import type { ArtemisElement } from '../../project'
import { PLANT_DEFAULTS, type PlantProps } from '../props'
import { BLOCK_DEFAULTS } from '../props'
import type { EmitContext, EmitContribution } from '../CodeGenerator'
import { blockDecl } from './block'

export function emitPlant(el: ArtemisElement, ctx: EmitContext): EmitContribution {
  const p = { ...PLANT_DEFAULTS, ...(el.properties as Partial<PlantProps>) }
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
      tags: ['brokenByFluids'],
      drops: 'self',
      textureMode: 'all',
      notInCreativeMenu: false
    },
    ctx
  )
  return { blockDecls: [decl] }
}
