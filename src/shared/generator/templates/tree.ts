import type { ArtemisElement } from '../../project'
import { toPascalCase } from '../../project'
import { TREE_DEFAULTS, type TreeProps } from '../props'
import { render, JavaWriter } from '../template'
import type { EmitContext, EmitContribution } from '../CodeGenerator'

export function emitTree(el: ArtemisElement, ctx: EmitContext): EmitContribution {
  const p = { ...TREE_DEFAULTS, ...(el.properties as Partial<TreeProps>) }
  const className = `WorldFeature${toPascalCase(el.name)}Tree`

  const w = new JavaWriter(`${ctx.pkg}.worldgen`, ctx.mapping.imports)
  w.use('World', 'WorldFeature', 'Random')
  w.block(
    render(ctx.mapping.tree.featureClass, {
      className,
      minHeight: p.minHeight,
      heightRange: Math.max(1, p.maxHeight - p.minHeight + 1),
      logBlock: ctx.blockExpr(p.logBlock, w),
      leavesBlock: ctx.blockExpr(p.leavesBlock, w)
    })
  )

  return { files: [{ relPath: `worldgen/${className}.java`, writer: w }] }
}
