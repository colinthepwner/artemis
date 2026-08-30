import type { ArtemisElement, ArtemisProject, ProjectMeta } from '../project'
import { toConstantCase, toPascalCase } from '../project'
import { getMapping, type BtaMapping } from './mappings'
import { getVanillaRegistry } from './vanilla'
import { projectRegistryEntries } from './registry'
import { JavaWriter, render, indent } from './template'
import { emitBlock } from './templates/block'
import { emitDimension } from './templates/dimension'
import { emitItem } from './templates/item'
import { emitLiquid } from './templates/liquid'
import { emitOre } from './templates/ore'
import { emitPlant } from './templates/plant'
import { emitTree } from './templates/tree'
import { emitStructure } from './templates/structure'
import { emitRecipe } from './templates/recipe'
import { emitMob } from './templates/mob'
import { emitBiome } from './templates/biome'

export interface GeneratedFile {

  path: string
  content: string
  language: 'java' | 'json' | 'gradle' | 'properties' | 'text'
}

export type BlockModelMode = 'all' | 'topBottomSides' | 'perFace' | 'cross' | 'fluid'

export interface EmitContribution {
  blockDecls?: string[]
  itemDecls?: string[]
  recipeCalls?: string[]
  biomeDecls?: string[]

  biomeRanges?: { style: 'substitute' | 'climate'; code: string }[]
  entityRegs?: string[]

  langLines?: string[]

  blockModels?: string[]
  itemModels?: string[]
  entityModels?: string[]

  afterStart?: string[]
  oreGenCalls?: string[]
  treeGenCalls?: string[]
  structureGenCalls?: string[]
  plantGenCalls?: string[]

  waterColors?: { FIELD: string; color: string }[]

  grassColors?: { FIELD: string; color: string }[]

  spawnCalls?: string[]

  dimensionDecls?: string[]

  dimensionAttaches?: string[]

  dimensionRegisters?: string[]

  portalIgnitions?: string[]

  worldFx?: string[]

  resources?: { path: string; content: string }[]

  files?: { relPath: string; writer: JavaWriter }[]
}

export interface EmitContext {
  mapping: BtaMapping
  meta: ProjectMeta
  project: ArtemisProject

  pkg: string

  entryClass: string

  fieldOf: (registryName: string) => string

  stackExpr: (ref: string, count: number, writer: JavaWriter) => string

  stackExprN: (ref: string, countJava: string | null, writer: JavaWriter) => string

  blockExpr: (ref: string, writer: JavaWriter) => string

  blockModelCalls: (
    registryName: string,
    mode: BlockModelMode,
    textureName?: string
  ) => { blockModels: string[]; itemModels: string[] }

  itemModelCalls: (registryName: string) => string[]

  creativeCall: (category: string) => string
}

type Emitter = (el: ArtemisElement, ctx: EmitContext) => EmitContribution

const EMITTERS: Record<string, Emitter> = {
  block: emitBlock,
  item: emitItem,
  liquid: emitLiquid,
  ore: emitOre,
  plant: emitPlant,
  tree: emitTree,
  structure: emitStructure,
  recipe: emitRecipe,
  mob: emitMob,
  biome: emitBiome,
  dimension: emitDimension
}

const MODEL_TEMPLATE_FOR: Record<BlockModelMode, string> = {
  all: 'blockAll',
  topBottomSides: 'blockTopBottomSides',
  perFace: 'blockPerFace',
  cross: 'blockCross',
  fluid: 'blockFluid'
}

export class CodeGenerator {
  private mapping: BtaMapping
  private ctx: EmitContext

  constructor(private project: ArtemisProject) {
    this.mapping = getMapping(project.meta.targetBta)
    const pkg = `com.${project.meta.modId}`
    const entryClass = `${toPascalCase(project.meta.modId)}Mod`

    this.ctx = {
      mapping: this.mapping,
      meta: project.meta,
      project,
      pkg,
      entryClass,
      fieldOf: toConstantCase,
      stackExpr: (ref, count, writer) =>
        this.stackExprN(ref, count === 1 ? null : String(count), writer),
      stackExprN: (ref, countJava, writer) => this.stackExprN(ref, countJava, writer),
      blockExpr: (ref, writer) => this.blockExpr(ref, writer),
      blockModelCalls: (name, mode, textureName) => this.blockModelCalls(name, mode, textureName),
      itemModelCalls: (name) => this.itemModelCalls(name),
      creativeCall: (category) =>
        render(this.mapping.creative.call, {
          category: this.mapping.creative.categories[category] ?? this.mapping.creative.categories.block
        })
    }
  }

  private header(scope: string): string {
    return [
      '/*',
      ` * ${scope}`,
      ` * Target: Better Than Adventure! ${this.mapping.btaVersion}`,
      ' *',
      ' * Made using Artemis (https://github.com/colinthepwner)',
      ' * Hand-edits are safe: Artemis only overwrites on re-export.',
      ' */'
    ].join('\n')
  }

  private blockModelCalls(
    registryName: string,
    mode: BlockModelMode,
    textureName = registryName
  ): { blockModels: string[]; itemModels: string[] } {
    const vars = {
      FIELD: this.ctx.fieldOf(registryName),
      registryName: textureName,
      modId: this.ctx.meta.modId
    }
    return {
      blockModels: [render(this.mapping.models[MODEL_TEMPLATE_FOR[mode]], vars)],

      itemModels: mode === 'fluid' ? [] : [render(this.mapping.models.blockItem, vars)]
    }
  }

  private itemModelCalls(registryName: string): string[] {
    return [
      render(this.mapping.models.item, {
        FIELD: this.ctx.fieldOf(registryName),
        registryName,
        modId: this.ctx.meta.modId
      })
    ]
  }

  private blockExpr(ref: string, writer: JavaWriter): string {
    const t = ref.trim()
    if (!t) return 'null /* TODO: pick a block */'
    if (t.startsWith('block:')) {
      writer.use('Blocks')
      return `Blocks.${t.slice(6).toUpperCase()}`
    }
    const owner = this.project.elements.find((e) => e.name === t)
    if (owner) {
      writer.useRaw(`import ${this.ctx.pkg}.init.ModBlocks;`)

      const name = owner.kind === 'liquid' ? `${t}_still` : t
      return `ModBlocks.${this.ctx.fieldOf(name)}`
    }

    const vanilla = getVanillaRegistry(this.project.meta.targetBta)
    if (vanilla.blocks.some((b) => b.field.toUpperCase() === t.toUpperCase())) {
      writer.use('Blocks')
      return `Blocks.${t.toUpperCase()}`
    }

    writer.use('Blocks')
    return `/* TODO: missing */ Blocks.DIRT`
  }

  private stackExprN(ref: string, countJava: string | null, writer: JavaWriter): string {
    const trimmed = ref.trim()
    const countArg = countJava === null ? '' : `, ${countJava}`

    if (!trimmed) {
      writer.use('ItemStack')
      return `/* TODO: pick an item */ (ItemStack) null`
    }

    if (trimmed.startsWith('block:')) {
      writer.use('Blocks', 'ItemStack')
      return `new ItemStack(Blocks.${trimmed.slice(6).toUpperCase()}${countArg})`
    }
    if (trimmed.startsWith('item:')) {
      writer.use('Items', 'ItemStack')
      return `new ItemStack(Items.${trimmed.slice(5).toUpperCase()}${countArg})`
    }

    const owner = this.project.elements.find((e) => e.name === trimmed)
    if (owner && ['block', 'plant', 'liquid'].includes(owner.kind)) {
      const name = owner.kind === 'liquid' ? `${trimmed}_still` : trimmed
      writer.use('ItemStack').useRaw(`import ${this.ctx.pkg}.init.ModBlocks;`)
      return `new ItemStack(ModBlocks.${this.ctx.fieldOf(name)}${countArg})`
    }

    const entry = projectRegistryEntries(this.project).find((e) => e.registryName === trimmed)
    if (entry?.kind === 'item') {
      writer.use('ItemStack').useRaw(`import ${this.ctx.pkg}.init.ModItems;`)
      return `new ItemStack(ModItems.${this.ctx.fieldOf(trimmed)}${countArg})`
    }

    writer.use('Items').use('ItemStack')
    return `/* TODO: missing */ new ItemStack(Items.STICK${countArg})`
  }

  generate(onlyElementId?: string): GeneratedFile[] {
    const elements = onlyElementId
      ? this.project.elements.filter((e) => e.id === onlyElementId)
      : this.project.elements

    const contributions = elements.map((el) => {
      const emitter = EMITTERS[el.kind]
      if (!emitter) throw new Error(`No emitter for kind "${el.kind}"`)
      return emitter(el, this.ctx)
    })

    const collect = (key: keyof EmitContribution): string[] =>
      contributions.flatMap((c) => (c[key] as string[] | undefined) ?? [])

    const files: GeneratedFile[] = []
    const javaRoot = `src/main/java/${this.ctx.pkg.replace(/\./g, '/')}`
    const preview = !!onlyElementId
    const modId = this.ctx.meta.modId

    const langLines = collect('langLines')
    if (langLines.length) {
      const dir = render(this.mapping.registration.langDir, { modId })
      files.push({
        path: `${dir}/${modId}.lang`,
        content: langLines.join('\n') + '\n',
        language: 'properties'
      })
    }

    const blockDecls = collect('blockDecls')
    if (blockDecls.length) {
      const w = new JavaWriter(`${this.ctx.pkg}.init`, this.mapping.imports)
      w.useRaw(`import static ${this.ctx.pkg}.${this.ctx.entryClass}.*;`)
      w.use('Block', 'BlockLogic')

      if (contributions.some((c) => (c.files ?? []).some((f) => f.relPath.startsWith('block/')))) {
        w.useRaw(`import ${this.ctx.pkg}.block.*;`)
      }
      w.line(`public final class ModBlocks {`)
      blockDecls.forEach((d) => w.line('').block(indent(d)))
      w.line('')
      w.line('\t/** Forces static initialization. Called from the mod entrypoint. */')
      w.line('\tpublic static void init() {}')
      w.line('}')
      files.push({
        path: `${javaRoot}/init/ModBlocks.java`,
        content: w.toString(this.header('Block registry')),
        language: 'java'
      })
    }

    const itemDecls = collect('itemDecls')
    if (itemDecls.length) {
      const w = new JavaWriter(`${this.ctx.pkg}.init`, this.mapping.imports)
      w.useRaw(`import static ${this.ctx.pkg}.${this.ctx.entryClass}.*;`)
      w.use('Item')
      w.line(`public final class ModItems {`)
      itemDecls.forEach((d) => w.line('').block(indent(d)))
      w.line('')
      w.line('\tpublic static void init() {}')
      w.line('}')
      files.push({
        path: `${javaRoot}/init/ModItems.java`,
        content: w.toString(this.header('Item registry')),
        language: 'java'
      })
    }

    const recipeCalls = collect('recipeCalls')
    if (recipeCalls.length) {
      const w = new JavaWriter(`${this.ctx.pkg}.init`, this.mapping.imports)
      w.useRaw(`import static ${this.ctx.pkg}.${this.ctx.entryClass}.MOD_ID;`)
      w.use('RecipeBuilder')
      w.line(`public final class ModRecipes {`)
      w.line('')
      w.line('\tpublic static void init() {')
      recipeCalls.forEach((c) => w.block(indent(c, 2)))
      w.line('\t}')
      w.line('}')
      files.push({
        path: `${javaRoot}/init/ModRecipes.java`,
        content: w.toString(this.header('Recipe registration')),
        language: 'java'
      })
    }

    const biomeDecls = collect('biomeDecls')
    if (biomeDecls.length) {
      const w = new JavaWriter(`${this.ctx.pkg}.init`, this.mapping.imports)
      w.useRaw(
        `import static ${this.ctx.pkg}.${this.ctx.entryClass}.MOD_ID;`,
        `import ${this.ctx.pkg}.worldgen.*;`
      )
      w.use('Biome', 'Biomes', 'SurfaceProperties')

      if (biomeDecls.some((d) => d.includes('Weathers.'))) w.use('Weathers')
      w.line(`public final class ModBiomes {`)
      biomeDecls.forEach((d) => w.line('').block(indent(d)))
      w.line('')
      w.line('\t/** Forces static initialization. Called from the mod entrypoint. */')
      w.line('\tpublic static void init() {}')
      w.line('}')
      files.push({
        path: `${javaRoot}/init/ModBiomes.java`,
        content: w.toString(this.header('Biome registry')),
        language: 'java'
      })
    }

    const entityRegs = collect('entityRegs')
    const spawnCalls = collect('spawnCalls')
    if (entityRegs.length) {
      const w = new JavaWriter(`${this.ctx.pkg}.init`, this.mapping.imports)
      w.useRaw(
        `import static ${this.ctx.pkg}.${this.ctx.entryClass}.*;`,
        `import ${this.ctx.pkg}.entity.*;`
      )
      w.use('EntityHelper', 'NamespaceID')
      w.line(`public final class ModEntities {`)
      w.line('')
      w.line('\tpublic static void init() {')
      entityRegs.forEach((c) => w.block(indent(c, 2)))
      if (spawnCalls.length) {
        w.line('')
        w.line('\t\t// natural spawning, declared on each mob (see spawn below)')
        spawnCalls.forEach((c) => w.block(indent(c, 2)))
      }
      w.line('\t}')
      if (spawnCalls.length) {

        w.line('')
        w.block(indent(this.mapping.entity.spawnHelper))
      }
      w.line('}')
      files.push({
        path: `${javaRoot}/init/ModEntities.java`,
        content: w.toString(this.header('Entity registry')),
        language: 'java'
      })
    }

    const dimensionDecls = collect('dimensionDecls')
    const dimensionAttaches = collect('dimensionAttaches')
    const dimensionRegisters = collect('dimensionRegisters')
    if (dimensionDecls.length) {
      const w = new JavaWriter(`${this.ctx.pkg}.init`, this.mapping.imports)
      w.useRaw(`import static ${this.ctx.pkg}.${this.ctx.entryClass}.*;`)

      w.useRaw(`import ${this.ctx.pkg}.worldgen.*;`)
      w.block(
        render(this.mapping.dimension.classTemplate, {
          decls: dimensionDecls.map((d) => indent(d)).join('\n\n'),
          attaches: dimensionAttaches.map((a) => a + '\n').join(''),
          registers: dimensionRegisters.map((r) => r + '\n').join('')
        })
      )
      files.push({
        path: `${javaRoot}/init/ModDimensions.java`,
        content: w.toString(this.header('Dimension registry')),
        language: 'java'
      })
    }

    const blockModels = collect('blockModels')
    const itemModels = collect('itemModels')
    const entityModels = collect('entityModels')
    const worldFx = collect('worldFx')
    const modelsClass = `${toPascalCase(modId)}Models`
    const hasModels =
      blockModels.length || itemModels.length || entityModels.length || worldFx.length
    if (hasModels) {
      const w = new JavaWriter(`${this.ctx.pkg}.client`, this.mapping.imports)
      w.use('ClientEvents', 'Key')
      w.useRaw(`import static ${this.ctx.pkg}.${this.ctx.entryClass}.MOD_ID;`)

      if (blockDecls.length) w.useRaw(`import ${this.ctx.pkg}.init.ModBlocks;`)
      if (itemDecls.length) w.useRaw(`import ${this.ctx.pkg}.init.ModItems;`)
      if (entityModels.length) w.useRaw(`import ${this.ctx.pkg}.entity.*;`)
      if (worldFx.length) w.useRaw(`import ${this.ctx.pkg}.init.ModDimensions;`)
      w.block(
        render(this.mapping.models.classTemplate, {
          className: modelsClass,
          blockModels: blockModels.map((c) => `\t\t\t${c}`).join('\n'),
          itemModels: itemModels.map((c) => `\t\t\t${c}`).join('\n'),
          entityModels: entityModels.map((c) => `\t\t\t${c}`).join('\n'),

          extraRegister: worldFx.length ? '\n' + worldFx.join('\n') + '\n' : ''
        })
      )
      files.push({
        path: `${javaRoot}/client/${modelsClass}.java`,
        content: w.toString(this.header('Model and renderer registration')),
        language: 'java'
      })
    }

    const mixinPkg = this.mapping.oreGen.mixinPackage
    const mixinClasses: string[] = []

    const oreGenCalls = collect('oreGenCalls')
    const treeGenCalls = collect('treeGenCalls')
    const structureGenCalls = collect('structureGenCalls')
    const plantGenCalls = collect('plantGenCalls')
    const worldGenCalls = [...oreGenCalls, ...treeGenCalls, ...structureGenCalls, ...plantGenCalls]
    if (worldGenCalls.length) {
      const className = `${toPascalCase(modId)}OreWorldGen`
      mixinClasses.push(className)
      const w = new JavaWriter(`${this.ctx.pkg}.${mixinPkg}`, this.mapping.imports)

      if (worldGenCalls.some((c) => c.includes('ModBlocks.'))) {
        w.useRaw(`import ${this.ctx.pkg}.init.ModBlocks;`)
      }
      if (worldGenCalls.some((c) => /\bBlocks\./.test(c))) {
        w.use('Blocks')
      }

      if (worldGenCalls.some((c) => c.includes('ModBiomes.'))) {
        w.useRaw(`import ${this.ctx.pkg}.init.ModBiomes;`)
      }

      if (treeGenCalls.length || structureGenCalls.length) {
        w.useRaw(`import ${this.ctx.pkg}.worldgen.*;`)
      }
      w.use('World', 'Chunk', 'ChunkDecoratorOverworld', 'WorldFeatureOre', 'TilePos', 'Random')
      w.useRaw(...MIXIN_IMPORTS)
      w.block(
        render(this.mapping.oreGen.mixinClass, {
          className,
          body: worldGenCalls.join('\n\n')
        })
      )
      files.push({
        path: `${javaRoot}/${mixinPkg}/${className}.java`,
        content: w.toString(this.header('World generation')),
        language: 'java'
      })
    }

    const rangeContributions = contributions.flatMap((c) => c.biomeRanges ?? [])
    const biomeRanges = [
      ...rangeContributions.filter((r) => r.style !== 'climate'),
      ...rangeContributions.filter((r) => r.style === 'climate')
    ].map((r) => r.code)
    if (biomeRanges.length) {
      const className = `${toPascalCase(modId)}BiomePlacement`
      mixinClasses.push(className)
      const w = new JavaWriter(`${this.ctx.pkg}.${mixinPkg}`, this.mapping.imports)
      w.useRaw(`import ${this.ctx.pkg}.init.ModBiomes;`)
      w.use('Biome', 'BiomeProviderOverworld')
      w.useRaw(
        ...MIXIN_IMPORTS,
        'import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;'
      )
      w.block(
        render(this.mapping.biome.rangeMixinClass, {
          className,
          ranges: biomeRanges.join('\n')
        })
      )
      files.push({
        path: `${javaRoot}/${mixinPkg}/${className}.java`,
        content: w.toString(this.header('Biome placement')),
        language: 'java'
      })
    }

    const clientMixinClasses: string[] = []
    const serverMixinClasses: string[] = []
    const waterColors = contributions.flatMap((c) => c.waterColors ?? [])
    if (waterColors.length) {
      const b = this.mapping.biome

      const waterClass = `${toPascalCase(modId)}WaterColor`
      clientMixinClasses.push(waterClass)
      const ww = new JavaWriter(`${this.ctx.pkg}.${mixinPkg}`, this.mapping.imports)
      ww.useRaw(`import ${this.ctx.pkg}.init.ModBiomes;`)
      ww.use('Biome', 'BlockColorWater', 'WorldSource', 'TilePosc')
      ww.useRaw(
        'import org.spongepowered.asm.mixin.Mixin;',
        'import org.spongepowered.asm.mixin.injection.At;',
        'import org.spongepowered.asm.mixin.injection.Inject;',
        'import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;'
      )
      ww.block(
        render(b.waterColorMixinClass, {
          className: waterClass,
          cases: waterColors.map((wc) => render(b.waterColorCase, wc)).join('')
        })
      )
      files.push({
        path: `${javaRoot}/${mixinPkg}/${waterClass}.java`,
        content: ww.toString(this.header('Per-biome water color')),
        language: 'java'
      })

      const rainClass = `${toPascalCase(modId)}RainTint`
      clientMixinClasses.push(rainClass)
      const rw = new JavaWriter(`${this.ctx.pkg}.${mixinPkg}`, this.mapping.imports)
      rw.useRaw(`import ${this.ctx.pkg}.init.ModBiomes;`)
      rw.use('Biome', 'WorldRenderer', 'TessellatorGeneral', 'Minecraft', 'WeatherRain')
      rw.useRaw(
        'import org.spongepowered.asm.mixin.Mixin;',
        'import org.spongepowered.asm.mixin.Shadow;',
        'import org.spongepowered.asm.mixin.injection.At;',
        'import org.spongepowered.asm.mixin.injection.Redirect;'
      )

      const channel = (hex: string, at: number): string =>
        (parseInt(hex.slice(at, at + 2), 16) / 255).toFixed(4)
      rw.block(
        render(b.rainTintMixinClass, {
          className: rainClass,
          cases: waterColors
            .map((wc) =>
              render(b.rainTintCase, {
                FIELD: wc.FIELD,
                r: channel(wc.color, 0),
                g: channel(wc.color, 2),
                b: channel(wc.color, 4)
              })
            )
            .join('')
        })
      )
      files.push({
        path: `${javaRoot}/${mixinPkg}/${rainClass}.java`,
        content: rw.toString(this.header('Rain tinted to the biome water color')),
        language: 'java'
      })
    }

    const grassColors = contributions.flatMap((c) => c.grassColors ?? [])
    if (grassColors.length) {
      const b = this.mapping.biome
      const grassClass = `${toPascalCase(modId)}GrassColor`
      clientMixinClasses.push(grassClass)
      const gw = new JavaWriter(`${this.ctx.pkg}.${mixinPkg}`, this.mapping.imports)
      gw.useRaw(
        `import ${this.ctx.pkg}.init.ModBiomes;`,
        'import org.spongepowered.asm.mixin.Mixin;',
        'import org.spongepowered.asm.mixin.injection.At;',
        'import org.spongepowered.asm.mixin.injection.Inject;',
        'import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;'
      )
      gw.block(
        render(b.grassColorMixinClass, {
          className: grassClass,
          cases: grassColors.map((gc) => render(b.grassColorCase, gc)).join('')
        })
      )
      files.push({
        path: `${javaRoot}/${mixinPkg}/${grassClass}.java`,
        content: gw.toString(this.header('Per-biome grass color')),
        language: 'java'
      })
    }

    const portalIgnitions = contributions.flatMap((c) => c.portalIgnitions ?? [])
    if (portalIgnitions.length) {
      const fireClass = `${toPascalCase(modId)}PortalIgnition`
      mixinClasses.push(fireClass)
      const fw = new JavaWriter(`${this.ctx.pkg}.${mixinPkg}`, this.mapping.imports)
      fw.useRaw(`import ${this.ctx.pkg}.init.ModBlocks;`)
      fw.use('Block', 'Blocks', 'BlockLogicFire', 'BlockLogicPortal', 'TilePos', 'TilePosc', 'World')
      fw.useRaw(...MIXIN_IMPORTS)
      fw.block(
        render(this.mapping.dimension.fireMixinClass, {
          className: fireClass,
          cases: portalIgnitions
            .map((PORTAL_FIELD) => render(this.mapping.dimension.fireCase, { PORTAL_FIELD }))
            .join('')
        })
      )
      files.push({
        path: `${javaRoot}/${mixinPkg}/${fireClass}.java`,
        content: fw.toString(this.header('Lighting the portals into this mod')),
        language: 'java'
      })
    }

    if (dimensionDecls.length) {
      const serverClass = `${toPascalCase(modId)}ServerDimensions`
      serverMixinClasses.push(serverClass)
      const sw = new JavaWriter(`${this.ctx.pkg}.${mixinPkg}`, this.mapping.imports)
      sw.useRaw(
        `import ${this.ctx.pkg}.init.ModDimensions;`,
        'import org.spongepowered.asm.mixin.Mixin;',
        'import org.spongepowered.asm.mixin.injection.At;',
        'import org.spongepowered.asm.mixin.injection.Inject;',
        'import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;'
      )
      sw.block(render(this.mapping.dimension.serverMixinClass, { className: serverClass }))
      files.push({
        path: `${javaRoot}/${mixinPkg}/${serverClass}.java`,
        content: sw.toString(this.header('Dimension registration, server side')),
        language: 'java'
      })
    }

    if (mixinClasses.length || clientMixinClasses.length || serverMixinClasses.length) {
      files.push({
        path: `src/main/resources/${modId}.mixins.json`,
        content: render(this.mapping.oreGen.mixinsJson, {
          pkg: this.ctx.pkg,
          mixins: mixinClasses.map((c) => `\t\t"${c}"`).join(',\n'),
          clientMixins: clientMixinClasses.map((c) => `\t\t"${c}"`).join(',\n'),
          serverMixins: serverMixinClasses.map((c) => `\t\t"${c}"`).join(',\n')
        }),
        language: 'json'
      })
    }

    for (const c of contributions) {
      for (const r of c.resources ?? []) {
        files.push({ path: r.path, content: r.content, language: 'json' })
      }
    }

    for (const c of contributions) {
      for (const f of c.files ?? []) {
        files.push({
          path: `${javaRoot}/${f.relPath}`,
          content: f.writer.toString(this.header('Generated element source')),
          language: 'java'
        })
      }
    }

    if (!preview) {

      const afterStart = collect('afterStart')
      if (dimensionDecls.length) afterStart.push('ModDimensions.register();')
      files.unshift(
        this.entrypointFile(
          javaRoot,
          {
            hasBlocks: blockDecls.length > 0,
            hasItems: itemDecls.length > 0,
            hasRecipes: recipeCalls.length > 0,
            hasBiomes: biomeDecls.length > 0,
            hasEntities: entityRegs.length > 0,
            hasDimensions: dimensionDecls.length > 0
          },
          afterStart,
          hasModels ? modelsClass : null
        )
      )
    }

    return files
  }

  private entrypointFile(
    javaRoot: string,
    has: Record<
      'hasBlocks' | 'hasItems' | 'hasRecipes' | 'hasBiomes' | 'hasEntities' | 'hasDimensions',
      boolean
    >,

    afterStart: string[],

    modelsClass: string | null
  ): GeneratedFile {
    const m = this.mapping
    const w = new JavaWriter(this.ctx.pkg, m.imports)
    w.use(
      'ModInitializer',
      'Logger',
      'LoggerFactory',
      'TomlConfigHandler',
      'Toml',
      'HalpLibe',
      'CommonEvents',
      'Key',
      'RecipeBuilder'
    )
    if (
      has.hasBlocks ||
      has.hasItems ||
      has.hasRecipes ||
      has.hasBiomes ||
      has.hasEntities ||
      has.hasDimensions
    ) {
      w.useRaw(`import ${this.ctx.pkg}.init.*;`)
    }

    const listen = (event: string, body: string[], fallback: string): string =>
      '\t\t' +
      render(m.entrypoint.listen, {
        event: m.entrypoint.events[event],
        listener: `() -> {\n${(body.length ? body : [fallback]).map((l) => `\t\t\t${l}`).join('\n')}\n\t\t}`
      })

    const registrations = [
      has.hasBlocks && 'ModBlocks.init();',
      has.hasItems && 'ModItems.init();',
      has.hasBiomes && 'ModBiomes.init();',
      has.hasEntities && 'ModEntities.init();',
      has.hasDimensions && 'ModDimensions.init();',

      has.hasDimensions && 'ModDimensions.attachPortals();'
    ].filter((v): v is string => typeof v === 'string')

    const hooks = [
      listen('beforeGameStart', registrations, '// nothing registered yet'),
      listen('afterGameStart', afterStart, '// nothing to wire up after registration'),

      listen('namespaces', [m.registration.initNamespace], ''),
      ...(has.hasRecipes ? [listen('recipes', ['ModRecipes.init();'], '')] : [])
    ]
    if (modelsClass) {

      w.useRaw(`import ${this.ctx.pkg}.client.${modelsClass};`)
      hooks.push('\t\t' + render(m.entrypoint.clientGuard, { className: modelsClass }))
    }

    const idEntries = Object.entries(m.idRanges).filter(
      ([k, v]) => !k.startsWith('$') && typeof v === 'object' && v !== null
    )
    const cfg = idEntries
      .map(([kind, r]) => `\t\tconfigToml.addEntry("starting_${kind}_id", ${r.start});`)
      .join('\n')
    const idFields = idEntries
      .map(
        ([kind]) =>
          `\tprivate static int next${cap(kind)}ID;\n\tpublic static int next${cap(kind)}ID() { return next${cap(kind)}ID++; }`
      )
      .join('\n')
    const idInit = idEntries
      .map(([kind]) => `\t\tnext${cap(kind)}ID = config.getInt("starting_${kind}_id");`)
      .join('\n')

    const iface = m.entrypoint.interfaces.join(', ')

    w.block(`public class ${this.ctx.entryClass} implements ${iface} {

\tpublic static final String MOD_ID = "${this.ctx.meta.modId}";
\tpublic static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);
\tpublic static final TomlConfigHandler config;

${idFields}

\tstatic {
\t\t// Registry IDs come from config so end users can shift the whole band
\t\t// if another mod collides. Artemis only picks the defaults.
\t\tToml configToml = new Toml("${this.ctx.meta.name} configuration");
${cfg}
\t\tconfig = new TomlConfigHandler(MOD_ID, configToml);
${idInit}
\t}

\t@Override
\tpublic void onInitialize() {
\t\t// Not optional, and it has to happen this early. Registries.NAMESPACES
\t\t// is what the texture stitcher and the language loader both walk, and
\t\t// this call is the only way into it. Without it the mod's blocks wear
\t\t// the missing texture and every name reads as its raw key.
\t\t${m.registration.registerMod}

${hooks.join('\n\n')}

\t\tLOGGER.info("${this.ctx.meta.name} initialized. (Made using Artemis)");
\t}
}`)

    return {
      path: `${javaRoot}/${this.ctx.entryClass}.java`,
      content: w.toString(this.header(`${this.ctx.meta.name} mod entrypoint`)),
      language: 'java'
    }
  }
}

const MIXIN_IMPORTS = [
  'import org.spongepowered.asm.mixin.Final;',
  'import org.spongepowered.asm.mixin.Mixin;',
  'import org.spongepowered.asm.mixin.Shadow;',
  'import org.spongepowered.asm.mixin.injection.At;',
  'import org.spongepowered.asm.mixin.injection.Inject;',
  'import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;'
]

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1)
}

export function previewElement(project: ArtemisProject, elementId: string): GeneratedFile[] {
  return new CodeGenerator(project).generate(elementId)
}

export { render }
