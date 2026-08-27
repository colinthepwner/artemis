import type { ArtemisElement } from '../../project'
import { ITEM_DEFAULTS, type ItemProps } from '../props'
import { render } from '../template'
import type { EmitContext, EmitContribution } from '../CodeGenerator'
import { titleCase, itemLangLine } from './block'
import { TOOL_KINDS, ARMOR_KINDS, kitPieces, type ToolKind, type ArmorKind } from '../family'

export function emitItem(el: ArtemisElement, ctx: EmitContext): EmitContribution {
  const p = {
    ...ITEM_DEFAULTS,
    ...(el.properties as Partial<ItemProps>),
    set: { ...ITEM_DEFAULTS.set, ...((el.properties as Partial<ItemProps>).set ?? {}) }
  }
  const FIELD = ctx.fieldOf(el.name)
  const displayName = p.displayName || titleCase(el.name)
  const ib = ctx.mapping.itemBuilder

  const itemDecls: string[] = []
  const langLines: string[] = [itemLangLine(el.name, displayName, ctx)]
  const itemModels: string[] = [...ctx.itemModelCalls(el.name)]

  const tool = p.piece && (TOOL_KINDS as readonly string[]).includes(p.piece) ? p.piece : null
  const armour = p.piece && (ARMOR_KINDS as readonly string[]).includes(p.piece) ? p.piece : null
  if (tool || armour) {
    const s = p.set
    const setVars = { FIELD, registryName: el.name, displayName, modId: ctx.meta.modId }
    if (tool) {
      itemDecls.push(
        render(ctx.mapping.toolMaterial.decl, {
          ...setVars,
          durability: s.durability,
          efficiency: s.efficiency,
          efficiencyOnProper: s.efficiency * 1.5,
          miningLevel: s.miningLevel,
          damage: s.damage
        }),
        render(ctx.mapping.toolMaterial.standalone[tool], {
          ...setVars,
          creative: ctx.creativeCall('tool')
        })
      )
    } else if (armour) {
      itemDecls.push(
        render(ctx.mapping.armorMaterial.decl, {
          ...setVars,
          durability: s.armorDurability,
          combat: s.totalProtection,
          blast: s.blastProtection,
          fall: 0,
          fire: s.fireProtection,
          drown: 0,
          generic: 0
        }),
        render(ctx.mapping.armorMaterial.standalone[armour], {
          ...setVars,
          creative: ctx.creativeCall('armor')
        })
      )
    }

    return { itemDecls, langLines, itemModels }
  }

  const chain: string[] = []
  if (p.stackSize !== 64 && ib.methods['stackSize']) {
    chain.push('\t' + render(ib.methods['stackSize'], { value: Math.max(1, Math.min(64, p.stackSize)) }))
  }
  itemDecls.push(
    [
      render(ib.decl, { FIELD }),
      ...chain,
      render(ib.build, {
        displayName,
        registryName: el.name,
        modId: ctx.meta.modId,
        creative: ctx.creativeCall(p.category)
      })
    ].join('\n')
  )

  if (p.generateSet) {
    const s = p.set
    const setVars = {
      FIELD,
      registryName: el.name,
      displayName,
      modId: ctx.meta.modId
    }
    const pieces = kitPieces(el)
    const tools = pieces.filter((piece) => piece.slot === 'tools')
    const armour = pieces.filter((piece) => piece.slot === 'armor')

    if (tools.length > 0) {
      itemDecls.push(
        render(ctx.mapping.toolMaterial.decl, {
          ...setVars,
          durability: s.durability,
          efficiency: s.efficiency,
          efficiencyOnProper: s.efficiency * 1.5,
          miningLevel: s.miningLevel,
          damage: s.damage
        })
      )
      for (const piece of tools) {
        itemDecls.push(
          render(ctx.mapping.toolMaterial.tools[piece.kind as ToolKind], {
            ...setVars,
            creative: ctx.creativeCall('tool')
          })
        )
        langLines.push(itemLangLine(piece.name, `${displayName} ${titleCase(piece.kind)}`, ctx))
        itemModels.push(...ctx.itemModelCalls(piece.name))
      }
    }

    if (armour.length > 0) {

      itemDecls.push(
        render(ctx.mapping.armorMaterial.decl, {
          ...setVars,
          durability: s.armorDurability,
          combat: s.totalProtection,
          blast: s.blastProtection,
          fall: 0,
          fire: s.fireProtection,
          drown: 0,
          generic: 0
        })
      )
      for (const piece of armour) {
        itemDecls.push(
          render(ctx.mapping.armorMaterial.pieces[piece.kind as ArmorKind], {
            ...setVars,
            creative: ctx.creativeCall('armor')
          })
        )
        langLines.push(itemLangLine(piece.name, `${displayName} ${titleCase(piece.kind)}`, ctx))
        itemModels.push(...ctx.itemModelCalls(piece.name))
      }
    }
  }

  return { itemDecls, langLines, itemModels }
}
