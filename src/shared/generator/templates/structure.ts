import type { ArtemisElement } from '../../project'
import { toPascalCase } from '../../project'
import {
  axisMeta,
  splitAxis,
  STRUCTURE_DEFAULTS,
  type BuildVariant,
  type LogAxis,
  type StructureProps
} from '../props'
import { render, JavaWriter } from '../template'
import { biomeGuard, extraGroundTest } from '../biomeFilter'
import type { EmitContext, EmitContribution } from '../CodeGenerator'

export function structureFeatureClassName(registryName: string): string {
  return `WorldFeature${toPascalCase(registryName)}Structure`
}

function offsetExpr(base: string, delta: number): string {
  if (delta === 0) return base
  return delta > 0 ? `${base} + ${delta}` : `${base} - ${-delta}`
}

export function builtVariants(variants: BuildVariant[] | undefined): BuildVariant[] {
  return (variants ?? []).filter((v) => Object.keys(v.blocks ?? {}).length > 0)
}

export function variantCells(
  variant: BuildVariant
): { x: number; y: number; z: number; ref: string; axis: LogAxis | null }[] {
  return Object.entries(variant.blocks ?? {})
    .map(([key, value]) => {
      const [x, y, z] = key.split(',').map(Number)

      const { ref, axis } = splitAxis(value)
      return { x, y, z, ref, axis }
    })
    .filter((c) => [c.x, c.y, c.z].every(Number.isFinite))
    .sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x)
}

export function variantFeatureWriter(
  className: string,
  variants: BuildVariant[],
  isTree: boolean,
  ctx: EmitContext,

  groundRefs: string[] = []
): JavaWriter {
  const s = ctx.mapping.structure
  const w = new JavaWriter(`${ctx.pkg}.worldgen`, ctx.mapping.imports)
  w.use('World', 'WorldFeature', 'Random')
  if (isTree) w.use('Blocks', 'BlockTags')

  const methods = variants.map((variant, i) => {
    const cells = variantCells(variant)

    const lines = cells
      .map((c) => {
        const vars = {
          X: offsetExpr('x', c.x),
          Y: offsetExpr('y', c.y),
          Z: offsetExpr('z', c.z),
          block: ctx.blockExpr(c.ref, w),
          meta: String(axisMeta(c.axis))
        }
        const guarded = isTree && !(c.x === 0 && c.z === 0)

        if (c.axis) return render(guarded ? s.placeLineIfAirMeta : s.placeLineMeta, vars)
        return render(guarded ? s.placeLineIfAir : s.placeLine, vars)
      })
      .join('\n')

    return render(s.variantMethod, { i, name: variant.name || `Variant ${i + 1}`, lines })
  })

  const cases = variants.map((_, i) => render(s.caseLine, { i })).join('\n')

  w.block(
    render(s.featureClass, {
      className,
      variantCount: variants.length,
      cases,
      variantMethods: methods.join('\n'),
      guard: isTree ? render(s.treeGuard, { extraGround: extraGroundTest(groundRefs, w, ctx) }) : ''
    })
  )
  return w
}

export function emitStructure(el: ArtemisElement, ctx: EmitContext): EmitContribution {
  const p = { ...STRUCTURE_DEFAULTS, ...(el.properties as Partial<StructureProps>) }
  const variants = builtVariants(p.variants)

  if (variants.length === 0) return {}

  const className = structureFeatureClassName(el.name)
  const w = variantFeatureWriter(className, variants, false, ctx)

  const oneIn = Math.max(1, Math.round(p.oneInChunks))
  const minY = Math.min(p.minY, p.maxY)
  const maxY = Math.max(p.minY, p.maxY)
  const call = render(
    p.placement === 'buried' ? ctx.mapping.oreGen.structureBuried : ctx.mapping.oreGen.structureSurface,
    {
      oneIn,
      featureClass: className,
      minY,
      yRange: Math.max(1, maxY - minY + 1),
      biomeGuard: biomeGuard(p.biomes, ctx)
    }
  )

  return {
    files: [{ relPath: `worldgen/${className}.java`, writer: w }],
    structureGenCalls: [call]
  }
}
