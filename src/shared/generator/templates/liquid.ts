import type { ArtemisElement } from '../../project'
import { LIQUID_DEFAULTS, type LiquidProps } from '../props'
import { BLOCK_DEFAULTS } from '../props'
import { render } from '../template'
import type { EmitContext, EmitContribution } from '../CodeGenerator'
import { blockDecl, tileLangLines, titleCase } from './block'

export function liquidBlocks(name: string): { still: string; flowing: string } {
  return { still: `${name}_still`, flowing: `${name}_flowing` }
}

export function emitLiquid(el: ArtemisElement, ctx: EmitContext): EmitContribution {
  const p = { ...LIQUID_DEFAULTS, ...(el.properties as Partial<LiquidProps>) }
  const names = liquidBlocks(el.name)
  const lq = ctx.mapping.liquid
  const material = ctx.mapping.materials[p.materialKind] ?? ctx.mapping.materials['water']
  const fluid = p.materialKind === 'lava' ? lq.fluidLava : lq.fluidWater
  const displayName = p.displayName || titleCase(el.name)

  const shared = {
    ...BLOCK_DEFAULTS,
    material: p.materialKind,
    sound: 'stone',
    hardness: 100,
    resistance: 100,
    luminance: p.luminance,
    tags: [],

    drops: 'self' as const,
    textureMode: 'all' as const
  }

  const flowingDecl = blockDecl(
    names.flowing,
    { ...shared, displayName, notInCreativeMenu: true },
    ctx,
    {
      logic: render(lq.logicFlowing, {
        material,
        fluid,
        STILL: ctx.fieldOf(names.still)
      }),
      logicType: 'BlockLogicFluid'
    }
  )

  const stillDecl = blockDecl(
    names.still,
    { ...shared, displayName, notInCreativeMenu: false },
    ctx,
    {
      logic: render(lq.logicStill, {
        material,
        fluid,
        FLOWING: ctx.fieldOf(names.flowing)
      }),
      logicType: 'BlockLogicFluid',
      creative: 'liquid'
    }
  )

  const models = [
    ...ctx.blockModelCalls(names.still, 'fluid', el.name).blockModels,
    ...ctx.blockModelCalls(names.flowing, 'fluid', el.name).blockModels
  ]

  return {
    blockDecls: [flowingDecl, stillDecl],
    blockModels: models,
    langLines: [
      ...tileLangLines(names.still, { displayName }, ctx),
      ...tileLangLines(names.flowing, { displayName: `Flowing ${displayName}` }, ctx)
    ],
    afterStart: [render(lq.relink, { FLOWING: ctx.fieldOf(names.flowing) })]
  }
}
