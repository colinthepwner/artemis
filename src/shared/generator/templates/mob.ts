import type { ArtemisElement } from '../../project'
import { toPascalCase } from '../../project'
import { MOB_DEFAULTS, type MobProps } from '../props'
import { render, JavaWriter } from '../template'
import type { EmitContext, EmitContribution } from '../CodeGenerator'

export function emitMob(el: ArtemisElement, ctx: EmitContext): EmitContribution {
  const p = { ...MOB_DEFAULTS, ...(el.properties as Partial<MobProps>) }
  const className = `Entity${toPascalCase(el.name)}`

  const w = new JavaWriter(`${ctx.pkg}.entity`, ctx.mapping.imports)
  w.use('EntityLiving', 'World')

  const dropRef = p.dropItem.trim()
  let dropBody = '\t\t// drops nothing'
  if (dropRef) {

    let itemExpr: string
    if (dropRef.startsWith('item:')) {
      w.use('Items')
      itemExpr = `Items.${dropRef.slice(5).toUpperCase()}`
    } else if (dropRef.startsWith('block:')) {
      w.use('Blocks')
      itemExpr = `Blocks.${dropRef.slice(6).toUpperCase()}.asItem()`
    } else {
      const owner = ctx.project.elements.find((e) => e.name === dropRef)
      if (owner && ['block', 'ore', 'plant', 'tree', 'liquid'].includes(owner.kind)) {
        w.useRaw(`import ${ctx.pkg}.init.ModBlocks;`)
        itemExpr = `ModBlocks.${ctx.fieldOf(dropRef)}.asItem()`
      } else {
        w.useRaw(`import ${ctx.pkg}.init.ModItems;`)
        itemExpr = `ModItems.${ctx.fieldOf(dropRef)}`
      }
    }
    dropBody = render(ctx.mapping.mob.dropLine, {
      itemExpr,
      dropCountMax: Math.max(1, p.dropCountMax)
    })
  }

  const hostileBody = p.hostile
    ? render(ctx.mapping.mob.hostileBody, { attackDamage: p.attackDamage })
    : ''

  const texture =
    p.texturePath.trim() || `${ctx.meta.modId}:entity/${el.name}`

  w.block(
    render(ctx.mapping.mob.classTemplate, {
      className,
      extends: ctx.mapping.entity.mobClassExtends,
      health: p.health,
      moveSpeed: p.moveSpeed,
      texture,
      hostileBody,
      dropBody
    })
  )

  const reg = render(ctx.mapping.entity.decl, {
    className,
    registryName: el.name
  })

  return {
    entityRegs: [reg],
    files: [{ relPath: `entity/${className}.java`, writer: w }]
  }
}
