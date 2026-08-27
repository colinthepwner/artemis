import type { ArtemisElement } from '../../project'
import { toPascalCase } from '../../project'
import { STRUCTURE_DEFAULTS, type BuildVariant, type StructureProps } from '../props'
import { render, JavaWriter } from '../template'
import { biomeGuard } from '../biomeFilter'
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

export function variantFeatureWriter(
  className: string,
  variants: BuildVariant[],
  isTree: boolean,
  ctx: EmitContext
): JavaWriter {
  const s = ctx.mapping.structure
  const w = new JavaWriter(`${ctx.pkg}.worldgen`, ctx.mapping.imports)
  w.use('World', 'WorldFeature', 'Random')
  if (isTree) w.use('Blocks', 'BlockTags')

  const methods = variants.map((variant, i) => {

    const cells = Object.entries(variant.blocks)
      .map(([key, ref]) => {
        const [x, y, z] = key.split(',').map(Number)
        return { x, y, z, ref }
      })
      .filter((c) => [c.x, c.y, c.z].every(Number.isFinite))
      .sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x)

    const lines = cells
      .map((c) => {
        const vars = {
          X: offsetExpr('x', c.x),
          Y: offsetExpr('y', c.y),
          Z: offsetExpr('z', c.z),
          block: ctx.blockExpr(c.ref, w)
        }
        const guarded = isTree && !(c.x === 0 && c.z === 0)
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
      guard: isTree ? s.treeGuard : ''
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
