import type { ArtemisElement } from '../../project'
import { ORE_DEFAULTS, type OreProps } from '../props'
import { render } from '../template'
import type { EmitContext, EmitContribution } from '../CodeGenerator'
import { blockDecl, titleCase } from './block'
import { oreFamily } from '../family'

export function emitOre(el: ArtemisElement, ctx: EmitContext): EmitContribution {
  const p: OreProps = {
    ...ORE_DEFAULTS,
    ...(el.properties as Partial<OreProps>),
    set: { ...ORE_DEFAULTS.set, ...((el.properties as Partial<OreProps>).set ?? {}) }
  }

  p.drops = 'default'
  const FIELD = ctx.fieldOf(el.name)
  const itemDecls: string[] = []

  const base = oreFamily(el)!.base
  const BASE_FIELD = ctx.fieldOf(base)
  const baseDisplay = titleCase(base)

  const extraMethods: string[] = []
  if (p.dropMode === 'item') {
    const ib = ctx.mapping.itemBuilder
    itemDecls.push(
      [
        render(ib.decl, { FIELD: BASE_FIELD }),
        '\t' + render(ib.methods['icon'], { modId: ctx.meta.modId, registryName: base }),
        render(ib.build, { displayName: baseDisplay, registryName: base })
      ].join('\n')
    )

    extraMethods.push(`.setBlockDrop(() -> new ItemStack[]{new ItemStack(ModItems.${BASE_FIELD})})`)
  }

  const decl = blockDecl(el.name, p, ctx, extraMethods)

  const oreGenCall = render(ctx.mapping.oreGen.call, {
    FIELD: `ModBlocks.${FIELD}`,
    veinSize: p.veinSize,
    veinsPerChunk: p.veinsPerChunk,
    minY: p.minY,
    maxY: p.maxY
  })

  if (p.generateSet) {
    const s = p.set
    const setVars = {
      FIELD: BASE_FIELD,
      registryName: base,
      displayName: baseDisplay,
      modId: ctx.meta.modId
    }

    if (s.tools) {
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
      for (const tool of Object.values(ctx.mapping.toolMaterial.tools)) {
        itemDecls.push(render(tool, setVars))
      }
    }

    if (s.armor) {
      itemDecls.push(
        render(ctx.mapping.armorMaterial.decl, {
          ...setVars,
          durability: s.armorDurability,
          totalProtection: s.totalProtection,
          blastProtection: s.blastProtection,
          fireProtection: s.fireProtection
        })
      )
      for (const piece of Object.values(ctx.mapping.armorMaterial.pieces)) {
        itemDecls.push(render(piece, setVars))
      }
    }
  }

  return {
    blockDecls: [decl],
    itemDecls,
    oreGenCalls: [oreGenCall]
  }
}
