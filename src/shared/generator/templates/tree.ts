import type { ArtemisElement } from '../../project'
import { toPascalCase } from '../../project'
import { TREE_DEFAULTS, type TreeProps } from '../props'
import { render, JavaWriter } from '../template'
import {
  biomeGuard,
  extraGroundTest,
  treeGroundRefs,
  VANILLA_BIOME_PREFIX
} from '../biomeFilter'
import type { EmitContext, EmitContribution } from '../CodeGenerator'
import { builtVariants, variantFeatureWriter } from './structure'

export function treeFeatureClassName(treeRegistryName: string): string {
  return `WorldFeature${toPascalCase(treeRegistryName)}Tree`
}

export function emitTree(el: ArtemisElement, ctx: EmitContext): EmitContribution {
  const p = { ...TREE_DEFAULTS, ...(el.properties as Partial<TreeProps>) }
  const className = treeFeatureClassName(el.name)

  const variants = p.design === 'built' ? builtVariants(p.variants) : []

  const groundRefs = treeGroundRefs(p.biomes, ctx)

  let w: JavaWriter
  if (variants.length > 0) {

    w = variantFeatureWriter(className, variants, true, ctx, groundRefs)
  } else {
    w = new JavaWriter(`${ctx.pkg}.worldgen`, ctx.mapping.imports)

    w.use('World', 'WorldFeature', 'Random', 'Blocks', 'BlockTags')
    w.block(
      render(ctx.mapping.tree.featureClass, {
        className,
        minHeight: p.minHeight,
        heightRange: Math.max(1, p.maxHeight - p.minHeight + 1),
        logBlock: ctx.blockExpr(p.logBlock, w),
        leavesBlock: ctx.blockExpr(p.leavesBlock, w),
        extraGround: extraGroundTest(groundRefs, w, ctx)
      })
    )
  }

  const listed = (p.biomes ?? []).map((r) => r.trim()).filter(Boolean)
  const vanillaListed = listed.filter((r) => r.startsWith(VANILLA_BIOME_PREFIX))
  const decoratorPlants =
    p.treesPerChunk > 0 && (listed.length === 0 || vanillaListed.length > 0)
  const plant = decoratorPlants
    ? [
        render(ctx.mapping.oreGen.tree, {
          perChunk: p.treesPerChunk,
          featureClass: className,
          biomeGuard: biomeGuard(listed.length === 0 ? [] : vanillaListed, ctx)
        })
      ]
    : []

  return {
    files: [{ relPath: `worldgen/${className}.java`, writer: w }],
    treeGenCalls: plant
  }
}
