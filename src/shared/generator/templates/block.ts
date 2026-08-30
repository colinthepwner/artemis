import type { ArtemisElement } from '../../project'
import { toPascalCase, titleCase } from '../../project'
import { BLOCK_DEFAULTS, type BlockProps } from '../props'
import { render, JavaWriter } from '../template'
import type { EmitContext, EmitContribution } from '../CodeGenerator'

export { titleCase } from '../../project'

export function harvestLevelCalls(
  registryName: string,
  p: BlockProps,
  ctx: EmitContext
): string[] {
  const level = Math.round(p.harvestLevel ?? 0)
  if (level <= 0) return []
  return [render(ctx.mapping.harvestLevel.put, { FIELD: ctx.fieldOf(registryName), level })]
}

export function tileLangLines(
  registryName: string,
  p: { displayName?: string; description?: string },
  ctx: EmitContext
): string[] {
  const key = render(ctx.mapping.registration.tileLangKey, {
    modId: ctx.meta.modId,
    registryName
  })
  const lines = [`${key}.name=${p.displayName || titleCase(registryName)}`]
  if (p.description) lines.push(`${key}.desc=${p.description}`)
  return lines
}

export function itemLangLine(registryName: string, displayName: string, ctx: EmitContext): string {
  const key = render(ctx.mapping.registration.itemLangKey, {
    modId: ctx.meta.modId,
    registryName
  })
  return `${key}.name=${displayName}`
}

export interface BlockDeclOptions {

  extraMethods?: string[]

  creative?: string

  logic?: string

  logicType?: string
}

export function blockDecl(
  registryName: string,
  p: BlockProps,
  ctx: EmitContext,
  options: BlockDeclOptions = {}
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

  const uniqueTags = [...new Set(tags)]
  if (uniqueTags.length) {
    chain.push(render(bb.methods['tags'], { ...vars, value: uniqueTags.join(', ') }))
  }

  chain.push(
    render(ctx.mapping.creative.call, {

      category:
        ctx.mapping.creative.categories[
          options.creative ?? p.creativeCategory ?? 'block'
        ] ?? ctx.mapping.creative.categories['block']
    })
  )

  chain.push(...(options.extraMethods ?? []))

  const material = ctx.mapping.materials[p.material] ?? ctx.mapping.materials['stone']
  const logic = options.logic ?? render(bb.logicPlain, { material })
  const decl = render(bb.decl, { ...vars, logicType: options.logicType ?? 'BlockLogic' })
  const build = render(bb.build, { ...vars, logic })

  const chainLines = chain
    .flatMap((c) => c.split('\n'))
    .map((l) => (l.startsWith('\t') ? l : '\t' + l))
    .join('\n')

  return `${decl}\n${chainLines}\n${build}`
}

export interface DropLogic {

  logic: string

  logicType: string
  file: { relPath: string; writer: JavaWriter }
}

export function dropLogic(
  registryName: string,
  material: string,
  dropStack: ((writer: JavaWriter) => string) | null,
  ctx: EmitContext
): DropLogic {
  const className = `BlockLogic${toPascalCase(registryName)}`
  const w = new JavaWriter(`${ctx.pkg}.block`, ctx.mapping.imports)
  w.use('Block', 'BlockLogic', 'Material', 'ItemStack', 'World', 'EnumDropCause', 'TileEntity')

  const body = dropStack
    ? render(ctx.mapping.drops.bodyItem, { dropStack: dropStack(w) })
    : ctx.mapping.drops.bodyNothing

  w.block(render(ctx.mapping.drops.logicClass, { className, body }))

  return {
    logic: render(ctx.mapping.blockBuilder.logicCustom, { logicClass: className, material }),
    logicType: className,
    file: { relPath: `block/${className}.java`, writer: w }
  }
}

export function dropCountJava(min: number, max: number): string | null {
  const lo = Math.max(0, Math.round(min))
  const hi = Math.max(lo, Math.round(max))
  if (lo === 1 && hi === 1) return null
  if (lo === hi) return String(lo)
  return `${lo} + world.rand.nextInt(${hi - lo + 1})`
}

export function emitBlock(el: ArtemisElement, ctx: EmitContext): EmitContribution {
  const p = { ...BLOCK_DEFAULTS, ...(el.properties as Partial<BlockProps>) }
  const material = ctx.mapping.materials[p.material] ?? ctx.mapping.materials['stone']

  const custom =
    p.drops === 'nothing'
      ? dropLogic(el.name, material, null, ctx)
      : p.drops === 'item' && p.dropItem.trim()
        ? dropLogic(
            el.name,
            material,
            (w) => ctx.stackExprN(p.dropItem, dropCountJava(p.dropCountMin, p.dropCountMax), w),
            ctx
          )
        : null

  const decl = blockDecl(el.name, p, ctx, {
    logic: custom?.logic,
    logicType: custom?.logicType
  })

  return {
    blockDecls: [decl],
    afterStart: harvestLevelCalls(el.name, p, ctx),
    langLines: tileLangLines(el.name, el.properties as never, ctx),
    ...ctx.blockModelCalls(el.name, p.textureMode),
    files: custom ? [custom.file] : []
  }
}
