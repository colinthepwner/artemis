import type { ArtemisElement } from '../../project'
import { toPascalCase } from '../../project'
import { BIOME_DEFAULTS, type BiomeProps } from '../props'
import { render, JavaWriter } from '../template'
import type { EmitContext, EmitContribution } from '../CodeGenerator'
import { titleCase } from './block'
import { treeFeatureClassName } from './tree'
import { biomeExpr } from '../biomeFilter'

export function biomeClassName(registryName: string): string {
  return `Biome${toPascalCase(registryName)}`
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

const round3 = (v: number): number => Math.round(v * 1000) / 1000

export function hexColor(value: string): string | null {
  const hex = value.replace(/[^0-9a-fA-F]/g, '')
  return hex.length === 6 ? hex.toUpperCase() : null
}

function varietyBand(
  el: ArtemisElement,
  claimants: ArtemisElement[]
): { min: number | null; max: number } {
  const rarityOf = (e: ArtemisElement): number => clamp01(biomePropsOf(e).rarity)

  const total = claimants.reduce((sum, e) => sum + rarityOf(e), 0)

  const scale = total > 1 ? 1 / total : 1

  let lo = 0
  for (const claimant of claimants) {
    const width = rarityOf(claimant) * scale
    if (claimant.id === el.id) {
      return { min: lo === 0 ? null : lo, max: clamp01(lo + width) }
    }
    lo += width
  }

  return { min: null, max: clamp01(rarityOf(el)) }
}

function biomePropsOf(e: ArtemisElement): BiomeProps {
  return { ...BIOME_DEFAULTS, ...(e.properties as Partial<BiomeProps>) }
}

function placementClaimants(el: ArtemisElement, ctx: EmitContext): ArtemisElement[] {
  const own = biomePropsOf(el)
  const ownStyle = own.generationStyle ?? 'substitute'
  return ctx.project.elements.filter((e) => {
    if (e.kind !== 'biome') return false
    const q = biomePropsOf(e)
    if (q.generateInOverworld === false) return false
    const style = q.generationStyle ?? 'substitute'
    if (style !== ownStyle) return false
    return style === 'climate' ? true : q.hostBiome === own.hostBiome
  })
}

export function emitBiome(el: ArtemisElement, ctx: EmitContext): EmitContribution {
  const p = { ...BIOME_DEFAULTS, ...(el.properties as Partial<BiomeProps>) }
  const b = ctx.mapping.biome
  const FIELD = ctx.fieldOf(el.name)
  const className = biomeClassName(el.name)
  const displayName = p.displayName || titleCase(el.name)

  const scratch = new JavaWriter('scratch', ctx.mapping.imports)

  const classWriter = new JavaWriter(`${ctx.pkg}.worldgen`, ctx.mapping.imports)
  classWriter.use('Biome')

  const extras: string[] = []
  const skyColor = hexColor(p.skyColor)
  if (skyColor) {
    extras.push(render(b.skyOverride, { color: skyColor }))
  }
  const claimants = ctx.project.elements.filter(
    (e) =>
      e.kind === 'tree' &&
      ((e.properties['biomes'] as string[] | undefined) ?? []).some((r) => r.trim() === el.name)
  )
  if (claimants.length > 0) {

    classWriter.use('WorldFeature', 'Random')
    const classNames = claimants.map((t) => treeFeatureClassName(t.name))
    extras.push(
      render(b.treeOverrideMulti, {
        count: classNames.length,
        cases: classNames
          .map((featureClass, i) => render(b.treeOverrideCase, { i, featureClass }))
          .join('\n'),

        first: classNames[0]
      })
    )
  } else if (p.vanillaTrees === false) {

    classWriter.use('WorldFeature', 'Random', 'World')
    extras.push(b.treeOverrideNone)
  }

  classWriter.block(
    render(b.classTemplate, {
      className,
      extra: extras.length ? '\n' + extras.join('\n\n') + '\n' : ''
    })
  )

  const blocked = (p.blockedWeathers ?? [])
    .map((key) => b.weathers[key])
    .filter((v): v is string => Boolean(v))
  const extraChain = blocked.length
    ? render(b.blockedWeathersChain, { weathers: blocked.join(', ') }) + '\n'
    : ''

  const decl = render(b.decl, {
    FIELD,
    className,
    modId: ctx.meta.modId,
    registryName: el.name,
    mapColor: p.mapColor.replace(/^#/, '').toUpperCase(),
    temperature: p.temperature,
    humidity: p.humidity,
    variance: p.variance,
    extraChain,
    topBlock: ctx.blockExpr(p.topBlock, scratch),
    fillerBlock: ctx.blockExpr(p.fillerBlock, scratch)
  })

  const inOverworld = p.generateInOverworld !== false
  const genStyle = p.generationStyle ?? 'substitute'

  let range = ''
  if (inOverworld) {

    const band = varietyBand(el, placementClaimants(el, ctx))
    if (genStyle === 'climate') {
      const window = ctx.mapping.biome.climateRange.window

      const climate = {
        FIELD,
        minTemp: round3(clamp01(p.temperature - window)),
        maxTemp: round3(clamp01(p.temperature + window)),
        minHum: round3(clamp01(p.humidity - window)),
        maxHum: round3(clamp01(p.humidity + window))
      }
      range =
        band.min === null
          ? render(b.rangeClimate, { ...climate, rarity: round3(band.max) })
          : render(b.rangeClimateBand, {
              ...climate,
              minVariety: round3(band.min),
              maxVariety: round3(band.max)
            })
    } else {
      const hostBiome = biomeExpr(p.hostBiome, ctx) ?? 'Biomes.OVERWORLD_FOREST'
      range =
        band.min === null
          ? render(b.range, { FIELD, hostBiome, rarity: round3(band.max) })
          : render(b.rangeBand, {
              FIELD,
              hostBiome,
              minVariety: round3(band.min),
              maxVariety: round3(band.max)
            })
    }
  }

  const waterColor = hexColor(p.waterColor)
  const grassColor = hexColor(p.grassColor)

  return {
    biomeDecls: [decl],
    biomeRanges: inOverworld ? [{ style: genStyle, code: range }] : [],
    waterColors: waterColor ? [{ FIELD, color: waterColor }] : [],
    grassColors: grassColor ? [{ FIELD, color: grassColor }] : [],
    langLines: [
      `${render(ctx.mapping.registration.biomeLangKey, {
        modId: ctx.meta.modId,
        registryName: el.name
      })}=${displayName}`
    ],
    files: [{ relPath: `worldgen/${className}.java`, writer: classWriter }]
  }
}
