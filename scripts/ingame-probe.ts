import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { spawn, spawnSync } from 'child_process'
import { exportWorkspace } from '../src/main/export/exporter'
import { toConstantCase, type ArtemisProject } from '../src/shared/project'
import { textureSlotsFor } from '../src/shared/generator/textures'
import { kitFamily } from '../src/shared/generator/family'
import { SCENARIOS } from './audit-fixtures'
import { sweepStale } from './_temp'
import { GRADLE } from './_gradle'
import { png16DataUrl } from './_canvas'

const PORT = 25599

const WORLD_SEED = 8010101

let failures = 0
let passes = 0
const check = (name: string, condition: boolean, detail?: string): void => {
  if (condition) passes++
  else {
    failures++
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`)
  }
}

interface Expectations {
  blocks: string[]
  items: string[]
  biomes: string[]

  overworldBiomes: string[]

  awayBiomes: string[]

  treelessBiomes: string[]

  claimedBiomes: { biome: string; logFields: string[] }[]

  dimensions: { field: string; idField: string; biomes: string[]; vanillaBiomes: string[] }[]
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

  const claimedTreeBiomes = project.elements
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
        .filter((r) =>
          project.elements.some(
            (el) =>
              el.kind === 'biome' &&
              el.name === r &&
              el.properties['generateInOverworld'] !== false
          )
        )
        .map((r) => ({ biome: `${project.meta.modId}:${r}`, logField }))
    })

    .reduce<{ biome: string; logFields: string[] }[]>((acc, one) => {
      const found = acc.find((g) => g.biome === one.biome)
      if (found) {
        if (!found.logFields.includes(one.logField)) found.logFields.push(one.logField)
      } else acc.push({ biome: one.biome, logFields: [one.logField] })
      return acc
    }, [])

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

  const kitPieces = project.elements.flatMap((el) => {
    const family = kitFamily(el)
    return [...(family?.tools ?? []), ...(family?.armor ?? [])].map(toConstantCase)
  })

  return {
    blocks: namesUnder('tile'),
    items: [...new Set([...namesUnder('item'), ...kitPieces])],
    biomes,
    overworldBiomes,
    awayBiomes,
    treelessBiomes,
    claimedBiomes: claimedTreeBiomes,
    dimensions,
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

\tprivate static void check(String name, boolean ok, String detail) {
\t\tif (ok) {
\t\t\tpass++;
\t\t\tSystem.out.println("ARTEMIS-PROBE PASS " + name);
\t\t} else {
\t\t\tfail++;
\t\t\tSystem.out.println("ARTEMIS-PROBE FAIL " + name + " :: " + detail);
\t\t}
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
\t\tThread worldgenThread = new Thread(ArtemisProbe::worldgen, "artemis-worldgen-probe");
\t\tworldgenThread.setDaemon(true);
\t\tworldgenThread.start();
\t}

\tprivate static void run() {
\t\ttry {
\t\t\tnamespace();
\t\t\tregistryFields("${pkg}.init.ModBlocks", BLOCKS, "block");
\t\t\tregistryFields("${pkg}.init.ModItems", ITEMS, "item");
\t\t\tbiomes();
\t\t\tstrays();
\t\t\tnames();
\t\t} catch (Throwable t) {
\t\t\tfail++;
\t\t\tSystem.out.println("ARTEMIS-PROBE FAIL probe itself threw :: " + t);
\t\t\ttrace(t);
\t\t}
\t\tSystem.out.println("ARTEMIS-PROBE SUMMARY " + pass + " " + fail);
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
\tprivate static void names() {
\t\tObject i18n;
\t\ttry {
\t\t\ti18n = net.minecraft.core.lang.I18n.getInstance();
\t\t} catch (Throwable t) {
\t\t\t// A dedicated server may never initialize I18n. That is the game's
\t\t\t// business, not the mod's, so it is reported and not failed.
\t\t\tSystem.out.println("ARTEMIS-PROBE SKIP names :: I18n not available :: " + t);
\t\t\treturn;
\t\t}
\t\tfor (String key : LANG_KEYS) {
\t\t\ttry {
\t\t\t\tObject translated = i18n.getClass().getMethod("translateKey", String.class).invoke(i18n, key);
\t\t\t\tString text = String.valueOf(translated);
\t\t\t\tcheck("name " + key, !key.equals(text) && text.length() > 0, "translated to itself, so nothing reads the lang line");
\t\t\t} catch (Throwable t) {
\t\t\t\tcheck("name " + key, false, String.valueOf(t));
\t\t\t}
\t\t}
\t}

\tprivate static int wpass = 0;
\tprivate static int wfail = 0;

\tprivate static void wcheck(String name, boolean ok, String detail) {
\t\tif (ok) {
\t\t\twpass++;
\t\t\tSystem.out.println("ARTEMIS-PROBE PASS " + name);
\t\t} else {
\t\t\twfail++;
\t\t\tSystem.out.println("ARTEMIS-PROBE FAIL " + name + " :: " + detail);
\t\t}
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
\t\t\tdimensionWorldgen();
\t\t\t// And the way IN, which is a different question again.
\t\t\tportals();
\t\t\t// and whether the way in leads anywhere a traveller survives.
\t\t\tjourneys();
\t\t\t// LAST, and deliberately. It is the only phase that makes the server
\t\t\t// generate chunks for its own sake, sixteen of them, and A53 is the
\t\t\t// standing reminder that this thread races the boot it runs beside.
\t\t\t// Run before the journeys it timed them out; run after, it costs
\t\t\t// nothing but its own minute.
\t\t\ttreeCensusOverworld();
\t\t} catch (Throwable t) {
\t\t\twcheck("the worldgen probe ran", false, String.valueOf(t));
\t\t\ttrace(t);
\t\t}
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
\t\ttreeCensus(world);
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
\t\t\t\t\t// A chunk is only DECORATED once its three neighbours to the
\t\t\t\t\t// east, south and south-east are there: that is where the game
\t\t\t\t\t// puts the trees. Growing the middle one alone gives bare
\t\t\t\t\t// terrain and a zero that means nothing at all.
\t\t\t\t\tboolean ready = true;
\t\t\t\t\tfor (int dx = 0; dx <= 1; dx++) {
\t\t\t\t\t\tfor (int dz = 0; dz <= 1; dz++) {
\t\t\t\t\t\t\tready = awaitChunk(world, spot[0] + dx, spot[1] + dz, 40) && ready;
\t\t\t\t\t\t}
\t\t\t\t\t}
\t\t\t\t\tif (!ready) continue;
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
\t\tif (CLAIMED_BIOMES.length == 0) return;
\t\tClass<?> holder;
\t\ttry {
\t\t\tholder = Class.forName("${pkg}.init.ModBlocks");
\t\t} catch (Throwable t) {
\t\t\twcheck("the block holder loaded for the claimed-tree census", false, String.valueOf(t));
\t\t\treturn;
\t\t}

\t\tfinal int CHUNKS_PER_BIOME = 4;
\t\tfinal int HALF = 2048;
\t\tfinal int STEP = 64;

\t\t// Every census FIRST, and only then any planting, because plantClaim puts
\t\t// real trees in the real world and a census that ran afterwards would be
\t\t// counting them. That is not hypothetical: with two trees claiming one
\t\t// biome, the second pass of the first version reported five trunks grown
\t\t// naturally and every one of them had been planted by this probe a second
\t\t// earlier.
\t\tjava.util.List<Object[]> planted = new java.util.ArrayList<>();

\t\tfor (String[] row : CLAIMED_BIOMES) {
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

\t\t\tint mine = 0;
\t\t\tint foreign = 0;
\t\t\tint coal = 0;
\t\t\tint columns = 0;
\t\t\tint grown = 0;
\t\t\tint ownMine = 0;
\t\t\tint ownForeign = 0;
\t\t\tint ownColumns = 0;
\t\t\tint ownChunks = 0;
\t\t\tfor (int[] spot : spots) {
\t\t\t\t// The same neighbour rule the treeless census follows: a chunk is
\t\t\t\t// decorated only once the three to its east, south and south-east
\t\t\t\t// exist, and a tree is decoration.
\t\t\t\tboolean ready = true;
\t\t\t\tfor (int dx = 0; dx <= 1; dx++) {
\t\t\t\t\tfor (int dz = 0; dz <= 1; dz++) {
\t\t\t\t\t\tready = awaitChunk(world, spot[0] + dx, spot[1] + dz, 40) && ready;
\t\t\t\t\t}
\t\t\t\t}
\t\t\t\tif (!ready) continue;
\t\t\t\tgrown++;
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
\t\t\t\t+ " columns=" + columns + " grown=" + grown + "/" + spots.size()
\t\t\t\t+ " | decorated only as itself: chunks=" + ownChunks + " mine=" + ownMine
\t\t\t\t+ " foreignLogs=" + ownForeign + " columns=" + ownColumns);

\t\t\twcheck("the census grew ground it could count in " + wanted,
\t\t\t\tcolumns > 0,
\t\t\t\t"not one column of it in " + grown + " of " + spots.size() + " chunks grown, so its counts prove nothing");
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
\t\t\t\t"no chunk sampled was decorated only as " + wanted + " (" + grown + " grown), so a zero would be about somebody else´s trees");
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
\t\t\t// actually owns, and it happens after every census for the reason at
\t\t\t// the top of this method.
\t\t\tplanted.add(new Object[] { wanted, label, trunks, spots });
\t\t}

\t\tfor (Object[] one : planted) {
\t\t\t@SuppressWarnings("unchecked")
\t\t\tjava.util.List<int[]> spots = (java.util.List<int[]>) one[3];
\t\t\tplantClaim(world, provider, (String) one[0], (String) one[1], (Object[]) one[2], spots);
\t\t}
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
\t\t\tfor (int lx = 2; lx < 14 && placed == 0; lx += 3) {
\t\t\t\tfor (int lz = 2; lz < 14 && placed == 0; lz += 3) {
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
\t\t\t\t\ttry {
\t\t\t\t\t\tok = feature.place(world, rand, x, y, z);
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
\t\tjava.util.List<int[]> all = new java.util.ArrayList<>();
\t\tfor (int x = -half; x < half; x += step) {
\t\t\tfor (int z = -half; z < half; z += step) {
\t\t\t\tnet.minecraft.core.world.biome.Biome b = provider.getBiome(x, 64, z);
\t\t\t\tif (b == null) continue;
\t\t\t\tif (!wanted.equals(b.getRegistryKey())) continue;
\t\t\t\tall.add(new int[] { x >> 4, z >> 4 });
\t\t\t}
\t\t}
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
\tprivate static boolean decoratedOnlyBy(net.minecraft.core.world.World world, int cx, int cz, String wanted) {
\t\treturn wanted.equals(decorationBiomeKey(world, cx, cz))
\t\t\t&& wanted.equals(decorationBiomeKey(world, cx - 1, cz))
\t\t\t&& wanted.equals(decorationBiomeKey(world, cx, cz - 1))
\t\t\t&& wanted.equals(decorationBiomeKey(world, cx - 1, cz - 1));
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
\t\tif (!awaitTicking(overworld, 240)) {
\t\t\twcheck("the server finished starting before anyone travelled", false,
\t\t\t\t"the world clock never advanced, so the boot never reached its main loop");
\t\t\treturn;
\t\t}
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

\t\tboolean toOverride = allowChunkLoads(to, true);
\t\ttry {
\t\t\tnew net.minecraft.core.world.PortalHandler().teleportEntity(to, traveller,
\t\t\t\tnet.minecraft.core.util.helper.DyeColor.WHITE, oldDim, newDim);
\t\t} finally {
\t\t\tif (toOverride) allowChunkLoads(to, false);
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
\t\tnet.minecraft.core.world.chunk.provider.ChunkProvider provider = world.getChunkProvider();
\t\tif (!(provider instanceof net.minecraft.server.world.chunk.provider.ChunkProviderServer)) {
\t\t\treturn false;
\t\t}
\t\t((net.minecraft.server.world.chunk.provider.ChunkProviderServer) provider)
\t\t\t.chunkLoadOverride = allow;
\t\treturn true;
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
\t\tbuildFrame(world, bx, by, bz, frame);

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
\t\tworld.setBlockTypeDataRaw(lit, net.minecraft.core.block.Blocks.FIRE, 0);
\t\tnet.minecraft.core.block.Blocks.FIRE.onPlacedByWorld(world, lit);
\t\tworld.notifyBlockChange(lit, net.minecraft.core.block.Blocks.FIRE);

\t\treturn world.getBlockType(p.set(bx + 1, by + 2, bz));
\t}

\t/** A chunk nobody asked for is not loaded on an empty server; asking for it
\t *  queues it on the generator thread, so this asks and then waits. */
\tprivate static boolean awaitChunk(net.minecraft.core.world.World world, int chunkX, int chunkZ,
\t\t\tint attempts) {
\t\tfor (int i = 0; i < attempts; i++) {
\t\t\tif (world.isChunkLoaded(chunkX, chunkZ)) return true;
\t\t\ttry {
\t\t\t\tworld.getChunk(new net.minecraft.core.world.pos.ChunkPos(chunkX, chunkZ));
\t\t\t} catch (Throwable ignored) {
\t\t\t\t// still generating
\t\t\t}
\t\t\ttry {
\t\t\t\tThread.sleep(500);
\t\t\t} catch (InterruptedException e) {
\t\t\t\treturn false;
\t\t\t}
\t\t}
\t\treturn world.isChunkLoaded(chunkX, chunkZ);
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

  const stale = sweepStale('artemis-ingame-')
  if (stale > 0) console.log(`swept ${stale} workspace(s) left by earlier runs`)
  const root = mkdtempSync(join(tmpdir(), 'artemis-ingame-'))
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

  const out = await runServer(root)

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
  check(
    'the worldgen probe ran',
    !!worldgenSummary,
    'no ARTEMIS-WORLDGEN SUMMARY: the overworld never arrived, or the phase threw'
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

  if (!keep) {
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
    } catch (e) {
      console.log(`could not remove the workspace yet (${String(e).split('\n')[0]}): ${root}`)
    }
  } else console.log(`kept: ${root}`)

  console.log(`\n${passes} checks passed, ${failures} failed`)
  if (failures) {
    console.log('INGAME FAIL')
    process.exit(1)
  }
  console.log('INGAME PASS')
}

function runServer(root: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(GRADLE, ['runServer', '--console=plain'], {
      cwd: root,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let out = ''
    let pending = ''
    let stopping = false
    const stop = (): void => {
      if (stopping) return
      stopping = true

      setTimeout(() => {
        try {
          spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
        } catch {
          child.kill('SIGKILL')
        }
      }, 2000)
    }

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
        stop()
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)

    const timer = setTimeout(() => {
      console.log('  (timeout: stopping the server)')
      stop()
    }, 10 * 60 * 1000)
    child.on('close', () => {
      clearTimeout(timer)
      resolve(out)
    })
  })
}

void main()
