import type { ArtemisElement } from '../../project'
import { GEARSET_DEFAULTS, type GearSetProps } from '../props'
import { render } from '../template'
import type { EmitContext, EmitContribution } from '../CodeGenerator'
import { titleCase, itemLangLines } from './block'
import { kitPieces, type ToolKind, type ArmorKind } from '../family'
import { toConstantCase } from '../../project'

export function emitGearSet(el: ArtemisElement, ctx: EmitContext): EmitContribution {
  const p = { ...GEARSET_DEFAULTS, ...(el.properties as Partial<GearSetProps>) }
  const itemDecls: string[] = []
  const langLines: string[] = []
  const itemModels: string[] = []

  const FIELD = toConstantCase(el.name)
  const displayName = p.displayName || titleCase(el.name)
  const setVars = {
    FIELD,
    registryName: el.name,
    displayName,
    modId: ctx.meta.modId
  }

  const pieces = kitPieces(el)
  const tools = pieces.filter((piece) => piece.slot === 'tools')
  const armor = pieces.filter((piece) => piece.slot === 'armor')

  if (tools.length > 0) {
    itemDecls.push(
      render(ctx.mapping.toolMaterial.decl, {
        ...setVars,
        durability: p.durability,
        efficiency: p.efficiency,
        efficiencyOnProper: p.efficiency * 1.5,
        miningLevel: p.miningLevel,
        damage: p.damage
      })
    )
    for (const piece of tools) {
      itemDecls.push(
        render(ctx.mapping.toolMaterial.tools[piece.kind as ToolKind], {
          ...setVars,
          creative: ctx.creativeCall('tool')
        })
      )
      langLines.push(...itemLangLines(piece.name, `${displayName} ${titleCase(piece.kind)}`, ctx))
      itemModels.push(...ctx.itemModelCalls(piece.name))
    }
  }

  if (armor.length > 0) {

    itemDecls.push(
      render(ctx.mapping.armorMaterial.decl, {
        ...setVars,
        durability: p.armorDurability,
        combat: p.totalProtection,
        blast: p.blastProtection,
        fall: 0,
        fire: p.fireProtection,
        drown: 0,
        generic: 0
      })
    )
    for (const piece of armor) {
      itemDecls.push(
        render(ctx.mapping.armorMaterial.pieces[piece.kind as ArmorKind], {
          ...setVars,
          creative: ctx.creativeCall('armor')
        })
      )
      langLines.push(...itemLangLines(piece.name, `${displayName} ${titleCase(piece.kind)}`, ctx))
      itemModels.push(...ctx.itemModelCalls(piece.name))
    }
  }

  return { itemDecls, langLines, itemModels }
}
