import type { ArtemisProject } from '../project'
import { getMapping } from './mappings'
import { getVanillaRegistry } from './vanilla'
import { projectRegistryEntries } from './registry'
import { toConstantCase } from '../project'

export type CompletionKind = 'class' | 'method' | 'constant' | 'field' | 'snippet'

export interface CompletionItem {
  label: string
  kind: CompletionKind

  detail?: string
  info?: string

  apply?: string

  owner?: string
}

export function buildCompletions(project: ArtemisProject): CompletionItem[] {
  const mapping = getMapping(project.meta.targetBta)
  const api = mapping.api
  const out: CompletionItem[] = []

  for (const [name, def] of Object.entries(api.classes)) {
    out.push({
      label: name,
      kind: 'class',
      detail: mapping.imports[name]?.split('.').slice(0, -1).join('.'),
      info: def.doc
    })
    for (const member of def.members) {
      out.push({
        label: member.split('(')[0],
        kind: 'method',
        detail: member,
        apply: member,
        owner: name,
        info: def.doc
      })
    }
  }

  for (const [owner, table] of Object.entries(api.staticFields)) {
    const values = mapping[table as 'materials' | 'sounds' | 'blockTags']
    for (const expr of Object.values(values)) {
      if (typeof expr !== 'string' || !expr.startsWith(`${owner}.`)) continue
      const field = expr.slice(owner.length + 1)
      out.push({ label: field, kind: 'constant', detail: owner, owner })
    }
  }

  const vanilla = getVanillaRegistry(project.meta.targetBta)
  for (const b of vanilla.blocks) {
    out.push({ label: b.field, kind: 'constant', detail: b.name, owner: 'Blocks' })
  }
  for (const i of vanilla.items) {
    out.push({ label: i.field, kind: 'constant', detail: i.name, owner: 'Items' })
  }

  for (const entry of projectRegistryEntries(project)) {
    out.push({
      label: toConstantCase(entry.registryName),
      kind: 'field',
      detail: entry.displayName,
      owner: entry.kind === 'block' ? 'ModBlocks' : 'ModItems'
    })
  }

  for (const s of api.snippets) {
    out.push({ label: s.label, kind: 'snippet', detail: s.detail, apply: s.body })
  }

  return out
}
