import type { ArtemisElement } from '../../project'
import { toPascalCase } from '../../project'
import { BLOCK_DEFAULTS, DIMENSION_DEFAULTS, type DimensionProps } from '../props'
import { render, JavaWriter } from '../template'
import type { EmitContext, EmitContribution } from '../CodeGenerator'
import { blockDecl, titleCase, tileLangLines } from './block'
import { biomeExpr } from '../biomeFilter'

export function emitDimension(el: ArtemisElement, ctx: EmitContext): EmitContribution {
  const p = { ...DIMENSION_DEFAULTS, ...(el.properties as Partial<DimensionProps>) }
  const d = ctx.mapping.dimension
  const FIELD = ctx.fieldOf(el.name)
  const TYPE_FIELD = `${FIELD}_TYPE`
  const displayName = p.displayName || titleCase(el.name)

  const biomes = (p.biomes ?? [])
    .map((ref) => biomeExpr(ref.trim(), ctx))
    .filter((e): e is string => Boolean(e))

  if (biomes.length === 0) return {}

  const worldTypeClass = `WorldType${toPascalCase(el.name)}`
  const providerClass = `BiomeProvider${toPascalCase(el.name)}`
  const portalName = `${el.name}_portal`
  const PORTAL_FIELD = ctx.fieldOf(portalName)

  const files: { relPath: string; writer: JavaWriter }[] = []

  const initImport = `import ${ctx.pkg}.init.ModBiomes;`
  const usesModBiomes = biomes.some((b) => b.includes('ModBiomes.'))

  const wt = new JavaWriter(`${ctx.pkg}.worldgen`, ctx.mapping.imports)
  if (usesModBiomes) wt.useRaw(initImport)
  let providerBody: string
  if (biomes.length === 1) {
    providerBody = render(d.providerSingle, { biome: biomes[0] })
  } else {
    providerBody = render(d.providerMulti, { providerClass })

    const pw = new JavaWriter(`${ctx.pkg}.worldgen`, ctx.mapping.imports)
    if (usesModBiomes) pw.useRaw(initImport)
    pw.block(
      render(d.providerClass, {
        className: providerClass,
        count: biomes.length,
        roster: biomes.join(', ')
      })
    )
    files.push({ relPath: `worldgen/${providerClass}.java`, writer: pw })
  }
  wt.block(
    render(d.worldTypeClass, {
      className: worldTypeClass,
      providerBody,
      allBiomes: biomes.join(', ')
    })
  )
  files.push({ relPath: `worldgen/${worldTypeClass}.java`, writer: wt })

  const vars = { FIELD, TYPE_FIELD, PORTAL_FIELD, modId: ctx.meta.modId, registryName: el.name, worldTypeClass }
  const dimensionDecls = [
    [render(d.typeDecl, vars), render(d.idDecl, vars), render(d.dimDecl, vars)].join('\n')
  ]

  const scratch = new JavaWriter(ctx.pkg, ctx.mapping.imports)
  const frame = ctx.blockExpr(p.portalFrame || 'block:OBSIDIAN', scratch)
  const portalDecl = blockDecl(
    portalName,
    {
      ...BLOCK_DEFAULTS,
      displayName: `${displayName} Portal`,
      material: 'glass',
      sound: 'glass',
      hardness: -1,
      resistance: 6000000,
      luminance: 15,
      tags: ['brokenByFluids'],
      drops: 'self',
      textureMode: 'all',
      notInCreativeMenu: true
    },
    ctx,
    {
      logic: render(d.portalLogic, { FIELD, frame }),
      logicType: 'BlockLogicPortal'
    }
  )

  const langLines = [
    `dimension.${ctx.meta.modId}.${el.name}.name=${displayName}`,
    `worldType.${ctx.meta.modId}.${el.name}.name=${displayName}`,
    ...tileLangLines(portalName, { displayName: `${displayName} Portal` }, ctx)
  ]

  const resources = d.portalColorIds.map((color) => ({
    path: `src/main/resources/assets/${ctx.meta.modId}/models/block/${portalName}/${color}.json`,
    content: render(d.portalModelJson, { modId: ctx.meta.modId, textureName: portalName })
  }))

  return {
    blockDecls: [portalDecl],

    portalIgnitions: [PORTAL_FIELD],
    dimensionDecls,
    dimensionAttaches: [render(d.attachCall, vars)],
    dimensionRegisters: [render(d.registerCall, vars)],
    worldFx: [render(ctx.mapping.models.worldFx, { TYPE_FIELD })],
    blockModels: [
      render(ctx.mapping.models.blockPortal, {
        FIELD: PORTAL_FIELD,
        modId: ctx.meta.modId,
        registryName: portalName
      })
    ],
    langLines,
    resources,
    files
  }
}
