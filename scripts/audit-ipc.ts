import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { harness } from './_harness'

const audit = harness()
const check = audit.check

const ROOT = process.cwd()
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
const sources = (sub: string): { path: string; text: string }[] =>
  walk(join(ROOT, 'src', sub))
    .filter((p) => /\.tsx?$/.test(p))
    .map((p) => ({ path: p.slice(ROOT.length + 1).replace(/\\/g, '/'), text: readFileSync(p, 'utf-8') }))

const ipcSrc = readFileSync(join(ROOT, 'src/shared/ipc.ts'), 'utf-8')
const mainSrc = sources('main')
const preloadSrc = sources('preload')
const rendererSrc = sources('renderer')

const declared = new Map<string, string>()
{

  const ipcStart = ipcSrc.indexOf('export const IPC')
  const ipcEnd = ipcSrc.indexOf('} as const', ipcStart)
  const body = ipcSrc.slice(ipcStart, ipcEnd < 0 ? undefined : ipcEnd)
  for (const m of body.matchAll(/^\s{2}(\w+):\s*'([^']+)'/gm)) declared.set(m[1], m[2])
}
console.log(`ipc audit: ${declared.size} channels declared in shared/ipc.ts\n`)
check('shared/ipc.ts declares channels at all', declared.size > 0)

{
  const byWire = new Map<string, string[]>()
  for (const [key, wire] of declared) byWire.set(wire, [...(byWire.get(wire) ?? []), key])
  const shared = [...byWire].filter(([, keys]) => keys.length > 1)
  check(
    'no two constants share a channel name',
    shared.length === 0,
    shared.map(([wire, keys]) => `${wire} <- ${keys.join(', ')}`).join('; ')
  )
}

const mentions = (files: { text: string }[]): Set<string> => {
  const out = new Set<string>()
  for (const f of files) for (const m of f.text.matchAll(/\bIPC\.(\w+)/g)) out.add(m[1])
  return out
}

const mainHandles = new Set<string>()
const mainSends = new Set<string>()
for (const f of mainSrc) {
  for (const m of f.text.matchAll(/ipcMain\.(?:handle|handleOnce|on|once)\s*\(\s*IPC\.(\w+)/g)) {
    mainHandles.add(m[1])
  }

  for (const m of f.text.matchAll(/\.send\s*\(\s*IPC\.(\w+)/g)) mainSends.add(m[1])
}

const preloadInvokes = new Set<string>()
const preloadSends = new Set<string>()
const preloadListens = new Set<string>()
for (const f of preloadSrc) {
  for (const m of f.text.matchAll(/ipcRenderer\.invoke\s*\(\s*IPC\.(\w+)/g)) preloadInvokes.add(m[1])
  for (const m of f.text.matchAll(/ipcRenderer\.send\s*\(\s*IPC\.(\w+)/g)) preloadSends.add(m[1])
  for (const m of f.text.matchAll(/ipcRenderer\.(?:on|once)\s*\(\s*IPC\.(\w+)/g)) preloadListens.add(m[1])
}

{

  const unhandled = [...preloadInvokes].filter((k) => !mainHandles.has(k))
  check(
    'every channel the preload invokes is handled in main',
    unhandled.length === 0,
    unhandled.map((k) => `IPC.${k} (${declared.get(k)})`).join(', ')
  )

  const unheardSends = [...preloadSends].filter((k) => !mainHandles.has(k))
  check(
    'every channel the preload sends is received in main',
    unheardSends.length === 0,
    unheardSends.map((k) => `IPC.${k} (${declared.get(k)})`).join(', ')
  )

  const unlistened = [...mainSends].filter((k) => !preloadListens.has(k))
  check(
    'every push main makes is listened for in the preload',
    unlistened.length === 0,
    unlistened.map((k) => `IPC.${k} (${declared.get(k)})`).join(', ')
  )

  const neverSent = [...preloadListens].filter((k) => !mainSends.has(k))
  check(
    'every channel the preload listens on is pushed by main',
    neverSent.length === 0,
    neverSent.map((k) => `IPC.${k} (${declared.get(k)})`).join(', ')
  )
}

{
  const used = new Set([...mentions(mainSrc), ...mentions(preloadSrc), ...mentions(rendererSrc)])
  const unused = [...declared.keys()].filter((k) => !used.has(k))
  check(
    'every declared channel is used somewhere',
    unused.length === 0,
    unused.map((k) => `IPC.${k} (${declared.get(k)})`).join(', ')
  )

  const reachedByPreload = new Set([...preloadInvokes, ...preloadSends, ...preloadListens])
  const mainOnly = [...declared.keys()].filter(
    (k) => (mainHandles.has(k) || mainSends.has(k)) && !reachedByPreload.has(k)
  )
  check(
    'no channel is wired in main with no way for the page to reach it',
    mainOnly.length === 0,
    mainOnly.map((k) => `IPC.${k} (${declared.get(k)})`).join(', ')
  )
}

{
  const wireNames = new Set(declared.values())
  const raw: string[] = []
  for (const f of [...mainSrc, ...preloadSrc]) {
    for (const m of f.text.matchAll(
      /ipc(?:Main|Renderer)\.(?:handle|handleOnce|on|once|send|invoke)\s*\(\s*(['"`])([^'"`]+)\1/g
    )) {
      raw.push(`${f.path}: "${m[2]}"${wireNames.has(m[2]) ? ' (a declared name, spelled by hand)' : ''}`)
    }
  }
  check('no IPC call uses a raw string instead of an IPC constant', raw.length === 0, raw.join('; '))
}

{

  const escaped = rendererSrc.filter((f) => /\bipcRenderer\b|require\(['"]electron['"]\)/.test(f.text))
  check(
    'the renderer never touches ipcRenderer directly',
    escaped.length === 0,
    escaped.map((f) => f.path).join(', ')
  )

  const apiPaths = new Set<string>()
  for (const f of preloadSrc) {
    for (const m of f.text.matchAll(/^\s{2}(\w+):\s*\{/gm)) apiPaths.add(m[1])
  }
  const rendererText = rendererSrc.map((f) => f.text).join('\n')
  const unusedGroups = [...apiPaths].filter(
    (g) => !new RegExp(`artemis\\??\\.${g}\\b|\\b${g}\\s*:\\s*\\{`).test(rendererText)
  )
  check(
    'every api group the bridge exposes is used by the renderer',
    unusedGroups.length === 0,
    unusedGroups.join(', ')
  )
}

console.log(`\n${audit.passes} checks passed, ${audit.failures} failed`)
console.log(audit.failures === 0 ? 'IPC PASS' : 'IPC: see above')
if (audit.failures > 0) process.exitCode = 1
