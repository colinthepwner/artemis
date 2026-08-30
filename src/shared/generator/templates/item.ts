import type { ArtemisElement } from '../../project'
import { ITEM_DEFAULTS, itemTypeOf, type BlockUseRule, type ItemProps } from '../props'
import { render, JavaWriter } from '../template'
import { toPascalCase } from '../../project'
import type { EmitContext, EmitContribution } from '../CodeGenerator'
import { titleCase, itemLangLine } from './block'
import { TOOL_KINDS, ARMOR_KINDS, kitPieces, type ToolKind, type ArmorKind } from '../family'

function itemUseClass(
  registryName: string,
  rules: BlockUseRule[],
  cost: number,
  ctx: EmitContext
): { className: string; file: { relPath: string; writer: JavaWriter } } {
  const className = `Item${toPascalCase(registryName)}`
  const w = new JavaWriter(`${ctx.pkg}.item`, ctx.mapping.imports)
  w.use('Item', 'ItemStack', 'World', 'Player', 'TilePosc', 'Side', 'Block')

  const iu = ctx.mapping.itemUse
  const body = rules
    .map((r) => {

      let clientEffects = ''
      if (r.particle?.trim()) {
        clientEffects += render(iu.particle, {
          name: r.particle.trim(),
          count: Math.max(1, Math.min(64, Math.round(r.particleCount || 8)))
        })
      }
      if (r.sound?.trim()) {
        w.use('SoundCategory')
        clientEffects += render(iu.sound, { event: r.sound.trim() })
      }

      let effects = ''
      if (r.becomes.trim()) {
        effects += render(iu.becomes, { block: ctx.blockExpr(r.becomes, w) })
      }
      if (r.drops.trim()) {
        effects += render(iu.drops, {
          stack: ctx.stackExpr(r.drops, Math.max(1, Math.round(r.dropCount || 1)), w)
        })
      }

      if (cost > 0) effects += render(iu.cost, { amount: Math.round(cost) })
      return render(iu.rule, { target: ctx.blockExpr(r.target, w), clientEffects, effects })
    })
    .join('')

  w.block(render(iu.className, { className, rules: body }))
  return { className, file: { relPath: `item/${className}.java`, writer: w } }
}

export function usableRules(rules: BlockUseRule[] | undefined): BlockUseRule[] {
  return (rules ?? []).filter(
    (r) =>
      r.target.trim() !== '' &&
      (r.becomes.trim() !== '' ||
        r.drops.trim() !== '' ||
        (r.sound ?? '').trim() !== '' ||
        (r.particle ?? '').trim() !== '')
  )
}

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
  const armor = p.piece && (ARMOR_KINDS as readonly string[]).includes(p.piece) ? p.piece : null
  if (tool || armor) {
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
    } else if (armor) {
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
        render(ctx.mapping.armorMaterial.standalone[armor], {
          ...setVars,
          creative: ctx.creativeCall('armor')
        })
      )
    }

    return { itemDecls, langLines, itemModels }
  }

  const chain: string[] = []

  const durability = Math.max(0, Math.round(p.durability ?? 0))

  const isFood = itemTypeOf(p) === 'food'
  const stackSize = durability > 0 ? 1 : Math.max(1, Math.min(64, p.stackSize))
  if (!isFood && stackSize !== 64 && ib.methods['stackSize']) {
    chain.push('	' + render(ib.methods['stackSize'], { value: stackSize }))
  }
  if (durability > 0 && ib.methods['maxDamage']) {
    chain.push('	' + render(ib.methods['maxDamage'], { value: durability }))
  }

  const itemTags = (p.tags ?? []).map((t) => ctx.mapping.itemTags[t]).filter(Boolean)
  if (itemTags.length && ib.methods['tags']) {
    chain.push('	' + render(ib.methods['tags'], { value: [...new Set(itemTags)].join(', ') }))
  }

  const afterStart: string[] = []
  const burnTime = Math.max(0, Math.round(p.burnTime ?? 0))
  if (burnTime > 0) {
    afterStart.push(render(ctx.mapping.fuel.addEntry, { FIELD, ticks: burnTime }))
  }

  const rules = usableRules(p.blockUses)
  const use = rules.length ? itemUseClass(el.name, rules, p.blockUseCost ?? 0, ctx) : null

  itemDecls.push(
    [
      render(ib.decl, { FIELD }),
      ...chain,
      render(isFood ? ctx.mapping.food.build : use ? ib.buildCustom : ib.build, {
        displayName,
        registryName: el.name,
        modId: ctx.meta.modId,
        className: use?.className ?? '',
        healAmount: Math.max(0, Math.round(p.healAmount ?? 0)),
        eatTicks: Math.max(1, Math.round(p.eatTicks ?? 32)),
        wolfMeat: p.wolfMeat ? 'true' : 'false',
        stackSize,
        creative: ctx.creativeCall(p.category)
      })
    ].join('\n')
  )

  return { itemDecls, langLines, itemModels, afterStart, files: use ? [use.file] : [] }
}
