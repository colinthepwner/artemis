import type { ArtemisElement } from '../../project'
import {
  effectAllowedOn,
  ITEM_DEFAULTS,
  itemTypeOf,
  type UseEffect,
  type UseRule,
  type ItemProps
} from '../props'
import { render, JavaWriter } from '../template'
import { toPascalCase } from '../../project'
import type { EmitContext, EmitContribution } from '../CodeGenerator'
import { titleCase, itemLangLines } from './block'
import { TOOL_KINDS, ARMOR_KINDS, kitPieces, type ToolKind, type ArmorKind } from '../family'

function itemUseClass(
  registryName: string,
  rules: UseRule[],
  ctx: EmitContext
): { className: string; file: { relPath: string; writer: JavaWriter } } {
  const className = `Item${toPascalCase(registryName)}`
  const w = new JavaWriter(`${ctx.pkg}.item`, ctx.mapping.imports)
  w.use('Item', 'ItemStack', 'World', 'Player', 'TilePosc', 'Side', 'Block')

  const iu = ctx.mapping.itemUse

  const bodies = (effects: UseEffect[], atPlayer: boolean): { client: string; server: string } => {
    const client: string[] = []
    const server: string[] = []
    for (const e of effects) {
      switch (e.kind) {
        case 'particles':
          client.push(
            render(atPlayer ? iu.particleAtPlayer : iu.particle, {
              name: e.name.trim(),
              count: Math.max(1, Math.min(64, Math.round(e.count || 8)))
            })
          )
          break
        case 'sound':
          w.use('SoundCategory')
          client.push(
            render(atPlayer ? iu.soundAtPlayer : iu.sound, { event: e.event.trim() })
          )
          break
        case 'becomes':

          if (!atPlayer) server.push(render(iu.becomes, { block: ctx.blockExpr(e.block, w) }))
          break
        case 'drops':
          server.push(
            render(atPlayer ? iu.dropsAtPlayer : iu.drops, {
              stack: ctx.stackExpr(e.item, Math.max(1, Math.round(e.count || 1)), w)
            })
          )
          break
        case 'cost':
          server.push(render(iu.cost, { amount: Math.max(1, Math.round(e.amount)) }))
          break
      }
    }
    return { client: client.join(''), server: server.join('') }
  }

  const allBlock = rules.filter((r) => r.on !== 'item')
  const firstAny = allBlock.findIndex((r) => r.on === 'anyBlock')
  const blockRules = firstAny === -1 ? allBlock : allBlock.slice(0, firstAny + 1)
  const blockFallsThrough = firstAny === -1

  const itemRules = rules.filter((r) => r.on === 'item')

  const methods: string[] = []

  if (blockRules.length) {
    const emitted = blockRules
      .map((r) => {
        const { client, server } = bodies(r.effects, false)

        const named = r.on === 'block'
        return render(named ? iu.rule : iu.ruleAny, {
          target: named ? ctx.blockExpr(r.target, w) : '',
          clientEffects: client,
          effects: server
        })
      })
      .join('')
    methods.push(
      render(iu.blockMethod, { rules: emitted, tail: blockFallsThrough ? iu.blockTail : '' })
    )
  }

  if (itemRules.length) {
    const merged = bodies(itemRules.flatMap((r) => r.effects), true)
    methods.push(
      render(iu.itemMethod, {
        rules: render(iu.itemRule, { clientEffects: merged.client, effects: merged.server }),
        tail: ''
      })
    )
  }

  w.block(render(iu.className, { className, methods: methods.join('') }))
  return { className, file: { relPath: `item/${className}.java`, writer: w } }
}

export function usableRules(rules: UseRule[] | undefined): UseRule[] {
  return (rules ?? [])
    .map((r) => ({
      ...r,
      on: r.on ?? 'block',
      effects: (r.effects ?? []).filter(
        (e) => isFilledEffect(e) && effectAllowedOn(e.kind, r.on ?? 'block')
      )
    }))

    .filter((r) => r.effects.length > 0 && !(r.on === 'block' && r.target.trim() === ''))
}

function isFilledEffect(e: UseEffect): boolean {
  switch (e.kind) {
    case 'becomes':
      return e.block.trim() !== ''
    case 'drops':
      return e.item.trim() !== ''
    case 'sound':
      return e.event.trim() !== ''
    case 'particles':
      return e.name.trim() !== ''
    case 'cost':
      return Math.round(e.amount) > 0
    default:
      return false
  }
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
  const langLines: string[] = itemLangLines(el.name, displayName, ctx, p.description)
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
          creative: ctx.creativeCall({ category: 'tool', registryName: el.name, family: 'item' })
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
          creative: ctx.creativeCall({ category: 'armor', registryName: el.name, family: 'item' })
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
  const use = rules.length ? itemUseClass(el.name, rules, ctx) : null

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
        creative: ctx.creativeCall({ category: p.category, registryName: el.name, family: 'item' })
      })
    ].join('\n')
  )

  return { itemDecls, langLines, itemModels, afterStart, files: use ? [use.file] : [] }
}
