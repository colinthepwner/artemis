import type { ArtemisElement } from '../../project'
import { toPascalCase } from '../../project'
import { TREE_DEFAULTS, type TreeProps } from '../props'
import { BLOCK_DEFAULTS } from '../props'
import { render, JavaWriter } from '../template'
import type { EmitContext, EmitContribution } from '../CodeGenerator'
import { blockDecl } from './block'

export function emitTree(el: ArtemisElement, ctx: EmitContext): EmitContribution {
  const p = { ...TREE_DEFAULTS, ...(el.properties as Partial<TreeProps>) }
  const logName = `${el.name}_log`
  const leavesName = `${el.name}_leaves`
  const className = `WorldFeature${toPascalCase(el.name)}Tree`

  const log = blockDecl(
    logName,
    {
      ...BLOCK_DEFAULTS,
      displayName: p.displayName ? `${p.displayName} Log` : '',
      material: 'wood',
      sound: 'wood',
      hardness: 2,
      resistance: 4,
      tags: ['mineableByAxe'],
      textureMode: 'topBottomSides',
      drops: 'self',
      luminance: 0,
      notInCreativeMenu: false
    },
    ctx
  )

  const leaves = blockDecl(
    leavesName,
    {
      ...BLOCK_DEFAULTS,
      displayName: p.displayName ? `${p.displayName} Leaves` : '',
      material: 'leaves',
      sound: 'grass',
      hardness: 0.2,
      resistance: 0.2,
      tags: ['mineableByHoe', 'passesLightThrough'],
      textureMode: 'all',
      drops: 'nothing',
      luminance: 0,
      notInCreativeMenu: false
    },
    ctx
  )

  const w = new JavaWriter(`${ctx.pkg}.worldgen`, ctx.mapping.imports)
  w.use('World', 'WorldFeature', 'Random')
  w.useRaw(`import ${ctx.pkg}.init.ModBlocks;`)
  w.block(
    render(ctx.mapping.tree.featureClass, {
      className,
      minHeight: p.minHeight,
      heightRange: Math.max(1, p.maxHeight - p.minHeight + 1),
      LOG_FIELD: ctx.fieldOf(logName),
      LEAVES_FIELD: ctx.fieldOf(leavesName)
    })
  )

  return {
    blockDecls: [log, leaves],
    files: [{ relPath: `worldgen/${className}.java`, writer: w }]
  }
}
