import type { ArtemisElement } from '../../project'
import { LIQUID_DEFAULTS, type LiquidProps } from '../props'
import { BLOCK_DEFAULTS } from '../props'
import type { EmitContext, EmitContribution } from '../CodeGenerator'
import { blockDecl } from './block'

export function emitLiquid(el: ArtemisElement, ctx: EmitContext): EmitContribution {
  const p = { ...LIQUID_DEFAULTS, ...(el.properties as Partial<LiquidProps>) }
  const decl = blockDecl(
    el.name,
    {
      ...BLOCK_DEFAULTS,
      displayName: p.displayName,
      material: p.materialKind,
      sound: 'glass',
      hardness: 100,
      resistance: 100,
      luminance: p.materialKind === 'lava' ? Math.max(p.luminance, 15) : p.luminance,
      tags: [],
      drops: 'nothing',
      textureMode: 'all',
      notInCreativeMenu: true
    },
    ctx
  )
  return { blockDecls: [decl] }
}
