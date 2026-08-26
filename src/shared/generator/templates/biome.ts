import type { ArtemisElement } from '../../project'
import { toPascalCase } from '../../project'
import { BIOME_DEFAULTS, type BiomeProps } from '../props'
import { render } from '../template'
import type { EmitContext, EmitContribution } from '../CodeGenerator'
import { titleCase } from './block'

export function emitBiome(el: ArtemisElement, ctx: EmitContext): EmitContribution {
  const p = { ...BIOME_DEFAULTS, ...(el.properties as Partial<BiomeProps>) }
  const b = ctx.mapping.biome
  const FIELD = ctx.fieldOf(el.name)

  const blockExpr = (ref: string): string => {
    const t = ref.trim()
    if (!t) return 'null /* TODO: pick a block */'
    if (t.startsWith('block:')) return `Blocks.${t.slice(6).toUpperCase()}`
    const owner = ctx.project.elements.find((e) => e.name === t)
    if (owner) return `ModBlocks.${ctx.fieldOf(t)}`

    return `Blocks.${t.toUpperCase()}`
  }

  const chain: string[] = []
  chain.push(render(b.methods['climate'], { temperature: p.temperature, humidity: p.humidity }))
  chain.push(
    render(b.methods['colors'], {
      grassColor: p.grassColor.replace(/^#/, ''),
      foliageColor: p.foliageColor.replace(/^#/, '')
    })
  )
  chain.push(render(b.methods['topBlock'], { value: blockExpr(p.topBlock) }))
  chain.push(render(b.methods['fillerBlock'], { value: blockExpr(p.fillerBlock) }))
  if (p.treeDensity > 0) chain.push(render(b.methods['treeDensity'], { value: p.treeDensity }))
  for (const spawn of p.spawns) {
    const mob = ctx.project.elements.find((e) => e.name === spawn.entity && e.kind === 'mob')
    const entityClass = mob ? `${ctx.pkg}.entity.Entity${toPascalCase(mob.name)}` : spawn.entity
    chain.push(render(b.methods['spawns'], { entityClass, weight: spawn.weight }))
  }

  const decl = render(b.decl, {
    FIELD,
    registryName: el.name,
    displayName: p.displayName || titleCase(el.name),
    chain: chain.join('\n')
  })

  const attach = render(b.attach, {
    FIELD,
    temperature: p.temperature,
    humidity: p.humidity,
    variance: p.variance
  })

  return { biomeDecls: [decl], biomeAttach: [attach] }
}
