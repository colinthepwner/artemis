import { dialog, ipcMain, shell } from 'electron'
import { mkdir, writeFile, readFile, readdir, rm, stat } from 'fs/promises'
import { existsSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { IPC } from '../../shared/ipc'
import type { ArtemisProject } from '../../shared/project'
import { toPascalCase } from '../../shared/project'
import { CodeGenerator } from '../../shared/generator/CodeGenerator'
import { getMapping, type BtaMapping } from '../../shared/generator/mappings'
import { textureSlotsFor } from '../../shared/generator/textures'
import { runGradle, warnIfNoJava } from '../gradle'
import { chooseModIcon } from '../modIcon'

interface ExportResult {
  ok: boolean
  path?: string
  jarPath?: string
  error?: string
  log: string[]
}

async function findBuiltJar(root: string): Promise<string | null> {
  const libsDir = join(root, 'build', 'libs')
  if (!existsSync(libsDir)) return null
  const candidates = (await readdir(libsDir)).filter(
    (f) => f.endsWith('.jar') && !f.endsWith('-dev.jar') && !f.endsWith('-sources.jar')
  )
  if (!candidates.length) return null
  const withTime = await Promise.all(
    candidates.map(async (f) => ({ f, mtime: (await stat(join(libsDir, f))).mtimeMs }))
  )
  withTime.sort((a, b) => b.mtime - a.mtime)
  return join(libsDir, withTime[0].f)
}

export function registerExportIpc(): void {
  ipcMain.handle(IPC.ExportWorkspace, async (_e, projectJson: string): Promise<ExportResult> => {
    const log: string[] = []
    try {
      const project = JSON.parse(projectJson) as ArtemisProject
      const res = await dialog.showOpenDialog({
        title: 'Choose export folder',
        properties: ['openDirectory', 'createDirectory']
      })
      if (res.canceled || res.filePaths.length === 0) {
        return { ok: false, error: 'Export canceled.', log }
      }
      const root = join(res.filePaths[0], project.meta.modId)
      await exportWorkspace(project, root, log)

      log.push('')
      log.push('Building mod jar…')
      log.push('First build downloads Minecraft + dependencies and can take several minutes…')
      log.push('─'.repeat(60))

      warnIfNoJava((line) => log.push(line))
      const build = await runGradle(
        root,
        'build',
        (line) => log.push(line),
        getMapping(project.meta.targetBta).gradle.gradleVersion
      )
      const { code, signal } = await build.done
      log.push('─'.repeat(60))

      if (signal || code !== 0) {
        log.push(`✗ Build failed (${signal ? `signal ${signal}` : `exit code ${code}`}). Source is still at ${root}.`)
        return { ok: true, path: root, log }
      }

      const jarPath = await findBuiltJar(root)
      if (jarPath) log.push(`✓ Built ${jarPath}`)
      else log.push('✗ Build succeeded but no jar was found under build/libs.')

      return { ok: true, path: root, jarPath: jarPath ?? undefined, log }
    } catch (e) {
      log.push(`✗ ${e instanceof Error ? e.message : String(e)}`)
      return { ok: false, error: e instanceof Error ? e.message : String(e), log }
    }
  })

  ipcMain.on(IPC.ShellShowItemInFolder, (_e, path: string) => {
    shell.showItemInFolder(path)
  })
}

const MANIFEST = '.artemis-generated'

type Written = Set<string>

async function write(root: string, rel: string, content: string, written?: Written): Promise<void> {
  const abs = join(root, rel)
  await mkdir(dirname(abs), { recursive: true })
  await writeFile(abs, content, 'utf-8')
  written?.add(rel)
}

async function writeBytes(root: string, rel: string, bytes: Buffer, written: Written): Promise<void> {
  const abs = join(root, rel)
  await mkdir(dirname(abs), { recursive: true })
  await writeFile(abs, bytes)
  written.add(rel)
}

async function reconcileGenerated(root: string, written: Written, log: string[]): Promise<void> {
  const manifestPath = join(root, MANIFEST)
  let previous: string[] = []
  if (existsSync(manifestPath)) {
    previous = (await readFile(manifestPath, 'utf-8'))
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
  }

  let removed = 0
  for (const rel of previous) {
    if (written.has(rel)) continue

    if (rel.includes('..') || rel.startsWith('/') || rel.includes('\\')) continue
    const abs = join(root, rel)
    if (!existsSync(abs)) continue
    try {
      await rm(abs, { force: true })
    } catch {

      continue
    }
    removed++

    let dir = dirname(abs)
    while (dir.startsWith(root) && dir !== root) {
      try {
        if ((await readdir(dir)).length > 0) break
        await rm(dir, { recursive: false, force: true })
      } catch {
        break
      }
      dir = dirname(dir)
    }
  }
  if (removed > 0) log.push(`  - ${removed} file(s) from the previous export that this one no longer generates`)

  await writeFile(manifestPath, [...written].sort().join('\n') + '\n', 'utf-8')
}

export interface ExportOptions {

  devMods?: boolean
}

export async function exportWorkspace(
  project: ArtemisProject,
  root: string,
  log: string[],
  options: ExportOptions = {}
): Promise<void> {
  const mapping = getMapping(project.meta.targetBta)
  const meta = project.meta

  log.push(`Exporting "${meta.name}" → ${root}`)

  const generated: Written = new Set()

  const generatedRoot = join(root, 'src/main/java', `com/${meta.modId}`)
  await rm(generatedRoot, { recursive: true, force: true })

  const generator = new CodeGenerator(project)
  const files = generator.generate()
  const overrides = project.codeOverrides ?? {}
  for (const f of files) {

    const edited = overrides[f.path]
    await write(root, f.path, edited ?? f.content, generated)
    log.push(`  + ${f.path}${edited === undefined ? '' : '  (hand-edited)'}`)
  }

  const halplibeVersion = await resolveHalplibeVersion(
    mapping.gradle.halplibe,
    mapping.gradle.repositories,
    log
  )

  if (options.devMods) await fetchDevMods(mapping.gradle.devMods, root, log)

  const g = mapping.gradle
  await write(
    root,
    'gradle.properties',
    `# Generated by Artemis
org.gradle.jvmargs=-Xmx2G
# IntelliJ's generated run configurations are not configuration-cache safe.
org.gradle.configuration-cache=false

mod_version=${meta.version}
mod_group=com.${meta.modId}
mod_name=${meta.modId}

bta_version=${mapping.btaVersion}
loader_version=${g.fabricLoaderVersion}
# Latest halplibe at export time. Bump freely, Artemis re-resolves on re-export.
halplibe_version=${halplibeVersion}
`,
    generated
  )

  await write(
    root,
    'settings.gradle',
    `// Generated by Artemis
pluginManagement {
	repositories {
		mavenCentral()
		gradlePluginPortal()
${g.pluginRepositories.map((url) => `\t\tmaven { url = '${url}' }`).join('\n')}
	}
}

// Fetches a matching JDK when the machine has none, so a fresh install only
// needs Gradle's own Java to get going.
plugins {
	id 'org.gradle.toolchains.foojay-resolver-convention' version '${g.foojayResolverVersion}'
}

rootProject.name = '${meta.modId}'
`,
    generated
  )

  const obfuscate = meta.obfuscate !== false
  await write(
    root,
    'build.gradle',
    `// Generated by Artemis for Better Than Adventure! ${mapping.btaVersion}
//
// Mirrors Turnip-Labs/bta-example-mod (8.0 branch). BTA 8.x builds on upstream
// fabric-loom and pulls the game from its own manifest rather than a maven
// coordinate, so the loom block below is what makes 'minecraft "::version"'
// resolve at all.
${
  obfuscate
    ? `buildscript {
	repositories { mavenCentral() }
	dependencies { classpath 'com.guardsquare:proguard-gradle:${mapping.obfuscation.proguardVersion}' }
}
`
    : ''
}plugins {
	id '${g.loomPlugin}' version '${g.loomVersion}'
	id 'java'
}

base.archivesName = project.mod_name
group = project.mod_group
version = project.mod_version

// LWJGL publishes its natives per platform, so the classifier has to be chosen
// for the machine doing the running.
def lwjglNatives = {
	String osName = System.getProperty('os.name')
	String osArch = System.getProperty('os.arch')
	if (osName.startsWith('Windows')) {
		if (!osArch.contains('64')) return 'natives-windows-x86'
		return osArch.startsWith('aarch64') ? 'natives-windows-arm64' : 'natives-windows'
	}
	if (osName.startsWith('Mac OS X') || osName.startsWith('Darwin')) {
		return osArch.startsWith('aarch64') ? 'natives-macos-arm64' : 'natives-macos'
	}
	if (osArch.startsWith('arm') || osArch.startsWith('aarch64')) {
		return (osArch.contains('64') || osArch.startsWith('armv8')) ? 'natives-linux-arm64' : 'natives-linux-arm32'
	}
	return 'natives-linux'
}()

loom {
	customMinecraftMetadata.set('${g.manifestUrl}')
}

repositories {
	mavenCentral()
	// the vanilla client jar, addressed by content hash
	ivy {
		url = 'https://piston-data.mojang.com'
		patternLayout { artifact 'v1/[organization]/[revision]/[module].jar' }
		metadataSources { artifact() }
	}
${g.repositories.map((url) => `\tmaven { url = '${url}' }`).join('\n')}
}

// BTA's own jar does not ship the paulscode/jorbis sound stack its SoundEngine
// still calls into, so the vanilla b1.7.3 client jar has to be on the run
// classpath. Dropping that jar in whole is a trap: it also carries its own
// obfuscated net/minecraft/client/Minecraft, and localRuntime lands it AHEAD of
// loom's minecraft-merged-deobf, so the loader resolves the wrong Minecraft and
// halplibe's MinecraftMixin dies with "@Shadow method displayScreen ... was not
// located in the target class". The upstream template sidesteps this by
// declaring the jar straight onto runtimeClasspath, which Gradle 9 refuses
// ("Dependencies can not be declared against the runtimeClasspath
// configuration"), so instead repack it here with net/minecraft stripped out.
// Only the audio libraries survive and nothing can shadow the game.
configurations {
	artemisVanillaClient
}

dependencies {
	artemisVanillaClient 'objects:client:${g.clientJarHash}'
}

def artemisAudioLibs = tasks.register('artemisAudioLibs', Jar) {
	description = 'Repacks the vanilla client jar with net/minecraft removed, leaving the sound libraries BTA needs at runtime.'
	archiveFileName = 'bta-audio-libs.jar'
	destinationDirectory = layout.buildDirectory.dir('artemis')
	from({ zipTree(configurations.artemisVanillaClient.singleFile) }) {
		exclude 'net/minecraft/**'
		// Mojang signed the original jar. Re-signing is impossible, so the
		// signature files have to go or the JVM rejects every class in it.
		exclude 'META-INF/*.SF', 'META-INF/*.DSA', 'META-INF/*.RSA'
	}
}

dependencies {
	minecraft "::\${project.bta_version}"

	implementation "${g.fabricLoaderGroup}:fabric-loader:\${project.loader_version}"
	implementation "${g.halplibe.mavenGroup}:${g.halplibe.artifact}:\${project.halplibe_version}"

	// generated code logs through slf4j
	compileOnly 'org.slf4j:slf4j-api:${g.slf4jVersion}'

	// only needed to launch the game from runClient. localRuntime rather than
	// runtimeClasspath: Gradle 9 refuses declarations against the latter, and
	// these must not leak into the published jar's metadata anyway.
	localRuntime files(artemisAudioLibs)
	localRuntime platform('org.lwjgl:lwjgl-bom:${g.lwjglVersion}')
	localRuntime "org.lwjgl:lwjgl::\$lwjglNatives"
	localRuntime "org.lwjgl:lwjgl-glfw::\$lwjglNatives"
	localRuntime "org.lwjgl:lwjgl-openal::\$lwjglNatives"
	localRuntime "org.lwjgl:lwjgl-opengl::\$lwjglNatives"
	localRuntime "org.lwjgl:lwjgl-stb::\$lwjglNatives"
}

java {
	toolchain {
		languageVersion = JavaLanguageVersion.of(${g.javaVersion})
	}
	sourceCompatibility = JavaVersion.toVersion(${g.javaVersion})
	targetCompatibility = JavaVersion.toVersion(${g.javaVersion})
}

tasks.withType(JavaCompile).configureEach {
	options.encoding = 'UTF-8'
	options.release = ${g.javaVersion}
}

processResources {
	inputs.property 'version', project.version
	filesMatching('fabric.mod.json') {
		expand 'version': project.version
	}
}

// The manifest lists libraries BTA no longer ships with; leaving them in breaks
// the run classpath.
configurations.configureEach {
	exclude group: 'org.lwjgl.lwjgl'
	exclude group: 'net.java.jutils'
	exclude group: 'net.java.jinput'
	exclude group: 'net.sf.jopt-simple'
	exclude group: 'net.minecraft', module: 'launchwrapper'
}
${obfuscate ? obfuscationTask() : ''}`,
    generated
  )

  if (obfuscate) {
    await write(root, 'proguard-rules.pro', proguardRules(project, mapping), generated)
    log.push('  + build.gradle / settings.gradle / gradle.properties')
    log.push('  + proguard-rules.pro (obfuscation ON: name obfuscation plus stability keep-list)')
  } else {
    log.push('  + build.gradle / settings.gradle / gradle.properties (obfuscation OFF)')
  }

  const mixinConfigs = files
    .filter((f) => f.path.endsWith('.mixins.json'))
    .map((f) => f.path.split('/').pop() as string)

  const icon = chooseModIcon(project)
  const iconPath = `assets/${meta.modId}/icon.png`
  if (icon) {
    await writeBytes(root, `src/main/resources/${iconPath}`, icon.png, generated)
    log.push(
      icon.source === 'uploaded'
        ? '  + icon.png (the one you uploaded)'
        : `  + icon.png (from your "${icon.textureName}" texture, nothing uploaded)`
    )
  }

  const oneLine = (meta.description || `${meta.name}, a Better Than Adventure! mod.`)
    .replace(/\s+/g, ' ')
    .trim()
  const described = !oneLine || /[.!?]$/.test(oneLine) ? oneLine : `${oneLine}.`

  const fmj = {
    ...mapping.fabricModJson,
    id: meta.modId,
    version: '${version}',
    name: meta.name,
    description: `${described} Made using Artemis`.trim(),
    authors: meta.authors.length ? meta.authors : ['Unknown'],
    ...(icon ? { icon: iconPath } : {}),
    ...(mixinConfigs.length ? { mixins: mixinConfigs } : {}),

    entrypoints: {
      main: [`com.${meta.modId}.${toPascalCase(meta.modId)}Mod`]
    },
    custom: {

      credits: [...meta.authors, 'Made using Artemis']
    }
  }
  await write(root, 'src/main/resources/fabric.mod.json', JSON.stringify(fmj, null, 2) + '\n', generated)

  const credits = [
    `${meta.name} v${meta.version}`,
    '',
    ...(meta.authors.length ? ['Authors:', ...meta.authors.map((a) => `  ${a}`), ''] : []),
    'Made using Artemis'
  ].join('\n')
  await write(root, 'CREDITS.txt', credits + '\n', generated)
  log.push('  + fabric.mod.json / CREDITS.txt (Artemis credit appended)')

  const assetDirs = ['block', 'item', 'entity', 'particle', 'art', 'gui/sprites', 'gui/sign']
  for (const d of assetDirs) {
    await write(
      root,
      `src/main/resources/assets/${meta.modId}/textures/${d}/.keep`,
      '',
      generated
    )
  }

  const slots = textureSlotsFor(project)
  const textureById = new Map((project.textures ?? []).map((t) => [t.id, t]))
  const assignments = project.textureAssignments ?? {}
  let written = 0
  const missing: typeof slots = []
  for (const slot of slots) {
    const tex = textureById.get(assignments[slot.key] ?? '')
    if (tex) {

      const base64 = tex.data.replace(/^data:image\/png;base64,/, '')

      await writeBytes(
        root,
        `src/main/resources/assets/${meta.modId}/textures/${slot.path ?? slot.key}.png`,
        Buffer.from(base64, 'base64'),
        generated
      )
      written++
    } else {
      missing.push(slot)
    }
  }

  await write(
    root,
    'TEXTURES_TODO.txt',
    missing.length === 0
      ? 'All referenced textures were painted in Artemis. Nothing left to add.\n'
      : [
          'Textures still needed (16x16 PNG unless noted).',
          'Paint them in Artemis and re-export, or drop the files in by hand:',
          '',
          ...missing.map(
            (s) =>
              `  src/main/resources/assets/${meta.modId}/textures/${s.path ?? s.key}.png${s.paintable ? '' : '  (64x32 entity skin)'}`
          ),
          ''
        ].join('\n'),
    generated
  )
  log.push(`  + ${written} painted texture(s) written, ${missing.length} still missing (see TEXTURES_TODO.txt)`)

  await reconcileGenerated(root, generated, log)

  log.push('')
  log.push(`Done. Open the folder in your IDE and run: gradlew build`)
}

function obfuscationTask(): string {
  return `
// ---- Artemis obfuscation ------------------------------------------------
// Name obfuscation only (no shrink/optimize) with the keep-list in
// proguard-rules.pro. Output: <name>-obf.jar, which then replaces the
// distributable jar.
import proguard.gradle.ProGuardTask

def artemisJarTask = tasks.names.contains('remapJar') ? 'remapJar' : 'jar'

tasks.register('obfuscateJar', ProGuardTask) {
	dependsOn tasks.named(artemisJarTask)
	def input = tasks.named(artemisJarTask).get().archiveFile.get().asFile
	def output = new File(input.parentFile, input.name.replaceFirst(/\\.jar$/, '-obf.jar'))

	injars input
	outjars output

	// full dependency surface so override names stay bound to library methods
	libraryjars configurations.runtimeClasspath
	// JDK modules ProGuard needs as a library reference
	libraryjars "\${System.getProperty('java.home')}/jmods/java.base.jmod", jarfilter: '!**.jar', filter: '!module-info.class'

	configuration 'proguard-rules.pro'

	doLast {
		// swap the obfuscated jar in for the normal artifact
		def dist = new File(input.parentFile, input.name)
		dist.delete()
		output.renameTo(dist)
		logger.lifecycle("Artemis: obfuscated jar written to \${dist.name}")
	}
}

// 'gradlew build' produces an obfuscated jar; the plain output is replaced in
// place by obfuscateJar's doLast.
tasks.named('build').configure { finalizedBy 'obfuscateJar' }
tasks.named('assemble').configure { finalizedBy 'obfuscateJar' }
`
}

function proguardRules(project: ArtemisProject, mapping: ReturnType<typeof getMapping>): string {
  const pkg = `com.${project.meta.modId}`
  const entry = `${pkg}.${toPascalCase(project.meta.modId)}Mod`
  const o = mapping.obfuscation

  const reflectivePatterns = o.reflectiveClassPatterns.map((p) =>
    p.startsWith('**') ? `${pkg}${p.slice(2)}` : p
  )

  return `# ===================================================================
# proguard-rules.pro, generated by Artemis
# Name obfuscation with a stability keep-list for BTA / Fabric / halplibe.
#
# A Fabric mod CANNOT be fully name-mangled and still load: the loader finds
# entrypoints by name, Minecraft calls your overrides by name, halplibe builds
# entities reflectively, and registry IDs are string literals (untouched by
# obfuscation anyway). This config renames everything internal and keeps only
# the load-bearing symbols below.
# ===================================================================

# Rename only. Do NOT shrink or optimize. Shrinking dead-strips reflectively
# used members; optimization rewrites bytecode Mixin/loom can't follow.
-dontshrink
-dontoptimize
-dontpreverify
-verbose

# Attributes the loader, Mixin, and stack traces depend on.
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,Exceptions,SourceFile,LineNumberTable,RuntimeVisibleAnnotations,RuntimeVisibleParameterAnnotations,RuntimeInvisibleAnnotations,AnnotationDefault
-keepparameternames
# keep a fake source name so stack traces still map to line numbers
-renamesourcefileattribute SourceFile

# --- Fabric entrypoints (referenced by FQN in fabric.mod.json) ---
-keep class ${entry} {
	public <init>(...);
	public *;
}

# --- Mixins (classes + members referenced by the mixin config and ASM) ---
-keep @${o.mixinPackage}.Mixin class * { *; }
-keepclassmembers class * {
	@${o.mixinPackage}.** *;
}
-keepnames class * extends ${o.mixinPackage}.extensibility.IMixinConfigPlugin

# --- Reflectively constructed classes (entities, world features): keep the
#     class name and constructors so factories/networking resolve them. ---
${reflectivePatterns.map((p) => `-keep class ${p} {\n\t<init>(...);\n\tpublic *;\n}`).join('\n')}

# --- Enums: values()/valueOf are reflection entry points. ---
-keepclassmembers enum * {
	public static **[] values();
	public static ** valueOf(java.lang.String);
}

# --- The library surface we compile against but don't ship. Suppress the
#     "can't find referenced class" notes/warnings for those packages;
#     -libraryjars in build.gradle supplies them at obfuscation time. ---
${o.minecraftPackages.map((p) => `-dontwarn ${p}`).join('\n')}
-dontwarn ${o.mixinPackage}.**
-dontwarn ${o.fabricApiPackage}.**
-dontnote **

# If ProGuard reports a missing class for a dependency you added by hand,
# add another '-libraryjars' line for it in build.gradle, or a '-dontwarn'
# here. Never use '-ignorewarnings', which hides real breakage.
`
}

const DEV_MODS_DIR = 'run/mods'

async function fetchDevMods(
  devMods: BtaMapping['gradle']['devMods'],
  root: string,
  log: string[]
): Promise<string[]> {
  const spec = devMods?.modMenu
  if (!spec) return []
  const dir = join(root, ...DEV_MODS_DIR.split('/'))
  await mkdir(dir, { recursive: true })

  let version = spec.fallbackVersion
  let url: string | null = null
  try {
    const res = await fetch(`https://api.github.com/repos/${spec.githubRepo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'artemis-mod-maker' }
    })
    if (!res.ok) throw new Error(`GitHub API ${res.status}`)
    const data = (await res.json()) as {
      tag_name?: string
      assets?: { name: string; browser_download_url: string }[]
    }
    version = (data.tag_name ?? spec.fallbackVersion).replace(/^v/, '')
    const wanted = spec.assetPattern.replace('{version}', version)

    url = data.assets?.find((a) => a.name === wanted)?.browser_download_url ?? null
    if (!url) throw new Error(`release ${version} has no ${wanted}`)
  } catch (e) {
    log.push(`  test mods: could not reach GitHub (${e instanceof Error ? e.message : e})`)
  }

  const fileName = spec.assetPattern.replace('{version}', version)
  const dest = join(dir, fileName)
  if (existsSync(dest)) {
    log.push(`  test mods: ModMenu ${version} already downloaded`)
    return [fileName]
  }
  if (!url) {
    log.push('  test mods: skipping ModMenu, nothing cached and no download')
    return []
  }
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'artemis-mod-maker' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
    log.push(`  test mods: ModMenu ${version} downloaded`)
    return [fileName]
  } catch (e) {
    log.push(`  test mods: ModMenu download failed (${e instanceof Error ? e.message : e})`)
    return []
  }
}

async function resolveHalplibeVersion(
  h: {
    githubRepo: string
    mavenGroup: string
    artifact: string
    fallbackVersion: string
    mavenSuffix: string
  },
  repositories: string[],
  log: string[]
): Promise<string> {
  const published = await fetchPublishedVersions(h, repositories, log)
  if (published.length === 0) {

    log.push(`  halplibe: no maven reachable, using pinned fallback ${h.fallbackVersion}`)
    return `${h.fallbackVersion}${h.mavenSuffix}`
  }

  const tag = await fetchLatestTag(h.githubRepo)
  if (tag) {

    const matching = published.filter((v) => v.split('+')[0] === tag)
    if (matching.length > 0) {
      const picked = matching[matching.length - 1]
      log.push(`  halplibe: latest release is ${tag}, published as ${picked}`)
      return picked
    }
    log.push(`  halplibe: release ${tag} is not on maven yet, taking the newest that is`)
  }

  const picked = published[published.length - 1]
  log.push(`  halplibe: using ${picked}, the newest published`)
  return picked
}

async function fetchLatestTag(githubRepo: string): Promise<string> {
  try {
    const res = await fetch(`https://api.github.com/repos/${githubRepo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'artemis-mod-maker' }
    })
    if (!res.ok) throw new Error(`GitHub API ${res.status}`)
    const data = (await res.json()) as { tag_name?: string }
    return (data.tag_name ?? '').replace(/^v/, '')
  } catch {
    return ''
  }
}

async function fetchPublishedVersions(
  h: { mavenGroup: string; artifact: string },
  repositories: string[],
  log: string[]
): Promise<string[]> {
  const path = `${h.mavenGroup.replace(/\./g, '/')}/${h.artifact}/maven-metadata.xml`
  for (const repo of repositories) {
    const url = `${repo.replace(/\/+$/, '')}/${path}`
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'artemis-mod-maker' } })
      if (!res.ok) continue
      const xml = await res.text()
      const versions = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1].trim())
      if (versions.length > 0) return versions
    } catch (e) {
      log.push(`  halplibe: ${repo} did not answer (${e instanceof Error ? e.message : e})`)
    }
  }
  return []
}
