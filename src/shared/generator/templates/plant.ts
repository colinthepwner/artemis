import type { ArtemisElement } from '../../project'
import { toPascalCase } from '../../project'
import { PLANT_DEFAULTS, type PlantProps } from '../props'
import { BLOCK_DEFAULTS } from '../props'
import { render, JavaWriter } from '../template'
import type { EmitContext, EmitContribution } from '../CodeGenerator'
import { biomeGuard } from '../biomeFilter'
import { blockDecl, dropCountJava, harvestLevelCalls, tileLangLines } from './block'

export function emitPlant(el: ArtemisElement, ctx: EmitContext): EmitContribution {
  const p = { ...PLANT_DEFAULTS, ...(el.properties as Partial<PlantProps>) }
  const pl = ctx.mapping.plant
  const maxHeight = Math.max(1, Math.round(p.maxHeight))
  const growing = maxHeight > 1

  const className = `BlockLogic${toPascalCase(el.name)}`
  const w = new JavaWriter(`${ctx.pkg}.block`, ctx.mapping.imports)
  w.use('Block', 'BlockLogicFlower')

  const grounds = (p.growsOn ?? []).map((ref) => ref.trim()).filter(Boolean)
  const tests = grounds.map((ref) => `ground == ${ctx.blockExpr(ref, w)}`)

  if (growing) tests.push('ground == this.block')
  const test = tests.length ? tests.join(' || ') : 'false /* TODO: pick ground */'

  const extras: string[] = []

  if (growing) {
    w.use('World', 'TilePos', 'TilePosc', 'Random')
    extras.push(render(pl.growth, { maxHeight }))
  }

  const dropsItem = p.drops === 'item' && p.dropItem.trim()
  const dropStack = (): string =>
    dropsItem
      ? ctx.stackExprN(p.dropItem, dropCountJava(p.dropCountMin, p.dropCountMax), w)
      : 'new ItemStack(this.block)'
  let body: string | null = null
  if (p.drops === 'nothing') {
    body = ctx.mapping.drops.bodyNothing
  } else if (p.shearsOnly) {
    body = render(ctx.mapping.drops.bodyShears, { dropStack: dropStack() })
  } else if (dropsItem) {
    body = render(ctx.mapping.drops.bodyItem, { dropStack: dropStack() })
  }
  if (body) {
    w.use('ItemStack', 'World', 'EnumDropCause', 'TileEntity')
    extras.push(render(ctx.mapping.drops.method, { body }))
  }

  w.block(
    render(pl.logicClass, {
      className,
      test,

      extra: extras.length ? '\n' + extras.join('\n\n') + '\n' : ''
    })
  )

  const decl = blockDecl(
    el.name,
    {
      ...BLOCK_DEFAULTS,
      displayName: p.displayName,
      material: 'plant',
      sound: 'grass',
      hardness: 0,
      resistance: 0,
      luminance: p.luminance,
      harvestLevel: p.harvestLevel,
      tags: ['brokenByFluids'],
      drops: 'self',
      textureMode: 'all',
      notInCreativeMenu: false
    },
    ctx,
    {
      logic: `block -> new ${className}(block)`,
      logicType: className,
      creative: 'plant',

      extraMethods: growing ? [render(ctx.mapping.blockBuilder.methods['ticking'], {})] : []
    }
  )

  const patches = Math.max(0, Math.round(p.patchesPerChunk))
  const plantGenCalls =
    patches > 0
      ? [
          render(ctx.mapping.oreGen.plantPatch, {
            FIELD: ctx.fieldOf(el.name),
            perChunk: patches,
            biomeGuard: biomeGuard(p.biomes, ctx)
          })
        ]
      : []

  return {
    blockDecls: [decl],
    langLines: tileLangLines(el.name, el.properties as never, ctx),
    ...ctx.blockModelCalls(el.name, 'cross'),
    afterStart: harvestLevelCalls(
      el.name,
      { ...BLOCK_DEFAULTS, harvestLevel: p.harvestLevel },
      ctx
    ),
    plantGenCalls,
    files: [{ relPath: `block/${className}.java`, writer: w }]
  }
}
