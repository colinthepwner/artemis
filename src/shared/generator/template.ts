export function render(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = vars[key]
    if (v === undefined) {

      throw new Error(`Template token {{${key}}} has no value. Template: ${template.slice(0, 80)}`)
    }
    return String(v)
  })
}

export class JavaWriter {
  private symbols = new Set<string>()
  private rawImports = new Set<string>()
  private chunks: string[] = []

  constructor(
    private pkg: string,
    private importTable: Record<string, string>
  ) {}

  use(...symbols: string[]): this {
    symbols.forEach((s) => this.symbols.add(s))
    return this
  }

  useRaw(...importLines: string[]): this {
    importLines.forEach((l) => this.rawImports.add(l))
    return this
  }

  line(text = ''): this {
    this.chunks.push(text)
    return this
  }

  block(text: string): this {
    this.chunks.push(text)
    return this
  }

  toString(header: string): string {

    const body = this.chunks.join('\n')
    for (const symbol of Object.keys(this.importTable)) {
      if (!this.symbols.has(symbol) && new RegExp(`\\b${symbol}\\b`).test(body)) {
        this.symbols.add(symbol)
      }
    }

    const resolved = [...this.symbols].map((s) => {
      const fqn = this.importTable[s]
      if (!fqn) throw new Error(`Unknown import symbol "${s}". Add it to the mapping's imports table.`)
      return `import ${fqn};`
    })
    const imports = [...resolved, ...this.rawImports].sort().join('\n')

    return `${header}\npackage ${this.pkg};\n\n${imports}\n\n${this.chunks.join('\n')}\n`
  }
}

export function indent(text: string, tabs = 1): string {
  const pad = '\t'.repeat(tabs)
  return text
    .split('\n')
    .map((l) => (l.length ? pad + l : l))
    .join('\n')
}

export function dropBlankLines(text: string): string {
  return text
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .join('\n')
}

export function javaString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
