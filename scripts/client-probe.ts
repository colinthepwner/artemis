import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { spawn, spawnSync } from 'child_process'
import { exportWorkspace } from '../src/main/export/exporter'
import { toConstantCase, type ArtemisProject } from '../src/shared/project'
import { textureSlotsFor } from '../src/shared/generator/textures'
import { kitFamily } from '../src/shared/generator/family'
import { SCENARIOS } from './audit-fixtures'
import { probeWorkspace } from './_temp'
import { GRADLE } from './_gradle'
import { png16DataUrl, pngDataUrl } from './_canvas'
import { collectTextureIds } from './_texture-ids'
import {
  dropAbsentDependencies,
  harness,
  kitPieceNames,
  onGameClose,
  tailLines,
  treeKiller,
  type GameRun
} from './_harness'
import { javaNames, javaReport } from './_probe-java'

const audit = harness()
const check = audit.check

interface Expectations {
  blocks: string[]
  items: string[]

  textures: string[]

  entities: string[]
  langKeys: string[]

  langBlank: string[]

  creativeRuns: { name: string; refs: string[] }[]
}

function expectationsFor(project: ArtemisProject, root: string): Expectations {
  const modId = project.meta.modId
  const langPath = join(root, `src/main/resources/assets/${modId}/lang/en_US/${modId}.lang`)
  const langLines = readFileSync(langPath, 'utf-8')
    .split('\n')
    .filter((l) => l.includes('='))
  const langKeys = langLines.map((l) => l.slice(0, l.indexOf('=')).trim())

  const langBlank = langLines
    .filter((l) => l.slice(l.indexOf('=') + 1).trim().length === 0)
    .map((l) => l.slice(0, l.indexOf('=')).trim())

  const namesUnder = (prefix: string): string[] => [
    ...new Set(
      langKeys
        .filter((k) => k.startsWith(`${prefix}.${modId}.`) && k.endsWith('.name'))
        .map((k) => k.slice(`${prefix}.${modId}.`.length, -'.name'.length))
        .map(toConstantCase)
    )
  ]
  const kitPieces = kitPieceNames(project)

  const javaFiles: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.java')) javaFiles.push(full)
    }
  }
  walk(join(root, 'src/main/java'))
  const allJava = javaFiles.map((f) => readFileSync(f, 'utf-8')).join('\n')
  const modelFile = javaFiles.find((f) => f.endsWith('Models.java'))
  const modelSrc = modelFile ? readFileSync(modelFile, 'utf-8') : ''

  const collected = collectTextureIds(modelSrc, allJava)

  const entities = [...collected.entity].filter((id) => id.startsWith(`${modId}:`))

  const textures: string[] = []
  for (const id of collected.atlas) {
    const [ns, path] = id.split(':')

    if (ns !== modId) continue
    if (path.endsWith('/')) {

      const dir = join(root, `src/main/resources/assets/${ns}/models/${path}`)
      for (const json of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
        const model = JSON.parse(readFileSync(join(dir, json), 'utf-8')) as {
          textures?: Record<string, string>
        }
        for (const value of Object.values(model.textures ?? {})) {
          if (value.startsWith(`${modId}:`)) textures.push(value)
        }
      }
      continue
    }
    textures.push(id)
  }

  return {
    blocks: namesUnder('tile'),
    items: [...new Set([...namesUnder('item'), ...kitPieces])],
    textures: [...new Set(textures)],
    entities,
    langKeys,
    langBlank,
    creativeRuns: creativeRunsFrom(project, root)
  }
}

function creativeRunsFrom(
  project: ArtemisProject,
  root: string
): { name: string; refs: string[] }[] {
  const path = join(
    root,
    `src/main/java/com/${project.meta.modId}/init/ModGroups.java`
  )
  let source: string
  try {
    source = readFileSync(path, 'utf-8')
  } catch {
    return []
  }
  const runs: { name: string; refs: string[] }[] = []
  for (const line of source.split(/\r?\n/)) {
    const comment = line.match(/^\t\t\/\/ (.+)$/)
    if (comment) {
      runs.push({ name: comment[1], refs: [] })
      continue
    }
    const place = line.match(/place\((Mod\w+\.\w+),/)
    if (place && runs.length > 0) runs[runs.length - 1].refs.push(place[1])
  }
  return runs.filter((r) => r.refs.length > 0)
}

const javaList = (values: string[]): string => values.map((v) => `\t\t"${v}"`).join(',\n')

const javaRuns = (runs: { name: string; refs: string[] }[]): string =>
  runs
    .map((r) => `\t\t{ ${[r.name, ...r.refs].map((v) => `"${v}"`).join(', ')} }`)
    .join(',\n')

function probeSource(project: ArtemisProject, e: Expectations): string {
  const pkg = `com.${project.meta.modId}`
  return `package artemisclientprobe;

// Injected by scripts/client-probe.ts into a throwaway workspace. Never part
// of an exported mod.
//
// Every client type this touches is named from inside a method rather than in
// a field or a signature, so the class itself stays loadable anywhere. The
// listen call is behind HalpLibe.isClient in its own nested class for the same
// reason: on a dedicated server, merely resolving ClientEvents would drag in
// BlockModelDispatcher, and a probe that crashes a server it was not even
// meant to run on is a harness telling a lie about the mod.
import java.lang.reflect.Field;

import net.fabricmc.api.ModInitializer;
import turniplabs.halplibe.HalpLibe;
import turniplabs.halplibe.util.dependency.Key;

public class ArtemisClientProbe implements ModInitializer {

\tprivate static final String MOD_ID = "${project.meta.modId}";

\tprivate static final String[] BLOCKS = {
${javaList(e.blocks)}
\t};
\tprivate static final String[] ITEMS = {
${javaList(e.items)}
\t};
\tprivate static final String[] TEXTURES = {
${javaList(e.textures)}
\t};
\tprivate static final String[] ENTITY_SKINS = {
${javaList(e.entities)}
\t};
\tprivate static final String[] LANG_KEYS = {
${javaList(e.langKeys)}
\t};
\t/** of those, the ones the export meant to leave blank */
\tprivate static final String[] LANG_BLANK = {
${javaList(e.langBlank)}
\t};
\t/** { group name, ref, ref, ... } per shelved group, in placement order. */
\tprivate static final String[][] CREATIVE_RUNS = {
${javaRuns(e.creativeRuns)}
\t};

\tprivate static int pass = 0;
\tprivate static int fail = 0;

${javaReport('ARTEMIS-CLIENT')}

\tprivate static void check(String name, boolean ok, String detail) {
\t\tif (report(name, ok, detail)) pass++; else fail++;
\t}

\t@Override
\tpublic void onInitialize() {
\t\tif (HalpLibe.isClient) {
\t\t\tHook.install();
\t\t}
\t}

\t/** Kept separate so a server never loads a class naming a client type. */
\tstatic final class Hook {
\t\tstatic void install() {
\t\t\t// TAIL of Minecraft.startGame(), which is after I18n.initialize,
\t\t\t// after TextureRegistry.init() and after both model dispatchers.
\t\t\tturniplabs.halplibe.event.defs.ClientEvents.AFTER_CLIENT_START
\t\t\t\t.listen(Key.of("artemisclientprobe"), ArtemisClientProbe::run);
\t\t}
\t}

\tprivate static void run() {
\t\ttry {
\t\t\ttextures();
\t\t\tatlasStrays();
\t\t\tentitySkins();
\t\t\tblockModels();
\t\t\titemModels();
\t\t\tnames();
\t\t\tcreativeMenu();
\t\t} catch (Throwable t) {
\t\t\t// Through check() rather than printed here, so the line format lives
\t\t\t// in one place. The text is unchanged: check prints FAIL, the name,
\t\t\t// " :: " and the detail, which is what this wrote by hand.
\t\t\tcheck("probe itself threw", false, String.valueOf(t));
\t\t\tt.printStackTrace(System.out);
\t\t}
\t\tSystem.out.println("ARTEMIS-CLIENT SUMMARY " + pass + " " + fail);
\t}

\t/**
\t * The stitcher. hasSourceFile and hasTexture are asked separately on
\t * purpose: the first says the PNG was found at the path the id names, the
\t * second says it made it into an atlas. A texture can pass the first and
\t * fail the second (an unregistered namespace, a segment the stitcher does
\t * not walk, an image it rejected) and that is a chequerboard in the world
\t * with a perfectly good file sitting on disk. Then the identity check: an
\t * atlas entry whose own namespaceId is not the id we asked for means the
\t * lookup silently handed back the missing-texture icon.
\t */
\tprivate static void textures() {
\t\tif (TEXTURES.length == 0) {
\t\t\treturn;
\t\t}
\t\tfor (String id : TEXTURES) {
\t\t\ttry {
\t\t\t\tboolean source = net.minecraft.client.render.texture.stitcher.TextureRegistry.hasSourceFile(id);
\t\t\t\tcheck("texture " + id + " has a source file the game found", source, "nothing at that path from the game´s side");
\t\t\t\tboolean stitched = net.minecraft.client.render.texture.stitcher.TextureRegistry.hasTexture(id);
\t\t\t\tcheck("texture " + id + " is in an atlas", stitched, "the file is " + (source ? "there" : "NOT there") + " but the stitcher has no entry, so this draws as the missing texture");
\t\t\t\tif (!stitched) {
\t\t\t\t\tcontinue;
\t\t\t\t}
\t\t\t\tObject icon = net.minecraft.client.render.texture.stitcher.TextureRegistry.getTexture(id);
\t\t\t\tif (icon == null) {
\t\t\t\t\tcheck("texture " + id + " resolves to itself", false, "hasTexture said yes and getTexture returned null");
\t\t\t\t\tcontinue;
\t\t\t\t}
\t\t\t\tField nsField = icon.getClass().getField("namespaceId");
\t\t\t\tString got = String.valueOf(nsField.get(icon));
\t\t\t\tcheck("texture " + id + " resolves to itself", id.equals(got), "resolved to " + got + ", which is a substitution, not this texture");
\t\t\t\tField w = icon.getClass().getField("width");
\t\t\t\tField h = icon.getClass().getField("height");
\t\t\t\tint iw = w.getInt(icon);
\t\t\t\tint ih = h.getInt(icon);
\t\t\t\tcheck("texture " + id + " has a real size in the atlas", iw > 0 && ih > 0, "the atlas entry is " + iw + "x" + ih);
\t\t\t} catch (Throwable t) {
\t\t\t\tcheck("texture " + id, false, String.valueOf(t));
\t\t\t}
\t\t}
\t}

\t/**
\t * The atlas, asked the other way round, and the exact companion of every
\t * question above it.
\t *
\t * textures() demands that each id the generated code NAMES reached an
\t * atlas. Nothing has ever asked what is IN an atlas under this mod´s
\t * namespace that the code names nowhere, and that is the running-client
\t * shape of A63. The stitcher does not take a list from the mod: it walks
\t * the namespace´s directories and stitches every PNG it finds, so artwork
\t * left behind by a deleted element is not an unused file sitting on disk,
\t * it is an entry in the atlas of the mod that ships, taking real space in
\t * a real texture the game uploads to the card.
\t *
\t * The count check first, for the reason A64 records: an empty result
\t * contains no strays, so a namespace filter that stopped matching, or an
\t * atlas map read before the stitcher filled it, reads exactly like a clean
\t * atlas. The sweep proves it found the mod before it is allowed to say
\t * what it did not find.
\t */
\tprivate static void atlasStrays() {
\t\ttry {
\t\t\tjava.util.Set<String> declared = new java.util.HashSet<>(java.util.Arrays.asList(TEXTURES));
\t\t\t// id -> the atlas it was found in, so a stray is reported with the
\t\t\t// place it is taking up rather than as a bare name.
\t\t\tjava.util.Map<String, String> found = new java.util.TreeMap<>();
\t\t\t// One AtlasStitcher can sit in stitcherMap under more than one name:
\t\t\t// TextureRegistry keeps a remapping table so an old atlas name still
\t\t\t// resolves. Identity and not equality, because two atlases are never
\t\t\t// equal by value and sweeping one twice would report every entry in
\t\t\t// it twice.
\t\t\tjava.util.Set<Object> swept =
\t\t\t\tjava.util.Collections.newSetFromMap(new java.util.IdentityHashMap<Object, Boolean>());
\t\t\tfor (java.util.Map.Entry<String, net.minecraft.client.render.texture.stitcher.AtlasStitcher> entry
\t\t\t\t\t: net.minecraft.client.render.texture.stitcher.TextureRegistry.stitcherMap.entrySet()) {
\t\t\t\tnet.minecraft.client.render.texture.stitcher.AtlasStitcher atlas = entry.getValue();
\t\t\t\tif (atlas == null || !swept.add(atlas)) {
\t\t\t\t\tcontinue;
\t\t\t\t}
\t\t\t\tfor (net.minecraft.core.util.collection.NamespaceID id : atlas.iconMap.keySet()) {
\t\t\t\t\tif (!MOD_ID.equals(id.namespace())) {
\t\t\t\t\t\tcontinue;
\t\t\t\t\t}
\t\t\t\t\tfound.put(id.namespace() + ":" + id.value(), entry.getKey());
\t\t\t\t}
\t\t\t}
\t\t\t// Printed rather than left implicit: check() says nothing at all when
\t\t\t// it passes, so without this the only evidence the sweep looked at
\t\t\t// anything is the count check passing, and a run that found exactly
\t\t\t// one entry would read the same as one that found forty.
\t\t\tSystem.out.println("ARTEMIS-CLIENT INFO atlas sweep: " + found.size()
\t\t\t\t+ " stitched entries in the " + MOD_ID + " namespace, " + declared.size()
\t\t\t\t+ " named by the generated code");
\t\t\tcheck(
\t\t\t\t"the atlas sweep found this mod at all",
\t\t\t\tfound.size() > 0 || declared.isEmpty(),
\t\t\t\t"the code names " + declared.size() + " texture(s) and no atlas holds one in the "
\t\t\t\t\t+ MOD_ID + " namespace, so this sweep proves nothing"
\t\t\t);
\t\t\tjava.util.List<String> strays = new java.util.ArrayList<>();
\t\t\tfor (java.util.Map.Entry<String, String> e : found.entrySet()) {
\t\t\t\tif (!declared.contains(e.getKey())) {
\t\t\t\t\tstrays.add(e.getKey() + " (in atlas " + e.getValue() + ")");
\t\t\t\t}
\t\t\t}
\t\t\tcheck(
\t\t\t\t"no texture is stitched that the mod names nowhere",
\t\t\t\tstrays.isEmpty(),
\t\t\t\t"stitched into an atlas but named by no generated code: " + strays
\t\t\t);
\t\t} catch (Throwable t) {
\t\t\tcheck("the atlases can be swept for strays", false, String.valueOf(t));
\t\t\tt.printStackTrace(System.out);
\t\t}
\t}

\t/**
\t * A mob skin, through the door a mob skin actually goes through.
\t *
\t * There is no 'entity' AtlasStitcher, so this cannot be asked of
\t * TextureRegistry: it throws "Failed to find atlas 'entity'" rather than
\t * answering. What loads a skin is TextureManager, and it has two methods
\t * that differ in exactly the way that matters here: loadTexture SUBSTITUTES
\t * the missing-texture image and returns something either way, while
\t * loadTextureNoDefault returns null when there is nothing there. Only the
\t * second one can tell the difference, which is the whole reason a mob with
\t * no skin has never been caught before.
\t *
\t * The path is the one Mob.setTextureIdentifier composes, and it is checked
\t * as an absolute resource path because that is what the game hands to the
\t * texture manager, not as anything this harness made up.
\t */
\tprivate static void entitySkins() {
\t\tif (ENTITY_SKINS.length == 0) {
\t\t\treturn;
\t\t}
\t\tObject manager;
\t\ttry {
\t\t\tmanager = net.minecraft.client.Minecraft.getMinecraft().textureManager;
\t\t} catch (Throwable t) {
\t\t\tcheck("the texture manager exists", false, String.valueOf(t));
\t\t\treturn;
\t\t}
\t\tfor (String id : ENTITY_SKINS) {
\t\t\tint colon = id.indexOf(':');
\t\t\tString ns = id.substring(0, colon);
\t\t\tString value = id.substring(colon + 1);
\t\t\tString path = "/assets/" + ns + "/textures/" + value + ".png";
\t\t\ttry {
\t\t\t\tObject tex = manager.getClass()
\t\t\t\t\t.getMethod("loadTextureNoDefault", String.class).invoke(manager, path);
\t\t\t\tcheck("mob skin " + path + " loads", tex != null, "the texture manager found nothing there, so the mob renders untextured");
\t\t\t} catch (Throwable t) {
\t\t\t\tcheck("mob skin " + path + " loads", false, String.valueOf(t));
\t\t\t}
\t\t}
\t}

\t/**
\t * BlockModelDispatcher.getDefault() is BlockModelEmpty, so a block with no
\t * dispatch is not an error anywhere, it is a hole in the world. hasDispatch
\t * is the honest question; comparing the answer against the empty model as
\t * well catches a dispatch that was registered AS the empty one.
\t */
\tprivate static void blockModels() {
\t\tif (BLOCKS.length == 0) {
\t\t\treturn;
\t\t}
\t\tObject dispatcher;
\t\ttry {
\t\t\tdispatcher = net.minecraft.client.render.block.model.BlockModelDispatcher.getInstance();
\t\t} catch (Throwable t) {
\t\t\tcheck("the block model dispatcher exists", false, String.valueOf(t));
\t\t\treturn;
\t\t}
\t\tClass<?> holder;
\t\ttry {
\t\t\tholder = Class.forName("${pkg}.init.ModBlocks");
\t\t} catch (Throwable t) {
\t\t\tcheck("the block holder loaded on the client", false, String.valueOf(t));
\t\t\treturn;
\t\t}
\t\tfor (String name : BLOCKS) {
\t\t\ttry {
\t\t\t\tObject block = holder.getField(name).get(null);
\t\t\t\tif (block == null) {
\t\t\t\t\tcheck("block " + name + " has a model", false, "the field is null on the client");
\t\t\t\t\tcontinue;
\t\t\t\t}
\t\t\t\tboolean has = (Boolean) dispatcher.getClass()
\t\t\t\t\t.getMethod("hasDispatch", Object.class).invoke(dispatcher, block);
\t\t\t\tcheck("block " + name + " has a model", has, "no dispatch, so it is invisible in the world");
\t\t\t\tif (!has) {
\t\t\t\t\tcontinue;
\t\t\t\t}
\t\t\t\tObject model = dispatcher.getClass()
\t\t\t\t\t.getMethod("getDispatch", Object.class).invoke(dispatcher, block);
\t\t\t\tboolean empty = model == null
\t\t\t\t\t|| model instanceof net.minecraft.client.render.block.model.BlockModelEmpty;
\t\t\t\tcheck("block " + name + " model is not the empty one", !empty, "dispatched to " + (model == null ? "null" : model.getClass().getName()));
\t\t\t} catch (NoSuchFieldException missing) {
\t\t\t\tcheck("block " + name + " has a model", false, "no such field on ModBlocks");
\t\t\t} catch (Throwable t) {
\t\t\t\tcheck("block " + name + " has a model", false, String.valueOf(t));
\t\t\t}
\t\t}
\t}

\t/** The same question for items, where the failure is a blank inventory slot. */
\tprivate static void itemModels() {
\t\tif (ITEMS.length == 0) {
\t\t\treturn;
\t\t}
\t\tObject dispatcher;
\t\tObject emptyModel;
\t\ttry {
\t\t\tdispatcher = net.minecraft.client.render.item.model.ItemModelDispatcher.getInstance();
\t\t\temptyModel = net.minecraft.client.render.item.model.ItemModelDispatcher.emptyModel;
\t\t} catch (Throwable t) {
\t\t\tcheck("the item model dispatcher exists", false, String.valueOf(t));
\t\t\treturn;
\t\t}
\t\tClass<?> holder;
\t\ttry {
\t\t\tholder = Class.forName("${pkg}.init.ModItems");
\t\t} catch (Throwable t) {
\t\t\tcheck("the item holder loaded on the client", false, String.valueOf(t));
\t\t\treturn;
\t\t}
\t\tfor (String name : ITEMS) {
\t\t\ttry {
\t\t\t\tObject item = holder.getField(name).get(null);
\t\t\t\tif (item == null) {
\t\t\t\t\tcheck("item " + name + " has a model", false, "the field is null on the client");
\t\t\t\t\tcontinue;
\t\t\t\t}
\t\t\t\tboolean has = (Boolean) dispatcher.getClass()
\t\t\t\t\t.getMethod("hasDispatch", Object.class).invoke(dispatcher, item);
\t\t\t\tcheck("item " + name + " has a model", has, "no dispatch, so it is a blank slot in the inventory");
\t\t\t\tif (!has) {
\t\t\t\t\tcontinue;
\t\t\t\t}
\t\t\t\tObject model = dispatcher.getClass()
\t\t\t\t\t.getMethod("getDispatch", Object.class).invoke(dispatcher, item);
\t\t\t\tcheck("item " + name + " model is not the empty one", model != null && model != emptyModel, "dispatched to the empty model");
\t\t\t} catch (NoSuchFieldException missing) {
\t\t\t\tcheck("item " + name + " has a model", false, "no such field on ModItems");
\t\t\t} catch (Throwable t) {
\t\t\t\tcheck("item " + name + " has a model", false, String.valueOf(t));
\t\t\t}
\t\t}
\t}

\t/**
\t * Every key in the exported lang file resolves to something other than the
\t * key. The server probe reports this as SKIP whenever a dedicated server
\t * never initializes I18n, so on that path nothing is being checked. A
\t * client always has one, and startGame() calls I18n.initialize before this
\t * runs, so here it is an assertion.
\t */
${javaNames({

  onMissingI18n: '\t\t\tcheck("the client has an I18n", false, String.valueOf(t));',
  detail: 'translated to itself, so it shows in game as the raw key'
})}

\t/**
\t * A content group comes out as ONE RUN of adjacent slots, in the modder's
\t * order, and this is the only place that can be found out.
\t *
\t * Everything about it up to here was reasoning over somebody else's
\t * bytecode: that CreativeInventoryRegistry.bakeAll appends to a per-category
\t * list in registration order, that halplibe's CreativeMenuContentsMixin
\t * splices those lists into the vanilla one, and that placing by hand from
\t * ModGroups therefore beats leaving the placement on each builder. All of
\t * that compiles either way, and a mod whose tier came out scattered through
\t * the shelf would look exactly like a mod whose tier came out together.
\t *
\t * CreativeMenuContents.populate is public static and is what the creative
\t * screen itself calls, so this is the real list rather than a reconstruction
\t * of it. Called once, deliberately: bakeAll appends without clearing, so a
\t * second populate on the same run would double every modded entry. The probe
\t * is the first thing to ask, because a client at AFTER_CLIENT_START has no
\t * world yet and so has never opened the menu.
\t */
\tprivate static void creativeMenu() {
\t\tif (CREATIVE_RUNS.length == 0) {
\t\t\treturn;
\t\t}
\t\tjava.util.List<net.minecraft.core.item.ItemStack> list = new java.util.ArrayList<>();
\t\ttry {
\t\t\tnet.minecraft.core.player.inventory.CreativeMenuContents.populate(list);
\t\t} catch (Throwable t) {
\t\t\tcheck("the creative menu populates", false, String.valueOf(t));
\t\t\treturn;
\t\t}
\t\t// A guard on the guard: every assertion below is about where things sit
\t\t// in this list, and all of them would pass vacuously on an empty one.
\t\tcheck("the creative menu has vanilla content in it", list.size() > 100, list.size() + " stacks");

\t\tfor (String[] run : CREATIVE_RUNS) {
\t\t\tString group = run[0];
\t\t\tint[] at = new int[run.length - 1];
\t\t\tboolean located = true;
\t\t\tfor (int i = 1; i < run.length; i++) {
\t\t\t\tint id = idOf(run[i]);
\t\t\t\tif (id < 0) {
\t\t\t\t\tcheck(group + ": " + run[i] + " exists in the game", false, "the field is missing or is not an item or a block");
\t\t\t\t\tlocated = false;
\t\t\t\t\tcontinue;
\t\t\t\t}
\t\t\t\tint first = -1;
\t\t\t\tint seen = 0;
\t\t\t\tfor (int n = 0; n < list.size(); n++) {
\t\t\t\t\tnet.minecraft.core.item.ItemStack stack = list.get(n);
\t\t\t\t\tif (stack == null || stack.itemID != id) {
\t\t\t\t\t\tcontinue;
\t\t\t\t\t}
\t\t\t\t\tif (first < 0) {
\t\t\t\t\t\tfirst = n;
\t\t\t\t\t}
\t\t\t\t\tseen++;
\t\t\t\t}
\t\t\t\tcheck(group + ": " + run[i] + " is in the creative menu", first >= 0,
\t\t\t\t\t"no player can get hold of it");
\t\t\t\t// Twice means it was placed twice, which is the failure this design
\t\t\t\t// invites: a builder call left on alongside the ModGroups one.
\t\t\t\tcheck(group + ": " + run[i] + " is in the menu once", seen <= 1, "it appears " + seen + " times");
\t\t\t\tif (first < 0) {
\t\t\t\t\tlocated = false;
\t\t\t\t}
\t\t\t\tat[i - 1] = first;
\t\t\t}
\t\t\tif (!located || at.length < 2) {
\t\t\t\tcontinue;
\t\t\t}
\t\t\tboolean ordered = true;
\t\t\tboolean together = true;
\t\t\tStringBuilder where = new StringBuilder();
\t\t\tfor (int i = 0; i < at.length; i++) {
\t\t\t\tif (i > 0) {
\t\t\t\t\twhere.append(", ");
\t\t\t\t\tif (at[i] <= at[i - 1]) {
\t\t\t\t\t\tordered = false;
\t\t\t\t\t}
\t\t\t\t\tif (at[i] != at[i - 1] + 1) {
\t\t\t\t\t\ttogether = false;
\t\t\t\t\t}
\t\t\t\t}
\t\t\t\twhere.append(run[i + 1]).append("@").append(at[i]);
\t\t\t}
\t\t\tcheck(group + ": its members are in the order the sidebar lists them", ordered, where.toString());
\t\t\tcheck(group + ": its members sit together, with nothing between", together, where.toString());
\t\t}
\t}

\t/** The numeric item id behind a "ModItems.RUBY" or "ModBlocks.KILN" ref. */
\tprivate static int idOf(String ref) {
\t\ttry {
\t\t\tint dot = ref.indexOf('.');
\t\t\tClass<?> holder = Class.forName("${pkg}.init." + ref.substring(0, dot));
\t\t\tObject value = holder.getField(ref.substring(dot + 1)).get(null);
\t\t\tif (value instanceof net.minecraft.core.item.Item) {
\t\t\t\treturn ((net.minecraft.core.item.Item) value).id;
\t\t\t}
\t\t\t// A block reaches the menu as its item form, which is what the
\t\t\t// registry placed and what the stack in the list holds.
\t\t\tif (value instanceof net.minecraft.core.block.Block) {
\t\t\t\treturn ((net.minecraft.core.block.Block<?>) value).asItem().id;
\t\t\t}
\t\t\treturn -1;
\t\t} catch (Throwable t) {
\t\t\treturn -1;
\t\t}
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

  project.textures = [
    { id: 't1', name: 'checker', data: png16DataUrl(), createdAt: now, updatedAt: now },
    { id: 'skin', name: 'skin', data: pngDataUrl(64, 32), createdAt: now, updatedAt: now }
  ]
  for (const slot of textureSlotsFor(project)) {
    project.textureAssignments[slot.key] = slot.paintable ? 't1' : 'skin'
  }

  const root = probeWorkspace('artemis-client-')
  console.log(`workspace: ${root}\n`)
  await exportWorkspace(project, root, [])

  const e = expectationsFor(project, root)
  console.log(
    `expecting ${e.textures.length} textures in the atlas, ${e.entities.length} mob skins, ` +
      `${e.blocks.length} block models, ${e.items.length} item models, ${e.langKeys.length} names\n`
  )

  const probePath = join(root, 'src/main/java/artemisclientprobe/ArtemisClientProbe.java')
  mkdirSync(dirname(probePath), { recursive: true })
  writeFileSync(probePath, probeSource(project, e))

  const modJsonPath = join(root, 'src/main/resources/fabric.mod.json')
  const modJson = JSON.parse(readFileSync(modJsonPath, 'utf-8'))
  modJson.entrypoints.main.push('artemisclientprobe.ArtemisClientProbe')
  const dropped = dropAbsentDependencies(modJson)
  if (dropped.length > 0) {
    console.log(
      `dropped ${dropped.length} required dependency(s) the loader could not satisfy ` +
        `(${dropped.join(', ')}); the manifest itself is checked in audit-export
`
    )
  }
  writeFileSync(modJsonPath, JSON.stringify(modJson, null, 2))

  const { out, ending, endedItself } = await runClient(root)

  console.log(`\n${ending}`)

  const probeLines = out.split('\n').filter((l) => l.includes('ARTEMIS-CLIENT'))
  const summary = probeLines.find((l) => l.includes('ARTEMIS-CLIENT SUMMARY'))
  console.log(`${probeLines.length} probe lines, summary: ${summary?.trim() ?? 'none'}\n`)

  check('the probe ran at all', !!summary, probeLines.slice(-5).join('\n') || out.slice(-3000))

  const counts = summary?.match(/ARTEMIS-CLIENT SUMMARY (\d+) (\d+)/)
  check('the summary line is readable', !summary || !!counts, summary ?? '')
  if (counts) {
    const passed = Number(counts[1])
    const failed = Number(counts[2])
    check(
      'nothing the probe asserted failed',
      failed === 0,
      probeLines.filter((l) => l.includes('FAIL')).join('\n')
    )

    const expected =
      e.textures.length + e.entities.length + e.blocks.length + e.items.length + e.langKeys.length
    check(
      'and it asserted at least one thing per texture, skin, model and name',
      passed + failed >= expected,
      `${passed} + ${failed} assertions for ${expected} expected subjects`
    )
  }

  check(
    'the client got as far as starting the game',
    /ARTEMIS-CLIENT SUMMARY/.test(out),
    'startGame never reached its tail'
  )
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
    'the client ran until this runner stopped it',
    !endedItself,
    `${ending}\n       the last thing the game itself printed:\n${tailLines(out)}`
  )

  if (!keep) {
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
    } catch (err) {
      console.log(`could not remove the workspace yet (${String(err).split('\n')[0]}): ${root}`)
    }
  } else console.log(`kept: ${root}`)

  console.log(`\n${audit.passes} checks passed, ${audit.failures} failed`)
  if (audit.failures) {
    console.log('CLIENT FAIL')
    process.exit(1)
  }
  console.log('CLIENT PASS')
}

function runClient(root: string): Promise<GameRun> {
  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn(GRADLE, ['runClient', '--console=plain'], {
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
        if (line.includes('ARTEMIS-CLIENT')) process.stdout.write(`  ${line.trim()}\n`)
      }
      if (out.includes('ARTEMIS-CLIENT SUMMARY')) killer.stop('the summary had been printed')
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)

    const timer = setTimeout(
      () => {
        console.log('  (timeout: stopping the client)')
        killer.stop('the eight minute timeout fired')
      },
      8 * 60 * 1000
    )

    onGameClose(child, killer, timer, started, () => out, resolve)
  })
}

void main()
