import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import ts from 'typescript'
import { harness } from './_harness'

const audit = harness()
const check = audit.check

const ROOT = process.cwd()
const SCRIPTS = join(ROOT, 'scripts')

const TS_LIB_DIR = join(ROOT, 'node_modules', 'typescript', 'lib')

function hostFor(options: ts.CompilerOptions): ts.CompilerHost {
  const host = ts.createCompilerHost(options)
  host.getDefaultLibLocation = (): string => TS_LIB_DIR
  host.getDefaultLibFileName = (o): string => join(TS_LIB_DIR, ts.getDefaultLibFileName(o))
  return host
}

function assertTypesResolve(program: ts.Program, what: string): void {
  const global = program.getGlobalDiagnostics()
  check(
    `${what}: the checker has its globals`,
    global.length === 0,
    global
      .slice(0, 3)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '))
      .join('; ')
  )
}

interface Dead {
  file: string
  line: number
  rule: string
  why: string
  text: string
}

function containsBoolean(type: ts.Type): boolean {
  if (type.flags & ts.TypeFlags.BooleanLike) return true

  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return true
  if (type.isUnion()) return type.types.some(containsBoolean)
  return false
}

function isPurelyBoolean(type: ts.Type): boolean {
  if (type.flags & ts.TypeFlags.BooleanLike) return true
  if (type.isUnion()) return type.types.every((t) => t.flags & ts.TypeFlags.BooleanLike)
  return false
}

function isAlwaysTruthy(type: ts.Type, checker: ts.TypeChecker): boolean {
  if (type.isUnion()) return false
  if (
    type.flags &
    (ts.TypeFlags.Any |
      ts.TypeFlags.Unknown |
      ts.TypeFlags.Null |
      ts.TypeFlags.Undefined |
      ts.TypeFlags.Void |
      ts.TypeFlags.StringLike |
      ts.TypeFlags.NumberLike |
      ts.TypeFlags.BooleanLike |
      ts.TypeFlags.BigIntLike |
      ts.TypeFlags.ESSymbolLike |
      ts.TypeFlags.TypeParameter)
  ) {
    return false
  }
  if (!(type.flags & ts.TypeFlags.Object)) return false

  if (checker.getSignaturesOfType(type, ts.SignatureKind.Call).length > 0) return true
  if (checker.isArrayType(type) || checker.isTupleType(type)) return true
  return false
}

const TYPEOF_RESULTS = new Set([
  'string',
  'number',
  'bigint',
  'boolean',
  'symbol',
  'undefined',
  'object',
  'function'
])

function isNullOrUndefinedLiteral(node: ts.Node): boolean {
  if (node.kind === ts.SyntaxKind.NullKeyword) return true
  return ts.isIdentifier(node) && node.text === 'undefined'
}

function isPure(node: ts.Node): boolean {
  let pure = true
  const walk = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) ||
      ts.isNewExpression(n) ||
      ts.isTaggedTemplateExpression(n) ||
      ts.isAwaitExpression(n) ||
      ts.isBinaryExpression(n) ||
      ts.isPostfixUnaryExpression(n) ||
      (ts.isPrefixUnaryExpression(n) &&
        (n.operator === ts.SyntaxKind.PlusPlusToken ||
          n.operator === ts.SyntaxKind.MinusMinusToken))
    ) {
      pure = false
      return
    }
    n.forEachChild(walk)
  }

  walk(node)
  return pure
}

function reachedConditionally(node: ts.Node): boolean {
  let n: ts.Node | undefined = node
  let child: ts.Node = node
  while ((n = n.parent)) {
    if (
      ts.isFunctionDeclaration(n) ||
      ts.isFunctionExpression(n) ||
      ts.isArrowFunction(n) ||
      ts.isMethodDeclaration(n) ||
      ts.isSourceFile(n)
    ) {
      return false
    }
    if (
      ts.isIfStatement(n) ||
      ts.isCatchClause(n) ||
      ts.isConditionalExpression(n) ||
      ts.isCaseClause(n) ||
      ts.isDefaultClause(n) ||
      ts.isTryStatement(n)
    ) {
      return true
    }

    if (
      ts.isBinaryExpression(n) &&
      (n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        n.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) &&
      n.right === child
    ) {
      return true
    }
    child = n
  }
  return false
}

const EQUALITY = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken
])

function diagnose(
  cond: ts.Expression,
  checker: ts.TypeChecker
): { rule: string; why: string } | null {
  const strip = (n: ts.Expression): ts.Expression =>
    ts.isParenthesizedExpression(n) ? strip(n.expression) : n
  const e = strip(cond)

  if (
    e.kind === ts.SyntaxKind.TrueKeyword ||
    e.kind === ts.SyntaxKind.FalseKeyword ||
    ts.isNumericLiteral(e) ||
    ts.isStringLiteral(e) ||
    ts.isObjectLiteralExpression(e) ||
    ts.isArrayLiteralExpression(e) ||
    ts.isArrowFunction(e) ||
    ts.isFunctionExpression(e) ||
    ts.isNoSubstitutionTemplateLiteral(e)
  ) {
    if (!reachedConditionally(e)) {
      return {
        rule: 'LITERAL',
        why: 'the condition is a literal and the call is reached unconditionally, so the check has one answer'
      }
    }
    return null
  }

  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    return {
      rule: 'ASSIGNMENT',
      why: 'this assigns rather than compares, so the check reports the value it just stored'
    }
  }

  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken) {
    let inner = strip(e.operand)
    if (ts.isPrefixUnaryExpression(inner) && inner.operator === ts.SyntaxKind.ExclamationToken) {
      inner = strip(inner.operand)
    }
    const t = checker.getTypeAtLocation(inner)
    if (isAlwaysTruthy(t, checker)) {
      return {
        rule: 'ALWAYS_TRUTHY',
        why: `\`${inner.getText()}\` is a ${
          checker.getSignaturesOfType(t, ts.SignatureKind.Call).length > 0 ? 'function' : 'array'
        }, which is always truthy, so negating it is a constant`
      }
    }
  }

  if (ts.isBinaryExpression(e) && EQUALITY.has(e.operatorToken.kind)) {
    const left = strip(e.left)
    const right = strip(e.right)

    const lt = checker.getTypeAtLocation(left)
    const rt = checker.getTypeAtLocation(right)
    const lBool = isPurelyBoolean(lt)
    const rBool = isPurelyBoolean(rt)
    if (lBool !== rBool) {
      const other = lBool ? right : left
      const otherType = lBool ? rt : lt
      const boolSide = lBool ? left : right
      if (!containsBoolean(otherType)) {
        const what = isNullOrUndefinedLiteral(other)
          ? other.getText()
          : checker.typeToString(otherType)
        return {
          rule: 'BOOLEAN_VS_NON_BOOLEAN',
          why: `\`${boolSide.getText()}\` is a boolean and is compared against ${what}, which a boolean can never equal`
        }
      }
    }

    for (const [a, b] of [
      [left, right],
      [right, left]
    ] as const) {
      if (
        ts.isTypeOfExpression(a) &&
        ts.isStringLiteral(b) &&
        !TYPEOF_RESULTS.has(b.text)
      ) {
        return {
          rule: 'BAD_TYPEOF',
          why: `typeof never returns '${b.text}', so this comparison has one answer`
        }
      }
    }

    if (
      left.getText() === right.getText() &&
      isPure(left) &&
      !ts.isLiteralExpression(left)
    ) {
      return {
        rule: 'SELF_COMPARE',
        why: 'both sides of the comparison are the same expression'
      }
    }
  }

  if (
    ts.isBinaryExpression(e) &&
    (e.operatorToken.kind === ts.SyntaxKind.GreaterThanEqualsToken ||
      e.operatorToken.kind === ts.SyntaxKind.LessThanToken)
  ) {
    const left = strip(e.left)
    const right = strip(e.right)
    if (
      ts.isPropertyAccessExpression(left) &&
      left.name.text === 'length' &&
      ts.isNumericLiteral(right) &&
      right.text === '0'
    ) {
      return {
        rule: 'LENGTH_SIGN',
        why: 'a length is never negative, so this comparison has one answer'
      }
    }
  }

  return null
}

function conditionParameterIndex(
  decl: ts.SignatureDeclarationBase,
  checker: ts.TypeChecker
): number | null {
  const boolIndexes: number[] = []
  decl.parameters.forEach((p, i) => {
    if (!p.type) return

    const t = checker.getTypeAtLocation(p.type)
    if (isPurelyBoolean(t)) boolIndexes.push(i)
  })
  if (boolIndexes.length !== 1) return null

  const hasName = decl.parameters.some((p, i) => {
    if (i === boolIndexes[0] || !p.type) return false
    const t = checker.getTypeAtLocation(p.type)
    return (t.flags & ts.TypeFlags.StringLike) !== 0
  })
  return hasName ? boolIndexes[0] : null
}

interface Helper {
  name: string
  condIndex: number
  file: string
}

function findReporters(files: ts.SourceFile[]): Set<string> {
  const names = new Set<string>()
  for (const sf of files) {
    const visit = (node: ts.Node): void => {
      let name: string | null = null
      let body: ts.Node | undefined
      if (ts.isFunctionDeclaration(node) && node.name) {
        name = node.name.text
        body = node.body
      } else if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
      ) {
        name = node.name.text
        body = node.initializer.body
      }
      if (name && body && /\bFAIL\b/.test(body.getText())) names.add(name)
      node.forEachChild(visit)
    }
    visit(sf)
  }
  return names
}

function guardOf(node: ts.Node): ts.IfStatement | null {
  let n: ts.Node | undefined = node
  while ((n = n.parent)) {
    if (
      ts.isFunctionDeclaration(n) ||
      ts.isFunctionExpression(n) ||
      ts.isArrowFunction(n) ||
      ts.isMethodDeclaration(n) ||
      ts.isSourceFile(n)
    ) {
      return null
    }
    if (ts.isIfStatement(n)) return n
  }
  return null
}

function findHelpers(program: ts.Program, files: ts.SourceFile[]): Map<string, Helper> {
  const checker = program.getTypeChecker()
  const helpers = new Map<string, Helper>()
  for (const sf of files) {
    const visit = (node: ts.Node): void => {
      let name: string | null = null
      let decl: ts.SignatureDeclarationBase | null = null
      if (ts.isFunctionDeclaration(node) && node.name) {
        name = node.name.text
        decl = node
      } else if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
      ) {
        name = node.name.text
        decl = node.initializer
      }
      if (name && decl) {
        const idx = conditionParameterIndex(decl, checker)
        if (idx !== null && !helpers.has(name)) {
          helpers.set(name, { name, condIndex: idx, file: relative(ROOT, sf.fileName) })
        }
      }
      node.forEachChild(visit)
    }
    visit(sf)
  }
  return helpers
}

interface SweepResult {
  dead: Dead[]
  perFile: Map<string, number>
  helpers: Map<string, Helper>
}

function sweep(program: ts.Program, files: ts.SourceFile[]): SweepResult {
  const checker = program.getTypeChecker()
  const helpers = findHelpers(program, files)
  const reporters = findReporters(files)
  const dead: Dead[] = []
  const perFile = new Map<string, number>()

  for (const sf of files) {
    const rel = relative(ROOT, sf.fileName).replace(/\\/g, '/')
    perFile.set(rel, 0)

    const seenGuards = new Set<number>()

    const record = (cond: ts.Expression): void => {
      perFile.set(rel, (perFile.get(rel) ?? 0) + 1)
      const bad = diagnose(cond, checker)
      if (!bad) return
      const { line } = sf.getLineAndCharacterOfPosition(cond.getStart(sf))
      dead.push({
        file: rel,
        line: line + 1,
        rule: bad.rule,
        why: bad.why,
        text: cond.getText(sf).replace(/\s+/g, ' ').slice(0, 120)
      })
    }

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const name = node.expression.text
        const helper = helpers.get(name)
        if (helper) {
          const cond = node.arguments[helper.condIndex]
          if (cond) record(cond)
        } else if (reporters.has(name)) {
          const guard = guardOf(node)
          if (guard && !seenGuards.has(guard.getStart(sf))) {
            seenGuards.add(guard.getStart(sf))
            record(guard.expression)
          }
        }
      }
      node.forEachChild(visit)
    }
    visit(sf)
  }
  return { dead, perFile, helpers }
}

function programFor(fileNames: string[]): ts.Program {
  const configPath = join(ROOT, 'tsconfig.scripts.json')
  const raw = ts.readConfigFile(configPath, ts.sys.readFile)
  if (raw.error) {
    throw new Error(ts.flattenDiagnosticMessageText(raw.error.messageText, '\n'))
  }
  const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, ROOT, undefined, configPath)
  const options = { ...parsed.options, noEmit: true }
  return ts.createProgram(fileNames, options, hostFor(options))
}

const POISON: Array<{ rule: string; src: string }> = [
  {
    rule: 'BOOLEAN_VS_NON_BOOLEAN',

    src: `declare const activeTour: string | null
          check('a', !activeTour !== null)`
  },
  {
    rule: 'BOOLEAN_VS_NON_BOOLEAN',
    src: `declare const flag: boolean
          check('b', flag === undefined)`
  },
  {
    rule: 'BOOLEAN_VS_NON_BOOLEAN',
    src: `declare const n: number
          check('c', !!n === 'yes' as unknown as string)`
  },
  { rule: 'LITERAL', src: `check('d', true)` },
  { rule: 'LITERAL', src: `check('e', 'a reason somebody typed into the wrong slot')` },
  { rule: 'ASSIGNMENT', src: `declare let seen: boolean; check('f', seen = true)` },
  {
    rule: 'ALWAYS_TRUTHY',
    src: `declare const rows: string[]
          check('g', !!rows)`
  },
  {
    rule: 'ALWAYS_TRUTHY',
    src: `declare const fn: () => void
          check('h', !fn)`
  },
  { rule: 'BAD_TYPEOF', src: `declare const x: unknown; check('i', typeof x === 'strng')` },
  {
    rule: 'SELF_COMPARE',
    src: `declare const o: { a: number }
          check('j', o.a === o.a)`
  },
  {
    rule: 'LENGTH_SIGN',
    src: `declare const rows: string[]
          check('k', rows.length >= 0)`
  }
]

const CLEAN: string[] = [

  `declare const activeTour: string | null
   check('a', activeTour === null)`,
  `declare const activeTour: string | null
   check('b', activeTour !== null)`,

  `declare const s: string
   check('c', !s)`,
  `declare const n: number
   check('d', !n)`,

  `declare const maybe: string[] | undefined
   check('e', !maybe)`,

  `declare const tri: boolean | undefined
   check('f', tri === undefined)`,

  `declare function next(): number
   check('g', next() === next())`,
  `declare const o: { a: number; b: number }
   check('h', o.a === o.b)`,

  `declare const rows: string[]
   check('i', rows.length > 0)`,
  `declare const rows: string[]
   check('j', rows.length === 3)`,

  `declare const x: unknown
   check('k', typeof x === 'string')`,

  `declare const a: boolean
   declare const b: boolean
   check('l', a === b)`
]

const HARNESS_PREAMBLE =
  `const check = (name: string, condition: boolean, detail?: string): void => {\n` +
  `  if (!condition) console.log(name, detail)\n` +
  `}\n`

function diagnoseSnippet(src: string): { dead: Dead[]; analyzed: number } {
  const fileName = join(SCRIPTS, '__sample.ts')
  const text = HARNESS_PREAMBLE + src + '\n'
  const sample = ts.createSourceFile(fileName, text, ts.ScriptTarget.ES2022, true)
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    lib: ['lib.es2022.d.ts'],
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    types: []
  }
  const host = hostFor(options)
  const originalGet = host.getSourceFile.bind(host)
  host.getSourceFile = (name, ...rest): ts.SourceFile | undefined =>
    resolve(name) === resolve(fileName) ? sample : originalGet(name, ...rest)
  host.fileExists = (name): boolean => resolve(name) === resolve(fileName) || ts.sys.fileExists(name)
  host.readFile = (name): string | undefined =>
    resolve(name) === resolve(fileName) ? text : ts.sys.readFile(name)
  const program = ts.createProgram([fileName], options, host)
  snippetGlobals = program.getGlobalDiagnostics().length
  const sf = program.getSourceFile(fileName)
  if (!sf) return { dead: [], analyzed: 0 }
  const r = sweep(program, [sf])
  return { dead: r.dead, analyzed: [...r.perFile.values()].reduce((a, b) => a + b, 0) }
}

let snippetGlobals = -1

const lastLine = (src: string): string => src.split('\n').pop()!.trim()

function proveTeeth(): void {
  console.log('\n[teeth] every sample is actually read')

  for (const s of [...POISON.map((p) => p.src), ...CLEAN]) {
    const { analyzed } = diagnoseSnippet(s)
    check(`the sweep reads \`${lastLine(s)}\``, analyzed === 1, `analyzed ${analyzed} assertions`)
    check(
      `and types it against a real lib: \`${lastLine(s)}\``,
      snippetGlobals === 0,
      `${snippetGlobals} global diagnostics, so the sample was typed against nothing`
    )
  }

  console.log('\n[teeth] every detector catches what it is for')
  for (const p of POISON) {
    const { dead } = diagnoseSnippet(p.src)
    const hit = dead.some((d) => d.rule === p.rule)
    check(
      `${p.rule} catches \`${lastLine(p.src)}\``,
      hit,
      hit ? undefined : `caught ${dead.length === 0 ? 'nothing' : dead.map((d) => d.rule).join(', ')}`
    )
  }

  console.log('\n[teeth] and leaves an honest check alone')
  for (const c of CLEAN) {
    const { dead } = diagnoseSnippet(c)
    check(
      `no complaint about \`${lastLine(c)}\``,
      dead.length === 0,
      dead.map((d) => `${d.rule}: ${d.why}`).join('; ')
    )
  }
}

function harnessFiles(): string[] {
  return readdirSync(SCRIPTS)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
    .map((f) => join(SCRIPTS, f))
    .sort()
}

function filesThatReportAVerdict(files: string[]): string[] {
  return files.filter((f) => {
    const src = readFileSync(f, 'utf8')
    return /\bPASS\b|\bFAIL\b|checks? passed/.test(src)
  })
}

const NOT_SWEPT: Record<string, string> = {
  'scripts/audit-controls.ts':
    'it holds no assertion of any shape. It drives every property of every kind through every ' +
    'mode, collects the ones that changed nothing, and prints the verdict from the size of that ' +
    'list. There is no condition written down anywhere for a detector to read, and the thing ' +
    'that would make it dead is an empty property table, which audit-misc.ts already checks.',
  'scripts/_harness.ts':
    'it holds no assertion of its own. It is where the pass and fail counter lives now, so the ' +
    'FAIL line every harness prints comes out of this file and the detector above reads that as ' +
    'a verdict. What it declares is the counter, not a check: there is no condition written here ' +
    'for a detector to find. If one is ever added, the mirror fails this entry as stale rather ' +
    'than letting the new check go unswept.',
  'scripts/_probe-java.ts':
    'it holds no assertion of its own, in the same way _harness.ts holds none. It is where the ' +
    'LINE FORMAT a probe reports an answer in lives now, so the PASS and FAIL lines both probes ' +
    'print come out of this file and the detector above reads that as a verdict. What it ' +
    'declares is the format, not a check: the only conditions here are Java inside a template ' +
    'string, which javac rejects for A57 shapes on every gradle run and which the duplicate ' +
    'sweep in audit-misc.ts reads for the rule this file exists to keep. If a TypeScript ' +
    'assertion is ever written here, the mirror fails this entry as stale rather than letting ' +
    'the new check go unswept.',

}

function main(): void {
  proveTeeth()

  const files = harnessFiles()
  console.log(`\n[sweep] ${files.length} harness files`)
  const program = programFor(files)
  const sources = files
    .map((f) => program.getSourceFile(f))
    .filter((sf): sf is ts.SourceFile => sf !== undefined)
  check('every harness file parsed', sources.length === files.length,
    `${sources.length} of ${files.length}`)

  assertTypesResolve(program, 'the harness sweep')

  const { dead, perFile, helpers } = sweep(program, sources)
  const total = [...perFile.values()].reduce((a, b) => a + b, 0)
  console.log(
    `         ${helpers.size} assertion helper${helpers.size === 1 ? '' : 's'} ` +
      `(${[...helpers.keys()].sort().join(', ')}), ${total} assertions analyzed`
  )

  console.log('\n[mirror] no harness drops out of coverage unnoticed')
  const declaring = new Set([...helpers.values()].map((h) => h.file.replace(/\\/g, '/')))
  for (const f of declaring) {
    check(`${f} has assertions the sweep can read`, (perFile.get(f) ?? 0) > 0,
      'the file declares an assertion helper and the sweep analyzed none of its calls')
  }

  for (const f of filesThatReportAVerdict(files)) {
    const rel = relative(ROOT, f).replace(/\\/g, '/')
    const excuse = NOT_SWEPT[rel]
    if ((perFile.get(rel) ?? 0) > 0) {
      check(`${rel} reports a verdict and the sweep can see its assertions`, true)

      check(`${rel} is not excused as well as covered`, excuse === undefined,
        'this file is analyzed now, so its entry in NOT_SWEPT should go')
      continue
    }
    check(`${rel} reports a verdict and is either swept or excused in writing`,
      excuse !== undefined,
      'this file prints a PASS or FAIL of its own, the sweep found no assertion it understands, ' +
        'and there is no entry for it in NOT_SWEPT saying why that is acceptable')
    if (excuse) console.log(`         excused: ${rel}\n                  ${excuse}`)
  }

  console.log('\n[assertions] every check can come out both ways')
  if (dead.length === 0) {
    check('no assertion is constant by construction', true)
  } else {
    for (const d of dead) {
      check(`${d.file}:${d.line} [${d.rule}]`, false, `${d.why}\n       ${d.text}`)
    }
  }

  console.log(`\n${audit.passes} checks passed, ${audit.failures} failed`)
  console.log(audit.failures === 0 ? 'ASSERTIONS PASS' : 'ASSERTIONS FAIL')
  process.exit(audit.failures === 0 ? 0 : 1)
}

main()
