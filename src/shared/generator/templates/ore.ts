import type { ArtemisElement } from '../../project'
import { ORE_DEFAULTS, type OreProps } from '../props'
import { render, JavaWriter } from '../template'
import type { EmitContext, EmitContribution } from '../CodeGenerator'
import { biomeGuard } from '../biomeFilter'

export function emitOre(el: ArtemisElement, ctx: EmitContext): EmitContribution {
  const p: OreProps = { ...ORE_DEFAULTS, ...(el.properties as Partial<OreProps>) }

  if (!p.blockRef.trim() || p.veinsPerChunk <= 0) return {}

  const w = new JavaWriter(ctx.pkg, ctx.mapping.imports)
  const oreGenCall = render(ctx.mapping.oreGen.vein, {
    blockExpr: ctx.blockExpr(p.blockRef, w),
    veinSize: p.veinSize,
    veinsPerChunk: p.veinsPerChunk,
    minY: p.minY,
    maxY: p.maxY,
    biomeGuard: biomeGuard(p.biomes, ctx)
  })

  return { oreGenCalls: [oreGenCall] }
}
