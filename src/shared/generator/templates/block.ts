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
  return [
    `${key}.name=${p.displayName || titleCase(registryName)}`,
    `${key}.desc=${p.description ?? ''}`
  ]
}

export function itemLangLines(
  registryName: string,
  displayName: string,
  ctx: EmitContext,
  description?: string
): string[] {
  const key = render(ctx.mapping.registration.itemLangKey, {
    modId: ctx.meta.modId,
    registryName
  })
  return [`${key}.name=${displayName}`, `${key}.desc=${description ?? ''}`]
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

  const placement = ctx.creativeCall({

    category: options.creative ?? p.creativeCategory ?? 'block',
    registryName,
    family: 'block',
    hidden: p.notInCreativeMenu
  })
  if (placement) chain.push(placement)

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

export function blockLogic(
  registryName: string,
  material: string,
  wants: {

    dropStack?: ((writer: JavaWriter) => string) | null
    emitsRedstone?: boolean
  },
  ctx: EmitContext
): DropLogic | null {
  const hasDrop = wants.dropStack !== undefined
  if (!hasDrop && !wants.emitsRedstone) return null

  const className = `BlockLogic${toPascalCase(registryName)}`
  const w = new JavaWriter(`${ctx.pkg}.block`, ctx.mapping.imports)
  w.use('Block', 'BlockLogic', 'Material')

  const methods: string[] = []
  if (hasDrop) {
    w.use('ItemStack', 'World', 'EnumDropCause', 'TileEntity')
    const body = wants.dropStack
      ? render(ctx.mapping.drops.bodyItem, { dropStack: wants.dropStack(w) })
      : ctx.mapping.drops.bodyNothing
    methods.push(render(ctx.mapping.blockLogic.dropMethod, { body }))
  }
  if (wants.emitsRedstone) {
    w.use('WorldSource', 'TilePosc', 'Side')
    methods.push(ctx.mapping.blockLogic.signalMethods)
  }

  w.block(render(ctx.mapping.blockLogic.classTemplate, { className, methods: methods.join('') }))

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

  const custom = blockLogic(
    el.name,
    material,
    {
      ...(p.drops === 'nothing'
        ? { dropStack: null }
        : p.drops === 'item' && p.dropItem.trim()
          ? {
              dropStack: (w: JavaWriter) =>
                ctx.stackExprN(p.dropItem, dropCountJava(p.dropCountMin, p.dropCountMax), w)
            }
          : {}),
      emitsRedstone: p.emitsRedstone
    },
    ctx
  )

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
