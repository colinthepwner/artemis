import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { spawn, spawnSync } from 'child_process'
import { exportWorkspace } from '../src/main/export/exporter'
import {
  toConstantCase,
  toPascalCase,
  type ArtemisElement,
  type ArtemisProject
} from '../src/shared/project'
import { textureSlotsFor } from '../src/shared/generator/textures'
import { kitFamily } from '../src/shared/generator/family'
import { builtVariants, variantCells } from '../src/shared/generator/templates/structure'
import { STRUCTURE_DEFAULTS, type StructureProps } from '../src/shared/generator/props'
import { getVanillaRegistry } from '../src/shared/generator/vanilla'
import { SCENARIOS } from './audit-fixtures'
import { probeWorkspace } from './_temp'
import { GRADLE } from './_gradle'
import { png16DataUrl } from './_canvas'
import { harness, kitPieceNames, onGameClose, tailLines, treeKiller, type GameRun } from './_harness'
import { javaNames, javaReport } from './_probe-java'

const PORT = 25599

const WORLD_SEED = 8010101

const audit = harness()
const check = audit.check

interface Expectations {
  blocks: string[]
  items: string[]
  biomes: string[]

  overworldBiomes: string[]

  awayBiomes: string[]

  treelessBiomes: string[]

  claimedBiomes: { biome: string; logFields: string[] }[]

  dimClaimedBiomes: { biome: string; logFields: string[] }[]

  dimensions: { field: string; idField: string; biomes: string[]; vanillaBiomes: string[] }[]

  ores: { field: string; veinsPerChunk: number; biomes: string[]; sharedWith: string[] }[]

  plants: { field: string; patchesPerChunk: number; biomes: string[] }[]

  structures: {
    name: string
    oneIn: number
    buried: boolean
    biomes: string[]
    cells: string[][]
  }[]

  spawns: { entityClass: string; weight: number; hostile: boolean; biomes: string[] }[]
  langKeys: string[]
}

function expectationsFor(project: ArtemisProject, root: string): Expectations {

  const langPath = join(
    root,
    `src/main/resources/assets/${project.meta.modId}/lang/en_US/${project.meta.modId}.lang`
  )
  const langKeys = readFileSync(langPath, 'utf-8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => l.slice(0, l.indexOf('=')).trim())

  const namesUnder = (prefix: string): string[] => [
    ...new Set(
      langKeys
        .filter((k) => k.startsWith(`${prefix}.${project.meta.modId}.`) && k.endsWith('.name'))
        .map((k) => k.slice(`${prefix}.${project.meta.modId}.`.length, -'.name'.length))
        .map(toConstantCase)
    )
  ]

  const biomes = project.elements.filter((el) => el.kind === 'biome').map((el) => el.name)

  const overworldBiomes = project.elements
    .filter((el) => el.kind === 'biome' && el.properties['generateInOverworld'] !== false)
    .map((el) => `${project.meta.modId}:${el.name}`)

  const awayBiomes = project.elements
    .filter((el) => el.kind === 'biome' && el.properties['generateInOverworld'] === false)
    .map((el) => `${project.meta.modId}:${el.name}`)

  const modBiomeNames = new Set(
    project.elements.filter((el) => el.kind === 'biome').map((el) => el.name)
  )

  const claimedBiomes = new Set(
    project.elements
      .filter((el) => el.kind === 'tree')
      .flatMap((el) => ((el.properties['biomes'] as string[] | undefined) ?? []).map((r) => r.trim()))
  )
  const treelessBiomes = project.elements
    .filter(
      (el) =>
        el.kind === 'biome' &&
        el.properties['vanillaTrees'] === false &&
        el.properties['generateInOverworld'] !== false &&
        !claimedBiomes.has(el.name)
    )
    .map((el) => `${project.meta.modId}:${el.name}`)

  const claimRows = project.elements
    .filter(
      (el) =>
        el.kind === 'tree' &&
        el.properties['design'] !== 'built' &&
        ((el.properties['treesPerChunk'] as number | undefined) ?? 0) > 0 &&
        typeof el.properties['logBlock'] === 'string' &&
        !(el.properties['logBlock'] as string).includes(':')
    )
    .flatMap((tree) => {
      const logField = toConstantCase(tree.properties['logBlock'] as string)
      return (((tree.properties['biomes'] as string[] | undefined) ?? []) as string[])
        .map((r) => r.trim())

        .filter((r) => project.elements.some((el) => el.kind === 'biome' && el.name === r))
        .map((r) => ({ name: r, biome: `${project.meta.modId}:${r}`, logField }))
    })

    .reduce<{ name: string; biome: string; logFields: string[] }[]>((acc, one) => {
      const found = acc.find((g) => g.biome === one.biome)
      if (found) {
        if (!found.logFields.includes(one.logField)) found.logFields.push(one.logField)
      } else acc.push({ name: one.name, biome: one.biome, logFields: [one.logField] })
      return acc
    }, [])

  const biomeOf = (name: string): ArtemisProject['elements'][number] | undefined =>
    project.elements.find((el) => el.kind === 'biome' && el.name === name)

  const rosterBiomes = new Set(
    project.elements
      .filter((el) => el.kind === 'dimension')
      .flatMap((el) => ((el.properties['biomes'] as string[] | undefined) ?? []).map((r) => r.trim()))
  )

  const claimedTreeBiomes = claimRows
    .filter((row) => biomeOf(row.name)?.properties['generateInOverworld'] !== false)
    .map(({ biome, logFields }) => ({ biome, logFields }))
  const dimClaimedTreeBiomes = claimRows
    .filter(
      (row) =>
        biomeOf(row.name)?.properties['generateInOverworld'] === false &&
        rosterBiomes.has(row.name)
    )
    .map(({ biome, logFields }) => ({ biome, logFields }))

  const dimensions = project.elements
    .filter((el) => el.kind === 'dimension')
    .map((el) => {
      const roster = ((el.properties['biomes'] as string[] | undefined) ?? []).map((r) => r.trim())
      return {
        field: toConstantCase(el.name),
        idField: `${toConstantCase(el.name)}_ID`,
        biomes: roster.filter((r) => modBiomeNames.has(r)).map((r) => `${project.meta.modId}:${r}`),

        vanillaBiomes: roster
          .filter((r) => r.startsWith('biome:'))
          .map((r) => r.slice('biome:'.length))
      }
    })
    .filter((d) => d.biomes.length + d.vanillaBiomes.length > 0)

  const placesBlock = (blockName: string): string[] => {
    const uses: string[] = []
    const prop = (el: ArtemisElement, key: string): string =>
      String((el.properties as Record<string, unknown>)[key] ?? '').trim()
    for (const el of project.elements) {
      if (el.kind === 'biome') {
        if (prop(el, 'topBlock') === blockName) uses.push(`biome:${el.name}/top`)
        if (prop(el, 'fillerBlock') === blockName) uses.push(`biome:${el.name}/filler`)
      } else if (el.kind === 'tree' || el.kind === 'structure') {
        if (prop(el, 'logBlock') === blockName) uses.push(`tree:${el.name}/log`)
        if (prop(el, 'leavesBlock') === blockName) uses.push(`tree:${el.name}/leaves`)

        const variants = (el.properties['variants'] as { blocks?: Record<string, string> }[]) ?? []
        if (variants.some((v) => Object.values(v.blocks ?? {}).some((b) => b.trim() === blockName)))
          uses.push(`${el.kind}:${el.name}`)
      } else if (el.kind === 'dimension') {
        if (prop(el, 'portalFrame') === blockName) uses.push(`dimension:${el.name}/frame`)
      }
    }
    return uses
  }

  const ores = project.elements
    .filter(
      (el) =>
        el.kind === 'ore' &&
        typeof el.properties['blockRef'] === 'string' &&
        (el.properties['blockRef'] as string).trim().length > 0 &&
        !(el.properties['blockRef'] as string).includes(':') &&
        ((el.properties['veinsPerChunk'] as number | undefined) ?? 0) > 0
    )
    .map((el) => {
      const asked = (((el.properties['biomes'] as string[] | undefined) ?? []) as string[])
        .map((r) => r.trim())
        .filter(Boolean)
      return {
        field: toConstantCase(el.properties['blockRef'] as string),
        veinsPerChunk: (el.properties['veinsPerChunk'] as number | undefined) ?? 0,
        asked: asked.length,

        sharedWith: placesBlock((el.properties['blockRef'] as string).trim()),

        biomes: asked
          .filter((r) => project.elements.some((el2) => el2.kind === 'biome' && el2.name === r))
          .map((r) => `${project.meta.modId}:${r}`)
      }
    })

    .filter((row) => row.asked === 0 || row.biomes.length > 0)
    .map(({ field, veinsPerChunk, biomes, sharedWith }) => ({
      field,
      veinsPerChunk,
      biomes,
      sharedWith
    }))

    .filter(
      (row, i, all) =>
        all.findIndex(
          (other) =>
            other.field === row.field && other.biomes.join(',') === row.biomes.join(',')
        ) === i
    )

  const plants = project.elements
    .filter(
      (el) =>
        el.kind === 'plant' &&
        Math.max(0, Math.round((el.properties['patchesPerChunk'] as number | undefined) ?? 0)) > 0
    )
    .map((el) => {
      const asked = (((el.properties['biomes'] as string[] | undefined) ?? []) as string[])
        .map((r) => r.trim())
        .filter(Boolean)
      return {
        field: toConstantCase(el.name),

        patchesPerChunk: Math.max(
          0,
          Math.round((el.properties['patchesPerChunk'] as number | undefined) ?? 0)
        ),
        asked: asked.length,

        biomes: asked
          .filter((r) => project.elements.some((el2) => el2.kind === 'biome' && el2.name === r))
          .map((r) => `${project.meta.modId}:${r}`)
      }
    })

    .filter((row) => row.asked === 0 || row.biomes.length > 0)
    .map(({ field, patchesPerChunk, biomes }) => ({ field, patchesPerChunk, biomes }))

  const vanillaBlocks = getVanillaRegistry(project.meta.targetBta).blocks
  const cellTag = (ref: string): string => {
    const t = ref.trim()
    if (!t) return '?'
    if (t.startsWith('block:')) return `V:${t.slice(6).toUpperCase()}`
    const owner = project.elements.find((e) => e.name === t)

    if (owner) return `M:${toConstantCase(owner.kind === 'liquid' ? `${t}_still` : t)}`
    if (vanillaBlocks.some((b) => b.field.toUpperCase() === t.toUpperCase()))
      return `V:${t.toUpperCase()}`
    return '?'
  }

  const structures = project.elements
    .filter((el) => el.kind === 'structure' && builtVariants(el.properties['variants'] as never) .length > 0)
    .map((el) => {
      const p = { ...STRUCTURE_DEFAULTS, ...(el.properties as Partial<StructureProps>) }
      const asked = (p.biomes ?? []).map((r) => r.trim()).filter(Boolean)
      return {
        name: el.name,

        oneIn: Math.max(1, Math.round(p.oneInChunks)),
        buried: p.placement === 'buried',
        asked: asked.length,
        biomes: asked
          .filter((r) => project.elements.some((el2) => el2.kind === 'biome' && el2.name === r))
          .map((r) => `${project.meta.modId}:${r}`),

        cells: builtVariants(p.variants).map((v) =>
          variantCells(v).map((c) => `${c.x},${c.y},${c.z},${cellTag(c.ref)}`)
        )
      }
    })

    .filter((row) => row.asked === 0 || row.biomes.length > 0)
    .map(({ name, oneIn, buried, biomes, cells }) => ({ name, oneIn, buried, biomes, cells }))

  const spawns = project.elements
    .filter(
      (el) =>
        el.kind === 'mob' &&
        Math.max(0, Math.round((el.properties['spawnWeight'] as number | undefined) ?? 0)) > 0
    )
    .map((el) => {
      const refs = (((el.properties['spawnBiomes'] as string[] | undefined) ?? []) as string[])
        .map((r) => r.trim())
        .filter(Boolean)
      return {
        entityClass: `Entity${toPascalCase(el.name)}`,
        weight: Math.max(0, Math.round((el.properties['spawnWeight'] as number | undefined) ?? 0)),
        hostile: el.properties['hostile'] === true,
        asked: refs.length,

        biomes: refs
          .map((r) =>
            r.startsWith('biome:')
              ? `V:${r.slice('biome:'.length)}`
              : project.elements.some((el2) => el2.kind === 'biome' && el2.name === r)
                ? `M:${project.meta.modId}:${r}`
                : null
          )
          .filter((r): r is string => r !== null)
      }
    })

    .filter((row) => row.asked === 0 || row.biomes.length > 0)
    .map(({ entityClass, weight, hostile, biomes }) => ({ entityClass, weight, hostile, biomes }))

  const kitPieces = kitPieceNames(project)

  return {
    blocks: namesUnder('tile'),
    items: [...new Set([...namesUnder('item'), ...kitPieces])],
    biomes,
    overworldBiomes,
    awayBiomes,
    treelessBiomes,
    claimedBiomes: claimedTreeBiomes,
    dimClaimedBiomes: dimClaimedTreeBiomes,
    dimensions,
    ores,
    plants,
    structures,
    spawns,
    langKeys
  }
}

const javaList = (values: string[]): string =>
  values.map((v) => `\t\t"${v}"`).join(',\n')

function probeSource(project: ArtemisProject, e: Expectations): string {
  const pkg = `com.${project.meta.modId}`
  return `package artemisprobe;

// Injected by scripts/ingame-probe.ts into a throwaway workspace. Never part
// of an exported mod. It asserts, from inside a running game, the facts a
// modder would notice were missing and a compiler never would.
import java.lang.reflect.Field;
import java.util.HashMap;
import java.util.Map;

import net.fabricmc.api.ModInitializer;
import turniplabs.halplibe.event.defs.CommonEvents;
import turniplabs.halplibe.util.dependency.Key;

public class ArtemisProbe implements ModInitializer {

\tprivate static final String[] BLOCKS = {
${javaList(e.blocks)}
\t};
\tprivate static final String[] ITEMS = {
${javaList(e.items)}
\t};
\tprivate static final String[] BIOMES = {
${javaList(e.biomes)}
\t};
\tprivate static final String[] LANG_KEYS = {
${javaList(e.langKeys)}
\t};
\tprivate static final String[] OVERWORLD_BIOMES = {
${javaList(e.overworldBiomes)}
\t};
\t/** biomes this mod asked to keep OUT of the overworld, which must own no column there */
\tprivate static final String[] AWAY_BIOMES = {
${javaList(e.awayBiomes)}
\t};
\t/** biomes of this mod's that must grow no tree at all, see Expectations */
\tprivate static final String[] TREELESS_BIOMES = {
${javaList(e.treelessBiomes)}
\t};
\t/** biomes a tree of the mod's claims, and the ModBlocks constant it plants
\t *  there, index for index. See Expectations.claimedBiomes */
\tprivate static final String[][] CLAIMED_BIOMES = {
${e.claimedBiomes
  .map((c) => `\t\t{ "${c.biome}", ${c.logFields.map((f) => `"${f}"`).join(', ')} }`)
  .join(',\n')}
\t};
\t/** the same, for biomes that live inside one of this mod's dimensions, which
\t *  are asked in that dimension's world rather than in the overworld. See
\t *  Expectations.dimClaimedBiomes */
\tprivate static final String[][] CLAIMED_DIM_BIOMES = {
${e.dimClaimedBiomes
  .map((c) => `\t\t{ "${c.biome}", ${c.logFields.map((f) => `"${f}"`).join(', ')} }`)
  .join(',\n')}
\t};
\t/** the mod's own ore veins: { ModBlocks field, veins per chunk, biome keys
\t *  it named }, with no key at all meaning every biome. See Expectations.ores */
\tprivate static final String[][] ORE_ROWS = {
${e.ores
  .map(
    (o) =>
      `\t\t{ "${o.field}", "${o.veinsPerChunk}"${o.biomes.map((b) => `, "${b}"`).join('')} }`
  )
  .join(',\n')}
\t};
\t/** and, row for row, everything ELSE in the project that puts that same
\t *  block into a world, empty when nothing does. A94: the count below is by
\t *  block identity, so a row with something here cannot tell a vein from the
\t *  ground it was cut into, and says so instead of claiming that it can. */
\tprivate static final String[] ORE_SHARED = {
${e.ores.map((o) => `\t\t"${o.sharedWith.join(' ')}"`).join(',\n')}
\t};
\t/** the mod's own plant patches: { ModBlocks field, patches per chunk, biome
\t *  keys it named }, with no key at all meaning every biome. The same shape as
\t *  ORE_ROWS and a harder question: see censusPlant and Expectations.plants */
\tprivate static final String[][] PLANT_ROWS = {
${e.plants
  .map(
    (p) =>
      `\t\t{ "${p.field}", "${p.patchesPerChunk}"${p.biomes.map((b) => `, "${b}"`).join('')} }`
  )
  .join(',\n')}
\t};
\t/** the mod's own structures: { registry name, one-in-N chunks, "1" when it is
\t *  buried, biome keys it named }, with no key at all meaning every biome. The
\t *  rarity is what makes this the hardest of the three to sample: see
\t *  censusStructure and Expectations.structures */
\tprivate static final String[][] STRUCTURE_ROWS = {
${e.structures
  .map(
    (st) =>
      `\t\t{ "${st.name}", "${st.oneIn}", "${st.buried ? 1 : 0}"${st.biomes
        .map((b) => `, "${b}"`)
        .join('')} }`
  )
  .join(',\n')}
\t};
\t/** and, row for row, the BUILD each one stamps: one string a variant, cells
\t *  separated by ';' and each cell "dx,dy,dz" from the placement anchor plus
\t *  the block, tagged "V:FIELD" for one of the game's and "M:FIELD" for one of
\t *  this mod's. "?" is a cell whose reference resolves to neither, which the
\t *  match skips rather than guessing at. This is what lets the census count a
\t *  PLACEMENT rather than a block, which is the thing A94 wished it had. */
\tprivate static final String[][] STRUCTURE_CELLS = {
${e.structures
  .map((st) => `\t\t{ ${st.cells.map((v) => `"${v.join(';')}"`).join(', ')} }`)
  .join(',\n')}
\t};
\t/** the mod's own natural spawns: { entity class, weight, hostile, biomes it
\t *  named }, tagged "M:key" for one of this mod's biomes and "V:FIELD" for one
\t *  of the game's, with no biome at all meaning every one of them. See spawns()
\t *  and Expectations.spawns */
\tprivate static final String[][] SPAWN_ROWS = {
${e.spawns
  .map(
    (s) =>
      `\t\t{ "${s.entityClass}", "${s.weight}", "${s.hostile}"${s.biomes
        .map((b) => `, "${b}"`)
        .join('')} }`
  )
  .join(',\n')}
\t};
\tprivate static final String[] NO_BIOMES = {};
\t/** the mod id, which is the namespace every entry of this mod's must carry */
\tprivate static final String MOD_ID = "${project.meta.modId}";
\t/** the ModDimensions int field naming each of this mod's dimensions */
\tprivate static final String[] DIM_ID_FIELDS = {
${javaList(e.dimensions.map((d) => d.idField))}
\t};
\t/** and the Dimension object beside it, which is where the portal hangs */
\tprivate static final String[] DIM_FIELDS = {
${javaList(e.dimensions.map((d) => d.field))}
\t};
\t/** and, index for index, the mod biomes that dimension is built from */
\tprivate static final String[][] DIM_BIOMES = {
${e.dimensions.map((d) => `\t\t{\n${javaList(d.biomes)}\n\t\t}`).join(',\n')}
\t};
\t/** and the Biomes fields naming the rest of its roster, the game's own */
\tprivate static final String[][] DIM_VANILLA_BIOMES = {
${e.dimensions.map((d) => `\t\t{\n${javaList(d.vanillaBiomes)}\n\t\t}`).join(',\n')}
\t};
\tprivate static final String MOD_DIMENSIONS_CLASS = "${pkg}.init.ModDimensions";

\tprivate static int pass = 0;
\tprivate static int fail = 0;

${javaReport('ARTEMIS-PROBE')}

\tprivate static void check(String name, boolean ok, String detail) {
\t\tif (report(name, ok, detail)) pass++; else fail++;
\t}

\t@Override
\tpublic void onInitialize() {
\t\t// The probe's entrypoint is listed after the mod's, so this listener
\t\t// registers after the mod's own and runs after it. Everything the mod
\t\t// registers is in place by then: blocks and items in BEFORE_GAME_START,
\t\t// dimensions in the mod's own AFTER_GAME_START.
\t\tCommonEvents.AFTER_GAME_START.listen(Key.of("artemisprobe"), ArtemisProbe::run);
\t\t// The worldgen phase needs a WORLD, which does not exist yet at
\t\t// AFTER_GAME_START and is built on this very thread, so it waits on its
\t\t// own daemon thread rather than blocking the boot it is waiting for.
\t\t//
\t\t// DAEMON is the property that makes A82 invisible. A daemon thread is
\t\t// killed the instant the JVM decides to exit, with no exception, no
\t\t// trace and no line of its own, so a census that was halfway through
\t\t// leaves exactly the log of a census that was never started. The hook
\t\t// installed below exists to make that difference readable.
\t\tworldgenThread = new Thread(ArtemisProbe::worldgen, "artemis-worldgen-probe");
\t\tworldgenThread.setDaemon(true);
\t\tworldgenThread.start();
\t\tinstallExitHook();
\t}

\t/** the worldgen thread, kept so the exit hook can ask what it was doing */
\tprivate static volatile Thread worldgenThread = null;
\t/** which part of the worldgen phase is running right now. Printed as it
\t *  changes AND held in a field, because the two survive different deaths:
\t *  the printed line survives the process being killed outright, the field
\t *  survives nothing but is the only one that can be read WITH a stack. */
\tprivate static volatile String wstage = "not started";
\t/** set once the phase has printed its summary, so the hook can tell a JVM
\t *  that exited after the work from one that exited during it */
\tprivate static volatile boolean wfinished = false;
\t/** when the current stage began, so a stage that hung for four minutes is
\t *  distinguishable from one that had only just started when the JVM went */
\tprivate static volatile long wstageAt = 0L;

\t/**
\t * Move to the next stage of the worldgen phase, and say so.
\t *
\t * A82 is a run that stopped mid-census with the last line it printed being
\t * an ordinary PASS, so nothing said which stage of the phase it was in, and
\t * five runs of reasoning about it followed. The cost of knowing is one line
\t * per stage.
\t */
\tprivate static void stage(String name) {
\t\twstage = name;
\t\twstageAt = System.currentTimeMillis();
\t\tSystem.out.println("ARTEMIS-WORLDGEN PHASE " + name);
\t}

\t/**
\t * What the JVM was doing when it decided to go.
\t *
\t * A shutdown hook runs on an ORDERLY exit only: System.exit, a main that
\t * returns, or a SIGTERM. It does NOT run when the process is killed
\t * outright, which is how this runner normally stops a server it has
\t * finished with. That is the whole reason it is worth having here, because
\t * its SILENCE is a reading as much as its line is:
\t *
\t *   hook printed, phase unfinished   something inside the game asked the
\t *                                    JVM to exit while the census was
\t *                                    running, and the stack says from where
\t *   no hook line, phase unfinished   the process was killed from outside,
\t *                                    so the thing to look at is who killed
\t *                                    it and not the mod
\t *
\t * The worldgen thread's own stack is printed because that is precisely what
\t * a daemon thread can never report for itself. trace() is not reused for it:
\t * that takes a Throwable and this has a Thread, and bending either into the
\t * other to share four lines would be worse than writing the four lines.
\t */
\tprivate static void installExitHook() {
\t\tRuntime.getRuntime().addShutdownHook(new Thread(() -> {
\t\t\ttry {
\t\t\t\tlong inStage = wstageAt == 0L ? 0L : System.currentTimeMillis() - wstageAt;
\t\t\t\tThread t = worldgenThread;
\t\t\t\tSystem.out.println("ARTEMIS-WORLDGEN EXIT finished=" + wfinished
\t\t\t\t\t+ " stage=" + wstage + " for=" + inStage + "ms"
\t\t\t\t\t+ " alive=" + (t != null && t.isAlive()));
\t\t\t\tif (!wfinished && t != null && t.isAlive()) {
\t\t\t\t\tfor (StackTraceElement el : t.getStackTrace()) {
\t\t\t\t\t\tSystem.out.println("ARTEMIS-WORLDGEN EXIT   at " + el);
\t\t\t\t\t}
\t\t\t\t}
\t\t\t} catch (Throwable ignored) {
\t\t\t\t// A hook that throws takes the last words in the log with it.
\t\t\t}
\t\t}, "artemis-exit-probe"));
\t}

\tprivate static void run() {
\t\t// First, and on this thread on purpose. This is the server thread before
\t\t// its main loop, which is the only moment a tick box can be added to a
\t\t// list nothing is walking. See installServerBox and A92.
\t\tinstallServerBox();
\t\ttry {
\t\t\tnamespace();
\t\t\tregistryFields("${pkg}.init.ModBlocks", BLOCKS, "block");
\t\t\tregistryFields("${pkg}.init.ModItems", ITEMS, "item");
\t\t\tbiomes();
\t\t\t// After biomes, because a spawn entry lives in a biome's own list and
\t\t\t// a biome that failed to register would fail this for a reason that
\t\t\t// belongs to the line above. Here rather than in the worldgen phase
\t\t\t// because it costs no chunks and no world: the table is in memory the
\t\t\t// moment ModEntities.init has run. See spawns() and A97.
\t\t\tspawns();
\t\t\tstrays();
\t\t\tnames();
\t\t} catch (Throwable t) {
\t\t\t// Through check() rather than printed here, so the line format lives
\t\t\t// in one place. The text is unchanged: check prints FAIL, the name,
\t\t\t// " :: " and the detail, which is what this wrote by hand.
\t\t\tcheck("probe itself threw", false, String.valueOf(t));
\t\t\ttrace(t);
\t\t}
\t\tSystem.out.println("ARTEMIS-PROBE SUMMARY " + pass + " " + fail);
\t}

\t/**
\t * The spawn table, read back out of the running game.
\t *
\t * A97, and it is A90's shape one kind of element over. A mob's Spawn Weight
\t * and Spawn Biomes land in ModEntities.init as calls to a helper that
\t * reaches a PROTECTED field on Biome by reflection and adds a SpawnListEntry
\t * to the list it finds. That helper catches its own failure, logs it and
\t * returns. So a field the game renamed, a biome that was null when the call
\t * ran, or a list that is not the one the spawner reads would all leave a mod
\t * that registers its mob perfectly, compiles, boots, and spawns nothing, with
\t * the only evidence a line in the log nobody reads.
\t *
\t * Nothing had ever looked. The mob checks in this probe are registry checks:
\t * the entity class exists, it has an id, its lang key resolves. None of them
\t * is a spawn.
\t *
\t * This costs no chunks and no world, which is why it sits in the registry
\t * phase beside the others rather than down in the worldgen one. The read
\t * side is public and was taken off the 8.0.1 jar with javap rather than
\t * guessed: Biome.getSpawnableList(MobCategory) returns the same List the
\t * helper mutates, SpawnListEntry.entityClass and .spawnFrequency are
\t * public fields, and Registries.BIOMES is an Iterable Registry<Biome>.
\t *
\t * Both halves are asked, because a filter that did nothing looks exactly
\t * like a filter that worked if you only ever look where it was supposed to
\t * put something:
\t *
\t *   named biomes    every biome the mob listed carries an entry for it, at
\t *                   the weight the modder asked for
\t *   the rest        a biome of the mod's own that the mob did NOT name
\t *                   carries no entry for it at all
\t *
\t * A mob that named no biome asked for every one of them, which is exactly
\t * what the generated loop over Registries.BIOMES does, so that is what is
\t * demanded: every registered biome, with none excused.
\t */
\tprivate static void spawns() {
\t\tif (SPAWN_ROWS.length == 0) return;
\t\tfor (String[] row : SPAWN_ROWS) {
\t\t\tString simple = row[0];
\t\t\tint weight = Integer.parseInt(row[1]);
\t\t\tboolean hostile = Boolean.parseBoolean(row[2]);
\t\t\tClass<?> entity;
\t\t\ttry {
\t\t\t\tentity = Class.forName("${pkg}.entity." + simple);
\t\t\t} catch (Throwable t) {
\t\t\t\tcheck("the entity class " + simple + " its spawn entry names exists", false,
\t\t\t\t\tString.valueOf(t));
\t\t\t\tcontinue;
\t\t\t}
\t\t\t// Which list the helper wrote into is decided by the same flag the
\t\t\t// studio's Hostile switch sets, so reading the other one would be
\t\t\t// asking a question the mod never answered.
\t\t\tnet.minecraft.core.enums.MobCategory category = hostile
\t\t\t\t? net.minecraft.core.enums.MobCategory.MONSTER
\t\t\t\t: net.minecraft.core.enums.MobCategory.CREATURE;
\t\t\tif (row.length == 3) {
\t\t\t\tint total = 0;
\t\t\t\tint carried = 0;
\t\t\t\tStringBuilder missing = new StringBuilder();
\t\t\t\tfor (net.minecraft.core.world.biome.Biome biome
\t\t\t\t\t\t: net.minecraft.core.data.registry.Registries.BIOMES) {
\t\t\t\t\ttotal++;
\t\t\t\t\tif (spawnWeightOf(biome, category, entity) == weight) {
\t\t\t\t\t\tcarried++;
\t\t\t\t\t} else if (missing.length() < 300) {
\t\t\t\t\t\tmissing.append(biome.getRegistryKey()).append(' ');
\t\t\t\t\t}
\t\t\t\t}
\t\t\t\tcheck("the mob " + simple + " is in every biome's spawn table at weight " + weight,
\t\t\t\t\ttotal > 0 && carried == total,
\t\t\t\t\tcarried + " of " + total + " biomes carry it. Without: " + missing);
\t\t\t\tcontinue;
\t\t\t}
\t\t\t// The biomes it named. A mod biome is looked up by registry key,
\t\t\t// which this side knows; one of the game's is read off the Biomes
\t\t\t// field, because its key is not this side's to predict. Same rule
\t\t\t// rosterOf follows.
\t\t\tjava.util.List<String> named = new java.util.ArrayList<>();
\t\t\tfor (int i = 3; i < row.length; i++) {
\t\t\t\tString ref = row[i];
\t\t\t\tnet.minecraft.core.world.biome.Biome biome = biomeOfRef(ref);
\t\t\t\tif (biome == null) {
\t\t\t\t\tcheck("the biome " + ref + " that " + simple + " spawns in exists", false,
\t\t\t\t\t\t"nothing answered for that reference, so no spawn entry could be looked for");
\t\t\t\t\tcontinue;
\t\t\t\t}
\t\t\t\tnamed.add(biome.getRegistryKey());
\t\t\t\tint found = spawnWeightOf(biome, category, entity);
\t\t\t\tcheck("the mob " + simple + " is in the spawn table of " + biome.getRegistryKey()
\t\t\t\t\t\t+ " at weight " + weight,
\t\t\t\t\tfound == weight,
\t\t\t\t\tfound < 0
\t\t\t\t\t\t? "no entry for it in that biome's list at all, so it never spawns there"
\t\t\t\t\t\t: "the entry is there at weight " + found + " rather than " + weight);
\t\t\t}
\t\t\t// And the other half. Only the mod's OWN biomes are asked, because a
\t\t\t// vanilla biome carrying a stray entry is the same bug and this side
\t\t\t// cannot name the game's biomes without predicting their keys.
\t\t\tfor (String key : modBiomeKeys()) {
\t\t\t\tif (named.contains(key)) continue;
\t\t\t\tnet.minecraft.core.world.biome.Biome biome = biomeOfKey(key);
\t\t\t\tif (biome == null) continue;
\t\t\t\tcheck("and " + simple + " is NOT in the spawn table of " + key + ", which it never named",
\t\t\t\t\tspawnWeightOf(biome, category, entity) < 0,
\t\t\t\t\t"it is there anyway, so the biome filter put it somewhere the modder did not ask for");
\t\t\t}
\t\t}
\t}

\t/** Every biome key this mod declares, assembled from the two arrays that
\t *  already say it rather than written down a third time: a biome is either
\t *  in the overworld or kept out of it, and between them those two lists are
\t *  the whole set. */
\tprivate static java.util.List<String> modBiomeKeys() {
\t\tjava.util.List<String> keys = new java.util.ArrayList<>();
\t\tfor (String key : OVERWORLD_BIOMES) keys.add(key);
\t\tfor (String key : AWAY_BIOMES) keys.add(key);
\t\treturn keys;
\t}

\t/** One biome's weight for one entity class, or -1 when it has no entry.
\t *  -1 rather than 0 on purpose: a weight of zero is a thing a modder can
\t *  ask for and "not there" is not the same answer. */
\tprivate static int spawnWeightOf(net.minecraft.core.world.biome.Biome biome,
\t\t\tnet.minecraft.core.enums.MobCategory category, Class<?> entity) {
\t\tjava.util.List<net.minecraft.core.entity.SpawnListEntry> list =
\t\t\tbiome.getSpawnableList(category);
\t\tif (list == null) return -1;
\t\tfor (net.minecraft.core.entity.SpawnListEntry entry : list) {
\t\t\tif (entry != null && entry.entityClass == entity) return entry.spawnFrequency;
\t\t}
\t\treturn -1;
\t}

\t/** A biome named by a spawn row: "M:key" is one of this mod's and is found
\t *  by that key, "V:FIELD" is one of the game's and is read off the field,
\t *  because a vanilla registry key is not this side's to predict. */
\tprivate static net.minecraft.core.world.biome.Biome biomeOfRef(String ref) {
\t\ttry {
\t\t\tif (ref.startsWith("V:")) {
\t\t\t\treturn (net.minecraft.core.world.biome.Biome)
\t\t\t\t\tnet.minecraft.core.world.biome.Biomes.class.getField(ref.substring(2)).get(null);
\t\t\t}
\t\t\treturn biomeOfKey(ref.substring(2));
\t\t} catch (Throwable t) {
\t\t\treturn null;
\t\t}
\t}

\t/** The biome carrying one registry key, found by walking the registry and
\t *  asking each one for its key.
\t *
\t *  Walked rather than looked up, deliberately. getItem takes whatever
\t *  string the registry was keyed with, and this probe knows the key the way
\t *  the rest of it knows one: as the thing getRegistryKey() answers. Asking
\t *  the same accessor the checks print means the two can never disagree
\t *  about what a key is, and a registry of a few hundred biomes costs
\t *  nothing to walk. */
\tprivate static net.minecraft.core.world.biome.Biome biomeOfKey(String key) {
\t\tfor (net.minecraft.core.world.biome.Biome biome
\t\t\t\t: net.minecraft.core.data.registry.Registries.BIOMES) {
\t\t\tif (biome != null && key.equals(biome.getRegistryKey())) return biome;
\t\t}
\t\treturn null;
\t}

\t/** The one fact everything else hangs off: without the namespace there are
\t *  no textures and no names, and nothing says so. */
\tprivate static void namespace() {
\t\ttry {
\t\t\tObject registry = net.minecraft.core.data.registry.Registries.NAMESPACES;
\t\t\tStringBuilder seen = new StringBuilder();
\t\t\tboolean found = false;
\t\t\tfor (Object value : ((Iterable<?>) registry.getClass().getMethod("values").invoke(registry))) {
\t\t\t\tseen.append(value).append(' ');
\t\t\t\tif ("${project.meta.modId}".equals(String.valueOf(value))) {
\t\t\t\t\tfound = true;
\t\t\t\t}
\t\t\t}
\t\t\tcheck("namespace is registered", found, "NAMESPACES held: " + seen);
\t\t} catch (Throwable t) {
\t\t\tcheck("namespace is registered", false, String.valueOf(t));
\t\t}
\t}

\t/** Every field the generator declared is a live object with an id, and no
\t *  two of them collide. A null field means a registration that failed
\t *  quietly; a shared id means one of them is unreachable in game. */
\tprivate static void registryFields(String className, String[] names, String what) {
\t\tMap<Object, String> byId = new HashMap<>();
\t\tif (names.length == 0) {
\t\t\t// Nothing of this kind in the project, so the holder must NOT be there.
\t\t\t// The generator writes ModBlocks and ModItems only when it has something
\t\t\t// to put in them, and an empty holder would be a file outliving its
\t\t\t// contents. Asserting its absence rather than skipping the case keeps
\t\t\t// this from going quiet on a fixture that has no items at all.
\t\t\ttry {
\t\t\t\tClass.forName(className);
\t\t\t\tcheck(what + " holder " + className + " is absent with nothing to hold", false, "the class is there and the project declares no " + what);
\t\t\t} catch (ClassNotFoundException expected) {
\t\t\t\tcheck(what + " holder " + className + " is absent with nothing to hold", true, "");
\t\t\t}
\t\t\treturn;
\t\t}
\t\ttry {
\t\t\tClass<?> holder = Class.forName(className);
\t\t\tfor (String name : names) {
\t\t\t\ttry {
\t\t\t\t\tField field = holder.getField(name);
\t\t\t\t\tObject value = field.get(null);
\t\t\t\t\tif (value == null) {
\t\t\t\t\t\tcheck(what + " " + name + " exists", false, "the field is null after init");
\t\t\t\t\t\tcontinue;
\t\t\t\t\t}
\t\t\t\t\tObject id = idOf(value);
\t\t\t\t\tcheck(what + " " + name + " exists", id != null, "no id() on " + value.getClass());
\t\t\t\t\tif (id != null) {
\t\t\t\t\t\tString other = byId.put(id, name);
\t\t\t\t\t\tif (other != null) {
\t\t\t\t\t\t\tcheck(what + " " + name + " has an id of its own", false, "shares id " + id + " with " + other);
\t\t\t\t\t\t}
\t\t\t\t\t}
\t\t\t\t} catch (NoSuchFieldException missing) {
\t\t\t\t\tcheck(what + " " + name + " exists", false, "no such field on " + className);
\t\t\t\t}
\t\t\t}
\t\t} catch (Throwable t) {
\t\t\tcheck(what + " holder " + className + " loaded", false, String.valueOf(t));
\t\t}
\t}

\tprivate static Object idOf(Object value) {
\t\ttry {
\t\t\treturn value.getClass().getMethod("id").invoke(value);
\t\t} catch (Throwable ignored) {
\t\t}
\t\ttry {
\t\t\treturn value.getClass().getField("id").get(value);
\t\t} catch (Throwable ignored) {
\t\t}
\t\treturn null;
\t}

\t/**
\t * The other half of every registry check here, and the half nothing has
\t * ever asked: does this mod register anything the project did NOT declare.
\t *
\t * A61 made the same point about worldgen. Every check above demands that
\t * something the project names is present, so a mod that quietly registered
\t * an extra block, or kept one under a name the modder had renamed away
\t * from, would pass all of them. The lists are already in hand and the
\t * registries are already open, so asking the question the other way round
\t * costs one walk.
\t *
\t * The expectation is the lang file's own view of the mod, read out of the
\t * export, so this is not "the elements Artemis knows about": it covers the
\t * blocks nothing declares directly, the still/flowing pair of a liquid and
\t * the portal block of a dimension included. Anything left over is something
\t * the generator emitted that nothing in the project asked for.
\t */
\tprivate static void strays() {
\t\ttry {
\t\t\t// What the project declared, in the registry's own spelling, read off
\t\t\t// the objects rather than composed here. A block's key is
\t\t\t// "block/<name>" and an item's is "item/<name>", and neither of those
\t\t\t// prefixes is Artemis's to know: they are halplibe's, and a harness
\t\t\t// that spelled them out would be a second copy of somebody else's
\t\t\t// rule, wrong the day it changed. The field list is the project's; the
\t\t\t// key each field took is the game's.
\t\t\tjava.util.Set<String> declaredBlocks = keysOf("${pkg}.init.ModBlocks", BLOCKS);
\t\t\tjava.util.Set<String> declaredItems = keysOf("${pkg}.init.ModItems", ITEMS);

\t\t\tjava.util.Set<String> blockKeys = new java.util.HashSet<>();
\t\t\tfor (net.minecraft.core.util.collection.NamespaceID id : net.minecraft.core.block.Blocks.blockMap.keySet()) {
\t\t\t\tif (MOD_ID.equals(id.namespace())) blockKeys.add(id.value());
\t\t\t}
\t\t\tstrayCheck("block", blockKeys, declaredBlocks);

\t\t\t// Every block also takes an entry in the ITEM registry, which is the
\t\t\t// game's doing and not the mod's: BTA keeps blocks and items in one
\t\t\t// id space, so a mod with six blocks and eleven items has seventeen
\t\t\t// entries here. So a block key is as declared as an item key is, and
\t\t\t// the union is what an item sweep has to be measured against. Found by
\t\t\t// running this: the first version demanded the item list alone and
\t\t\t// reported all six blocks as strays.
\t\t\tjava.util.Set<String> declaredEither = new java.util.HashSet<>(declaredItems);
\t\t\tdeclaredEither.addAll(declaredBlocks);
\t\t\tjava.util.Set<String> itemKeys = new java.util.HashSet<>();
\t\t\tfor (net.minecraft.core.util.collection.NamespaceID id : net.minecraft.core.item.Item.itemsMap.keySet()) {
\t\t\t\tif (MOD_ID.equals(id.namespace())) itemKeys.add(id.value());
\t\t\t}
\t\t\tstrayCheck("item", itemKeys, declaredEither);

\t\t\t// The biome registry is keyed by plain strings rather than by
\t\t\t// NamespaceID, and a key with no colon in it belongs to the game. A
\t\t\t// biome carries no prefix, so the project's own names are the keys.
\t\t\tjava.util.Set<String> biomeKeys = new java.util.HashSet<>();
\t\t\tfor (Object key : net.minecraft.core.data.registry.Registries.BIOMES.keySet()) {
\t\t\t\tString k = String.valueOf(key);
\t\t\t\tint colon = k.indexOf(':');
\t\t\t\tif (colon < 0) continue;
\t\t\t\tif (MOD_ID.equals(k.substring(0, colon))) biomeKeys.add(k.substring(colon + 1));
\t\t\t}
\t\t\tstrayCheck("biome", biomeKeys, new java.util.HashSet<>(java.util.Arrays.asList(BIOMES)));
\t\t} catch (Throwable t) {
\t\t\tcheck("the registries can be swept for strays", false, String.valueOf(t));
\t\t\ttrace(t);
\t\t}
\t}

\t/** The registry key every named field on a holder class actually took. A
\t *  field that is missing or null is left out rather than guessed at:
\t *  registryFields has already failed for it, and inventing a key here would
\t *  turn one failure into two. */
\tprivate static java.util.Set<String> keysOf(String className, String[] fields) {
\t\tjava.util.Set<String> out = new java.util.HashSet<>();
\t\tif (fields.length == 0) return out;
\t\ttry {
\t\t\tClass<?> holder = Class.forName(className);
\t\t\tfor (String name : fields) {
\t\t\t\ttry {
\t\t\t\t\tObject value = holder.getField(name).get(null);
\t\t\t\t\tif (value == null) continue;
\t\t\t\t\tString key = namespaceKeyOf(value);
\t\t\t\t\tif (key != null) out.add(key);
\t\t\t\t} catch (NoSuchFieldException missing) {
\t\t\t\t\t// registryFields reports this one
\t\t\t\t}
\t\t\t}
\t\t} catch (Throwable t) {
\t\t\tcheck("the holder " + className + " loaded for the stray sweep", false, String.valueOf(t));
\t\t}
\t\treturn out;
\t}

\t/** A block answers namespaceId(); an item carries a public namespaceID
\t *  field. Both are asked, the same way idOf asks for an id two ways, so one
\t *  helper covers both registries. */
\tprivate static String namespaceKeyOf(Object value) {
\t\ttry {
\t\t\tObject id = value.getClass().getMethod("namespaceId").invoke(value);
\t\t\tif (id != null) return String.valueOf(id.getClass().getMethod("value").invoke(id));
\t\t} catch (Throwable ignored) {
\t\t}
\t\ttry {
\t\t\tObject id = value.getClass().getField("namespaceID").get(value);
\t\t\tif (id != null) return String.valueOf(id.getClass().getMethod("value").invoke(id));
\t\t} catch (Throwable ignored) {
\t\t}
\t\treturn null;
\t}

\t/**
\t * Everything registered under this mod's namespace was declared by it, and
\t * everything it declared is registered under this mod's namespace.
\t *
\t * The count check above them is not decoration. A sweep that found nothing
\t * at all would report no strays and read afterwards as evidence that there
\t * were none, which is the failure this whole audit is built to refuse: a
\t * namespace filter that stopped matching, a registry that moved, or a map
\t * read before the mod filled it all look identical to a clean result. So the
\t * sweep is made to prove it found the mod first, and only then is it allowed
\t * to say what it did not find.
\t */
\tprivate static void strayCheck(String what, java.util.Set<String> found, java.util.Set<String> expected) {
\t\tcheck(
\t\t\t"the " + what + " sweep found this mod at all",
\t\t\tfound.size() > 0 || expected.isEmpty(),
\t\t\t"the project declares " + expected.size() + " " + what + "(s) and the registry holds none of this mod´s, so this sweep proves nothing"
\t\t);
\t\tjava.util.List<String> strays = new java.util.ArrayList<>(found);
\t\tstrays.removeAll(expected);
\t\tjava.util.Collections.sort(strays);
\t\tcheck(
\t\t\t"no " + what + " is registered that the project never declared",
\t\t\tstrays.isEmpty(),
\t\t\t"registered but declared by nothing: " + strays
\t\t);
\t\t// and the same sets the other way, which catches a declared thing that
\t\t// landed in somebody else's namespace rather than in ours
\t\tjava.util.List<String> absent = new java.util.ArrayList<>(expected);
\t\tabsent.removeAll(found);
\t\tjava.util.Collections.sort(absent);
\t\tcheck(
\t\t\t"and every " + what + " it declared is registered under " + MOD_ID,
\t\t\tabsent.isEmpty(),
\t\t\t"declared but not in the " + MOD_ID + " namespace: " + absent
\t\t);
\t}

\t/** A biome the game does not have is a biome that generates nowhere. */
\tprivate static void biomes() {
\t\tif (BIOMES.length == 0) {
\t\t\treturn;
\t\t}
\t\ttry {
\t\t\tObject registry = net.minecraft.core.data.registry.Registries.BIOMES;
\t\t\tStringBuilder seen = new StringBuilder();
\t\t\tfor (Object key : ((Iterable<?>) registry.getClass().getMethod("keySet").invoke(registry))) {
\t\t\t\tseen.append(key).append(' ');
\t\t\t}
\t\t\tString all = seen.toString();
\t\t\tfor (String name : BIOMES) {
\t\t\t\tcheck("biome " + name + " is registered", all.contains(name), "registry keys: " + all);
\t\t\t}
\t\t} catch (Throwable t) {
\t\t\tcheck("biome registry readable", false, String.valueOf(t));
\t\t}
\t}

\t/** Every key in the exported lang file resolves to something that is not
\t *  the key. This is the check that would have caught the display-name keys,
\t *  the double-prefixed item keys and the lang file written to a path the
\t *  game never reads: all three showed in game as the raw key. */
${javaNames({

  onMissingI18n:
    '\t\t\tSystem.out.println("ARTEMIS-PROBE SKIP names :: I18n not available :: " + t);',
  detail: 'translated to itself, so nothing reads the lang line'
})}

\tprivate static int wpass = 0;
\tprivate static int wfail = 0;

\t/** The same line format as check(), from the same one place, and its own
\t *  counter: a biome can register cleanly and still generate nowhere, so the
\t *  two phases are summarised apart. */
\tprivate static void wcheck(String name, boolean ok, String detail) {
\t\tif (report(name, ok, detail)) wpass++; else wfail++;
\t}

\t/**
\t * A stack trace the report can actually see.
\t *
\t * printStackTrace writes lines with no marker on them, and the runner
\t * echoes only marked ones, so every trace this probe ever printed was
\t * dropped and the failure it belonged to read as a bare exception name
\t * with no file and no line. Marking each frame costs nothing and is the
\t * difference between a finding and a guess.
\t */
\tprivate static void trace(Throwable t) {
\t\tSystem.out.println("ARTEMIS-PROBE TRACE " + t);
\t\tfor (StackTraceElement el : t.getStackTrace()) {
\t\t\tSystem.out.println("ARTEMIS-PROBE TRACE   at " + el);
\t\t}
\t\tif (t.getCause() != null && t.getCause() != t) trace(t.getCause());
\t}

\t/**
\t * Which columns of a real world each biome actually owns.
\t *
\t * Registering a biome only makes it EXIST. The mapping's own
\t * $placementComment records two placement designs that registered cleanly
\t * and generated nothing, and says of the climate window that it "silently
\t * yields nothing in some worlds". Nothing above this point can tell the
\t * difference, because the registry check passes either way.
\t *
\t * So this asks the overworld's own BiomeProvider, the same object chunk
\t * generation asks, over a grid of real columns. No chunks are generated:
\t * the provider answers out of noise.
\t */
\tprivate static void worldgen() {
\t\ttry {
\t\t\t// Runs when the mod has ANY biome, not just one it places. A mod whose
\t\t\t// biomes are all through a portal has the most to prove here and used
\t\t\t// to be the one case that skipped this phase entirely: with nothing
\t\t\t// expected in the overworld there was nothing to count, so nobody
\t\t\t// looked, so a biome leaking into the overworld would not have shown.
\t\t\tstage("the overworld census");
\t\t\tif (OVERWORLD_BIOMES.length > 0 || AWAY_BIOMES.length > 0) {
\t\t\t\tnet.minecraft.core.world.World world = awaitWorld(0, 600);
\t\t\t\tif (world == null) {
\t\t\t\t\twcheck("the overworld loaded so its biomes could be counted", false,
\t\t\t\t\t\t"no dimension 0 arrived while waiting");
\t\t\t\t} else {
\t\t\t\t\tsampleWorld("the overworld", world, OVERWORLD_BIOMES, AWAY_BIOMES, true);
\t\t\t\t}
\t\t\t}
\t\t\t// The far side of every portal this mod adds. Skipped entirely by a
\t\t\t// mod with no dimensions, which is most of them.
\t\t\tstage("the dimension census");
\t\t\tdimensionWorldgen();
\t\t\t// And the way IN, which is a different question again.
\t\t\tstage("lighting a portal to each dimension");
\t\t\tportals();
\t\t\t// and whether the way in leads anywhere a traveller survives.
\t\t\tstage("travelling through each portal");
\t\t\tjourneys();
\t\t\t// LAST, and deliberately. It is the only phase that makes the server
\t\t\t// generate chunks for its own sake, sixteen of them, and A53 is the
\t\t\t// standing reminder that this thread races the boot it runs beside.
\t\t\t// Run before the journeys it timed them out; run after, it costs
\t\t\t// nothing but its own minute.
\t\t\tstage("the overworld tree census");
\t\t\ttreeCensusOverworld();
\t\t\t// And the same question through the portal, beside it rather than up
\t\t\t// in dimensionWorldgen, because this is the other phase that makes the
\t\t\t// server grow chunks and all of that belongs at the end together.
\t\t\tstage("the tree census through each portal");
\t\t\tclaimedDimensions();
\t\t\t// And the decorator's own output, in both kinds of world, which is the
\t\t\t// one thing every census above this line manages not to look at: they
\t\t\t// count the game's coal, or a feature this probe called by hand. Last
\t\t\t// because it grows chunks like the two above it and all of that belongs
\t\t\t// at the end together. See oreCensus and A89.
\t\t\tstage("the ore census");
\t\t\toreCensus();
\t\t\t// And the second kind of thing that mixin places, which is the harder
\t\t\t// one: a vein lands in any stone and a plant needs a column of air over
\t\t\t// ground it accepts. Beside the ore rather than inside it because the
\t\t\t// two ask the same question of the same mixin and answer it with
\t\t\t// different arithmetic. See plantCensus.
\t\t\tstage("the plant census");
\t\t\tplantCensus();
\t\t\t// And the third kind, which is the RARE one: an ore and a plant are
\t\t\t// attempted several times a chunk and a structure once in many, so
\t\t\t// this is the census whose sample has to be sized against a roll
\t\t\t// rather than a density. Last of the three because it is much the
\t\t\t// widest: it grows a square of chunks rather than a handful of
\t\t\t// spots. See censusStructure and A99.
\t\t\tstage("the structure census");
\t\t\tstructureCensus();
\t\t} catch (Throwable t) {
\t\t\twcheck("the worldgen probe ran", false, String.valueOf(t));
\t\t\ttrace(t);
\t\t}
\t\t// Before the line rather than after it, so a hook firing between the
\t\t// two cannot report a phase that had finished as one that was still
\t\t// running. stage() is not used here: this is the phase ENDING, and
\t\t// printing a PHASE line for it would read as one more stage.
\t\twstage = "finished";
\t\twfinished = true;
\t\tSystem.out.println("ARTEMIS-WORLDGEN SUMMARY " + wpass + " " + wfail);
\t}

\t/**
\t * The first check in this probe that reads a generated CHUNK.
\t *
\t * a vanillaTrees of false is a switch in the studio that emits a
\t * getTreeFeature returning a feature which places nothing. Everything about
\t * it has been asserted statically: the override is emitted, it is emitted
\t * only when no tree claims the biome, and it compiles. Nothing has ever
\t * looked at the ground. A switch whose effect nobody has measured is a
\t * candidate dead control, and dead controls are bugs here.
\t *
\t * So: find columns that belong to the biome, make the game generate the
\t * chunks under them, and count logs standing in exactly those columns.
\t *
\t * Two things make the zero mean something.
\t *
\t * A chunk straddles biomes, so a chunk containing a treeless biome usually
\t * contains a forest as well and counting the whole chunk would count that
\t * forest's oaks. Every column is therefore asked its own biome and only the
\t * matching ones are counted.
\t *
\t * And a census that grew nothing anywhere would report zero for the biome
\t * under test and read afterwards as proof. So the same walk counts the logs
\t * in every OTHER column it passes, and the run fails if the answer to
\t * "does this world grow trees at all" is no. No biome is named for that: the
\t * control is the world, not a forest somebody chose.
\t */
\t/** The census needs the overworld again, and it runs long after the phase
\t *  that first fetched one, so it asks for its own rather than holding a
\t *  reference across three phases of a racing boot. */
\tprivate static void treeCensusOverworld() {
\t\tif (TREELESS_BIOMES.length == 0 && CLAIMED_BIOMES.length == 0) return;
\t\tnet.minecraft.core.world.World world = awaitWorld(0, 60);
\t\tif (world == null) {
\t\t\twcheck("the overworld was still there for the tree census", false,
\t\t\t\t"no dimension 0 arrived while waiting");
\t\t\treturn;
\t\t}
\t\t// And wait for the boot, for the reason journeys() waits: this phase
\t\t// makes the server generate real chunks from a thread that is not its
\t\t// own, and doing that while the boot is still preparing the spawn area
\t\t// starves it. A53 attached that wait to the phase that discovered it
\t\t// rather than to the property, so it only ever ran for a mod WITH a
\t\t// dimension: journeys() returns immediately without one, and the census
\t\t// behind it then raced the boot with nothing in front of it. Measured on
\t\t// the first fixture that has two censused biomes and no dimension: every
\t\t// probe check passed, every worldgen check passed, and the server had
\t\t// still not printed Done ten minutes later. See A72.
\t\tif (!awaitBoot(world, "the tree census")) return;
\t\ttreeCensus(world);
\t}

\t/**
\t * The boot, waited for once, by whoever is about to make chunks.
\t *
\t * One method rather than the same twenty lines in three phases, because
\t * what it is really guarding is a property of the CALLER (it generates
\t * chunks) and not of any one phase. serverRunning is no use as the signal,
\t * it is set in the MinecraftServer constructor. The honest one is the
\t * clock: world time only advances once the server is in its main loop,
\t * which is the same moment Done is printed.
\t */
\tprivate static boolean awaitBoot(net.minecraft.core.world.World overworld, String who) {
\t\t// The budget is DERIVED rather than a constant, which is A88. Before the
\t\t// server reaches its main loop it prepares a start region for every
\t\t// dimension in the game, this mod's included, and each one costs about
\t\t// seven seconds. Two minutes is generous for a mod with two doors and is
\t\t// not enough for one with sixteen: measured on that fixture, the boot took
\t\t// 129 seconds, this wait gave up at 120, portals() returned without
\t\t// building a single ring, and the very next phase asked the same question
\t\t// moments later and was answered yes. A fixed number here is a constant
\t\t// standing in for something that varies with the MOD, which is the shape
\t\t// A53, A72 and A74 all have: the guard belongs on the property.
\t\t//
\t\t// Twenty seconds a dimension rather than the seven that was measured, because
\t\t// it was measured on one machine with a warm daemon and the cost of being
\t\t// wrong in this direction is a phase that never runs. The runner's budget
\t\t// is derived from the same count now (see runBudget), and the two are safe
\t\t// against each other at EVERY width rather than at the widths anybody has
\t\t// built: this wait is 120 + 20 a dimension and that budget is 600 + 20 a
\t\t// dimension, so the runner always holds eight minutes more than the boot
\t\t// can spend, plus whatever the censuses added.
\t\tint attempts = 240 + 40 * DIM_FIELDS.length;
\t\tlong startedAt = System.currentTimeMillis();
\t\tboolean ticking = awaitTicking(overworld, attempts);
\t\tlong waited = (System.currentTimeMillis() - startedAt) / 1000L;
\t\t// Printed on the way through and not only on the failure. How long the boot
\t\t// took is the reading that names this in ONE run instead of in a sweep, it
\t\t// is the number the budget above is derived from, and it costs one line a
\t\t// phase. A85's argument, applied before the next intermittent thing rather
\t\t// than after it.
\t\tSystem.out.println("ARTEMIS-WORLDGEN BOOT " + who + ": waited " + waited + "s of "
\t\t\t+ (attempts / 2) + "s allowed, with " + DIM_FIELDS.length + " dimension(s) to prepare");
\t\tif (ticking) return true;
\t\twcheck("the server finished starting before " + who + " grew anything", false,
\t\t\t"the world clock never advanced in " + waited + "s, so the boot never reached its main loop");
\t\treturn false;
\t}

\tprivate static void treeCensus(net.minecraft.core.world.World world) {
\t\tnet.minecraft.core.world.biome.provider.BiomeProvider provider = world.getBiomeProvider();
\t\tif (provider == null) {
\t\t\twcheck("the tree census has a biome provider", false, "getBiomeProvider() returned null");
\t\t\treturn;
\t\t}

\t\t// A server with nobody on it refuses to generate a chunk nobody is
\t\t// standing near, and the refusal is silent: awaitChunk simply never sees
\t\t// the chunk arrive. A53 found that the hard way for the journey phase and
\t\t// left the switch behind; this is the second thing to need it. The first
\t\t// run of this census loaded not one of its four chunks and counted
\t\t// nothing at all, which is exactly what the guards below said out loud
\t\t// instead of passing.
\t\tboolean override = allowChunkLoads(world, true);
\t\ttry {
\t\t\t// The instrument, before anything it measures.
\t\t\t//
\t\t\t// This phase reports an ABSENCE, and an absence is only ever as good
\t\t\t// as the thing that would have seen the presence. A census that
\t\t\t// cannot recognise a log reports zero for every biome in the game
\t\t\t// and reads afterwards as proof that the switch works. That is not
\t\t\t// hypothetical: feeding a vanilla FOREST to this census is how the
\t\t\t// height bug was found, and the honest run before it had happily
\t\t\t// reported the bog treeless while seeing nothing at all.
\t\t\twcheck("the census knows a log when it sees one",
\t\t\t\tnet.minecraft.core.block.Block.hasLogicClass(net.minecraft.core.block.Blocks.LOG_OAK, net.minecraft.core.block.BlockLogicLog.class)
\t\t\t\t\t&& net.minecraft.core.block.Block.hasLogicClass(net.minecraft.core.block.Blocks.LOG_PINE, net.minecraft.core.block.BlockLogicLog.class),
\t\t\t\t"BlockLogicLog does not answer for the game´s own logs, so every zero below would be this check´s fault");

\t\t\tfinal int CHUNKS_PER_BIOME = 4;
\t\t\tfinal int HALF = 2048;
\t\t\tfinal int STEP = 64;

\t\t\tfor (String wanted : TREELESS_BIOMES) {
\t\t\t\tjava.util.List<int[]> spots = spreadSpots(provider, wanted, HALF, STEP, CHUNKS_PER_BIOME);
\t\t\t\twcheck("the census found somewhere " + wanted + " actually is",
\t\t\t\t\tspots.size() > 0,
\t\t\t\t\t"no column of it in the sampled grid, so nothing was grown to look at");
\t\t\t\tif (spots.isEmpty()) continue;

\t\t\t\tint logs = 0;
\t\t\t\tint coal = 0;
\t\t\t\tint columnsCounted = 0;
\t\t\t\tint grown = 0;
\t\t\t\tint ownLogs = 0;
\t\t\t\tint ownCoal = 0;
\t\t\t\tint ownColumns = 0;
\t\t\t\tint ownChunks = 0;
\t\t\t\tfor (int[] spot : spots) {
\t\t\t\t\tif (!growDecorated(world, spot[0], spot[1])) continue;
\t\t\t\t\tgrown++;
\t\t\t\t\tint[] tally = countChunk(world, provider, spot[0], spot[1], wanted, NO_TRUNKS);
\t\t\t\t\tlogs += tally[0];
\t\t\t\t\tcoal += tally[2];
\t\t\t\t\tcolumnsCounted += tally[3];
\t\t\t\t\tif (decoratedOnlyBy(world, spot[0], spot[1], wanted)) {
\t\t\t\t\t\townChunks++;
\t\t\t\t\t\townLogs += tally[0];
\t\t\t\t\t\townCoal += tally[2];
\t\t\t\t\t\townColumns += tally[3];
\t\t\t\t\t}
\t\t\t\t}

\t\t\t\tSystem.out.println("ARTEMIS-WORLDGEN CENSUS " + wanted + " logs=" + logs
\t\t\t\t\t+ " coal=" + coal + " columns=" + columnsCounted
\t\t\t\t\t+ " grown=" + grown + "/" + spots.size()
\t\t\t\t\t+ " | decorated only as itself: chunks=" + ownChunks
\t\t\t\t\t+ " logs=" + ownLogs + " coal=" + ownCoal + " columns=" + ownColumns);

\t\t\t\twcheck("the census grew ground it could count in " + wanted,
\t\t\t\t\tcolumnsCounted > 0,
\t\t\t\t\t"not one column of it in " + grown + " of " + spots.size() + " chunks grown, so its zero proves nothing");
\t\t\t\t// The control, and the whole reason the zero below is worth having.
\t\t\t\t//
\t\t\t\t// Coal is not decoration in general, it is decoration by the SAME
\t\t\t\t// method: ChunkDecoratorOverworld.decorate places the ore veins and
\t\t\t\t// then calls Biome.getTreeFeature, and that is the only call to it
\t\t\t\t// in the game. So coal in these columns is proof that the pass which
\t\t\t\t// would have planted a tree here ran over this exact ground and
\t\t\t\t// declined to. Without it a chunk that was never decorated at all
\t\t\t\t// reads identically to a biome that refused its trees, and the first
\t\t\t\t// run of this census was exactly that: it counted nothing anywhere
\t\t\t\t// and still reported no trees in the bog.
\t\t\t\twcheck("and the decorator ran over that ground, so a zero means it declined",
\t\t\t\t\tcoal > 0,
\t\t\t\t\t"not one ore vein in " + columnsCounted + " columns either: these chunks were generated but never decorated, so nothing here is evidence about trees");
\t\t\t\t// The absence is asserted over the DECORATED-ONLY-AS-ITSELF chunks
\t\t\t\t// and not over every column of the biome, and A68 is the reason.
\t\t\t\t// BTA decorates a chunk as ONE biome, sampled at a single point, and
\t\t\t\t// then plants that biome´s trees at offsets which cross into the
\t\t\t\t// neighbouring chunk. So an oak standing in this biome´s column can
\t\t\t\t// be a forest chunk´s doing, and no mod can prevent it. Demanding
\t\t\t\t// zero over every column would be demanding something Artemis does
\t\t\t\t// not control, and it fired for real: 9 oaks inside a claimed biome
\t\t\t\t// whose override was working perfectly.
\t\t\t\twcheck("and there is ground of " + wanted + " that only it decorated",
\t\t\t\t\townColumns > 0,
\t\t\t\t\t"no chunk sampled was decorated only as " + wanted + " (" + grown + " grown), so a zero would be about somebody else´s trees");
\t\t\t\tif (ownColumns == 0) continue;
\t\t\t\twcheck("and the decorator ran over THAT ground too",
\t\t\t\t\townCoal > 0,
\t\t\t\t\t"not one ore vein in the " + ownColumns + " columns the biome decorated itself");
\t\t\t\twcheck("biome " + wanted + " grew no tree, as it asked",
\t\t\t\t\townLogs == 0,
\t\t\t\t\townLogs + " log blocks standing in " + ownColumns + " columns this biome decorated itself: vanillaTrees is off and the game planted trees there anyway");
\t\t\t}

\t\t\tclaimedCensus(world, provider);
\t\t} finally {
\t\t\tif (override) allowChunkLoads(world, false);
\t\t}
\t}

\t/**
\t * The other half of the same ground, and the question A65 deliberately left
\t * alone.
\t *
\t * A biome with vanillaTrees off that a tree of the mod´s ALSO claims never
\t * gets the "no trees at all" override: the claim replaces the oaks by
\t * itself. Demanding no logs there would be demanding that the mod´s own tree
\t * fail to grow, so those biomes are dropped from TREELESS_BIOMES and until
\t * now nothing asked anything about them at all. The sharper question is what
\t * the claim actually put in the ground, and it has three parts which only
\t * mean anything together:
\t *
\t *   the mod´s OWN trunk is standing there   the claim was planted
\t *   no oak is standing beside it            the claim REPLACED rather than
\t *                                           joined the vanilla trees
\t *   an ore vein is in the same columns      the decorator walked this ground,
\t *                                           so both of the above are answers
\t *                                           rather than the silence of a
\t *                                           chunk that was never decorated
\t *
\t * The trunk is compared by IDENTITY against the ModBlocks field the project
\t * says the tree plants. Blocks in BTA are singletons, so identity is the
\t * exact question, and it is a stricter one than a logic class: LOG_OAK and a
\t * mod´s own log share BlockLogicLog, which is what lets the oak count come
\t * off the same walk and is the reason the treeless census can count "a log"
\t * while this one cannot.
\t */
\tprivate static void claimedCensus(net.minecraft.core.world.World world,
\t\t\tnet.minecraft.core.world.biome.provider.BiomeProvider provider) {
\t\t// Every census FIRST, and only then any planting, because plantClaim puts
\t\t// real trees in the real world and a census that ran afterwards would be
\t\t// counting them. That is not hypothetical: with two trees claiming one
\t\t// biome, the second pass of the first version reported five trunks grown
\t\t// naturally and every one of them had been planted by this probe a second
\t\t// earlier.
\t\tjava.util.List<Object[]> prepared = prepareClaims(world, provider, CLAIMED_BIOMES);

\t\tfor (Object[] one : prepared) {
\t\t\tString wanted = (String) one[0];
\t\t\tString label = (String) one[1];
\t\t\tObject[] trunks = (Object[]) one[2];
\t\t\t@SuppressWarnings("unchecked")
\t\t\tjava.util.List<int[]> ready = (java.util.List<int[]>) one[3];
\t\t\tint found = ((Integer) one[4]).intValue();

\t\t\tint mine = 0;
\t\t\tint foreign = 0;
\t\t\tint coal = 0;
\t\t\tint columns = 0;
\t\t\tint ownMine = 0;
\t\t\tint ownForeign = 0;
\t\t\tint ownColumns = 0;
\t\t\tint ownChunks = 0;
\t\t\tfor (int[] spot : ready) {
\t\t\t\tint[] tally = countChunk(world, provider, spot[0], spot[1], wanted, trunks);
\t\t\t\tforeign += tally[0];
\t\t\t\tmine += tally[1];
\t\t\t\tcoal += tally[2];
\t\t\t\tcolumns += tally[3];
\t\t\t\tif (decoratedOnlyBy(world, spot[0], spot[1], wanted)) {
\t\t\t\t\townChunks++;
\t\t\t\t\townForeign += tally[0];
\t\t\t\t\townMine += tally[1];
\t\t\t\t\townColumns += tally[3];
\t\t\t\t}
\t\t\t}

\t\t\tSystem.out.println("ARTEMIS-WORLDGEN CLAIM " + wanted + " trunk=" + label
\t\t\t\t+ " mine=" + mine + " foreignLogs=" + foreign + " coal=" + coal
\t\t\t\t+ " columns=" + columns + " grown=" + ready.size() + "/" + found
\t\t\t\t+ " | decorated only as itself: chunks=" + ownChunks + " mine=" + ownMine
\t\t\t\t+ " foreignLogs=" + ownForeign + " columns=" + ownColumns);

\t\t\twcheck("the census grew ground it could count in " + wanted,
\t\t\t\tcolumns > 0,
\t\t\t\t"not one column of it in " + ready.size() + " of " + found + " chunks grown, so its counts prove nothing");
\t\t\tif (columns == 0) continue;
\t\t\twcheck("and the decorator ran over that ground, so the counts are answers",
\t\t\t\tcoal > 0,
\t\t\t\t"not one ore vein in " + columns + " columns: these chunks were generated but never decorated, so nothing here is evidence about trees");
\t\t\tif (coal == 0) continue;
\t\t\t// Over the chunks this biome decorated itself, and nowhere else. See
\t\t\t// the same guard in the treeless census above, and A68: a log in this
\t\t\t// biome´s column can be the neighbouring chunk´s doing, so demanding
\t\t\t// zero everywhere would be demanding something no mod controls.
\t\t\twcheck("and there is ground of " + wanted + " that only it decorated",
\t\t\t\townColumns > 0,
\t\t\t\t"no chunk sampled was decorated only as " + wanted + " (" + ready.size() + " grown), so a zero would be about somebody else´s trees");
\t\t\tif (ownColumns > 0) {
\t\t\t\twcheck("and no tree but its own grew in " + wanted + ", so the claim replaced the oaks",
\t\t\t\t\townForeign == 0,
\t\t\t\t\townForeign + " log blocks that are not " + label + " in " + ownColumns
\t\t\t\t\t\t+ " columns this biome decorated itself: the claim was planted on top of the vanilla trees rather than instead of them");
\t\t\t}
\t\t\t// The counts above are NOT asserted for presence, and A67 is why. BTA
\t\t\t// decides how many trees to attempt in a chunk by comparing the biome
\t\t\t// by identity against its own Biomes constants; a modded biome matches
\t\t\t// none of them and is left on the bare 1-in-10 baseline, so "how many
\t\t\t// grew here naturally" is a fact about the game´s density table rather
\t\t\t// than about whether the claim works. Measured: 0 trunks in 5210
\t\t\t// columns of ember_wastes with 2339 ore veins in the same columns.
\t\t\t//
\t\t\t// So the claim is asked directly instead, which is the half Artemis
\t\t\t// actually owns, and it happens after every census, for the reason at
\t\t\t// the top of this method: the planting below is what would corrupt the
\t\t\t// counts above.
\t\t}

\t\tplantAll(world, provider, prepared);
\t}

\t/**
\t * The claims of one world, each with the ground it is going to be measured
\t * on already grown.
\t *
\t * Split out of the census because the overworld and the far side of a portal
\t * need exactly this and nothing here is about either one of them. A claim on
\t * a biome that only exists inside a dimension is the same bug as A67 in a
\t * world nobody had ever sampled, and writing this preamble out a second time
\t * for it would put the rules about trunks, sampling and chunk readiness in
\t * two places that could disagree.
\t *
\t * Each row comes back as { registry key, label, trunk blocks, the chunks the
\t * server actually grew, how many were asked for }. A row whose trunk cannot
\t * be resolved, or whose biome is nowhere in the sampled grid, is reported
\t * and dropped rather than passed on with nothing to measure.
\t */
\tprivate static java.util.List<Object[]> prepareClaims(net.minecraft.core.world.World world,
\t\t\tnet.minecraft.core.world.biome.provider.BiomeProvider provider, String[][] rows) {
\t\tjava.util.List<Object[]> prepared = new java.util.ArrayList<>();
\t\tif (rows.length == 0) return prepared;
\t\tClass<?> holder;
\t\ttry {
\t\t\tholder = Class.forName("${pkg}.init.ModBlocks");
\t\t} catch (Throwable t) {
\t\t\twcheck("the block holder loaded for the claimed-tree census", false, String.valueOf(t));
\t\t\treturn prepared;
\t\t}

\t\tfinal int CHUNKS_PER_BIOME = 4;
\t\tfinal int HALF = 2048;
\t\tfinal int STEP = 64;

\t\tfor (String[] row : rows) {
\t\t\tString wanted = row[0];
\t\t\tString[] fields = java.util.Arrays.copyOfRange(row, 1, row.length);
\t\t\tString label = String.join(" or ", fields);
\t\t\tObject[] trunks = new Object[fields.length];
\t\t\tboolean ok = true;
\t\t\tfor (int i = 0; i < fields.length; i++) {
\t\t\t\ttry {
\t\t\t\t\ttrunks[i] = holder.getField(fields[i]).get(null);
\t\t\t\t} catch (Throwable t) {
\t\t\t\t\twcheck("the trunk " + fields[i] + " the claim plants exists", false, String.valueOf(t));
\t\t\t\t\tok = false;
\t\t\t\t\tbreak;
\t\t\t\t}
\t\t\t\t// A null field makes every comparison below false, and the biome
\t\t\t\t// would then read as having grown nothing, which is the opposite of
\t\t\t\t// what a missing block means.
\t\t\t\tif (trunks[i] == null) {
\t\t\t\t\twcheck("the trunk " + fields[i] + " the claim plants exists", false,
\t\t\t\t\t\t"the field is there but null, so nothing could be counted");
\t\t\t\t\tok = false;
\t\t\t\t\tbreak;
\t\t\t\t}
\t\t\t}
\t\t\tif (!ok) continue;

\t\t\tjava.util.List<int[]> spots = spreadSpots(provider, wanted, HALF, STEP, CHUNKS_PER_BIOME);
\t\t\twcheck("the census found somewhere " + wanted + " actually is",
\t\t\t\tspots.size() > 0,
\t\t\t\t"no column of it in the sampled grid, so nothing was grown to look at");
\t\t\tif (spots.isEmpty()) continue;

\t\t\tjava.util.List<int[]> ready = new java.util.ArrayList<>();
\t\t\tfor (int[] spot : spots) {
\t\t\t\t// Planting needs the decorated ground for a plainer reason than
\t\t\t\t// counting does: an ungrown chunk has no height and no block under
\t\t\t\t// the tree, so the planter would be offered air.
\t\t\t\tif (growDecorated(world, spot[0], spot[1])) ready.add(spot);
\t\t\t}
\t\t\tprepared.add(new Object[] { wanted, label, trunks, ready, Integer.valueOf(spots.size()) });
\t\t}
\t\treturn prepared;
\t}

\t/** Every prepared claim, asked directly. Separate from the loop that
\t *  prepares them because nothing may be planted until every census that
\t *  counts what grew naturally has finished. */
\tprivate static void plantAll(net.minecraft.core.world.World world,
\t\t\tnet.minecraft.core.world.biome.provider.BiomeProvider provider,
\t\t\tjava.util.List<Object[]> prepared) {
\t\tfor (Object[] one : prepared) {
\t\t\t@SuppressWarnings("unchecked")
\t\t\tjava.util.List<int[]> spots = (java.util.List<int[]>) one[3];
\t\t\tplantClaim(world, provider, (String) one[0], (String) one[1], (Object[]) one[2], spots);
\t\t}
\t}

\t/**
\t * The same question on the far side of every portal.
\t *
\t * A tree claiming a biome that only exists inside a dimension was asserted
\t * by nothing until this existed: the claim census reads the same
\t * generateInOverworld the overworld phase reads, so those biomes were
\t * filtered out of it and their world was never opened for them. That is not
\t * a smaller case than the overworld one, it is the same bug in a world
\t * nobody sampled: A67's refusal is exactly as available on the far side of a
\t * portal. The ground gate belongs to the tree feature and the floor belongs
\t * to the biome, and neither of them knows which world it is in.
\t *
\t * Only the direct question is asked here, and not the natural census beside
\t * it. A68 is why: how many trees a chunk is given comes off a table of the
\t * game's own biomes, so counting what grew by itself measures BTA rather
\t * than the mod, and the census's foreign-log half needs the overworld
\t * decorator's ore veins as its control, which is a fact about the overworld
\t * and not about a dimension.
\t */
\tprivate static void claimedDimensions() {
\t\tif (CLAIMED_DIM_BIOMES.length == 0) return;
\t\t// The same wait, for the same reason, asked of the same clock the other
\t\t// two phases ask. The overworld's, not this dimension's: it is the world
\t\t// whose spawn area the boot is preparing, and a phase that has to wait
\t\t// for the boot at all must not depend on which world it is about to
\t\t// generate chunks in.
\t\tnet.minecraft.core.world.World overworld = awaitWorld(0, 60);
\t\tif (overworld == null) {
\t\t\twcheck("the overworld was still there to time the claim census by", false,
\t\t\t\t"no dimension 0 arrived while waiting");
\t\t\treturn;
\t\t}
\t\tif (!awaitBoot(overworld, "the claim census through a portal")) return;
\t\tClass<?> dims;
\t\ttry {
\t\t\tdims = Class.forName(MOD_DIMENSIONS_CLASS);
\t\t} catch (Throwable t) {
\t\t\twcheck("the mod's ModDimensions class loaded for the claim census", false, String.valueOf(t));
\t\t\treturn;
\t\t}
\t\t// Every claimed dimension biome has to be reached by SOME dimension of
\t\t// this mod's. Without this, a roster that stopped listing the biome would
\t\t// leave the loop below with nothing to do and the phase would pass in
\t\t// silence, which is the shape A64 and A66 were both about.
\t\tjava.util.Set<String> reached = new java.util.HashSet<>();
\t\tfor (int i = 0; i < DIM_ID_FIELDS.length; i++) {
\t\t\tString[][] mine = rowsIn(DIM_BIOMES[i]);
\t\t\tif (mine.length == 0) continue;
\t\t\tString fieldName = DIM_ID_FIELDS[i];
\t\t\tint id;
\t\t\ttry {
\t\t\t\tid = dims.getField(fieldName).getInt(null);
\t\t\t} catch (Throwable t) {
\t\t\t\twcheck("ModDimensions declares " + fieldName + " for the claim census", false, String.valueOf(t));
\t\t\t\tcontinue;
\t\t\t}
\t\t\tnet.minecraft.core.world.World world = awaitWorld(id, 60);
\t\t\tif (world == null) {
\t\t\t\twcheck("dimension " + fieldName + " was still there for the tree census", false,
\t\t\t\t\t"no world for dimension id " + id + " arrived while waiting");
\t\t\t\tcontinue;
\t\t\t}
\t\t\tnet.minecraft.core.world.biome.provider.BiomeProvider provider = world.getBiomeProvider();
\t\t\tif (provider == null) {
\t\t\t\twcheck("dimension " + fieldName + " has a biome provider for the tree census", false,
\t\t\t\t\t"getBiomeProvider() returned null");
\t\t\t\tcontinue;
\t\t\t}
\t\t\tfor (String[] row : mine) reached.add(row[0]);
\t\t\t// A server with nobody in this world refuses to generate a chunk, the
\t\t\t// same way it does in the overworld. A53 left the switch behind.
\t\t\tboolean override = allowChunkLoads(world, true);
\t\t\ttry {
\t\t\t\tplantAll(world, provider, prepareClaims(world, provider, mine));
\t\t\t} finally {
\t\t\t\tif (override) allowChunkLoads(world, false);
\t\t\t}
\t\t}
\t\tfor (String[] row : CLAIMED_DIM_BIOMES) {
\t\t\twcheck("the claimed biome " + row[0] + " is in a dimension this probe opened",
\t\t\t\treached.contains(row[0]),
\t\t\t\t"no dimension of this mod's listed it, so its claim was never asked anywhere");
\t\t}
\t}

\t/**
\t * The claim rows whose biome this dimension's roster holds.
\t *
\t * The pairing is made HERE, out of the roster the probe already carries,
\t * rather than written into a third table beside the claims and the rosters.
\t * A biome listed by two dimensions is asked in both, which is the right
\t * answer: the ground gate is the same but the world is not.
\t */
\tprivate static String[][] rowsIn(String[] roster) {
\t\tjava.util.List<String[]> rows = new java.util.ArrayList<>();
\t\tfor (String[] row : CLAIMED_DIM_BIOMES) {
\t\t\tfor (String biome : roster) {
\t\t\t\tif (row[0].equals(biome)) rows.add(row);
\t\t\t}
\t\t}
\t\treturn rows.toArray(new String[0][]);
\t}

\t/**
\t * The claim itself, asked of the game rather than waited for.
\t *
\t * Three questions, and each one is a different failure. The biome has to
\t * hand back a tree feature at all; it has to be one of THIS mod´s classes,
\t * because a claim that silently left the vanilla feature in place would
\t * still return something perfectly valid; and placing it has to put the
\t * mod´s own trunk in the ground, because a feature that runs and plants
\t * nothing is what an empty Workshop grid or a broken block reference would
\t * produce, and neither of those throws.
\t *
\t * Placement is retried across columns because a tree refuses ground it does
\t * not like (BlockTags.GROWS_TREES gates it) and one refusal is not a
\t * failure. Only every column refusing is.
\t */
\tprivate static void plantClaim(net.minecraft.core.world.World world,
\t\t\tnet.minecraft.core.world.biome.provider.BiomeProvider provider,
\t\t\tString wanted, String label, Object[] trunks, java.util.List<int[]> spots) {
\t\tjava.util.Random rand = new java.util.Random(20260827L);
\t\tnet.minecraft.core.world.pos.TilePos probe = new net.minecraft.core.world.pos.TilePos();
\t\tint wet = 0;
\t\tint refusals = 0;
\t\tint threw = 0;
\t\tString lastThrow = null;
\t\tint attempts = 0;
\t\tint placed = 0;
\t\tint planted = 0;
\t\tString featureClass = null;
\t\tboolean sawFeature = false;
\t\tboolean modsOwn = false;

\t\tfor (int[] spot : spots) {
\t\t\t// EVERY column of the grown chunk, not one in nine. The chunks are
\t\t\t// already generated by the time this runs, so a denser walk costs a
\t\t\t// getHeightValue per column and nothing else, and the thing being
\t\t\t// asked is whether there is ANY dry ground of this biome here. One
\t\t\t// column in nine answering "no" is the census hoping again, which is
\t\t\t// what A81 was about. Measured: "a mod that lives through a portal"
\t\t\t// reported 64 of 64 sampled columns wet and failed, and the same
\t\t\t// four chunks hold dry ground of the biome a column or two over.
\t\t\t// The two-block margin stays: a tree wants room inside the chunk.
\t\t\tfor (int lx = 2; lx < 14 && placed == 0; lx++) {
\t\t\t\tfor (int lz = 2; lz < 14 && placed == 0; lz++) {
\t\t\t\t\tint x = (spot[0] << 4) + lx;
\t\t\t\t\tint z = (spot[1] << 4) + lz;
\t\t\t\t\tnet.minecraft.core.world.biome.Biome b = provider.getBiome(x, 64, z);
\t\t\t\t\tif (b == null || !wanted.equals(b.getRegistryKey())) continue;
\t\t\t\t\tnet.minecraft.core.world.generate.feature.WorldFeature feature;
\t\t\t\t\ttry {
\t\t\t\t\t\tfeature = b.getTreeFeature(rand);
\t\t\t\t\t} catch (Throwable t) {
\t\t\t\t\t\twcheck("asking " + wanted + " for its tree feature", false, String.valueOf(t));
\t\t\t\t\t\treturn;
\t\t\t\t\t}
\t\t\t\t\tif (feature == null) continue;
\t\t\t\t\tsawFeature = true;
\t\t\t\t\tfeatureClass = feature.getClass().getName();
\t\t\t\t\tif (featureClass.startsWith("${pkg}.")) modsOwn = true;
\t\t\t\t\tint y = world.getHeightValue(x, z);
\t\t\t\t\t// Dry land only. A tree refuses to stand on water and is right to,
\t\t\t\t\t// so counting a submerged column as a refusal would blame the mod
\t\t\t\t\t// for the sea. Skipped rather than attempted, so the attempt count
\t\t\t\t\t// stays the number of columns the tree was genuinely offered.
\t\t\t\t\tObject ground = world.getBlockType(probe.set(x, y - 1, z));
\t\t\t\t\tif (ground == null) continue;
\t\t\t\t\tif (ground == net.minecraft.core.block.Blocks.FLUID_WATER_STILL
\t\t\t\t\t\t|| ground == net.minecraft.core.block.Blocks.FLUID_WATER_FLOWING
\t\t\t\t\t\t|| ground == net.minecraft.core.block.Blocks.FLUID_LAVA_STILL
\t\t\t\t\t\t|| ground == net.minecraft.core.block.Blocks.FLUID_LAVA_FLOWING) {
\t\t\t\t\t\twet++;
\t\t\t\t\t\tcontinue;
\t\t\t\t\t}
\t\t\t\t\tattempts++;
\t\t\t\t\t// What is already there, before anything is planted. The
\t\t\t\t\t// difference is the assertion and the total is not, because a
\t\t\t\t\t// tree is free to be made of a block the terrain is also made
\t\t\t\t\t// of: "kitchen sink" plants a tree of MARBLE into a biome
\t\t\t\t\t// floored with MARBLE, and 442 of them were standing there
\t\t\t\t\t// before the probe planted anything at all.
\t\t\t\t\tint before = boxCount(world, x, y, z, trunks);
\t\t\t\t\tboolean ok;
\t\t\t\t\t// The planting itself goes to the server thread, for the reason
\t\t\t\t\t// the comment below records and A92 finally fixed at the root:
\t\t\t\t\t// setBlockWithNotify walks the lighting queue the server drains
\t\t\t\t\t// every tick. The catch stays exactly where it was, because
\t\t\t\t\t// onServerThread rethrows on this thread.
\t\t\t\t\tfinal java.util.concurrent.atomic.AtomicBoolean grew =
\t\t\t\t\t\tnew java.util.concurrent.atomic.AtomicBoolean(false);
\t\t\t\t\tfinal net.minecraft.core.world.generate.feature.WorldFeature planting = feature;
\t\t\t\t\ttry {
\t\t\t\t\t\tif (!onServerThread("plant " + wanted + " at " + x + "," + y + "," + z,
\t\t\t\t\t\t\t\t() -> grew.set(planting.place(world, rand, x, y, z)))) {
\t\t\t\t\t\t\treturn;
\t\t\t\t\t\t}
\t\t\t\t\t\tok = grew.get();
\t\t\t\t\t} catch (Throwable t) {
\t\t\t\t\t\t// The tree template plants with setBlockWithNotify, which walks
\t\t\t\t\t\t// the world´s lighting queue, and this phase runs on its own
\t\t\t\t\t\t// thread beside the server´s. So the game can throw out of its
\t\t\t\t\t\t// own lighting ("lightUpdate is null") for a race this probe
\t\t\t\t\t\t// caused rather than for anything the mod did, and that is not a
\t\t\t\t\t\t// failure of the mod to report as one. Seen once in about five
\t\t\t\t\t\t// runs of "kitchen sink". The next column is tried instead, and
\t\t\t\t\t\t// only every column throwing is worth saying anything about.
\t\t\t\t\t\tthrew++;
\t\t\t\t\t\tlastThrow = String.valueOf(t);
\t\t\t\t\t\tcontinue;
\t\t\t\t\t}
\t\t\t\t\tif (!ok) {
\t\t\t\t\t\t// What it refused, not just that it refused. A tree that says no
\t\t\t\t\t\t// says nothing about why, and the answer is almost always the
\t\t\t\t\t\t// block underneath.
\t\t\t\t\t\trefusals++;
\t\t\t\t\t\tif (refusals <= 3) {
\t\t\t\t\t\t\tSystem.out.println("ARTEMIS-WORLDGEN REFUSED at " + x + "," + y + "," + z
\t\t\t\t\t\t\t\t+ " ground=" + ground
\t\t\t\t\t\t\t\t+ " growsTrees=" + net.minecraft.core.block.Blocks.hasTag(
\t\t\t\t\t\t\t\t\tworld.getBlockId(x, y - 1, z), net.minecraft.core.block.tag.BlockTags.GROWS_TREES));
\t\t\t\t\t\t}
\t\t\t\t\t\tcontinue;
\t\t\t\t\t}
\t\t\t\t\tplaced++;
\t\t\t\t\tplanted += boxCount(world, x, y, z, trunks) - before;
\t\t\t\t}
\t\t\t}
\t\t\tif (placed > 0) break;
\t\t}

\t\tSystem.out.println("ARTEMIS-WORLDGEN PLANT " + wanted + " feature=" + featureClass
\t\t\t+ " attempts=" + attempts + " wet=" + wet + " threw=" + threw
\t\t\t+ " placed=" + placed + " trunks=" + planted);

\t\twcheck(wanted + " hands back a tree feature when the game asks for one",
\t\t\tsawFeature,
\t\t\t"getTreeFeature returned null in every column tried, so the claim plants nothing anywhere");
\t\tif (!sawFeature) return;
\t\twcheck("and the feature it hands back is one of this mod´s",
\t\t\tmodsOwn,
\t\t\t"it returned " + featureClass + ", which is not a class this mod generated, so the claim did not take");
\t\t// A run that found no dry column of the biome has not tested anything,
\t\t// and must not be allowed to read as a pass or as a failure.
\t\twcheck("and there was dry ground of " + wanted + " to offer it",
\t\t\tattempts > 0,
\t\t\t"every column sampled was under water or lava (" + wet + " of them), so nothing was offered to the tree");
\t\tif (attempts == 0) return;
\t\t// Loudly, and without asserting either way. Every column having thrown
\t\t// means this probe never got an answer, and both a pass and a fail would
\t\t// be inventing one. See the catch above for what throws and why.
\t\tif (placed == 0 && threw >= attempts) {
\t\t\tSystem.out.println("ARTEMIS-WORLDGEN SKIP planting in " + wanted
\t\t\t\t+ ": the game threw from its own lighting on all " + threw
\t\t\t\t+ " columns tried, which is this probe planting off the server thread: " + lastThrow);
\t\t\treturn;
\t\t}
\t\twcheck("and it was allowed to plant somewhere in " + wanted,
\t\t\tplaced > 0,
\t\t\t"refused " + refusals + " and threw on " + threw + " of " + attempts
\t\t\t\t+ " dry columns, so the tree can never appear there");
\t\tif (placed == 0) return;
\t\twcheck("and what it planted is " + label,
\t\t\tplanted > 0,
\t\t\t"place() said yes and the count of " + label + " where it went in did not change");
\t}

\t/**
\t * The claimed trunks standing in a box around one point.
\t *
\t * A box rather than the column, because a trunk is one column and a canopy
\t * is not, and a feature is free to plant beside the point it was handed.
\t */
\tprivate static int boxCount(net.minecraft.core.world.World world, int x, int y, int z, Object[] trunks) {
\t\tint n = 0;
\t\tnet.minecraft.core.world.pos.TilePos q = new net.minecraft.core.world.pos.TilePos();
\t\tfor (int ox = -3; ox <= 3; ox++) {
\t\t\tfor (int oz = -3; oz <= 3; oz++) {
\t\t\t\tfor (int oy = 0; oy < 24 && y + oy < world.getHeightBlocks(); oy++) {
\t\t\t\t\tif (isOneOf(world.getBlockType(q.set(x + ox, y + oy, z + oz)), trunks)) n++;
\t\t\t\t}
\t\t\t}
\t\t}
\t\treturn n;
\t}

\t/** No claimed tree at all, which is the treeless census´s whole point:
\t *  every log it meets is a foreign log. */
\tprivate static final Object[] NO_TRUNKS = new Object[0];

\t/** Identity against any of the trunks a biome´s claim may plant. A biome
\t *  claimed by two trees derives a getTreeFeature that picks between them,
\t *  so "its own tree" is a set and not one block. */
\tprivate static boolean isOneOf(Object block, Object[] trunks) {
\t\tif (block == null) return false;
\t\tfor (Object t : trunks) {
\t\t\tif (t != null && block == t) return true;
\t\t}
\t\treturn false;
\t}

\t/**
\t * Every column of a biome in the sampled grid, and then a SPREAD of them.
\t *
\t * This is not tidiness. The first version of the claim census took the first
\t * four matches of a corner-to-corner scan, which are four chunks of one
\t * patch of one biome cell, and the patch it happened to land on was under an
\t * ocean: the planter refused fifty-one columns in a row and the ground under
\t * every one of them was water. A biome is not evenly ground, so a sample
\t * taken from one corner of it is evidence about that corner and nothing
\t * else.
\t */
\tprivate static java.util.List<int[]> spreadSpots(
\t\t\tnet.minecraft.core.world.biome.provider.BiomeProvider provider,
\t\t\tString wanted, int half, int step, int want) {
\t\tjava.util.List<int[]> pure = new java.util.ArrayList<>();
\t\tjava.util.List<int[]> any = new java.util.ArrayList<>();
\t\tfor (int x = -half; x < half; x += step) {
\t\t\tfor (int z = -half; z < half; z += step) {
\t\t\t\tnet.minecraft.core.world.biome.Biome b = provider.getBiome(x, 64, z);
\t\t\t\tif (b == null) continue;
\t\t\t\tif (!wanted.equals(b.getRegistryKey())) continue;
\t\t\t\tint cx = x >> 4;
\t\t\t\tint cz = z >> 4;
\t\t\t\t(likelyDecoratedOnlyBy(provider, cx, cz, wanted) ? pure : any).add(new int[] { cx, cz });
\t\t\t}
\t\t}
\t\t// Chunks the biome would decorate BY ITSELF first, because that is the
\t\t// only ground either census can conclude anything from. See A68: BTA
\t\t// decorates a chunk as one biome and plants at offsets that spill into
\t\t// the neighbour, so a log in this biome´s column can be somebody else´s
\t\t// doing, and both censuses therefore count only over chunks whose whole
\t\t// two-by-two decorating neighbourhood is this biome.
\t\t//
\t\t// This used to grow four chunks the biome merely APPEARS in and hope one
\t\t// of them qualified, which is a coin toss that gets worse the thinner the
\t\t// biome is. ridgemod:rime_flats owns 6784 of 262144 columns in scattered
\t\t// patches, and not one of its four grown chunks ever qualified: the census
\t\t// counted 306 columns and then correctly refused to conclude anything from
\t\t// them. Choosing for the requirement costs nothing, because the provider
\t\t// answers from noise rather than from generated chunks.
\t\t//
\t\t// The fallback to the unqualified list is deliberate. A biome with no chunk
\t\t// anywhere in the grid is a real thing, and the honest outcome for it is
\t\t// the guard downstream saying so over grown ground, not this returning
\t\t// nothing and the census reporting that the biome could not be found.
\t\tjava.util.List<int[]> all = pure.isEmpty() ? any : pure;
\t\tjava.util.List<int[]> spots = new java.util.ArrayList<>();
\t\tif (all.isEmpty()) return spots;
\t\tint stride = Math.max(1, all.size() / want);
\t\tfor (int i = 0; i < all.size() && spots.size() < want; i += stride) {
\t\t\tspots.add(all.get(i));
\t\t}
\t\treturn spots;
\t}

\t/**
\t * The biome BTA decorates a chunk AS, which is not the same thing as the
\t * biomes the chunk is made of.
\t *
\t * Read off ChunkDecoratorOverworld.decorate in the 8.0.1 jar rather than
\t * guessed: it samples ONE biome, at the chunk origin plus sixteen, and every
\t * ore vein and every tree it plants for that chunk comes from that one
\t * biome. So a chunk made of nine biomes is decorated as whichever biome
\t * happens to sit at that corner.
\t */
\tprivate static String decorationBiomeKey(net.minecraft.core.world.World world, int cx, int cz) {
\t\tint bx = (cx << 4) + 16;
\t\tint bz = (cz << 4) + 16;
\t\tnet.minecraft.core.world.biome.Biome b =
\t\t\tworld.getBlockBiome(bx, world.getHeightValue(bx, bz), bz);
\t\treturn b == null ? null : b.getRegistryKey();
\t}

\t/**
\t * True when every decoration pass that can reach into this chunk belonged to
\t * the biome under test, which is the only ground on which an ABSENCE of
\t * trees means anything.
\t *
\t * Four passes can reach a column, not one. The game plants at
\t * chunkX * 16 + random(16) + 8, so a chunk´s own pass covers its columns 8
\t * to 23 and spills the rest into the chunk to the east; the chunk to the
\t * west spills into this one´s first eight columns. Same in z. So this asks
\t * about (cx, cz) and the three chunks whose spill lands here, and all four
\t * sample points lie inside the two-by-two block already loaded.
\t */
\tprivate static int[][] decoratingChunks(int cx, int cz) {
\t\treturn new int[][] { { cx, cz }, { cx - 1, cz }, { cx, cz - 1 }, { cx - 1, cz - 1 } };
\t}

\tprivate static boolean decoratedOnlyBy(net.minecraft.core.world.World world, int cx, int cz, String wanted) {
\t\tfor (int[] c : decoratingChunks(cx, cz)) {
\t\t\tif (!wanted.equals(decorationBiomeKey(world, c[0], c[1]))) return false;
\t\t}
\t\treturn true;
\t}

\t/**
\t * The same question asked of the biome PROVIDER instead of the world.
\t *
\t * The provider answers without generating anything, which is the whole
\t * point: this is used to CHOOSE which chunks to grow, before paying for
\t * them. The world is still what decides the assertion, because the biome
\t * stored in a generated chunk is the only thing the decorator actually read.
\t *
\t * Sampled at the same block the decorator samples, and over the same four
\t * chunks, both of which come from one place above so that a change to the
\t * rule cannot reach one asker and not the other. That is A75's lesson: the
\t * neighbour rule was written out twice and the two copies were already
\t * spelled differently.
\t */
\tprivate static boolean likelyDecoratedOnlyBy(
\t\t\tnet.minecraft.core.world.biome.provider.BiomeProvider provider, int cx, int cz, String wanted) {
\t\tfor (int[] c : decoratingChunks(cx, cz)) {
\t\t\tnet.minecraft.core.world.biome.Biome b = provider.getBiome((c[0] << 4) + 16, 64, (c[1] << 4) + 16);
\t\t\tif (b == null || !wanted.equals(b.getRegistryKey())) return false;
\t\t}
\t\treturn true;
\t}

\t/**
\t * One chunk, counted only in the columns that belong to the biome under
\t * test. One counter for both censuses, because they ask the same question
\t * of the same ground and two copies of this walk would drift.
\t *
\t * A chunk straddles biomes, so a chunk containing the biome under test
\t * usually contains a wooded one as well, and counting the whole chunk would
\t * count that one´s oaks. Every column is therefore asked its own biome and
\t * only the matching ones are counted.
\t *
\t * Returns { logs that are NOT this biome´s own tree, this biome´s own trunk,
\t * ore veins, columns of the biome seen }.
\t *
\t * The trunk argument is the block the claiming tree plants, or null when
\t * the biome is supposed to grow nothing at all. With null every log is a
\t * foreign log, which is what the treeless census wants. The trunk is
\t * compared by IDENTITY because blocks in BTA are singletons, and a logic
\t * class could not do it: LOG_OAK and a mod´s own log both answer to
\t * BlockLogicLog, which is the whole reason this split exists.
\t *
\t * A log is anything whose logic class is BlockLogicLog and an ore vein
\t * anything whose logic is BlockLogicOreCoal, both asked of the game rather
\t * than listed here. BTA has eight log types and a harness that named them
\t * would be wrong the day it gains a ninth, which is the same reason the
\t * stray sweep reads registry keys off the objects.
\t */
\tprivate static int[] countChunk(net.minecraft.core.world.World world,
\t\t\tnet.minecraft.core.world.biome.provider.BiomeProvider provider,
\t\t\tint chunkX, int chunkZ, String wanted, Object[] trunks) {
\t\tint foreign = 0;
\t\tint mine = 0;
\t\tint coal = 0;
\t\tint columns = 0;
\t\tnet.minecraft.core.world.pos.TilePos p = new net.minecraft.core.world.pos.TilePos();
\t\tfor (int lx = 0; lx < 16; lx++) {
\t\t\tfor (int lz = 0; lz < 16; lz++) {
\t\t\t\tint x = (chunkX << 4) + lx;
\t\t\t\tint z = (chunkZ << 4) + lz;
\t\t\t\tnet.minecraft.core.world.biome.Biome b = provider.getBiome(x, 64, z);
\t\t\t\tif (b == null || !wanted.equals(b.getRegistryKey())) continue;
\t\t\t\tcolumns++;
\t\t\t\t// getHeightBlocks, not 128. The first version of this walked y up to
\t\t\t\t// 127 and found 448 coal veins and not one log in a vanilla FOREST,
\t\t\t\t// because coal is deep and the canopy is not: BTA is taller than
\t\t\t\t// b1.7.3 and every tree in the world was above the ceiling this
\t\t\t\t// walk had invented. Ask the world how tall it is.
\t\t\t\tfor (int y = 1; y < world.getHeightBlocks(); y++) {
\t\t\t\t\tnet.minecraft.core.block.Block<?> block = world.getBlockType(p.set(x, y, z));
\t\t\t\t\tif (block == null) continue;
\t\t\t\t\tif (isOneOf(block, trunks)) mine++;
\t\t\t\t\telse if (net.minecraft.core.block.Block.hasLogicClass(block, net.minecraft.core.block.BlockLogicLog.class)) foreign++;
\t\t\t\t\telse if (net.minecraft.core.block.Block.hasLogicClass(block, net.minecraft.core.block.BlockLogicOreCoal.class)) coal++;
\t\t\t\t}
\t\t\t}
\t\t}
\t\treturn new int[] { foreign, mine, coal, columns };
\t}

\t/**
\t * Count the columns each expected biome owns in one world.
\t *
\t * Shared by the overworld phase and the dimension phase because it is the
\t * same question twice and writing the grid out again is how the two would
\t * drift apart. demandVariety is the one real difference: the overworld
\t * has to be made of more than one biome or the sampling is not proving
\t * anything, while a dimension built from a single-biome roster is
\t * deliberately made of exactly one and must not be failed for it.
\t */
\t/**
\t * The decorator's own output, counted in a real world for the first time.
\t *
\t * A89. Everything Artemis generates that is not a biome is placed from one
\t * mixin on ChunkDecoratorOverworld: ore veins, plant patches, structures,
\t * and trees in the game's own biomes. Nothing in this probe had ever counted
\t * a block that mixin placed. The two censuses that read generated chunks
\t * count the game's coal as a control and the mod's own trunks as the answer,
\t * and the trunks are there because plantClaim called the feature by hand. So
\t * a mixin that applied, ran, and placed nothing would have passed every check
\t * in this file, in the overworld and on the far side of all sixteen doors,
\t * which is this project's oldest failure shape wearing a different hat.
\t *
\t * Ores are what it is asked with. A vein is dense enough to find in a handful
\t * of chunks, it is countable by block IDENTITY (blocks are singletons in BTA,
\t * and the mod's ore carries a plain BlockLogic, so nothing of the game's can
\t * be mistaken for it), and how many are attempted per chunk is the modder's
\t * own number. That last part is what makes an ore worth asserting and a tree
\t * not: A68 measured a claimed biome growing 0 trunks in 5210 columns because
\t * the density comes off a table of BTA's own biomes, so a tree's absence
\t * measures the game. An ore's does not.
\t *
\t * Both kinds of world, from one loop, because "does the mod's content exist
\t * through the portal" is the question the dimension half of this probe was
\t * built for and the biome census can only answer the half about ground.
\t */
\tprivate static void oreCensus() {
\t\tif (ORE_ROWS.length == 0) return;
\t\t// The overworld, for the same reason every other chunk-growing phase asks
\t\t// for it: it is the world whose spawn area the boot is preparing, and a
\t\t// phase that waits for the boot must not wait on the world it is about to
\t\t// generate chunks in.
\t\tnet.minecraft.core.world.World overworld = awaitWorld(0, 60);
\t\tif (overworld == null) {
\t\t\twcheck("the overworld was still there to time the ore census by", false,
\t\t\t\t"no dimension 0 arrived while waiting");
\t\t\treturn;
\t\t}
\t\tif (!awaitBoot(overworld, "the ore census")) return;
\t\tClass<?> holder;
\t\ttry {
\t\t\tholder = Class.forName("${pkg}.init.ModBlocks");
\t\t} catch (Throwable t) {
\t\t\twcheck("the block holder loaded for the ore census", false, String.valueOf(t));
\t\t\treturn;
\t\t}
\t\tfor (int r = 0; r < ORE_ROWS.length; r++) {
\t\t\tString[] row = ORE_ROWS[r];
\t\t\tString field = row[0];
\t\t\tint veinsPerChunk = Integer.parseInt(row[1]);
\t\t\t// Everything ELSE in the project that puts this same block into a
\t\t\t// world. Empty for most ores, and the whole of A94 when it is not:
\t\t\t// the count below is by block identity and identity cannot tell a
\t\t\t// vein from the ground it was cut into.
\t\t\tString shared = ORE_SHARED[r];
\t\t\tObject ore;
\t\t\ttry {
\t\t\t\tore = holder.getField(field).get(null);
\t\t\t} catch (Throwable t) {
\t\t\t\twcheck("the ore block " + field + " the veins are made of exists", false, String.valueOf(t));
\t\t\t\tcontinue;
\t\t\t}
\t\t\t// A null field makes every identity comparison below false, and the
\t\t\t// census would then read as a decorator that placed nothing, which is
\t\t\t// the opposite of what a missing block means.
\t\t\tif (ore == null) {
\t\t\t\twcheck("the ore block " + field + " the veins are made of exists", false,
\t\t\t\t\t"the field is there but null, so nothing could be counted");
\t\t\t\tcontinue;
\t\t\t}
\t\t\tif (row.length == 2) {
\t\t\t\t// An ore that named no biome asked for EVERY biome, which is a claim
\t\t\t\t// about every world this mod reaches and not only about the one it
\t\t\t\t// is easiest to look in. A mod with no doors gets the overworld half
\t\t\t\t// and nothing else, which is every world it has.
\t\t\t\tcensusOre(overworld, "the overworld", field, ore, null, veinsPerChunk, shared);
\t\t\t\tnet.minecraft.core.world.World away = firstDimensionWorld();
\t\t\t\tif (away != null) {
\t\t\t\t\tcensusOre(away, "the first dimension", field, ore, null, veinsPerChunk, shared);
\t\t\t\t}
\t\t\t\tcontinue;
\t\t\t}
\t\t\tfor (int i = 2; i < row.length; i++) {
\t\t\t\tString biomeKey = row[i];
\t\t\t\tnet.minecraft.core.world.World world = worldOfBiome(biomeKey, overworld);
\t\t\t\tif (world == null) {
\t\t\t\t\t// A biome that is in no overworld and in no roster generates in no
\t\t\t\t\t// world at all, so an ore restricted to it has nowhere to be asked.
\t\t\t\t\t// That is the studio's readiness list talking, not the game's, and
\t\t\t\t\t// a check with nowhere to look reports absence rather than failing.
\t\t\t\t\tSystem.out.println("ARTEMIS-WORLDGEN SKIP ore " + field + " in " + biomeKey
\t\t\t\t\t\t+ " :: that biome generates in no world, so its veins have nowhere to be");
\t\t\t\t\tcontinue;
\t\t\t\t}
\t\t\t\tcensusOre(world, "the world of " + biomeKey, field, ore, biomeKey, veinsPerChunk,
\t\t\t\t\tshared);
\t\t\t}
\t\t}
\t}

\t/**
\t * Which world a biome of this mod's lives in: the overworld if it generates
\t * there, otherwise the first dimension whose roster names it.
\t *
\t * The rosters are the same table the claim census pairs its rows against, so
\t * a biome listed by two dimensions resolves to the first, deliberately: this
\t * census asks whether the decorator ran, and one world settles that.
\t */
\tprivate static net.minecraft.core.world.World worldOfBiome(String biomeKey,
\t\t\tnet.minecraft.core.world.World overworld) {
\t\tfor (String key : OVERWORLD_BIOMES) {
\t\t\tif (key.equals(biomeKey)) return overworld;
\t\t}
\t\tfor (int i = 0; i < DIM_ID_FIELDS.length; i++) {
\t\t\tfor (String key : DIM_BIOMES[i]) {
\t\t\t\tif (key.equals(biomeKey)) return dimensionWorld(i);
\t\t\t}
\t\t}
\t\treturn null;
\t}

\t/** The world behind the mod's first dimension, or null when it has none. */
\tprivate static net.minecraft.core.world.World firstDimensionWorld() {
\t\tif (DIM_ID_FIELDS.length == 0) return null;
\t\treturn dimensionWorld(0);
\t}

\t/** One dimension's world, by its index in the roster tables. Reported and
\t *  null rather than thrown, because a dimension that has no world is
\t *  already failed by name in dimensionWorldgen and a second failure here
\t *  would count the same fact twice. */
\tprivate static net.minecraft.core.world.World dimensionWorld(int i) {
\t\ttry {
\t\t\tClass<?> dims = Class.forName(MOD_DIMENSIONS_CLASS);
\t\t\tint id = dims.getField(DIM_ID_FIELDS[i]).getInt(null);
\t\t\treturn awaitWorld(id, 60);
\t\t} catch (Throwable t) {
\t\t\tSystem.out.println("ARTEMIS-WORLDGEN SKIP dimension " + DIM_ID_FIELDS[i]
\t\t\t\t+ " for the ore census :: " + t);
\t\t\treturn null;
\t\t}
\t}

\t/**
\t * One ore, in one world, over enough chunks that a zero means something.
\t *
\t * The chunk count is DERIVED from the density the modder asked for rather
\t * than fixed, which is the same argument A88 makes about a wait: four chunks
\t * of an ore that attempts nine veins each is thirty-six attempts and a zero
\t * there is an answer, while four chunks of an ore that attempts one is four
\t * attempts and a zero there is a coin toss. Twenty-four attempts is the
\t * floor, twelve chunks the ceiling, because the chunks are what this costs.
\t *
\t * The wanted biome is the one to count in, or null for an ore that named
\t * none, in
\t * which case every column counts and the chunks are a spread near the
\t * origin. The counting is over the columns of the biome only, which
\t * UNDERCOUNTS on purpose: a vein starts in a column the guard allowed and
\t * spreads up to eight blocks, so some of it lands next door. Presence is
\t * what is asserted and an undercount cannot fake that.
\t */
\tprivate static void censusOre(net.minecraft.core.world.World world, String where, String field,
\t\t\tObject ore, String wanted, int veinsPerChunk, String shared) {
\t\tnet.minecraft.core.world.biome.provider.BiomeProvider provider = world.getBiomeProvider();
\t\tif (provider == null) {
\t\t\twcheck("the ore census has a biome provider in " + where, false, "getBiomeProvider() returned null");
\t\t\treturn;
\t\t}
\t\tint want = Math.max(4, Math.min(12, (24 + veinsPerChunk - 1) / veinsPerChunk));
\t\tjava.util.List<int[]> spots;
\t\tif (wanted == null) {
\t\t\tspots = openSpots(want);
\t\t} else {
\t\t\tspots = spreadSpots(provider, wanted, 2048, 64, want);
\t\t\twcheck("the ore census found somewhere " + wanted + " actually is", spots.size() > 0,
\t\t\t\t"no column of it in the sampled grid, so nothing was grown to look at");
\t\t\tif (spots.isEmpty()) return;
\t\t}
\t\t// The same switch every chunk-growing phase holds open, for the same
\t\t// reason: a server with nobody in the world refuses to generate a chunk
\t\t// nobody is standing near, and the refusal is silent. See A72 and A74.
\t\tboolean override = allowChunkLoads(world, true);
\t\tint blocks = 0;
\t\tint columns = 0;
\t\tint grown = 0;
\t\ttry {
\t\t\tfor (int[] spot : spots) {
\t\t\t\tif (!growDecorated(world, spot[0], spot[1])) continue;
\t\t\t\tgrown++;
\t\t\t\tint[] tally = countOre(world, provider, spot[0], spot[1], wanted, ore);
\t\t\t\tblocks += tally[0];
\t\t\t\tcolumns += tally[1];
\t\t\t}
\t\t} finally {
\t\t\tif (override) allowChunkLoads(world, false);
\t\t}
\t\t// Printed every run and not only on a failure, which is A85's rule: a
\t\t// line nobody knows the normal shape of is a line nobody can read when it
\t\t// changes. attempts is what the decorator was asked to try over the
\t\t// chunks that actually grew.
\t\tSystem.out.println("ARTEMIS-WORLDGEN ORE " + field + " in " + where
\t\t\t+ (wanted == null ? " (every biome)" : " biome=" + wanted)
\t\t\t+ " blocks=" + blocks + " columns=" + columns + " chunks=" + grown + "/" + spots.size()
\t\t\t+ " attempts=" + (veinsPerChunk * grown)
\t\t\t+ " shared=" + (shared.isEmpty() ? "none" : shared.replace(" ", ",")));
\t\twcheck("the ore census grew ground it could count for " + field + " in " + where,
\t\t\tcolumns > 0,
\t\t\t"not one column to count in " + grown + " of " + spots.size() + " chunks grown, so its zero proves nothing");
\t\tif (columns == 0) return;
\t\t// A94. When something else in the project puts this same block in a
\t\t// world, a count by identity is counting both and the row cannot claim
\t\t// the vein. 'a bog reached two ways' is the measured case: bog_mud veins
\t\t// in a biome floored with bog mud read 1429 blocks in 1524 columns, which
\t\t// is the floor. The check is kept because it still catches a block that
\t\t// is in no world at all, and the WORDING is what changes, because a name
\t\t// that claims more than the number under it proves is the same lie a
\t\t// green harness tells.
\t\tif (!shared.isEmpty()) {
\t\t\twcheck("at least " + field + " is in the ground in " + where
\t\t\t\t\t+ " (also placed by " + shared.replace(" ", ", ") + ", so this cannot tell a vein from it)",
\t\t\t\tblocks > 0,
\t\t\t\t"not one block of it in " + columns + " columns, and this mod puts it there two ways");
\t\t\treturn;
\t\t}
\t\twcheck("and the decorator really put " + field + " in the ground in " + where,
\t\t\tblocks > 0,
\t\t\t"not one block of it in " + columns + " columns after " + (veinsPerChunk * grown)
\t\t\t\t+ " vein attempts: the mixin placed nothing here, so the ore exists in the registry and nowhere else");
\t}

\t/** Chunks for an ore that named no biome: a spread rather than a block, for
\t *  the reason spreadSpots gives, and near the origin because every biome is
\t *  the right biome for it. */
\tprivate static java.util.List<int[]> openSpots(int want) {
\t\tjava.util.List<int[]> spots = new java.util.ArrayList<>();
\t\tfor (int i = 0; i < want; i++) spots.add(new int[] { i * 4, i * 4 });
\t\treturn spots;
\t}

\t/**
\t * One chunk, counted for one block by identity.
\t *
\t * Separate from countChunk rather than folded into it: that one answers a
\t * question about trees over a biome that always has one, and this one has to
\t * answer over EVERY column when the ore named no biome, which countChunk
\t * cannot do without its wanted becoming nullable and every existing caller
\t * inheriting the branch. Same walk, different question.
\t *
\t * Returns { blocks of the ore found, columns counted }.
\t */
\tprivate static int[] countOre(net.minecraft.core.world.World world,
\t\t\tnet.minecraft.core.world.biome.provider.BiomeProvider provider,
\t\t\tint chunkX, int chunkZ, String wanted, Object ore) {
\t\tint found = 0;
\t\tint columns = 0;
\t\tnet.minecraft.core.world.pos.TilePos p = new net.minecraft.core.world.pos.TilePos();
\t\tfor (int lx = 0; lx < 16; lx++) {
\t\t\tfor (int lz = 0; lz < 16; lz++) {
\t\t\t\tint x = (chunkX << 4) + lx;
\t\t\t\tint z = (chunkZ << 4) + lz;
\t\t\t\tif (wanted != null) {
\t\t\t\t\tnet.minecraft.core.world.biome.Biome b = provider.getBiome(x, 64, z);
\t\t\t\t\tif (b == null || !wanted.equals(b.getRegistryKey())) continue;
\t\t\t\t}
\t\t\t\tcolumns++;
\t\t\t\t// The world's own height, not 128, for the reason countChunk gives:
\t\t\t\t// BTA is taller than the number a harness would have invented.
\t\t\t\tfor (int y = 1; y < world.getHeightBlocks(); y++) {
\t\t\t\t\tif (world.getBlockType(p.set(x, y, z)) == ore) found++;
\t\t\t\t}
\t\t\t}
\t\t}
\t\treturn new int[] { found, columns };
\t}

\t/**
\t * The decorator's SECOND kind of output, and the harder half to be honest
\t * about.
\t *
\t * A90 asked the mixin with ORES because a vein is the easy case: a cluster
\t * dropped anywhere inside a y band, dense, and countable by identity. The
\t * mixin places four kinds of thing and the ore was one. This is the next.
\t *
\t * A plant patch is ONE block per attempt, at one column, and the attempt
\t * only lands if that column is air standing on ground the plant itself
\t * accepts. So a zero is far easier to reach HONESTLY here than it is for an
\t * ore, and a check that fails a legitimate mod is worse than no check at
\t * all. Two things make it safe:
\t *
\t *   more chunks   the sample is sized from the density like the ore's, but
\t *                 against a floor of forty-eight attempts rather than
\t *                 twenty-four, because most of an ore's attempts land and
\t *                 only some of a plant's can
\t *   the ground    the same columns are then asked how many of them the
\t *                 plant COULD stand in, using the plant's own canPlaceAt,
\t *                 which is the very predicate the mixin uses. That turns
\t *                 the attempts into an expectation, and the row only makes
\t *                 an assertion when the expectation is large enough that a
\t *                 zero cannot be luck
\t *
\t * Both numbers are printed either way, which is A85's rule: a row that made
\t * no assertion still says what it saw, so a plant that quietly stopped
\t * generating shows as an expectation that collapsed rather than as a line
\t * that went missing.
\t *
\t * Structures are the third kind and are not asked here: one chunk in sixteen
\t * to thirty is a different sampling problem again. Trees are the fourth and
\t * are A68's, which is that their density is BTA's table rather than the
\t * modder's number, and they should stay out of it.
\t */
\tprivate static void plantCensus() {
\t\tif (PLANT_ROWS.length == 0) return;
\t\t// The overworld first, for the reason every chunk-growing phase asks for
\t\t// it: it is the world whose spawn area the boot is preparing, and a phase
\t\t// that waits for the boot must not wait on the world it is about to grow
\t\t// chunks in.
\t\tnet.minecraft.core.world.World overworld = awaitWorld(0, 60);
\t\tif (overworld == null) {
\t\t\twcheck("the overworld was still there to time the plant census by", false,
\t\t\t\t"no dimension 0 arrived while waiting");
\t\t\treturn;
\t\t}
\t\tif (!awaitBoot(overworld, "the plant census")) return;
\t\tClass<?> holder;
\t\ttry {
\t\t\tholder = Class.forName("${pkg}.init.ModBlocks");
\t\t} catch (Throwable t) {
\t\t\twcheck("the block holder loaded for the plant census", false, String.valueOf(t));
\t\t\treturn;
\t\t}
\t\tfor (String[] row : PLANT_ROWS) {
\t\t\tString field = row[0];
\t\t\tint patchesPerChunk = Integer.parseInt(row[1]);
\t\t\tObject plant;
\t\t\ttry {
\t\t\t\tplant = holder.getField(field).get(null);
\t\t\t} catch (Throwable t) {
\t\t\t\twcheck("the plant block " + field + " the patches are made of exists", false,
\t\t\t\t\tString.valueOf(t));
\t\t\t\tcontinue;
\t\t\t}
\t\t\t// A null field makes every identity comparison below false, and the
\t\t\t// census would then read as a decorator that placed nothing, which is
\t\t\t// the opposite of what a missing block means. Same trap as the ore's.
\t\t\tif (plant == null) {
\t\t\t\twcheck("the plant block " + field + " the patches are made of exists", false,
\t\t\t\t\t"the field is there but null, so nothing could be counted");
\t\t\t\tcontinue;
\t\t\t}
\t\t\tif (row.length == 2) {
\t\t\t\t// A plant that named no biome asked for every biome, which is a
\t\t\t\t// claim about every world this mod reaches rather than about the
\t\t\t\t// one it is easiest to look in.
\t\t\t\tcensusPlant(overworld, "the overworld", field, plant, null, patchesPerChunk);
\t\t\t\tnet.minecraft.core.world.World away = firstDimensionWorld();
\t\t\t\tif (away != null) {
\t\t\t\t\tcensusPlant(away, "the first dimension", field, plant, null, patchesPerChunk);
\t\t\t\t}
\t\t\t\tcontinue;
\t\t\t}
\t\t\tfor (int i = 2; i < row.length; i++) {
\t\t\t\tString biomeKey = row[i];
\t\t\t\tnet.minecraft.core.world.World world = worldOfBiome(biomeKey, overworld);
\t\t\t\tif (world == null) {
\t\t\t\t\t// A biome that is in no overworld and in no roster generates in
\t\t\t\t\t// no world, so a plant confined to it has nowhere to be asked.
\t\t\t\t\tSystem.out.println("ARTEMIS-WORLDGEN SKIP plant " + field + " in " + biomeKey
\t\t\t\t\t\t+ " :: that biome generates in no world, so its patches have nowhere to be");
\t\t\t\t\tcontinue;
\t\t\t\t}
\t\t\t\tcensusPlant(world, "the world of " + biomeKey, field, plant, biomeKey, patchesPerChunk);
\t\t\t}
\t\t}
\t}

\t/**
\t * One plant, in one world, over enough chunks that a zero means something,
\t * and only asserted when the ground says a zero could not be luck.
\t *
\t * The chunk count is derived from the density the modder asked for, which is
\t * the argument A88 makes about a wait and A90 makes about an ore: four
\t * chunks of a plant that attempts one patch each is four attempts, and a
\t * zero there is a coin toss. Forty-eight attempts is the floor here against
\t * the ore's twenty-four, and sixteen chunks the ceiling, because a plant
\t * attempt can fail for reasons no mod is doing wrong.
\t *
\t * EXPECTED is the number that decides whether to assert at all. Every
\t * attempt picks a uniformly random column of its chunk, so the chance one
\t * lands somewhere the plant can stand is the fraction of that chunk's 256
\t * columns which are ground it accepts, and the expected number of plants
\t * over the whole sample is patchesPerChunk x (ground / 256). Five is the
\t * line: the Poisson tail at five is under a percent, and the decorator's own
\t * Random is seeded from the chunk coordinates, so this is a fixed draw for a
\t * given world rather than a fresh gamble every run.
\t *
\t * The line guards the ZERO and not the row. A plant found in the ground
\t * proves the mixin planted it whatever the sample was worth, so only an
\t * ABSENCE has to clear the expectation. Below five with nothing found, the
\t * row prints its numbers and makes no claim, which is the honest answer to
\t * "this plant had almost nowhere to grow": the mod may be perfectly correct
\t * and the sample simply cannot tell.
\t */
\tprivate static void censusPlant(net.minecraft.core.world.World world, String where, String field,
\t\t\tObject plant, String wanted, int patchesPerChunk) {
\t\tnet.minecraft.core.world.biome.provider.BiomeProvider provider = world.getBiomeProvider();
\t\tif (provider == null) {
\t\t\twcheck("the plant census has a biome provider in " + where, false,
\t\t\t\t"getBiomeProvider() returned null");
\t\t\treturn;
\t\t}
\t\t// The plant's own ground test, which is the same object the mixin casts
\t\t// to and calls. Asking the block rather than re-deriving the Grows On
\t\t// list is the one-declaration rule: that list is declared in the logic
\t\t// class, and this reads it there instead of keeping a second copy.
\t\tnet.minecraft.core.block.BlockLogicFlower logic;
\t\ttry {
\t\t\tlogic = (net.minecraft.core.block.BlockLogicFlower)
\t\t\t\t((net.minecraft.core.block.Block<?>) plant).getLogic();
\t\t} catch (Throwable t) {
\t\t\twcheck("the plant " + field + " is a flower, so it has ground of its own to ask about",
\t\t\t\tfalse, String.valueOf(t));
\t\t\treturn;
\t\t}
\t\tint want = Math.max(6, Math.min(16, (48 + patchesPerChunk - 1) / patchesPerChunk));
\t\tjava.util.List<int[]> spots;
\t\tif (wanted == null) {
\t\t\tspots = openSpots(want);
\t\t} else {
\t\t\tspots = spreadSpots(provider, wanted, 2048, 64, want);
\t\t\twcheck("the plant census found somewhere " + wanted + " actually is", spots.size() > 0,
\t\t\t\t"no column of it in the sampled grid, so nothing was grown to look at");
\t\t\tif (spots.isEmpty()) return;
\t\t}
\t\t// The same switch every chunk-growing phase holds open, for the same
\t\t// reason: a server with nobody in the world refuses to generate a chunk
\t\t// nobody is standing near, and the refusal is silent. See A72 and A74.
\t\tboolean override = allowChunkLoads(world, true);
\t\tint blocks = 0;
\t\tint columns = 0;
\t\tint ground = 0;
\t\tint grown = 0;
\t\ttry {
\t\t\tfor (int[] spot : spots) {
\t\t\t\tif (!growDecorated(world, spot[0], spot[1])) continue;
\t\t\t\tgrown++;
\t\t\t\tint[] tally = countPlant(world, provider, spot[0], spot[1], wanted, plant, logic);
\t\t\t\tblocks += tally[0];
\t\t\t\tcolumns += tally[1];
\t\t\t\tground += tally[2];
\t\t\t}
\t\t} finally {
\t\t\tif (override) allowChunkLoads(world, false);
\t\t}
\t\tdouble expected = patchesPerChunk * (ground / 256.0);
\t\tdouble shown = Math.round(expected * 10.0) / 10.0;
\t\t// Printed every run and not only on a failure, which is A85's rule. The
\t\t// ground and the expectation are the two numbers nothing else in this
\t\t// probe prints, and they are what make a zero readable.
\t\tSystem.out.println("ARTEMIS-WORLDGEN PLANT " + field + " in " + where
\t\t\t+ (wanted == null ? " (every biome)" : " biome=" + wanted)
\t\t\t+ " blocks=" + blocks + " columns=" + columns + " ground=" + ground
\t\t\t+ " chunks=" + grown + "/" + spots.size()
\t\t\t+ " attempts=" + (patchesPerChunk * grown)
\t\t\t+ " expected=" + shown);
\t\twcheck("the plant census grew ground it could count for " + field + " in " + where,
\t\t\tcolumns > 0,
\t\t\t"not one column to count in " + grown + " of " + spots.size()
\t\t\t\t+ " chunks grown, so its zero proves nothing");
\t\tif (columns == 0) return;
\t\t// The guard is on the ZERO and not on the row, which is the ordering that
\t\t// matters. A plant found in the ground proves the mixin planted it, and
\t\t// how thin the sample was is beside the point once the evidence is there.
\t\t// It is only an ABSENCE that needs the expectation to mean anything, so a
\t\t// row that got lucky in poor ground still gets its assertion.
\t\tif (blocks == 0 && expected < 5.0) {
\t\t\t// Not a failure and not a pass. The plant had almost nowhere to stand
\t\t\t// in the ground this sample found, so nothing about the mixin can be
\t\t\t// concluded from what it did not place here.
\t\t\tSystem.out.println("ARTEMIS-WORLDGEN SKIP plant " + field + " in " + where
\t\t\t\t+ " :: only " + ground + " of " + columns + " columns are ground it accepts, so "
\t\t\t\t+ (patchesPerChunk * grown) + " attempts expect " + shown
\t\t\t\t+ " and a zero proves nothing");
\t\t\treturn;
\t\t}
\t\twcheck("and the decorator really planted " + field + " in " + where,
\t\t\tblocks > 0,
\t\t\t"not one of it in " + columns + " columns after " + (patchesPerChunk * grown)
\t\t\t\t+ " attempts over " + ground + " columns of ground it accepts, which expected "
\t\t\t\t+ shown
\t\t\t\t+ ": the mixin planted nothing here, so the plant exists in the registry and nowhere else");
\t}

\t/**
\t * One chunk, counted for one plant and for the ground that plant would take.
\t *
\t * Separate from countOre rather than folded into it, and the reason is the
\t * third number: an ore needs no notion of where it COULD have been, because
\t * a vein lands in any stone, and a plant's whole honesty problem is that it
\t * cannot. Folding them would give countOre a logic argument it never uses
\t * and a return slot it always left empty.
\t *
\t * A column the plant is already standing in counts as ground WITHOUT being
\t * asked: the plant grew there, so the ground was acceptable, and asking
\t * canPlaceAt now would say no, because what is under that surface is the
\t * plant itself. Undercounting the ground only ever raises the expectation
\t * bar, so this is the direction that cannot invent a pass.
\t *
\t * Returns { blocks of the plant found, columns counted, columns of ground }.
\t */
\tprivate static int[] countPlant(net.minecraft.core.world.World world,
\t\t\tnet.minecraft.core.world.biome.provider.BiomeProvider provider,
\t\t\tint chunkX, int chunkZ, String wanted, Object plant,
\t\t\tnet.minecraft.core.block.BlockLogicFlower logic) {
\t\tint found = 0;
\t\tint columns = 0;
\t\tint ground = 0;
\t\tnet.minecraft.core.world.pos.TilePos p = new net.minecraft.core.world.pos.TilePos();
\t\tfor (int lx = 0; lx < 16; lx++) {
\t\t\tfor (int lz = 0; lz < 16; lz++) {
\t\t\t\tint x = (chunkX << 4) + lx;
\t\t\t\tint z = (chunkZ << 4) + lz;
\t\t\t\tif (wanted != null) {
\t\t\t\t\tnet.minecraft.core.world.biome.Biome b = provider.getBiome(x, 64, z);
\t\t\t\t\tif (b == null || !wanted.equals(b.getRegistryKey())) continue;
\t\t\t\t}
\t\t\t\tcolumns++;
\t\t\t\tint here = 0;
\t\t\t\t// The world's own height, not 128, for the reason countChunk gives:
\t\t\t\t// BTA is taller than the number a harness would have invented. A
\t\t\t\t// stacked plant is several blocks in one column and every one of
\t\t\t\t// them counts, because the question is whether the mixin planted
\t\t\t\t// anything and not how tall it grew afterwards.
\t\t\t\tfor (int y = 1; y < world.getHeightBlocks(); y++) {
\t\t\t\t\tif (world.getBlockType(p.set(x, y, z)) == plant) here++;
\t\t\t\t}
\t\t\t\tfound += here;
\t\t\t\tif (here > 0) {
\t\t\t\t\tground++;
\t\t\t\t\tcontinue;
\t\t\t\t}
\t\t\t\t// The mixin's own two conditions, asked of the same column: the
\t\t\t\t// surface must be air, and the plant's logic must accept what is
\t\t\t\t// under it. Anything else is a column no correct mod could have
\t\t\t\t// planted in.
\t\t\t\tnet.minecraft.core.world.pos.TilePos at =
\t\t\t\t\tnew net.minecraft.core.world.pos.TilePos(x, world.getHeightValue(x, z), z);
\t\t\t\tif (world.isAirBlock(at) && logic.canPlaceAt(world, at)) ground++;
\t\t\t}
\t\t}
\t\treturn new int[] { found, columns, ground };
\t}

\t/**
\t * The decorator's THIRD kind of output, and the rare one.
\t *
\t * A90 asked the mixin with ores and A95 with plants. Both are dense: an ore
\t * attempts several veins in every chunk and a plant several patches, so a
\t * dozen chunks is already dozens of attempts and a zero there is an answer.
\t * A structure attempts ONCE in oneIn CHUNKS. At the studio's own default of
\t * 24 a twelve-chunk sample expects half a placement, so the ore census's
\t * arithmetic applied here would produce a row that is a coin toss dressed
\t * up as a check.
\t *
\t * Two things are different here, and both of them are the point.
\t *
\t * THE SAMPLE IS A BLOCK, NOT A SPREAD. Every other census picks scattered
\t * spots and calls growDecorated on each, which loads a two by two so the
\t * counted chunk is really decorated. Scattered, that is four generations
\t * per counted chunk. Abutting, the two by twos overlap and a square of
\t * S x S counted chunks costs (S + 2)^2 generations: 225 counted chunks for
\t * 289 generations rather than 900. That is the difference between this
\t * census being affordable and not, and it costs nothing in honesty because
\t * the decorator's Random is seeded from the chunk COORDINATES alone
\t * (see mapping.oreGen.mixinClass), so neighbouring chunks roll
\t * independently and a block of them is as good a sample as a spread.
\t *
\t * THE SHAPE IS WHAT IS COUNTED. A structure is built out of blocks that
\t * already exist, so counting one of them by identity is A94's problem at
\t * its worst: a cairn of cobblestone in a world that has cobblestone in it
\t * proves nothing at all. But a structure stamps a DECLARED ARRANGEMENT
\t * unconditionally, so the arrangement itself is the evidence. This walks
\t * every anchor in the counted chunks and asks whether a whole variant
\t * stands there, which is the question "did the mixin place this" rather
\t * than "is this block anywhere".
\t *
\t * AND THE SHAPE CHECKS ITSELF. "That arrangement cannot occur by chance" is
\t * exactly the kind of claim this project has been wrong about before, and
\t * it is a claim about BTA's terrain rather than about the mod, which is the
\t * sort of thing the audit refuses to guess at (see the moss_bell limit in
\t * PROGRESS.md). So every variant is matched a second time as a DECOY: the
\t * same cells, the same blocks, one of them moved three east and three
\t * south. The decoy is a shape of the same size and the same composition
\t * that the mod never places, so whatever it matches is coincidence, and it
\t * is measured in the same chunks in the same run rather than assumed. A row
\t * whose decoy keeps up with it is a row whose shape is not distinctive
\t * here, and it says so and claims nothing.
\t *
\t * AND THERE IS A CEILING ABOVE BOTH OF THEM, which is the one rule here
\t * that is arithmetic rather than judgement: the mixin rolls once a chunk
\t * and places once, so more builds than chunks is not a better answer, it is
\t * proof the count has stopped counting placements. A100 found that the
\t * decoy alone does not catch it, because a shape that matches everywhere
\t * makes its own control match nearly everywhere too.
\t */
\tprivate static void structureCensus() {
\t\tif (STRUCTURE_ROWS.length == 0) return;
\t\t// The overworld, for the same reason every other chunk-growing phase
\t\t// asks for it: it is the world whose spawn area the boot is preparing.
\t\tnet.minecraft.core.world.World overworld = awaitWorld(0, 60);
\t\tif (overworld == null) {
\t\t\twcheck("the overworld was still there to time the structure census by", false,
\t\t\t\t"no dimension 0 arrived while waiting");
\t\t\treturn;
\t\t}
\t\tif (!awaitBoot(overworld, "the structure census")) return;
\t\tfor (int r = 0; r < STRUCTURE_ROWS.length; r++) {
\t\t\tString[] row = STRUCTURE_ROWS[r];
\t\t\tString name = row[0];
\t\t\tint oneIn = Integer.parseInt(row[1]);
\t\t\tboolean buried = "1".equals(row[2]);
\t\t\t// The build, resolved once per row rather than once per world: the
\t\t\t// blocks are singletons and a second world does not change them.
\t\t\tObject[][] blocks = new Object[STRUCTURE_CELLS[r].length][];
\t\t\tint[][][] offs = new int[STRUCTURE_CELLS[r].length][][];
\t\t\tint unresolved = 0;
\t\t\tint usable = 0;
\t\t\tfor (int v = 0; v < STRUCTURE_CELLS[r].length; v++) {
\t\t\t\tString[] cells = STRUCTURE_CELLS[r][v].split(";");
\t\t\t\toffs[v] = new int[cells.length][];
\t\t\t\tblocks[v] = new Object[cells.length];
\t\t\t\tint known = 0;
\t\t\t\tfor (int c = 0; c < cells.length; c++) {
\t\t\t\t\tString[] part = cells[c].split(",");
\t\t\t\t\toffs[v][c] = new int[] {
\t\t\t\t\t\tInteger.parseInt(part[0]), Integer.parseInt(part[1]), Integer.parseInt(part[2])
\t\t\t\t\t};
\t\t\t\t\tString tag = part.length > 3 ? part[3] : "?";
\t\t\t\t\tif ("?".equals(tag)) {
\t\t\t\t\t\t// A cell whose reference resolved to neither holder on
\t\t\t\t\t\t// the TypeScript side. Skipped rather than guessed at,
\t\t\t\t\t\t// which only ever weakens the match.
\t\t\t\t\t\tblocks[v][c] = null;
\t\t\t\t\t\tcontinue;
\t\t\t\t\t}
\t\t\t\t\tObject b = blockOfTag(tag);
\t\t\t\t\tif (b == null) unresolved++; else known++;
\t\t\t\t\tblocks[v][c] = b;
\t\t\t\t}
\t\t\t\t// A variant with nothing known in it would match every anchor in
\t\t\t\t// the world, which is the one way this census could invent a
\t\t\t\t// pass out of nothing. Emptied so the match skips it entirely.
\t\t\t\tif (known == 0) blocks[v] = null; else usable++;
\t\t\t}
\t\t\t// A tag this side could not resolve is a real problem and not a
\t\t\t// weaker claim: the generated Java names the same field, so a field
\t\t\t// the probe cannot find is one javac agreed to and the game did not.
\t\t\twcheck("every block the structure " + name + " is built from exists in the game",
\t\t\t\tunresolved == 0,
\t\t\t\tunresolved + " of its cells name a block field that is not there at runtime");
\t\t\tif (usable == 0) {
\t\t\t\twcheck("the structure " + name + " is built out of blocks this census can recognise",
\t\t\t\t\tfalse, "not one variant has a single resolvable cell, so no placement could be told from terrain");
\t\t\t\tcontinue;
\t\t\t}
\t\t\tif (row.length == 3) {
\t\t\t\t// A structure that named no biome asked for every one of them,
\t\t\t\t// which is a claim about every world this mod reaches. Same
\t\t\t\t// reading the ore and plant rows give an empty list.
\t\t\t\tcensusStructure(overworld, "the overworld", name, offs, blocks, null, oneIn, buried);
\t\t\t\tnet.minecraft.core.world.World away = firstDimensionWorld();
\t\t\t\tif (away != null) {
\t\t\t\t\tcensusStructure(away, "the first dimension", name, offs, blocks, null, oneIn, buried);
\t\t\t\t}
\t\t\t\tcontinue;
\t\t\t}
\t\t\tfor (int i = 3; i < row.length; i++) {
\t\t\t\tString biomeKey = row[i];
\t\t\t\tnet.minecraft.core.world.World world = worldOfBiome(biomeKey, overworld);
\t\t\t\tif (world == null) {
\t\t\t\t\tSystem.out.println("ARTEMIS-WORLDGEN SKIP structure " + name + " in " + biomeKey
\t\t\t\t\t\t+ " :: that biome generates in no world, so it has nowhere to stand");
\t\t\t\t\tcontinue;
\t\t\t\t}
\t\t\t\tcensusStructure(world, "the world of " + biomeKey, name, offs, blocks, biomeKey,
\t\t\t\t\toneIn, buried);
\t\t\t}
\t\t}
\t}

\t/** One cell's block, from the tag STRUCTURE_CELLS carries: "V:FIELD" on the
\t *  game's Blocks holder, "M:FIELD" on the mod's. Null when the field is not
\t *  there, which the caller counts and reports rather than swallowing. */
\tprivate static Object blockOfTag(String tag) {
\t\ttry {
\t\t\tif (tag.startsWith("V:")) {
\t\t\t\treturn net.minecraft.core.block.Blocks.class.getField(tag.substring(2)).get(null);
\t\t\t}
\t\t\tif (tag.startsWith("M:")) {
\t\t\t\treturn Class.forName("${pkg}.init.ModBlocks").getField(tag.substring(2)).get(null);
\t\t\t}
\t\t} catch (Throwable ignored) {
\t\t\t// reported by the caller as an unresolved cell
\t\t}
\t\treturn null;
\t}

\t/**
\t * One structure, in one world, over a square of chunks sized against the
\t * roll, asserted only when the shape beat its own decoy.
\t *
\t * The chunk count is derived from the RARITY the way the other two derive
\t * theirs from a density: five placements is the line the plant census drew
\t * and this draws it in the same place, so the sample wants 5 x oneIn
\t * chunks. Twenty-five is the floor and 225 the ceiling, and the ceiling is
\t * what a very rare structure runs into: at one chunk in fifty the row
\t * expects four and a half, says so, and makes no claim from a zero.
\t *
\t * EXPECTED is the plant census's arithmetic with one attempt per chunk
\t * instead of several. The mixin rolls once a chunk, and on a hit picks a
\t * uniformly random column of it, so the chance of a placement in a chunk is
\t * (1 / oneIn) x (the fraction of that chunk's 256 columns the guards would
\t * have let it stand in). Those guards are the biome test and, for a surface
\t * structure, the solid-ground test under the heightmap, both read off
\t * mapping.oreGen.structureSurface rather than invented here.
\t */
\tprivate static void censusStructure(net.minecraft.core.world.World world, String where,
\t\t\tString name, int[][][] offs, Object[][] blocks, String wanted, int oneIn,
\t\t\tboolean buried) {
\t\tnet.minecraft.core.world.biome.provider.BiomeProvider provider = world.getBiomeProvider();
\t\tif (provider == null) {
\t\t\twcheck("the structure census has a biome provider in " + where, false,
\t\t\t\t"getBiomeProvider() returned null");
\t\t\treturn;
\t\t}
\t\tint want = Math.max(25, Math.min(225, 5 * oneIn));
\t\tint side = (int) Math.ceil(Math.sqrt((double) want));
\t\tint ax;
\t\tint az;
\t\tif (wanted == null) {
\t\t\t// Off the origin on purpose. The probe builds its own portal rings
\t\t\t// near spawn, and while a ring is not any structure's shape, a
\t\t\t// census that walks ground this harness has been writing to is one
\t\t\t// more thing to have to reason about. See A94's portal-frame entry.
\t\t\tax = 8;
\t\t\taz = 8;
\t\t} else {
\t\t\t// One spot the biome really is, and the square centred on it. The
\t\t\t// centring is what stops a biome-restricted row sampling a square
\t\t\t// that merely touches its biome at one corner.
\t\t\tjava.util.List<int[]> found = spreadSpots(provider, wanted, 2048, 64, 1);
\t\t\twcheck("the structure census found somewhere " + wanted + " actually is",
\t\t\t\tfound.size() > 0, "no column of it in the sampled grid, so nothing was grown to look at");
\t\t\tif (found.isEmpty()) return;
\t\t\tax = found.get(0)[0] - side / 2;
\t\t\taz = found.get(0)[1] - side / 2;
\t\t}
\t\t// The same switch every chunk-growing phase holds open, for the same
\t\t// reason: a server with nobody in the world refuses to generate a chunk
\t\t// nobody is standing near, and the refusal is silent. See A72 and A74.
\t\tboolean override = allowChunkLoads(world, true);
\t\tint builds = 0;
\t\tint decoys = 0;
\t\tint eligible = 0;
\t\tint columns = 0;
\t\tint grown = 0;
\t\tlong started = System.currentTimeMillis();
\t\ttry {
\t\t\t// The ring OUTSIDE the counted square, loaded first and counted
\t\t\t// never. BTA populates a chunk once the three chunks east, south
\t\t\t// and south-east of it are loaded, so loading one chunk beyond the
\t\t\t// square in every direction is what makes every counted chunk
\t\t\t// decorated AND every chunk that can decorate into it decorated. It
\t\t\t// is also what keeps a cell reaching one chunk west of its anchor
\t\t\t// inside loaded ground rather than off the edge of the sample.
\t\t\tfor (int cx = ax - 1; cx <= ax + side; cx++) {
\t\t\t\tfor (int cz = az - 1; cz <= az + side; cz++) {
\t\t\t\t\tawaitChunk(world, cx, cz, 40);
\t\t\t\t}
\t\t\t}
\t\t\tfor (int cx = ax; cx < ax + side; cx++) {
\t\t\t\tfor (int cz = az; cz < az + side; cz++) {
\t\t\t\t\tif (!world.isChunkLoaded(cx, cz)) continue;
\t\t\t\t\tgrown++;
\t\t\t\t\tint[] tally = countStructure(world, provider, cx, cz, wanted, offs, blocks, buried);
\t\t\t\t\tbuilds += tally[0];
\t\t\t\t\tdecoys += tally[1];
\t\t\t\t\teligible += tally[2];
\t\t\t\t\tcolumns += tally[3];
\t\t\t\t}
\t\t\t}
\t\t} finally {
\t\t\tif (override) allowChunkLoads(world, false);
\t\t}
\t\tdouble expected = columns == 0 ? 0.0 : grown * (1.0 / oneIn) * (eligible / (double) columns);
\t\tdouble shown = Math.round(expected * 10.0) / 10.0;
\t\t// Printed every run and not only on a failure, which is A85's rule. The
\t\t// decoy is the number nothing else in this probe prints and it is the
\t\t// one that says how much the builds count is worth.
\t\tSystem.out.println("ARTEMIS-WORLDGEN STRUCTURE " + name + " in " + where
\t\t\t+ (wanted == null ? " (every biome)" : " biome=" + wanted)
\t\t\t+ " builds=" + builds + " decoy=" + decoys
\t\t\t+ " eligible=" + eligible + " of " + columns
\t\t\t+ " chunks=" + grown + "/" + (side * side)
\t\t\t+ " oneIn=" + oneIn + " expected=" + shown
\t\t\t+ " for=" + (System.currentTimeMillis() - started) + "ms");
\t\twcheck("the structure census grew ground it could count for " + name + " in " + where,
\t\t\tcolumns > 0,
\t\t\t"not one chunk of the " + (side * side) + " it asked for came back loaded, so its zero proves nothing");
\t\tif (columns == 0) return;
\t\t// The CEILING first, and it is the one rule here that is not a
\t\t// judgement call. mapping.oreGen.structureSurface and structureBuried
\t\t// are both a single-iteration loop that rolls once and places once, so
\t\t// the mixin cannot have stamped more builds into these chunks than
\t\t// there are chunks. A count above that is not counting placements, it
\t\t// is counting terrain, and the row has to say so rather than read a
\t\t// bigger number as a better answer.
\t\t//
\t\t// A100 is why this is here and it was a poison that found it. A
\t\t// structure of ONE cell of the ashen biome's own top block matched 874
\t\t// anchors in the overworld against a decoy's 727, and 139911 against
\t\t// 138956 in a dimension floored with the same block. Both passed, on
\t\t// the strength of builds being LARGER than its control, when the whole
\t\t// difference was noise on top of a count of the ground. The decoy
\t\t// alone could not catch it: a shape that matches everywhere makes its
\t\t// own control match nearly everywhere too, and the two large numbers
\t\t// then differ by a rounding error that has a sign.
\t\tif (builds > grown) {
\t\t\tSystem.out.println("ARTEMIS-WORLDGEN SKIP structure " + name + " in " + where
\t\t\t\t+ " :: " + builds + " builds in " + grown
\t\t\t\t+ " chunks, and the mixin rolls once a chunk, so this shape is in the terrain"
\t\t\t\t+ " rather than stamped and no count of it can tell the two apart");
\t\t\treturn;
\t\t}
\t\t// The decoy next, because it decides whether either of the other two
\t\t// numbers can be read at all. A shape its own control keeps up with is
\t\t// a shape this terrain produces on its own, and a count of it is a
\t\t// count of coincidences whichever way it comes out.
\t\tif (builds <= decoys && decoys > 0) {
\t\t\tSystem.out.println("ARTEMIS-WORLDGEN SKIP structure " + name + " in " + where
\t\t\t\t+ " :: a decoy of the same size and the same blocks matched " + decoys
\t\t\t\t+ " times against this shape's " + builds
\t\t\t\t+ ", so the arrangement is not distinctive in this terrain and neither number means anything");
\t\t\treturn;
\t\t}
\t\t// Then the same rule the plant census draws, in the same place and for
\t\t// the same reason: the guard is on the ZERO and not on the row. A build
\t\t// standing in the ground proves the mixin stamped it whatever the
\t\t// sample was worth, and only an ABSENCE needs the expectation.
\t\tif (builds == 0 && expected < 5.0) {
\t\t\tSystem.out.println("ARTEMIS-WORLDGEN SKIP structure " + name + " in " + where
\t\t\t\t+ " :: one chunk in " + oneIn + " over " + grown + " chunks, of which "
\t\t\t\t+ eligible + " of " + columns + " columns pass its guards, expects " + shown
\t\t\t\t+ " and a zero proves nothing");
\t\t\treturn;
\t\t}
\t\twcheck("and the decorator really stamped " + name + " into " + where,
\t\t\tbuilds > 0,
\t\t\t"not one of its builds stands in " + grown + " chunks, where one chunk in " + oneIn
\t\t\t\t+ " over " + eligible + " of " + columns
\t\t\t\t+ " columns it is allowed to stand in expected " + shown
\t\t\t\t+ ": the mixin stamped nothing here, so the structure exists in the code and nowhere else");
\t}

\t/**
\t * One chunk, walked for whole builds and for the ground a build was allowed
\t * to stand on.
\t *
\t * Every anchor in the chunk is asked, at every height, because the anchor a
\t * surface structure was given is the heightmap AT GENERATION TIME and the
\t * structure itself has changed the heightmap since. Reading it now and
\t * trusting it would miss every build that stands more than nothing tall.
\t *
\t * Returns { whole builds, decoy matches, columns the guards allow, columns }.
\t */
\tprivate static int[] countStructure(net.minecraft.core.world.World world,
\t\t\tnet.minecraft.core.world.biome.provider.BiomeProvider provider,
\t\t\tint chunkX, int chunkZ, String wanted, int[][][] offs, Object[][] blocks,
\t\t\tboolean buried) {
\t\tint builds = 0;
\t\tint decoys = 0;
\t\tint eligible = 0;
\t\tint columns = 0;
\t\tint height = world.getHeightBlocks();
\t\tnet.minecraft.core.world.pos.TilePos p = new net.minecraft.core.world.pos.TilePos();
\t\tfor (int lx = 0; lx < 16; lx++) {
\t\t\tfor (int lz = 0; lz < 16; lz++) {
\t\t\t\tint x = (chunkX << 4) + lx;
\t\t\t\tint z = (chunkZ << 4) + lz;
\t\t\t\tcolumns++;
\t\t\t\t// The mixin's own two guards, asked of the same column it would
\t\t\t\t// have asked. The biome one is structureSurface's and
\t\t\t\t// structureBuried's alike; the ground one is only the surface
\t\t\t\t// template's, and a buried build has no ground rule at all.
\t\t\t\tboolean ok = true;
\t\t\t\tif (wanted != null) {
\t\t\t\t\tnet.minecraft.core.world.biome.Biome b = provider.getBiome(x, 64, z);
\t\t\t\t\tok = b != null && wanted.equals(b.getRegistryKey());
\t\t\t\t}
\t\t\t\tif (ok && !buried) {
\t\t\t\t\tint under = world.getHeightValue(x, z) - 1;
\t\t\t\t\tok = under >= 0 && net.minecraft.core.block.Blocks.solid[world.getBlockId(x, under, z)];
\t\t\t\t}
\t\t\t\tif (ok) eligible++;
\t\t\t\tfor (int y = 1; y < height; y++) {
\t\t\t\t\tfor (int v = 0; v < blocks.length; v++) {
\t\t\t\t\t\tif (blocks[v] == null) continue;
\t\t\t\t\t\tif (matchesBuild(world, p, offs[v], blocks[v], x, y, z, height, false)) {
\t\t\t\t\t\t\tbuilds++;
\t\t\t\t\t\t\tbreak;
\t\t\t\t\t\t}
\t\t\t\t\t}
\t\t\t\t\tfor (int v = 0; v < blocks.length; v++) {
\t\t\t\t\t\tif (blocks[v] == null) continue;
\t\t\t\t\t\tif (matchesBuild(world, p, offs[v], blocks[v], x, y, z, height, true)) {
\t\t\t\t\t\t\tdecoys++;
\t\t\t\t\t\t\tbreak;
\t\t\t\t\t\t}
\t\t\t\t\t}
\t\t\t\t}
\t\t\t}
\t\t}
\t\treturn new int[] { builds, decoys, eligible, columns };
\t}

\t/**
\t * Whether a whole variant stands anchored at (x, y, z).
\t *
\t * The decoy argument moves the LAST cell three east and three south, which
\t * is the control described on censusStructure. Three, and sideways rather
\t * than up, so the moved cell stays in the same medium the real one is in: a
\t * decoy that lifted a buried cell out of the stone it sits in would be
\t * measuring the sky rather than the coincidence, and would come back zero
\t * for everything.
\t *
\t * A cell the TypeScript side could not resolve is null and is skipped, and
\t * a cell whose y falls outside the world refuses the whole match rather
\t * than being skipped: off the top of the world is not a place the mixin
\t * could have stamped anything.
\t */
\tprivate static boolean matchesBuild(net.minecraft.core.world.World world,
\t\t\tnet.minecraft.core.world.pos.TilePos p, int[][] offs, Object[] blocks,
\t\t\tint x, int y, int z, int height, boolean decoy) {
\t\tfor (int c = 0; c < blocks.length; c++) {
\t\t\tif (blocks[c] == null) continue;
\t\t\tint dx = offs[c][0];
\t\t\tint dz = offs[c][2];
\t\t\tif (decoy && c == blocks.length - 1) {
\t\t\t\tdx += 3;
\t\t\t\tdz += 3;
\t\t\t}
\t\t\tint by = y + offs[c][1];
\t\t\tif (by < 1 || by >= height) return false;
\t\t\tif (world.getBlockType(p.set(x + dx, by, z + dz)) != blocks[c]) return false;
\t\t}
\t\treturn true;
\t}

\tprivate static void sampleWorld(String label, net.minecraft.core.world.World world,
\t\t\tString[] expected, String[] forbidden, boolean demandVariety) {
\t\tnet.minecraft.core.world.biome.provider.BiomeProvider provider = world.getBiomeProvider();
\t\tif (provider == null) {
\t\t\twcheck(label + " has a biome provider", false, "getBiomeProvider() returned null");
\t\t\treturn;
\t\t}

\t\t// Wide enough that a biome taking half of one vanilla host still lands
\t\t// in the grid many times over, stepped by 16 because a biome cell is
\t\t// very much larger than one column.
\t\tfinal int HALF = 4096;
\t\tfinal int STEP = 16;
\t\tMap<String, Integer> counts = new HashMap<>();
\t\tint sampled = 0;
\t\tfor (int x = -HALF; x < HALF; x += STEP) {
\t\t\tfor (int z = -HALF; z < HALF; z += STEP) {
\t\t\t\tnet.minecraft.core.world.biome.Biome b = provider.getBiome(x, 64, z);
\t\t\t\tsampled++;
\t\t\t\tif (b == null) {
\t\t\t\t\tcounts.merge("<null>", 1, Integer::sum);
\t\t\t\t\tcontinue;
\t\t\t\t}
\t\t\t\tString key = b.getRegistryKey();
\t\t\t\tcounts.merge(key == null ? "<unregistered>" : key, 1, Integer::sum);
\t\t\t}
\t\t}

\t\t// The sampling has to be shown to work before any zero it reports
\t\t// means anything: a getBiome answering null everywhere would read as
\t\t// "every mod biome is missing" and be believed.
\t\twcheck(label + ": the biome provider answered for every sampled column",
\t\t\t!counts.containsKey("<null>") && sampled > 0,
\t\t\tsampled + " columns sampled, " + counts.getOrDefault("<null>", 0) + " answered null");
\t\tif (demandVariety) {
\t\t\twcheck("and the world it answered for is made of more than one biome",
\t\t\t\tcounts.size() > 1, "distribution: " + counts);
\t\t}

\t\tSystem.out.println("ARTEMIS-WORLDGEN DISTRIBUTION " + label + " " + counts);
\t\tfor (String name : expected) {
\t\t\tint n = counts.getOrDefault(name, 0);
\t\t\twcheck("biome " + name + " owns columns in " + label, n > 0,
\t\t\t\t"0 of " + sampled + " sampled columns: it is registered but generates nowhere");
\t\t}
\t\t// And the negative, which is the same sampling read the other way round.
\t\t// It costs nothing extra: the counts are already in hand, and a zero here
\t\t// is only worth having because the "answered for every sampled column"
\t\t// check above has already shown the provider was answering at all.
\t\tfor (String name : forbidden) {
\t\t\tint n = counts.getOrDefault(name, 0);
\t\t\twcheck("biome " + name + " owns no column in " + label, n == 0,
\t\t\t\tn + " of " + sampled + " sampled columns: this biome asked to stay out of "
\t\t\t\t\t+ label + " and is generating there anyway");
\t\t}
\t}

\t/**
\t * Every dimension this mod adds, sampled through its OWN provider.
\t *
\t * The id cannot be predicted from outside: it comes from nextDimensionID()
\t * at class-init time and depends on what else is loaded. So the generated
\t * ModDimensions field is read reflectively, which is also a check worth
\t * having on its own: a rename in the emitter breaks this loudly instead of
\t * quietly testing nothing.
\t */
\tprivate static void dimensionWorldgen() {
\t\tif (DIM_ID_FIELDS.length == 0) return;
\t\tClass<?> dims;
\t\ttry {
\t\t\tdims = Class.forName(MOD_DIMENSIONS_CLASS);
\t\t} catch (Throwable t) {
\t\t\twcheck("the mod's ModDimensions class loaded", false, String.valueOf(t));
\t\t\treturn;
\t\t}
\t\tfor (int i = 0; i < DIM_ID_FIELDS.length; i++) {
\t\t\tString fieldName = DIM_ID_FIELDS[i];
\t\t\tint id;
\t\t\ttry {
\t\t\t\tField f = dims.getField(fieldName);
\t\t\t\tid = f.getInt(null);
\t\t\t} catch (Throwable t) {
\t\t\t\twcheck("ModDimensions declares " + fieldName, false, String.valueOf(t));
\t\t\t\tcontinue;
\t\t\t}
\t\t\twcheck("dimension " + fieldName + " took an id of its own", id != 0,
\t\t\t\t"id " + id + " collides with the overworld");
\t\t\t// A dedicated server builds a WorldServer per REGISTERED dimension
\t\t\t// during startServer, which is why the mod registers from a server
\t\t\t// mixin rather than at afterGameStart. If that ever stops being
\t\t\t// true the world is null here and a portal step bricks the player.
\t\t\t// A shorter wait than the overworld's, deliberately: by the time the
\t\t\t// overworld has answered, startServer has long since built every
\t\t\t// registered dimension's world, so one that is not there is not
\t\t\t// coming and five more minutes will not change it.
\t\t\tnet.minecraft.core.world.World world = awaitWorld(id, 120);
\t\t\tif (world == null) {
\t\t\t\twcheck("dimension " + fieldName + " has a world behind it", false,
\t\t\t\t\t"no world for dimension id " + id + " arrived while waiting");
\t\t\t\tcontinue;
\t\t\t}
\t\t\t// No forbidden list on this side, deliberately. A dimension's roster is
\t\t\t// explicit and a biome is allowed to be in a roster AND in the overworld
\t\t\t// ("a world reachable three ways" is built on exactly that), so "not in
\t\t\t// this roster" would need the vanilla half of the roster resolved to
\t\t\t// registry keys before it meant anything. The overworld is where the
\t\t\t// claim being tested lives, so that is where the negative is asked.
\t\t\tsampleWorld("dimension " + fieldName, world, rosterOf(i), NO_BIOMES, false);
\t\t}
\t}

\t/**
\t * The registry keys one dimension's whole roster should answer with.
\t *
\t * The mod's own biomes are keys already. A vanilla entry is a Biomes FIELD
\t * name, because that is all a "biome:X" ref ever was, so its key is asked
\t * of the field in the running game. A roster is a roster: a modder who
\t * listed one of the game's biomes beside their own expects to walk through
\t * the portal and find it, and until this line existed nothing demanded it.
\t */
\tprivate static String[] rosterOf(int i) {
\t\tjava.util.List<String> keys = new java.util.ArrayList<>();
\t\tfor (String key : DIM_BIOMES[i]) keys.add(key);
\t\tfor (String field : DIM_VANILLA_BIOMES[i]) {
\t\t\ttry {
\t\t\t\tnet.minecraft.core.world.biome.Biome b = (net.minecraft.core.world.biome.Biome)
\t\t\t\t\tnet.minecraft.core.world.biome.Biomes.class.getField(field).get(null);
\t\t\t\tString key = b == null ? null : b.getRegistryKey();
\t\t\t\tif (key == null) {
\t\t\t\t\twcheck("the game's own biome " + field + " has a registry key", false,
\t\t\t\t\t\t"Biomes." + field + " answered " + b);
\t\t\t\t} else {
\t\t\t\t\tkeys.add(key);
\t\t\t\t}
\t\t\t} catch (Throwable t) {
\t\t\t\twcheck("the game declares Biomes." + field, false, String.valueOf(t));
\t\t\t}
\t\t}
\t\treturn keys.toArray(new String[0]);
\t}

\t/**
\t * The way IN.
\t *
\t * Everything above this asks whether the far side of the portal is worth
\t * arriving at. This asks whether a player can get there at all, which is
\t * the question a modder would notice first and no registry can answer.
\t *
\t * A mod portal is lit the way the nether one is: a frame of the chosen
\t * block with fire inside it. So the probe builds exactly that, in the
\t * overworld, out of the frame block read off the portal's own logic rather
\t * than out of anything typed here, and then looks at what the ring holds.
\t * Either the mod's portal block is standing in it or the dimension is
\t * decoration nobody can reach.
\t *
\t * Built in mid-air well above the terrain, which a portal does not mind,
\t * because the alternative is flattening ground the worldgen phase has
\t * already counted.
\t */
\tprivate static void portals() {
\t\tif (DIM_FIELDS.length == 0) return;
\t\tClass<?> dims;
\t\ttry {
\t\t\tdims = Class.forName(MOD_DIMENSIONS_CLASS);
\t\t} catch (Throwable t) {
\t\t\twcheck("the mod's ModDimensions class loaded", false, String.valueOf(t));
\t\t\treturn;
\t\t}
\t\tnet.minecraft.core.world.World world = awaitWorld(0, 120);
\t\tif (world == null) {
\t\t\twcheck("the overworld loaded so a portal could be built in it", false,
\t\t\t\t"no dimension 0 arrived while waiting");
\t\t\treturn;
\t\t}
\t\t// And the boot, for the reason the census waits: this phase makes the
\t\t// server generate chunks and then WRITES into them, from a thread that is
\t\t// not its own, and doing that while the boot is still preparing the spawn
\t\t// area is what A53 found starving it.
\t\t//
\t\t// It had no wait at all until this was measured, and the measurement is
\t\t// worth keeping: at the moment portals() started, the world clock read 0
\t\t// and not one of the chunks its rings sit in was loaded. It passed anyway,
\t\t// because the boot loaded them inside awaitChunk´s thirty second window.
\t\t// That is luck with a shape: the prepared region reaches 12 chunks east of
\t\t// spawn and a ring sits one chunk further out per dimension, so the
\t\t// fourteenth dimension of a mod would have landed outside it and the probe
\t\t// would have reported the mod unreachable for its own missing guard.
\t\tif (!awaitBoot(world, "a portal was built")) return;
\t\t// The ritual has to be shown to work before any failure below means
\t\t// anything, the same way the sampling grid does: a frame the probe built
\t\t// wrong, or a fire the probe placed through a call the game does not
\t\t// notice, would read as "every dimension is unreachable" and be believed.
\t\t// So it is run first on the one pair the game itself hardcodes.
\t\tnet.minecraft.core.block.Block<?> control =
\t\t\tlightRing(world, -1, net.minecraft.core.block.Blocks.OBSIDIAN);
\t\twcheck("the probe's own ritual works: obsidian and fire open the nether",
\t\t\tcontrol == net.minecraft.core.block.Blocks.PORTAL_NETHER,
\t\t\t"the ring holds " + (control == null ? "nothing" : control.getKey())
\t\t\t\t+ ", so this probe cannot light anything and proves nothing");
\t\tfor (int i = 0; i < DIM_FIELDS.length; i++) {
\t\t\tString fieldName = DIM_FIELDS[i];
\t\t\ttry {
\t\t\t\tObject value = dims.getField(fieldName).get(null);
\t\t\t\tnet.minecraft.core.world.Dimension dim = (net.minecraft.core.world.Dimension) value;
\t\t\t\t// attachPortals() closes the constructor cycle by reflection; if it
\t\t\t\t// ever stops running this is null and every journey NPEs in
\t\t\t\t// PortalHandler rather than here.
\t\t\t\tnet.minecraft.core.block.Block<?> portalBlock = dim.portalBlock;
\t\t\t\twcheck("dimension " + fieldName + " has its portal block attached",
\t\t\t\t\tportalBlock != null, "Dimension.portalBlock is null");
\t\t\t\tif (portalBlock == null) continue;
\t\t\t\tObject logic = portalBlock.getLogic();
\t\t\t\tif (!(logic instanceof net.minecraft.core.block.BlockLogicPortal)) {
\t\t\t\t\twcheck("dimension " + fieldName + "'s portal block is a portal",
\t\t\t\t\t\tfalse, "its logic is " + logic);
\t\t\t\t\tcontinue;
\t\t\t\t}
\t\t\t\tnet.minecraft.core.block.BlockLogicPortal portal =
\t\t\t\t\t(net.minecraft.core.block.BlockLogicPortal) logic;
\t\t\t\tnet.minecraft.core.block.Block<?> frame = portal.portalFrame;
\t\t\t\twcheck("dimension " + fieldName + "'s portal names a frame block",
\t\t\t\t\tframe != null, "portalFrame is null");
\t\t\t\tif (frame == null) continue;

\t\t\t\tnet.minecraft.core.block.Block<?> inner = lightRing(world, i, frame);
\t\t\t\twcheck("a frame of " + frame.getKey() + " lit with fire opens " + fieldName,
\t\t\t\t\tinner == portalBlock,
\t\t\t\t\t"the ring holds " + (inner == null ? "nothing" : inner.getKey())
\t\t\t\t\t\t+ " rather than " + portalBlock.getKey()
\t\t\t\t\t\t+ ": the dimension exists and nobody can reach it");
\t\t\t} catch (Throwable t) {
\t\t\t\twcheck("a portal to " + fieldName + " could be built", false, String.valueOf(t));
\t\t\t\ttrace(t);
\t\t\t}
\t\t}
\t}

\t/**
\t * The JOURNEY.
\t *
\t * portals() proves a portal can be LIT. It says nothing about what happens
\t * when something walks into one, and that is where three things meet for
\t * the first time: PortalHandler, the portalBlock this mod attaches to its
\t * Dimension by reflection, and the far side's own terrain.
\t *
\t * The sequence below is PlayerList.sendPlayerToOtherDimension's, minus the
\t * packets and the player-list bookkeeping, which are the parts a mod cannot
\t * get wrong. What is left is the part it can: the destination world, the
\t * coordinate scale, and PortalHandler.teleportEntity, which finds a portal
\t * near the arrival column or builds one, and moves the traveller to it.
\t *
\t * It travels an EntityItem rather than a player on purpose. Entity's own
\t * handlePortal is an empty method and only Player overrides it, so a mob
\t * never travels in BTA and a player needs a network handler this probe has
\t * no way to supply headlessly. PortalHandler itself takes an Entity and
\t * never asks what kind, so every line of it that a mod can break runs the
\t * same way for either. That handlePortal is Player-only is asserted below
\t * rather than assumed, so this comment cannot quietly go stale.
\t *
\t * What it demands on arrival is what a modder would: a traveller in the
\t * right world, a portal of this mod's own block within reach of where they
\t * landed, and ground under their feet with room to stand.
\t */
\tprivate static void journeys() {
\t\tif (DIM_FIELDS.length == 0) return;
\t\tClass<?> dims;
\t\ttry {
\t\t\tdims = Class.forName(MOD_DIMENSIONS_CLASS);
\t\t} catch (Throwable t) {
\t\t\twcheck("the mod's ModDimensions class loaded for the journey", false, String.valueOf(t));
\t\t\treturn;
\t\t}
\t\t// Only Player travels. Asserted rather than trusted, because the whole
\t\t// shape of this phase rests on it: if BTA ever gives Entity a real
\t\t// handlePortal, mobs start walking through mod portals and the mod-side
\t\t// question changes.
\t\ttry {
\t\t\tjava.lang.reflect.Method m = net.minecraft.core.entity.Entity.class
\t\t\t\t.getDeclaredMethod("handlePortal", int.class,
\t\t\t\t\tnet.minecraft.core.util.helper.DyeColor.class);
\t\t\twcheck("Entity.handlePortal exists, so a portal has something to call",
\t\t\t\tm != null, "no such method");
\t\t\tjava.lang.reflect.Method p = net.minecraft.core.entity.player.Player.class
\t\t\t\t.getDeclaredMethod("handlePortal", int.class,
\t\t\t\t\tnet.minecraft.core.util.helper.DyeColor.class);
\t\t\twcheck("Player overrides it, which is why only a player ever travels",
\t\t\t\tp != null, "Player does not declare handlePortal");
\t\t} catch (Throwable t) {
\t\t\twcheck("the portal entry point is where this probe thinks it is", false,
\t\t\t\tString.valueOf(t));
\t\t}

\t\tnet.minecraft.core.world.World overworld = awaitWorld(0, 120);
\t\tif (overworld == null) {
\t\t\twcheck("the overworld loaded so a journey could start in it", false,
\t\t\t\t"no dimension 0 arrived while waiting");
\t\t\treturn;
\t\t}
\t\t// And then WAIT for the boot to finish, which no phase before this one
\t\t// had to do. The others read a provider out of noise and touch nothing;
\t\t// this one makes the server generate and save real chunks in two worlds
\t\t// from a thread that is not the server's. Doing that while the boot
\t\t// thread is still preparing the spawn area starved it: every journey
\t\t// passed and the server never printed Done, and the run was failed by its
\t\t// own timeout rather than by anything the mod did.
\t\t//
\t\t// serverRunning is no use as the signal, it is set in the constructor.
\t\t// The honest one is the clock: the world time only advances once the
\t\t// server is in its main loop, which is the same moment Done is printed.
\t\tif (!awaitBoot(overworld, "anyone travelled")) return;
\t\tfor (int i = 0; i < DIM_FIELDS.length; i++) {
\t\t\tString fieldName = DIM_FIELDS[i];
\t\t\ttry {
\t\t\t\tnet.minecraft.core.world.Dimension dim =
\t\t\t\t\t(net.minecraft.core.world.Dimension) dims.getField(fieldName).get(null);
\t\t\t\tint id = dims.getField(DIM_ID_FIELDS[i]).getInt(null);
\t\t\t\tnet.minecraft.core.world.World far = awaitWorld(id, 120);
\t\t\t\tif (far == null) {
\t\t\t\t\twcheck("the world behind " + fieldName + " loaded for a journey", false,
\t\t\t\t\t\t"no dimension " + id + " arrived while waiting");
\t\t\t\t\tcontinue;
\t\t\t\t}
\t\t\t\t// Out, and then back. The return leg is not the same code twice:
\t\t\t\t// PortalHandler picks the portal block it hunts for off
\t\t\t\t// newDim.homeDim, so arriving somewhere with a home dimension uses
\t\t\t\t// the destination's block and arriving in the overworld, which has
\t\t\t\t// none, uses the block of the dimension being LEFT. Both ends of
\t\t\t\t// that branch are this mod's own block, and only one of them is
\t\t\t\t// exercised by going one way.
\t\t\t\ttravel("out to " + fieldName, overworld, far,
\t\t\t\t\tnet.minecraft.core.world.Dimension.OVERWORLD, dim, dim);
\t\t\t\ttravel("home from " + fieldName, far, overworld,
\t\t\t\t\tdim, net.minecraft.core.world.Dimension.OVERWORLD, dim);
\t\t\t} catch (Throwable t) {
\t\t\t\twcheck("a journey through " + fieldName + " could be made", false,
\t\t\t\t\tString.valueOf(t));
\t\t\t\ttrace(t);
\t\t\t}
\t\t}
\t}

\t/**
\t * One leg of a journey, and everything that has to be true when it lands.
\t *
\t * carrier is the mod's dimension whichever way we are going, because it
\t * owns the portal block both legs are expected to arrive beside: the far
\t * side hunts for the destination's own, the way home hunts for the one
\t * belonging to the dimension being left, and for this mod those are the
\t * same object.
\t */
\tprivate static void travel(String label, net.minecraft.core.world.World from,
\t\t\tnet.minecraft.core.world.World to, net.minecraft.core.world.Dimension oldDim,
\t\t\tnet.minecraft.core.world.Dimension newDim, net.minecraft.core.world.Dimension carrier) {
\t\tnet.minecraft.core.block.Block<?> portalBlock = carrier.portalBlock;
\t\tif (portalBlock == null) {
\t\t\twcheck(label + ": the dimension has a portal block to arrive beside", false,
\t\t\t\t"Dimension.portalBlock is null, so PortalHandler has nothing to look for");
\t\t\treturn;
\t\t}
\t\tnet.minecraft.core.block.Block<?> frame =
\t\t\t((net.minecraft.core.block.BlockLogicPortal) portalBlock.getLogic()).portalFrame;

\t\t// Start where a player would: standing in the world being left, above
\t\t// its own terrain rather than inside it, in a chunk that exists.
\t\t//
\t\t// The override has to be on for this too, not just for the arrival. Only
\t\t// the overworld keeps chunks loaded around its spawn on an empty server;
\t\t// a dimension nobody is standing in has none at all, and asking its
\t\t// provider for one without the override hands back the shared empty
\t\t// chunk instead of generating. The return leg departs from exactly such
\t\t// a world, which is why it could not find ground to stand on.
\t\tboolean fromOverride = allowChunkLoads(from, true);
\t\tint sx;
\t\tint sz;
\t\tint sy;
\t\ttry {
\t\t\tnet.minecraft.core.world.pos.TilePos spawn = from.getLevelData().getSpawnPos();
\t\t\tsx = spawn.x + 64;
\t\t\tsz = spawn.z + 64;
\t\t\tif (!awaitChunk(from, sx >> 4, sz >> 4, 60)) {
\t\t\t\twcheck(label + ": the chunk the traveller starts in loaded", false,
\t\t\t\t\t"nothing can depart from a chunk the server never generated");
\t\t\t\treturn;
\t\t\t}
\t\t\tsy = from.getHeightValue(sx, sz) + 1;
\t\t} finally {
\t\t\tif (fromOverride) allowChunkLoads(from, false);
\t\t}

\t\tnet.minecraft.core.entity.EntityItem traveller =
\t\t\tnew net.minecraft.core.entity.EntityItem(from);
\t\ttraveller.moveTo(sx + 0.5D, sy, sz + 0.5D, 0.0F, 0.0F);

\t\t// PortalHandler reads the DEPARTING dimension's data off DISK, not out
\t\t// of the running world: Dimension.getDimensionData answers from memory
\t\t// only for the world that is its own, and for any other one it goes to
\t\t// the save format and then requireNonNulls what comes back. A world that
\t\t// has never been saved has no such file, so the first journey out of a
\t\t// freshly made world throws before it does anything. That is vanilla's
\t\t// own shape, on the same line for the nether, and nothing a mod can
\t\t// change; a real server hides it by autosaving long before anyone builds
\t\t// a portal. This probe travels seconds after boot, so it writes that one
\t\t// file itself.
\t\t//
\t\t// Only that file. saveWorld is the whole autosave and it walks the entity
\t\t// and chunk lists the server thread is mutating underneath, which threw a
\t\t// ConcurrentModificationException from this thread and is not a race
\t\t// worth winning. saveDimensionData writes exactly the record
\t\t// getDimensionData reads back and touches no live collection.
\t\ttry {
\t\t\tfrom.getLevelStorage().saveDimensionData(from.dimension.id, from.getDimensionData());
\t\t} catch (Throwable t) {
\t\t\twcheck(label + ": the departing dimension's data could be written", false,
\t\t\t\tString.valueOf(t));
\t\t\treturn;
\t\t}

\t\t// The game's own sequence, in its own order. setWorld before the scale
\t\t// because PortalHandler reads the entity's coordinates out of the
\t\t// entity, and chunkLoadOverride because on a server with nobody on it
\t\t// the destination chunks do not exist: without it every read comes back
\t\t// as the provider's shared empty chunk and every write lands in it,
\t\t// which reads afterwards as a portal that was never built.
\t\tfloat scale = net.minecraft.core.world.Dimension.getCoordScale(oldDim, newDim);
\t\ttraveller.setWorld(to);
\t\ttraveller.moveTo(traveller.x * scale, traveller.y, traveller.z * scale, 0.0F, 0.0F);

\t\t// PortalHandler BUILDS the portal it drops the traveller beside, and it
\t\t// builds it with setBlockWithNotify, which drains the world's lighting
\t\t// queue. That queue is a plain ArrayList and the SERVER thread drains the
\t\t// same one every tick in updatingLighting(), both of them taking the LAST
\t\t// element, which is how one of them gets a null back out of a list that
\t\t// was not empty when it looked:
\t\t//
\t\t//   NullPointerException: Cannot read field "layer" because "lightUpdate" is null
\t\t//
\t\t// The tree census met the identical throw from the identical cause and
\t\t// answered it the identical way, which is the precedent this follows: it
\t\t// is a race THIS PROBE caused by writing to a world from a thread that is
\t\t// not the server's, so it is not a failure of the mod to report as one.
\t\t// Unlike A82 it does not touch the server: the throw lands here, on this
\t\t// thread, and the game carries on. Measured at one leg in twelve boots.
\t\t//
\t\t// The leg is tried again rather than skipped at the first throw, because
\t\t// the collision is one drain of one queue and the next attempt a quarter
\t\t// of a second later is a different moment. Only every attempt throwing is
\t\t// worth saying anything about, and then it is said out loud rather than
\t\t// asserted either way: a leg nobody could run proves nothing in either
\t\t// direction, and a green check for it would be worse than none.
\t\tboolean toOverride = allowChunkLoads(to, true);
\t\tboolean teleported = false;
\t\tString lastThrow = null;
\t\ttry {
\t\t\tfor (int attempt = 0; attempt < 4 && !teleported; attempt++) {
\t\t\t\ttry {
\t\t\t\t\t// On the server's thread now, which is what removes the race
\t\t\t\t\t// rather than surviving it. The retry below stays: it costs
\t\t\t\t\t// nothing, and a leg that still cannot be run says so out loud
\t\t\t\t\t// instead of asserting anything either way. See A92.
\t\t\t\t\tif (!onServerThread(label + ": the teleport",
\t\t\t\t\t\t\t() -> new net.minecraft.core.world.PortalHandler().teleportEntity(to, traveller,
\t\t\t\t\t\t\t\tnet.minecraft.core.util.helper.DyeColor.WHITE, oldDim, newDim))) {
\t\t\t\t\t\tbreak;
\t\t\t\t\t}
\t\t\t\t\tteleported = true;
\t\t\t\t} catch (Throwable t) {
\t\t\t\t\tlastThrow = String.valueOf(t);
\t\t\t\t\ttry {
\t\t\t\t\t\tThread.sleep(250);
\t\t\t\t\t} catch (InterruptedException e) {
\t\t\t\t\t\tbreak;
\t\t\t\t\t}
\t\t\t\t}
\t\t\t}
\t\t} finally {
\t\t\tif (toOverride) allowChunkLoads(to, false);
\t\t}
\t\tif (!teleported) {
\t\t\tSystem.out.println("ARTEMIS-WORLDGEN SKIP " + label
\t\t\t\t+ " :: the game threw out of its own lighting on all four attempts ("
\t\t\t\t+ lastThrow + "), which is a race this probe caused and not the mod's doing");
\t\t\treturn;
\t\t}

\t\twcheck(label + ": the traveller is in the destination world",
\t\t\ttraveller.world == to,
\t\t\t"it is in " + (traveller.world == null ? "no world" : String.valueOf(traveller.world)));

\t\tint tx = net.minecraft.core.util.helper.MathHelper.floor(traveller.x);
\t\tint ty = net.minecraft.core.util.helper.MathHelper.floor(traveller.y);
\t\tint tz = net.minecraft.core.util.helper.MathHelper.floor(traveller.z);

\t\t// A portal of THIS mod's block, within arm's reach of where they landed.
\t\t// PortalHandler either found one or built one; which of the two it did
\t\t// is not the mod's business, but that one is there is.
\t\tint[] found = nearest(to, tx, ty, tz, portalBlock, 8);
\t\twcheck(label + ": a " + portalBlock.getKey() + " portal stands where they arrived",
\t\t\tfound != null,
\t\t\t"nothing of that block within 8 of " + tx + "," + ty + "," + tz
\t\t\t\t+ ": the traveller is stranded in an empty world");
\t\tif (found != null) {
\t\t\t// And a frame around it, which is what lets a player who breaks the
\t\t\t// portal light it again rather than being locked in.
\t\t\twcheck(label + ": that portal is framed in " + frame.getKey(),
\t\t\t\tnearest(to, found[0], found[1], found[2], frame, 4) != null,
\t\t\t\t"no " + frame.getKey() + " within 4 of the portal at "
\t\t\t\t\t+ found[0] + "," + found[1] + "," + found[2]
\t\t\t\t\t+ ": a portal nobody could relight");
\t\t}

\t\t// Somewhere survivable. Two blocks of room to stand in and something
\t\t// under the feet, which is the difference between arriving and falling
\t\t// out of the world.
\t\tnet.minecraft.core.world.pos.TilePos p = new net.minecraft.core.world.pos.TilePos();
\t\tboolean feet = !to.getBlockMaterial(p.set(tx, ty, tz)).isSolid();
\t\tboolean head = !to.getBlockMaterial(p.set(tx, ty + 1, tz)).isSolid();
\t\twcheck(label + ": there is room to stand where they landed", feet && head,
\t\t\t"solid at " + (feet ? "" : "feet ") + (head ? "" : "head ")
\t\t\t\t+ "of " + tx + "," + ty + "," + tz);
\t\tboolean ground = false;
\t\tfor (int y = ty - 1; y >= ty - 4 && y > 0; y--) {
\t\t\tif (to.getBlockMaterial(p.set(tx, y, tz)).isSolid()) {
\t\t\t\tground = true;
\t\t\t\tbreak;
\t\t\t}
\t\t}
\t\twcheck(label + ": there is ground under their feet", ground,
\t\t\t"nothing solid in the four blocks below " + tx + "," + ty + "," + tz
\t\t\t\t+ ": they arrive falling");
\t}

\t/** Whether the world's clock is moving, which is the only signal on this
\t *  side that the server has left its boot and entered its main loop. */
\tprivate static boolean awaitTicking(net.minecraft.core.world.World world, int attempts) {
\t\tlong start = world.getLevelData().getTotalWorldTime();
\t\tfor (int i = 0; i < attempts; i++) {
\t\t\tif (world.getLevelData().getTotalWorldTime() > start) return true;
\t\t\ttry {
\t\t\t\tThread.sleep(500);
\t\t\t} catch (InterruptedException e) {
\t\t\t\treturn false;
\t\t\t}
\t\t}
\t\treturn false;
\t}

\t/* -------------------------------------------------------------- */
\t/* handing work to the server thread                               */
\t/* -------------------------------------------------------------- */

\t/**
\t * The queue this probe hands world WRITES to, and the tick box that runs
\t * them on the server's own thread.
\t *
\t * A92 is why this exists, and it is the third instance of one pattern. This
\t * probe writes to a live world from a thread that is not the server's, and
\t * every collection the game touches per tick is a plain ArrayList with no
\t * lock on it:
\t *
\t *   A82  an append to the chunk list inside the server's autosave walk,
\t *        which stops the server
\t *   A86  the lighting queue drained by the probe's teleport and by the
\t *        server's tick at once, which throws on the probe's side
\t *   A92  the same lighting queue, hit by the portal ring this probe builds
\t *        two seconds after the boot ends, which threw on BOTH sides: the
\t *        ring failed for nine of sixteen doors and the server's own
\t *        updatingLighting then threw in doTick, which BTA answers by
\t *        calling initiateShutdown, so the game stopped and exited zero
\t *
\t * Both of the first two were answered where they were found, which is the
\t * criticism A82 makes of A72 and A74 and which PROGRESS.md then wrote down
\t * as a pattern nobody had fixed, on the grounds that "halplibe 6.2.0 has no
\t * tick event, so there is no clean way to do it". Halplibe has none. The
\t * GAME has one: MinecraftServer.doTick walks playerListBoxes and calls
\t * IUpdatePlayerListBox.update() on the server thread every tick, and
\t * addPlayerListBox is public. Verified by javap against the shipped 8.0.1
\t * server rather than assumed.
\t *
\t * So the probe stops racing the server and asks it instead. Nothing about
\t * WHAT is written changes; only which thread writes it.
\t *
\t * The same disassembly settled the two things that shape the code below, and
\t * neither was guessable. That loop is NOT inside a try/catch: doTick's
\t * exception table covers the world tick, the entity tick and the console
\t * parser, and the box loop at 288 to 322 is in none of them, so a box that
\t * throws goes out through doTick into run() and stops the server, which is
\t * the very failure this exists to remove. Hence the catch inside update().
\t * And hence WHERE it is installed: see installServerBox.
\t */
\tprivate static final java.util.concurrent.ConcurrentLinkedQueue<Runnable> SERVER_WORK =
\t\tnew java.util.concurrent.ConcurrentLinkedQueue<>();
\tprivate static volatile boolean serverBoxInstalled = false;
\tprivate static volatile boolean serverBoxRefused = false;

\t/**
\t * Install the tick box, once.
\t *
\t * Called from the AFTER_GAME_START listener, which is the one moment that
\t * is both late enough and early enough: the server exists, so there is
\t * something to add the box to, and the main loop has not started, so
\t * nothing is walking the list this appends to. Both halves are visible in
\t * this probe's own output, where the registry summary prints long before
\t * the game says Done.
\t *
\t * It is still callable lazily, and every caller checks the answer, because
\t * the alternative is a phase that silently writes on the wrong thread. A
\t * late install is a smaller race than the one being removed but it is not
\t * none, so it says so when it happens.
\t */
\tprivate static synchronized boolean installServerBox() {
\t\tif (serverBoxInstalled) return true;
\t\tif (serverBoxRefused) return false;
\t\ttry {
\t\t\tnet.minecraft.server.MinecraftServer server =
\t\t\t\tnet.minecraft.server.MinecraftServer.getInstance();
\t\t\tif (server == null) {
\t\t\t\tserverBoxRefused = true;
\t\t\t\tSystem.out.println("ARTEMIS-WORLDGEN THREAD no MinecraftServer instance to hand work to");
\t\t\t\treturn false;
\t\t\t}
\t\t\tserver.addPlayerListBox(new net.minecraft.core.net.IUpdatePlayerListBox() {
\t\t\t\t@Override
\t\t\t\tpublic void update() {
\t\t\t\t\t// Nothing may leave this method. doTick does not guard the loop
\t\t\t\t\t// it calls this from, so a throw here would stop the server the
\t\t\t\t\t// same way A92 did. Each job already catches its own, and this
\t\t\t\t\t// is the second wall around the queue itself.
\t\t\t\t\ttry {
\t\t\t\t\t\tRunnable job;
\t\t\t\t\t\twhile ((job = SERVER_WORK.poll()) != null) job.run();
\t\t\t\t\t} catch (Throwable t) {
\t\t\t\t\t\tSystem.out.println("ARTEMIS-WORLDGEN THREAD the probe's own tick box threw :: " + t);
\t\t\t\t\t}
\t\t\t\t}
\t\t\t});
\t\t\tserverBoxInstalled = true;
\t\t\tSystem.out.println("ARTEMIS-WORLDGEN THREAD the server thread is taking this probe's writes");
\t\t\treturn true;
\t\t} catch (Throwable t) {
\t\t\tserverBoxRefused = true;
\t\t\tSystem.out.println("ARTEMIS-WORLDGEN THREAD could not hand work to the server thread :: " + t);
\t\t\treturn false;
\t\t}
\t}

\t/**
\t * Run one job on the server thread and wait for it, answering whether it
\t * ran there.
\t *
\t * A job that THROWS is rethrown on the calling thread, so every caller's
\t * own catch reports it exactly the way it did when the work was done here.
\t * That matters for the retries: a leg that still meets something is still
\t * retried, and the loud SKIP it can end in still means what it meant.
\t *
\t * A job the server never takes is a FAILURE and not a fallback. Running it
\t * here instead would be reintroducing the race this exists to remove, and a
\t * server that has not ticked in thirty seconds is a finding of its own.
\t */
\tprivate static boolean onServerThread(String what, Runnable job) {
\t\tif (!installServerBox()) return false;
\t\tfinal java.util.concurrent.atomic.AtomicReference<Throwable> thrown =
\t\t\tnew java.util.concurrent.atomic.AtomicReference<>();
\t\tfinal java.util.concurrent.atomic.AtomicBoolean cancelled =
\t\t\tnew java.util.concurrent.atomic.AtomicBoolean(false);
\t\tfinal java.util.concurrent.CountDownLatch done = new java.util.concurrent.CountDownLatch(1);
\t\tSERVER_WORK.add(() -> {
\t\t\t// Checked at entry only. A job the waiter gave up on while it was
\t\t\t// already running still finishes, which is the honest behaviour: it
\t\t\t// is the server's thread and half a write is worse than a whole one.
\t\t\tif (cancelled.get()) return;
\t\t\ttry {
\t\t\t\tjob.run();
\t\t\t} catch (Throwable t) {
\t\t\t\tthrown.set(t);
\t\t\t} finally {
\t\t\t\tdone.countDown();
\t\t\t}
\t\t});
\t\tboolean ran;
\t\ttry {
\t\t\tran = done.await(30, java.util.concurrent.TimeUnit.SECONDS);
\t\t} catch (InterruptedException e) {
\t\t\tThread.currentThread().interrupt();
\t\t\tran = false;
\t\t}
\t\tif (!ran) {
\t\t\tcancelled.set(true);
\t\t\twcheck("the server thread took the probe's work: " + what, false,
\t\t\t\t"thirty seconds went by without a tick running it, so the server is not ticking"
\t\t\t\t\t+ " and nothing was written");
\t\t\treturn false;
\t\t}
\t\tThrowable t = thrown.get();
\t\tif (t instanceof RuntimeException) throw (RuntimeException) t;
\t\tif (t instanceof Error) throw (Error) t;
\t\tif (t != null) throw new RuntimeException(t);
\t\treturn true;
\t}

\t/**
\t * Let a world generate the chunks it is asked for, and say whether the
\t * switch was actually flipped so the caller can put it back.
\t *
\t * This is the server's own switch, thrown by PlayerList around every
\t * dimension change for the same reason: with nobody standing in a world,
\t * nothing in it is loaded, and a provider that is not allowed to generate
\t * answers every request with one shared empty chunk. Reads then come back
\t * as air and writes go nowhere, which is indistinguishable from a mod whose
\t * dimension is empty.
\t */
\tprivate static boolean allowChunkLoads(net.minecraft.core.world.World world, boolean allow) {
\t\tnet.minecraft.server.world.chunk.provider.ChunkProviderServer server = serverProvider(world);
\t\tif (server == null) return false;
\t\tserver.chunkLoadOverride = allow;
\t\treturn true;
\t}

\t/** The server-side chunk provider of this world, or null if it has some
\t *  other one. One instanceof rather than two, so the switch above and the
\t *  wait in awaitChunk cannot come to disagree about what they are holding. */
\tprivate static net.minecraft.server.world.chunk.provider.ChunkProviderServer serverProvider(
\t\t\tnet.minecraft.core.world.World world) {
\t\tnet.minecraft.core.world.chunk.provider.ChunkProvider provider = world.getChunkProvider();
\t\treturn provider instanceof net.minecraft.server.world.chunk.provider.ChunkProviderServer
\t\t\t? (net.minecraft.server.world.chunk.provider.ChunkProviderServer) provider
\t\t\t: null;
\t}

\t/** The nearest block of the given kind, or null. Small radius on purpose:
\t *  the question is whether the traveller landed AT a portal, not whether
\t *  the world contains one somewhere. */
\tprivate static int[] nearest(net.minecraft.core.world.World world, int x, int y, int z,
\t\t\tnet.minecraft.core.block.Block<?> want, int radius) {
\t\tnet.minecraft.core.world.pos.TilePos p = new net.minecraft.core.world.pos.TilePos();
\t\tfor (int dx = -radius; dx <= radius; dx++) {
\t\t\tfor (int dy = -radius; dy <= radius; dy++) {
\t\t\t\tfor (int dz = -radius; dz <= radius; dz++) {
\t\t\t\t\tint yy = y + dy;
\t\t\t\t\tif (yy < 1 || yy >= world.getHeightBlocks()) continue;
\t\t\t\t\tif (world.getBlockType(p.set(x + dx, yy, z + dz)) == want) {
\t\t\t\t\t\treturn new int[] { x + dx, yy, z + dz };
\t\t\t\t\t}
\t\t\t\t}
\t\t\t}
\t\t}
\t\treturn null;
\t}

\t/**
\t * Build one ring of the given frame block, light it, and answer with whatever ends up
\t * standing in the hole.
\t *
\t * The slot picks the chunk, one per ring and -1 for the control, so no two
\t * rings can ever touch and each sits well inside a single chunk. That
\t * matters more than it sounds: a server with nobody on it keeps nothing
\t * loaded, and a write into an unloaded chunk lands in the provider's shared
\t * empty chunk and reads back as air. Every block this touches is inside the
\t * one chunk it waited for.
\t */
\tprivate static net.minecraft.core.block.Block<?> lightRing(net.minecraft.core.world.World world,
\t\t\tint slot, net.minecraft.core.block.Block<?> frame) {
\t\tnet.minecraft.core.world.pos.TilePos spawn = world.getLevelData().getSpawnPos();
\t\tint chunkX = (spawn.x >> 4) + slot;
\t\tint chunkZ = (spawn.z >> 4) + 2;
\t\tif (!awaitChunk(world, chunkX, chunkZ, 60)) {
\t\t\twcheck("the probe's chunk at " + chunkX + "," + chunkZ + " loaded", false,
\t\t\t\t"nothing can be built in a chunk the server never loaded");
\t\t\treturn null;
\t\t}
\t\t// Five wide and three deep inside the chunk, so nothing it writes crosses
\t\t// into a neighbour nobody loaded.
\t\tint bx = (chunkX << 4) + 5;
\t\tint bz = (chunkZ << 4) + 8;
\t\tint by = Math.min(world.getHeightValue(bx, bz) + 8, world.getHeightBlocks() - 8);
\t\t// On the SERVER's thread, not this one. Every block written here schedules
\t\t// a lighting update into the same ArrayList the server drains each tick,
\t\t// and this phase starts two seconds after the boot ends, which is the
\t\t// moment that draining begins. See A92 and onServerThread.
\t\tif (!onServerThread("build the ring at " + bx + "," + by + "," + bz,
\t\t\t\t() -> buildFrame(world, bx, by, bz, frame))) {
\t\t\treturn null;
\t\t}

\t\tnet.minecraft.core.world.pos.TilePos p = new net.minecraft.core.world.pos.TilePos();
\t\tnet.minecraft.core.block.Block<?> written = world.getBlockType(p.set(bx, by, bz));
\t\tif (written != frame) {
\t\t\twcheck("the frame the probe laid at " + bx + "," + by + "," + bz + " is there", false,
\t\t\t\t"it reads back as " + (written == null ? "nothing" : written.getKey()));
\t\t\treturn null;
\t\t}

\t\t// Fire placed the way the game places it: IPlaceable.PlaceableBlock
\t\t// writes the block raw, calls onPlacedByWorld and then notifies. The
\t\t// World.setBlock* family does NOT do the middle one, and onPlacedByWorld
\t\t// is where every portal in the game is lit, so fire set through those
\t\t// just sits there and nothing is ever tried. That cost a whole run.
\t\tnet.minecraft.core.world.pos.TilePos lit =
\t\t\tnew net.minecraft.core.world.pos.TilePos(bx + 1, by + 1, bz);
\t\t// All three on the server's thread, and together: the notify is what
\t\t// opens the portal, so splitting them would leave a lit fire and an
\t\t// unopened door for however long the queue took.
\t\tif (!onServerThread("light the ring at " + bx + "," + by + "," + bz, () -> {
\t\t\tworld.setBlockTypeDataRaw(lit, net.minecraft.core.block.Blocks.FIRE, 0);
\t\t\tnet.minecraft.core.block.Blocks.FIRE.onPlacedByWorld(world, lit);
\t\t\tworld.notifyBlockChange(lit, net.minecraft.core.block.Blocks.FIRE);
\t\t})) {
\t\t\treturn null;
\t\t}

\t\treturn world.getBlockType(p.set(bx + 1, by + 2, bz));
\t}

\t/**
\t * Grow the chunk at cx,cz and the three that decide whether it gets
\t * decorated, and say whether all four arrived.
\t *
\t * A chunk is only DECORATED once the three to its east, south and
\t * south-east are there: that is where the game puts the trees. Growing the
\t * middle one alone gives bare terrain, and a count taken off bare terrain
\t * is a zero that means nothing at all.
\t *
\t * One copy, because the rule is a fact about how BTA decorates rather than
\t * about either census that needs it. It was written out twice, once in each,
\t * and the two copies were already drifting: same loop, different variable,
\t * and only one of them said why. Nothing in the audit could have seen it,
\t * either: the duplicate-body sweep in audit-misc.ts reads TypeScript out of
\t * src, and this is Java inside a template string in scripts.
\t *
\t * The && is deliberately on the right. Putting it on the left lets Java
\t * short-circuit and skip growing the rest of the neighbours.
\t */
\tprivate static boolean growDecorated(net.minecraft.core.world.World world, int cx, int cz) {
\t\tboolean ready = true;
\t\tfor (int dx = 0; dx <= 1; dx++) {
\t\t\tfor (int dz = 0; dz <= 1; dz++) {
\t\t\t\tready = awaitChunk(world, cx + dx, cz + dz, 40) && ready;
\t\t\t}
\t\t}
\t\treturn ready;
\t}

\t/** A chunk nobody asked for is not loaded on an empty server; asking for it
\t *  queues it on the generator thread, so this asks and then waits. */
\tprivate static boolean awaitChunk(net.minecraft.core.world.World world, int chunkX, int chunkZ,
\t\t\tint attempts) {
\t\t// The override belongs HERE, to the act of asking for a chunk, and not
\t\t// to whichever phase happened to need it first. A53 found the switch
\t\t// while fixing the journey and left it in journey(); the census needed
\t\t// it next and got its own copy; lightRing needed it third, nobody
\t\t// noticed, and it has been getting away with it ever since because the
\t\t// boot loads the spawn area underneath it. That is A72 exactly: a guard
\t\t// written into a phase runs for the mods that reach that phase.
\t\t//
\t\t// Measured rather than argued. With the switch off, a chunk 40 chunks
\t\t// out from spawn was still unloaded after ten asks; with it on, one 60
\t\t// out arrived on the first.
\t\t//
\t\t// It restores what it found rather than false, which is what lets it sit
\t\t// inside the phases that hold the switch open across a whole run of
\t\t// reads. Restoring false would close it under their feet.
\t\tnet.minecraft.server.world.chunk.provider.ChunkProviderServer server = serverProvider(world);
\t\tboolean previous = server != null && server.chunkLoadOverride;
\t\tif (server != null) server.chunkLoadOverride = true;
\t\ttry {
\t\t\tfor (int i = 0; i < attempts; i++) {
\t\t\t\tif (world.isChunkLoaded(chunkX, chunkZ)) return true;
\t\t\t\t// GENERATED ON THE SERVER'S THREAD, which is A101 and the fourth
\t\t\t\t// instance of the pattern onServerThread was built for. Asking
\t\t\t\t// for a chunk that does not exist yet generates and DECORATES
\t\t\t\t// it here, and decoration writes blocks, and every block
\t\t\t\t// written schedules a lighting update onto the same unlocked
\t\t\t\t// queue the server drains in doTick. A82, A86 and A92 were all
\t\t\t\t// that queue; this is the same queue reached one call deeper.
\t\t\t\t//
\t\t\t\t// It was a known open position rather than a surprise: this
\t\t\t\t// file's own Next list said chunk generation still happened on
\t\t\t\t// this thread and that nothing had ever thrown out of the
\t\t\t\t// lighting half. The structure census made it throw, because it
\t\t\t\t// generates a couple of hundred chunks in one burst where every
\t\t\t\t// earlier phase generated a dozen, and BTA answers an
\t\t\t\t// updatingLighting throw in doTick by shutting the server down.
\t\t\t\t//
\t\t\t\t// The objection recorded against moving generation here was
\t\t\t\t// that a minute of generation inside one tick is a worse
\t\t\t\t// failure. That objection is about moving the LOOP; this moves
\t\t\t\t// one chunk per job, which is milliseconds of work per tick and
\t\t\t\t// leaves the waiting on this thread where it was.
\t\t\t\t//
\t\t\t\t// The fallback is deliberate. onServerThread returns false when
\t\t\t\t// there is no box to hand work to, and a probe that then
\t\t\t\t// generated nothing at all would turn a race into a phase that
\t\t\t\t// reports absence, which is the worse of the two.
\t\t\t\ttry {
\t\t\t\t\tfinal net.minecraft.core.world.World w = world;
\t\t\t\t\tfinal int gx = chunkX;
\t\t\t\t\tfinal int gz = chunkZ;
\t\t\t\t\tif (!onServerThread("generate chunk " + gx + "," + gz,
\t\t\t\t\t\t\t() -> w.getChunk(new net.minecraft.core.world.pos.ChunkPos(gx, gz)))) {
\t\t\t\t\t\tworld.getChunk(new net.minecraft.core.world.pos.ChunkPos(chunkX, chunkZ));
\t\t\t\t\t}
\t\t\t\t} catch (Throwable ignored) {
\t\t\t\t\t// still generating
\t\t\t\t}
\t\t\t\ttry {
\t\t\t\t\tThread.sleep(500);
\t\t\t\t} catch (InterruptedException e) {
\t\t\t\t\treturn false;
\t\t\t\t}
\t\t\t}
\t\t\treturn world.isChunkLoaded(chunkX, chunkZ);
\t\t} finally {
\t\t\tif (server != null) server.chunkLoadOverride = previous;
\t\t}
\t}

\t/** The nether-portal shape: four wide, five tall, a two by three hole. The
\t *  pocket around it is cleared first so nothing already in the air is
\t *  mistaken for part of the ring. */
\tprivate static void buildFrame(net.minecraft.core.world.World world, int bx, int by, int bz,
\t\t\tnet.minecraft.core.block.Block<?> frame) {
\t\tnet.minecraft.core.world.pos.TilePos p = new net.minecraft.core.world.pos.TilePos();
\t\tfor (int x = -1; x <= 4; x++) {
\t\t\tfor (int y = -1; y <= 5; y++) {
\t\t\t\tfor (int z = -1; z <= 1; z++) {
\t\t\t\t\tworld.setBlockTypeData(p.set(bx + x, by + y, bz + z),
\t\t\t\t\t\tnet.minecraft.core.block.Blocks.AIR, 0);
\t\t\t\t}
\t\t\t}
\t\t}
\t\tfor (int x = 0; x <= 3; x++) {
\t\t\tworld.setBlockTypeData(p.set(bx + x, by, bz), frame, 0);
\t\t\tworld.setBlockTypeData(p.set(bx + x, by + 4, bz), frame, 0);
\t\t}
\t\tfor (int y = 1; y <= 3; y++) {
\t\t\tworld.setBlockTypeData(p.set(bx, by + y, bz), frame, 0);
\t\t\tworld.setBlockTypeData(p.set(bx + 3, by + y, bz), frame, 0);
\t\t}
\t}

\t/** The world is built on the boot thread after this probe is installed, so
\t *  waiting is the only way to see it. Bounded: a probe that hangs forever
\t *  costs more than one that reports it never arrived. */
\tprivate static net.minecraft.core.world.World awaitWorld(int dimensionId, int attempts) {
\t\tfor (int i = 0; i < attempts; i++) {
\t\t\ttry {
\t\t\t\tnet.minecraft.server.MinecraftServer server =
\t\t\t\t\tnet.minecraft.server.MinecraftServer.getInstance();
\t\t\t\tif (server != null) {
\t\t\t\t\tnet.minecraft.core.world.World world = server.getDimensionWorld(dimensionId);
\t\t\t\t\tif (world != null && world.getBiomeProvider() != null) {
\t\t\t\t\t\t// Every world this probe ever touches passes through here, which is
\t\t\t\t\t\t// the only reason this is the right place for it. A82.
\t\t\t\t\t\t//
\t\t\t\t\t\t// The probe grows chunks from its own thread. ChunkProviderServer
\t\t\t\t\t\t// keeps its chunks in a plain ArrayList and provideChunk appends to
\t\t\t\t\t\t// it; the SERVER thread walks that same list every autosave, in
\t\t\t\t\t\t// World.tick -> saveWorld -> saveChunks. Land an append inside that
\t\t\t\t\t\t// walk and the server thread takes a ConcurrentModificationException,
\t\t\t\t\t\t// and BTA does not merely log that: MinecraftServer.doTick catches a
\t\t\t\t\t\t// tick failure, prints "Unhandled exception while ticking dimension"
\t\t\t\t\t\t// and calls initiateShutdown(), so run() stops the server and exits
\t\t\t\t\t\t// zero. The census is a DAEMON thread, so it dies with the JVM saying
\t\t\t\t\t\t// nothing, gradle reports BUILD SUCCESSFUL, and the whole event reads
\t\t\t\t\t\t// in the log as a phase that never started. That is A82 exactly, and
\t\t\t\t\t\t// it took fifteen runs because nothing echoed the server's own lines.
\t\t\t\t\t\t//
\t\t\t\t\t\t// dontSave is BTA's own switch for it and it closes both halves:
\t\t\t\t\t\t// canSave() is !dontSave, so World.saveWorld returns before it reaches
\t\t\t\t\t\t// saveChunks, and ChunkProviderServer.tick() skips its unload pass,
\t\t\t\t\t\t// which walks the same list to remove from it. Nothing here wants a
\t\t\t\t\t\t// saved world: the workspace is a temp directory deleted at the end of
\t\t\t\t\t\t// the run, and every answer this probe gives is read out of memory.
\t\t\t\t\t\t//
\t\t\t\t\t\t// The one thing that DOES need writing is written directly, and was
\t\t\t\t\t\t// already: travel() calls saveDimensionData on the level storage,
\t\t\t\t\t\t// which does not ask canSave and does not touch a live collection.
\t\t\t\t\t\t// That call exists because this same race was met from the probe's
\t\t\t\t\t\t// side of it and worked around there rather than understood, which is
\t\t\t\t\t\t// how it went on killing the server from the other side for five runs.
\t\t\t\t\t\tif (world instanceof net.minecraft.server.world.WorldServer) {
\t\t\t\t\t\t\t((net.minecraft.server.world.WorldServer) world).dontSave = true;
\t\t\t\t\t\t}
\t\t\t\t\t\treturn world;
\t\t\t\t\t}
\t\t\t\t}
\t\t\t} catch (Throwable ignored) {
\t\t\t\t// not up yet
\t\t\t}
\t\t\ttry {
\t\t\t\tThread.sleep(500);
\t\t\t} catch (InterruptedException e) {
\t\t\t\treturn null;
\t\t\t}
\t\t}
\t\treturn null;
\t}
}
`
}

async function main(): Promise<void> {
  const keep = process.argv.includes('--keep')

  const wanted = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'kitchen sink'
  const scenario = SCENARIOS.find((s) => s.name === wanted)
  if (!scenario) {
    console.log(`No scenario named "${wanted}". Known scenarios:`)
    for (const s of SCENARIOS) console.log(`  ${s.name}`)
    process.exit(2)
    return
  }
  console.log(`scenario: ${scenario.name}`)
  const project = scenario.build()
  const now = '2026-08-27T00:00:00Z'
  project.textures = [{ id: 't1', name: 'checker', data: png16DataUrl(), createdAt: now, updatedAt: now }]
  for (const slot of textureSlotsFor(project)) project.textureAssignments[slot.key] = 't1'

  const root = probeWorkspace('artemis-ingame-')
  console.log(`workspace: ${root}\n`)
  await exportWorkspace(project, root, [])

  const expectations = expectationsFor(project, root)
  console.log(
    `expecting ${expectations.blocks.length} blocks, ${expectations.items.length} items, ` +
      `${expectations.biomes.length} biomes, ${expectations.langKeys.length} names\n`
  )

  const probePath = join(root, 'src/main/java/artemisprobe/ArtemisProbe.java')
  mkdirSync(dirname(probePath), { recursive: true })
  writeFileSync(probePath, probeSource(project, expectations))

  const modJsonPath = join(root, 'src/main/resources/fabric.mod.json')
  const modJson = JSON.parse(readFileSync(modJsonPath, 'utf-8'))
  modJson.entrypoints.main.push('artemisprobe.ArtemisProbe')
  writeFileSync(modJsonPath, JSON.stringify(modJson, null, 2))

  const runDir = join(root, 'run')
  mkdirSync(runDir, { recursive: true })
  writeFileSync(
    join(runDir, 'server.properties'),
    `server-port=${PORT}\nlevel-name=probe\nlevel-seed=${WORLD_SEED}\n`
  )
  writeFileSync(join(runDir, 'eula.txt'), 'eula=true\n')

  const budget = runBudget(expectations)
  console.log(`${budget.why}\n`)

  const { out, ending, endedItself } = await runServer(root, budget)

  console.log(`\n${ending}`)

  if (/FAILED TO BIND/.test(out)) {
    check(
      `the port ${PORT} was free for this run`,
      false,
      'a server is already on it, so this run proves nothing about the mod: kill the leftover java'
    )
  }

  const probeLines = out.split('\n').filter((l) => l.includes('ARTEMIS-PROBE'))
  const summary = probeLines.find((l) => l.includes('ARTEMIS-PROBE SUMMARY'))
  console.log(`the game reached: ${out.includes('Done (') ? 'Done' : 'NOT Done'}`)
  console.log(`${probeLines.length} probe lines, summary: ${summary?.trim() ?? 'none'}\n`)

  check('the probe ran at all', !!summary, probeLines.slice(-5).join('\n') || out.slice(-2000))
  if (summary) {
    const [, , passed, failed] = summary.trim().split(/\s+/)
    check('nothing the probe asserted failed', failed === '0', probeLines.filter((l) => l.includes('FAIL')).join('\n'))

    const expected =
      expectations.blocks.length + expectations.items.length + expectations.biomes.length + 1
    check(
      'and it asserted at least one thing per registered name',
      Number(passed) + Number(failed) >= expected,
      `${passed} + ${failed} assertions for ${expected} expected names`
    )
  }

  const worldgenLines = out.split('\n').filter((l) => l.includes('ARTEMIS-WORLDGEN'))
  const worldgenSummary = worldgenLines.find((l) => l.includes('ARTEMIS-WORLDGEN SUMMARY'))

  const distributions = worldgenLines.filter((l) => l.includes('ARTEMIS-WORLDGEN DISTRIBUTION'))
  for (const d of distributions) console.log(`\n${d.trim()}\n`)

  const phases = worldgenLines.filter((l) => l.includes('ARTEMIS-WORLDGEN PHASE'))
  const exits = worldgenLines.filter((l) => l.includes('ARTEMIS-WORLDGEN EXIT'))
  check(
    'the worldgen probe ran',
    !!worldgenSummary,

    [
      'no ARTEMIS-WORLDGEN SUMMARY: the overworld never arrived, or the phase threw',
      ending,
      `last phase reached: ${phases.at(-1)?.trim() ?? 'none, the phase never started'}`,
      exits.length > 0
        ? `the JVM exited in an orderly way and the hook said:\n       ${exits.map((l) => l.trim()).join('\n       ')}`
        : 'no exit hook line: the JVM was killed outright rather than shut down',
      `the last thing the game itself printed:\n${tailLines(out)}`
    ].join('\n       ')
  )
  if (worldgenSummary) {
    const [, , wPassed, wFailed] = worldgenSummary.trim().split(/\s+/)
    check(
      'every biome the mod places owns columns in a real world, and every portal opens',
      wFailed === '0',
      probeLines.filter((l) => l.includes('FAIL')).join('\n')
    )

    const overworldChecks = expectations.overworldBiomes.length + expectations.awayBiomes.length
    const expectedAssertions =
      (overworldChecks > 0 ? overworldChecks + 2 : 0) +
      expectations.dimensions.reduce((n, d) => n + d.biomes.length + d.vanillaBiomes.length + 2, 0)
    if (expectedAssertions > 0) {
      check(
        'and it counted columns rather than reporting nothing',
        Number(wPassed) + Number(wFailed) >= expectedAssertions,
        `${wPassed} + ${wFailed} assertions, expected at least ${expectedAssertions} for ` +
          `${expectations.overworldBiomes.length} overworld biomes, ` +
          `${expectations.awayBiomes.length} kept out of the overworld and ` +
          `${expectations.dimensions.length} dimensions`
      )
    }

    if (expectations.dimensions.length > 0) {
      check(
        'and it looked inside every dimension the mod adds',
        expectations.dimensions.every((d) =>
          distributions.some((line) => line.includes(`dimension ${d.idField}`))
        ),
        `distribution lines seen:\n${distributions.join('\n')}`
      )

      check(
        'and a portal to every dimension could be lit in the overworld',
        expectations.dimensions.every((d) =>
          probeLines.some((l) => l.includes('PASS') && l.includes(`opens ${d.field}`))
        ),
        probeLines.filter((l) => l.includes('opens ')).join('\n') ||
          'no portal was ever lit'
      )

      const legs = ['out to', 'home from']
      const missing = expectations.dimensions.flatMap((d) =>
        legs
          .filter(
            (leg) =>
              !out.includes(
                `ARTEMIS-PROBE PASS ${leg} ${d.field}: the traveller is in the destination world`
              ) && !out.includes(`ARTEMIS-WORLDGEN SKIP ${leg} ${d.field} ::`)
          )
          .map((leg) => `${leg} ${d.field}`)
      )
      check(
        'and every journey out and home either happened or said why not',
        missing.length === 0,
        `nothing was reported at all for: ${missing.join(', ')}`
      )
    }

    if (expectations.ores.length > 0) {
      const oreLines = worldgenLines.filter(
        (l) => l.includes('ARTEMIS-WORLDGEN ORE ') || l.includes('ARTEMIS-WORLDGEN SKIP ore ')
      )
      const unasked = expectations.ores.filter((o) => !oreLines.some((l) => l.includes(` ${o.field} `)))
      check(
        "and the decorator's own output was counted for every ore the mod grows",
        unasked.length === 0,
        `nothing was reported for: ${unasked.map((o) => o.field).join(', ')}\n       ` +
          `ore lines seen:\n       ${oreLines.map((l) => l.trim()).join('\n       ') || 'none'}`
      )
    }

    if (expectations.plants.length > 0) {
      const plantLines = worldgenLines.filter(
        (l) => l.includes('ARTEMIS-WORLDGEN PLANT ') || l.includes('ARTEMIS-WORLDGEN SKIP plant ')
      )
      const unplanted = expectations.plants.filter(
        (p) => !plantLines.some((l) => l.includes(` ${p.field} `))
      )
      check(
        'and the same for every plant the mod scatters',
        unplanted.length === 0,
        `nothing was reported for: ${unplanted.map((p) => p.field).join(', ')}\n       ` +
          `plant lines seen:\n       ${plantLines.map((l) => l.trim()).join('\n       ') || 'none'}`
      )
    }
  }

  const skipped = probeLines.filter((l) => l.includes('SKIP'))
  if (skipped.length > 0) console.log(`skipped in this environment:\n${skipped.join('\n')}\n`)

  check('the server started the world', out.includes('Done ('), 'the run never finished starting')
  check(
    'no mixin failed to apply',
    !/Mixin apply failed|MixinApplyError/.test(out),
    out.split('\n').filter((l) => /Mixin/.test(l) && /fail/i.test(l)).join('\n')
  )
  check(
    'nothing crashed',
    !/Exception in thread|A fatal error|Failed to start/.test(out),
    out.split('\n').filter((l) => /Exception|fatal/i.test(l)).slice(0, 10).join('\n')
  )

  check(
    'the game logged no unhandled exception of its own',
    !/Unhandled exception while ticking|Caught throwable in shutdown sequence/.test(out),
    out
      .split(/\r?\n/)
      .filter((l) => /Unhandled exception while ticking|Caught throwable in shutdown/.test(l))
      .join('\n       ')
  )

  check(
    'the game ran until this runner stopped it',
    !endedItself,
    `${ending}\n       the last thing the game itself printed:\n${tailLines(out)}`
  )

  if (!keep) {
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
    } catch (e) {
      console.log(`could not remove the workspace yet (${String(e).split('\n')[0]}): ${root}`)
    }
  } else console.log(`kept: ${root}`)

  console.log(`\n${audit.passes} checks passed, ${audit.failures} failed`)
  if (audit.failures) {
    console.log('INGAME FAIL')
    process.exit(1)
  }
  console.log('INGAME PASS')
}

interface RunBudget {
  seconds: number

  why: string
}

function runBudget(expectations: Expectations): RunBudget {
  const dimensions = expectations.dimensions.length
  const claims = expectations.claimedBiomes.length + expectations.dimClaimedBiomes.length

  const rows = [...expectations.ores, ...expectations.plants].reduce(
    (n, row) => n + (row.biomes.length === 0 ? 2 : row.biomes.length),
    0
  )

  const structureChunks = expectations.structures.reduce((n, row) => {
    const side = Math.ceil(Math.sqrt(Math.max(25, Math.min(225, 5 * row.oneIn))))
    const worlds = row.biomes.length === 0 ? 2 : row.biomes.length
    return n + worlds * (side + 2) * (side + 2)
  }, 0)
  const seconds = 600 + 20 * dimensions + 60 * claims + 30 * rows + structureChunks
  return {
    seconds,
    why:
      `runner budget: ${seconds}s (600s floor + ${dimensions} dimension(s) x 20s + ` +
      `${claims} claim census(es) x 60s + ${rows} decorator row(s) x 30s + ` +
      `${structureChunks} structure census chunk(s) x 1s)`
  }
}

function runServer(root: string, budget: RunBudget): Promise<GameRun> {
  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn(GRADLE, ['runServer', '--console=plain'], {
      cwd: root,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let out = ''
    let pending = ''

    const killer = treeKiller(child)

    const onData = (buf: Buffer): void => {
      const text = buf.toString()
      out += text
      pending += text
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) {
        if (line.includes('ARTEMIS-PROBE') || line.includes('ARTEMIS-WORLDGEN')) {
          process.stdout.write(`  ${line.trim()}\n`)
        }
      }

      if (
        out.includes('ARTEMIS-PROBE SUMMARY') &&
        out.includes('ARTEMIS-WORLDGEN SUMMARY') &&
        out.includes('Done (')
      ) {
        killer.stop('both summaries and Done had been printed')
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)

    const timer = setTimeout(() => {
      console.log(`  (timeout: stopping the server after ${budget.seconds}s)`)
      killer.stop(`the ${budget.seconds}s budget fired: ${budget.why}`)
    }, budget.seconds * 1000)

    onGameClose(child, killer, timer, started, () => out, resolve)
  })
}

void main()
