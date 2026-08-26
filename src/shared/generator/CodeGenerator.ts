import type { ArtemisElement, ArtemisProject, ProjectMeta } from '../project'
import { toConstantCase, toPascalCase } from '../project'
import { getMapping, type BtaMapping } from './mappings'
import { JavaWriter, render } from './template'
import { emitBlock } from './templates/block'
import { emitLiquid } from './templates/liquid'
import { emitOre } from './templates/ore'
import { emitPlant } from './templates/plant'
import { emitTree } from './templates/tree'
import { emitRecipe } from './templates/recipe'
import { emitMob } from './templates/mob'
import { emitBiome } from './templates/biome'

export interface GeneratedFile {

  path: string
  content: string
  language: 'java' | 'json' | 'gradle' | 'properties' | 'text'
}

export interface EmitContribution {
  blockDecls?: string[]
  itemDecls?: string[]
  recipeCalls?: string[]
  biomeDecls?: string[]
  biomeAttach?: string[]
  entityRegs?: string[]
  oreGenCalls?: string[]

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
}

type Emitter = (el: ArtemisElement, ctx: EmitContext) => EmitContribution

const EMITTERS: Record<string, Emitter> = {
  block: emitBlock,
  liquid: emitLiquid,
  ore: emitOre,
  plant: emitPlant,
  tree: emitTree,
  recipe: emitRecipe,
  mob: emitMob,
  biome: emitBiome
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
      stackExpr: (ref, count, writer) => this.stackExpr(ref, count, writer)
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

  private stackExpr(ref: string, count: number, writer: JavaWriter): string {
    const trimmed = ref.trim()
    const countArg = count === 1 ? '' : `, ${count}`

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

    const field = this.ctx.fieldOf(trimmed)
    const owner = this.project.elements.find((e) => e.name === trimmed)
    if (owner && ['block', 'ore', 'plant', 'tree', 'liquid'].includes(owner.kind)) {
      writer.use('ItemStack').useRaw(`import ${this.ctx.pkg}.init.ModBlocks;`)
      return `new ItemStack(ModBlocks.${field}${countArg})`
    }

    writer.use('ItemStack').useRaw(`import ${this.ctx.pkg}.init.ModItems;`)
    return `new ItemStack(ModItems.${field}${countArg})`
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

    const blockDecls = collect('blockDecls')
    if (blockDecls.length || !preview) {
      const w = new JavaWriter(`${this.ctx.pkg}.init`, this.mapping.imports)
      w.useRaw(`import static ${this.ctx.pkg}.${this.ctx.entryClass}.*;`)
      w.use('Block', 'BlockLogic')
      w.line(`public final class ModBlocks {`)
      blockDecls.forEach((d) => w.line('').block(indentChunk(d)))
      w.line('')
      w.line('\t/** Forces static initialization. Called from the mod entrypoint. */')
      w.line('\tpublic static void init() {}')
      w.line('}')
      if (blockDecls.length) {
        files.push({
          path: `${javaRoot}/init/ModBlocks.java`,
          content: w.toString(this.header('Block registry')),
          language: 'java'
        })
      }
    }

    const itemDecls = collect('itemDecls')
    if (itemDecls.length) {
      const w = new JavaWriter(`${this.ctx.pkg}.init`, this.mapping.imports)
      w.useRaw(`import static ${this.ctx.pkg}.${this.ctx.entryClass}.*;`)
      w.use('Item')
      w.line(`public final class ModItems {`)
      itemDecls.forEach((d) => w.line('').block(indentChunk(d)))
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
      recipeCalls.forEach((c) => w.block(indentChunk(c, 2)))
      w.line('\t}')
      w.line('}')
      files.push({
        path: `${javaRoot}/init/ModRecipes.java`,
        content: w.toString(this.header('Recipe registration')),
        language: 'java'
      })
    }

    const biomeDecls = collect('biomeDecls')
    const biomeAttach = collect('biomeAttach')
    if (biomeDecls.length) {
      const w = new JavaWriter(`${this.ctx.pkg}.init`, this.mapping.imports)
      w.useRaw(`import static ${this.ctx.pkg}.${this.ctx.entryClass}.MOD_ID;`)
      w.use('Biome', 'BiomeHelper')
      w.line(`public final class ModBiomes {`)
      biomeDecls.forEach((d) => w.line('').block(indentChunk(d)))
      w.line('')
      w.line('\tpublic static void init() {')
      biomeAttach.forEach((c) => w.block(indentChunk(c, 2)))
      w.line('\t}')
      w.line('}')
      files.push({
        path: `${javaRoot}/init/ModBiomes.java`,
        content: w.toString(this.header('Biome registry')),
        language: 'java'
      })
    }

    const entityRegs = collect('entityRegs')
    if (entityRegs.length) {
      const w = new JavaWriter(`${this.ctx.pkg}.init`, this.mapping.imports)
      w.useRaw(
        `import static ${this.ctx.pkg}.${this.ctx.entryClass}.*;`,
        `import ${this.ctx.pkg}.entity.*;`
      )
      w.use('EntityHelper')
      w.line(`public final class ModEntities {`)
      w.line('')
      w.line('\tpublic static void init() {')
      entityRegs.forEach((c) => w.block(indentChunk(c, 2)))
      w.line('\t}')
      w.line('}')
      files.push({
        path: `${javaRoot}/init/ModEntities.java`,
        content: w.toString(this.header('Entity registry')),
        language: 'java'
      })
    }

    const oreGenCalls = collect('oreGenCalls')
    if (oreGenCalls.length) {
      const className = `${toPascalCase(this.project.meta.modId)}OreWorldGen`
      const w = new JavaWriter(`${this.ctx.pkg}.worldgen`, this.mapping.imports)
      w.useRaw(`import ${this.ctx.pkg}.init.ModBlocks;`)
      w.use('World', 'Chunk', 'ChunkDecoratorOverworld', 'WorldFeatureOre', 'TilePos', 'Random')
      w.useRaw(
        'import org.spongepowered.asm.mixin.Final;',
        'import org.spongepowered.asm.mixin.Mixin;',
        'import org.spongepowered.asm.mixin.Shadow;',
        'import org.spongepowered.asm.mixin.injection.At;',
        'import org.spongepowered.asm.mixin.injection.Inject;',
        'import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;'
      )
      w.block(
        render(this.mapping.oreGen.mixinClass, {
          className,
          veins: oreGenCalls.join('\n\n')
        })
      )
      files.push({
        path: `${javaRoot}/worldgen/${className}.java`,
        content: w.toString(this.header('Ore world generation')),
        language: 'java'
      })
      files.push({
        path: `src/main/resources/${this.project.meta.modId}.mixins.json`,
        content: render(this.mapping.oreGen.mixinsJson, { pkg: this.ctx.pkg, className }),
        language: 'json'
      })
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
      files.unshift(this.entrypointFile(javaRoot, {
        hasBlocks: blockDecls.length > 0,
        hasItems: itemDecls.length > 0,
        hasRecipes: recipeCalls.length > 0,
        hasBiomes: biomeDecls.length > 0,
        hasEntities: entityRegs.length > 0,
        hasOreGen: oreGenCalls.length > 0
      }))
    }

    return files
  }

  private entrypointFile(
    javaRoot: string,
    has: Record<'hasBlocks' | 'hasItems' | 'hasRecipes' | 'hasBiomes' | 'hasEntities' | 'hasOreGen', boolean>
  ): GeneratedFile {
    const m = this.mapping
    const w = new JavaWriter(this.ctx.pkg, m.imports)
    w.use('ModInitializer', 'GameStartEntrypoint', 'RecipeEntrypoint', 'Logger', 'LoggerFactory', 'TomlConfigHandler', 'Toml')
    if (has.hasBlocks || has.hasItems || has.hasRecipes || has.hasBiomes || has.hasEntities) {
      w.useRaw(`import ${this.ctx.pkg}.init.*;`)
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
\t\tLOGGER.info("${this.ctx.meta.name} initialized. (Made using Artemis)");
\t}

\t@Override
\tpublic void beforeGameStart() {
${[
  has.hasBlocks && '\t\tModBlocks.init();',
  has.hasItems && '\t\tModItems.init();',
  has.hasBiomes && '\t\tModBiomes.init();',
  has.hasEntities && '\t\tModEntities.init();'
]
  .filter(Boolean)
  .join('\n') || '\t\t// no registries yet'}
\t}

\t@Override
\tpublic void afterGameStart() {
\t}

\t@Override
\tpublic void onRecipesReady() {
${has.hasRecipes ? '\t\tModRecipes.init();' : '\t\t// no recipes yet'}
\t}

\t@Override
\tpublic void initNamespaces() {
\t}
}`)

    return {
      path: `${javaRoot}/${this.ctx.entryClass}.java`,
      content: w.toString(this.header(`${this.ctx.meta.name} mod entrypoint`)),
      language: 'java'
    }
  }
}

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1)
}

function indentChunk(chunk: string, tabs = 1): string {
  const pad = '\t'.repeat(tabs)
  return chunk
    .split('\n')
    .map((l) => (l.length ? pad + l : l))
    .join('\n')
}

export function previewElement(project: ArtemisProject, elementId: string): GeneratedFile[] {
  return new CodeGenerator(project).generate(elementId)
}

export { render }
