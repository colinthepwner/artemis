import type { ArtemisElement } from '../../project'
import { BLOCK_DEFAULTS, type BlockProps } from '../props'
import { render } from '../template'
import type { EmitContext, EmitContribution } from '../CodeGenerator'

export function titleCase(registryName: string): string {
  return registryName
    .split('_')
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join(' ')
}

export function blockDecl(
  registryName: string,
  p: BlockProps,
  ctx: EmitContext,
  extraMethods: string[] = []
): string {
  const bb = ctx.mapping.blockBuilder
  const FIELD = ctx.fieldOf(registryName)
  const displayName = p.displayName || titleCase(registryName)
  const vars = { FIELD, registryName, displayName, modId: ctx.meta.modId }

  const chain: string[] = []

  const sound = ctx.mapping.sounds[p.sound]
  if (sound) chain.push(render(bb.methods['sound'], { ...vars, value: sound }))

  chain.push(render(bb.methods['hardness'], { ...vars, value: p.hardness }))
  chain.push(render(bb.methods['resistance'], { ...vars, value: p.resistance }))
  if (p.luminance > 0) chain.push(render(bb.methods['luminance'], { ...vars, value: p.luminance }))

  const tags = p.tags.map((t) => ctx.mapping.blockTags[t]).filter(Boolean)
  if (p.notInCreativeMenu && ctx.mapping.blockTags['notInCreativeMenu']) {
    tags.push(ctx.mapping.blockTags['notInCreativeMenu'])
  }
  if (tags.length) chain.push(render(bb.methods['tags'], { ...vars, value: tags.join(', ') }))

  if (p.drops === 'nothing') {
    chain.push('// TODO: drops nothing needs a custom BlockLogic in BTA 8.0.1')
  }

  chain.push(...extraMethods)

  const material = ctx.mapping.materials[p.material] ?? ctx.mapping.materials['stone']
  const decl = render(bb.decl, vars)
  const build = render(bb.build, { ...vars, material })

  const chainLines = chain
    .flatMap((c) => c.split('\n'))
    .map((l) => (l.startsWith('\t') ? l : '\t' + l))
    .join('\n')

  return `${decl}\n${chainLines}\n${build}`
}

export function emitBlock(el: ArtemisElement, ctx: EmitContext): EmitContribution {
  const p = { ...BLOCK_DEFAULTS, ...(el.properties as Partial<BlockProps>) }
  return { blockDecls: [blockDecl(el.name, p, ctx)] }
}
