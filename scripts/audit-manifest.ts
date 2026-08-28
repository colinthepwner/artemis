import { getMapping, LATEST_BTA } from '../src/shared/generator/mappings'
import { harness } from './_harness'

const audit = harness()
const check = audit.check
let skipped = 0

const skip = (name: string, why: string): void => {
  skipped++
  console.log(`  SKIP ${name}: ${why}`)
}

const mapping = getMapping(LATEST_BTA)
const g = mapping.gradle

const MAVEN_CENTRAL = 'https://repo1.maven.org/maven2'
const PLUGIN_PORTAL = 'https://plugins.gradle.org/m2'

const DEPENDENCY_REPOS = [MAVEN_CENTRAL, ...g.repositories]

const PLUGIN_REPOS = [MAVEN_CENTRAL, PLUGIN_PORTAL, ...g.pluginRepositories]

type Verdict = 'yes' | 'no' | 'unknown'

const UA = { 'User-Agent': 'artemis-audit' }

async function status(url: string): Promise<number | null> {
  try {
    const head = await fetch(url, { method: 'HEAD', headers: UA })
    if (head.status !== 405 && head.status !== 501) return head.status
  } catch {
    return null
  }
  try {
    const res = await fetch(url, { headers: UA })
    await res.body?.cancel()
    return res.status
  } catch {
    return null
  }
}

async function text(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: UA })
    if (!res.ok) {
      await res.body?.cancel()
      return null
    }
    return await res.text()
  } catch {
    return null
  }
}

async function publishedVersions(repo: string, group: string, artifact: string): Promise<string[] | null> {
  const root = repo.replace(/\/+$/, '')
  const xml = await text(`${root}/${group.replace(/\./g, '/')}/${artifact}/maven-metadata.xml`)
  if (xml === null) return null
  const versions = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1].trim())
  return versions.length > 0 ? versions : null
}

async function versionExists(
  repo: string,
  group: string,
  artifact: string,
  version: string
): Promise<Verdict> {
  const root = repo.replace(/\/+$/, '')
  const dir = `${root}/${group.replace(/\./g, '/')}/${artifact}`
  const file = version.endsWith('-SNAPSHOT') ? 'maven-metadata.xml' : `${artifact}-${version}.pom`

  for (const segment of [version, encodeURIComponent(version)]) {
    const code = await status(`${dir}/${segment}/${file}`)
    if (code === null) return 'unknown'
    if (code >= 200 && code < 300) return 'yes'
    if (code !== 404) return 'unknown'
    if (segment === encodeURIComponent(version)) break
  }
  return 'no'
}

async function resolves(
  repos: string[],
  group: string,
  artifact: string,
  version: string
): Promise<{ verdict: Verdict; detail: string }> {
  let answered = 0
  let newest = ''
  for (const repo of repos) {
    const listed = await publishedVersions(repo, group, artifact)
    if (listed !== null) {
      answered++
      if (listed.includes(version)) return { verdict: 'yes', detail: `${repo} lists it` }
      newest = listed[listed.length - 1]
    }

    const direct = await versionExists(repo, group, artifact, version)
    if (direct === 'yes') return { verdict: 'yes', detail: `${repo} serves it` }
    if (direct !== 'unknown') answered++
  }
  if (answered === 0) return { verdict: 'unknown', detail: 'no repository answered' }
  return {
    verdict: 'no',
    detail: `not in ${repos.length} repositories${newest ? `, newest published is ${newest}` : ''}`
  }
}

async function coordinate(
  label: string,
  repos: string[],
  group: string,
  artifact: string,
  version: string
): Promise<void> {
  let { verdict, detail } = await resolves(repos, group, artifact, version)

  if (verdict === 'no') {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    const again = await resolves(repos, group, artifact, version)
    verdict = again.verdict
    detail = `${again.detail}; asked twice, the first answer was: ${detail}`
  }
  if (verdict === 'unknown') skip(`${label} ${version}`, 'no repository answered')
  else check(`${label} ${version} still resolves`, verdict === 'yes', detail)
}

const pluginMarker = (id: string): { group: string; artifact: string } => ({
  group: id,
  artifact: `${id}.gradle.plugin`
})

function pinsInMapping(): string[] {
  const found: string[] = []
  const walk = (obj: Record<string, unknown>, prefix: string): void => {
    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith('$')) continue
      const path = prefix ? `${prefix}.${key}` : key
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        walk(value as Record<string, unknown>, path)
        continue
      }

      if (/(Version|Url|Hash|Pattern|Suffix)$/.test(key)) found.push(path)
    }
  }
  walk(g as unknown as Record<string, unknown>, '')
  walk(mapping.obfuscation as unknown as Record<string, unknown>, 'obfuscation')
  return found.sort()
}

const PROBED = [
  'clientJarHash',
  'clientJarVersion',
  'devMods.modMenu.assetPattern',
  'devMods.modMenu.fallbackVersion',
  'fabricLoaderVersion',
  'foojayResolverVersion',
  'gradleVersion',
  'halplibe.fallbackVersion',
  'halplibe.mavenSuffix',
  'loomVersion',
  'lwjglVersion',
  'manifestUrl',
  'obfuscation.proguardVersion',
  'slf4jVersion'
]

const NOT_OUTWARD: Record<string, string> = {

  javaVersion: 'a JDK major version, provisioned by foojay: nothing to resolve'
}

function theMirror(): void {
  console.log('the mirror: every pin is either probed or excused')
  const pins = pinsInMapping()
  const covered = new Set([...PROBED, ...Object.keys(NOT_OUTWARD)])
  const unprobed = pins.filter((p) => !covered.has(p))
  check(
    `every pinned constant in the mapping is accounted for (${pins.length} pins)`,
    unprobed.length === 0,
    unprobed.length > 0
      ? `${unprobed.join(', ')} names something outside this repository and nothing here asks whether it still exists.\n       Add a probe, or add it to NOT_OUTWARD with the reason it cannot be asked.`
      : undefined
  )

  const stale = [...covered].filter((c) => !pins.includes(c))
  check(
    'no probe names a pin the mapping no longer has',
    stale.length === 0,
    stale.length > 0 ? stale.join(', ') : undefined
  )
}

function theMappingAgainstItself(): void {
  console.log('\nthe mapping against itself')
  const expected = `https://downloads.betterthanadventure.net/bta-client/${g.btaChannel}/v${mapping.btaVersion}/manifest.json`
  check(
    'the manifest URL agrees with btaChannel and btaVersion',
    g.manifestUrl === expected,
    `mapping has ${g.manifestUrl}\n       channel "${g.btaChannel}" and version "${mapping.btaVersion}" make ${expected}`
  )
  check(
    'the pinned client jar hash is a sha1',
    /^[0-9a-f]{40}$/.test(g.clientJarHash),
    g.clientJarHash
  )
  check(
    'the halplibe fallback carries no suffix of its own',
    !g.halplibe.fallbackVersion.includes('+'),
    `fallbackVersion ${g.halplibe.fallbackVersion} already has a suffix, and mavenSuffix ${g.halplibe.mavenSuffix} is appended to it`
  )
}

async function theControl(): Promise<void> {
  console.log('\nthe control (a version that cannot exist)')
  const nowhere = await resolves(
    [MAVEN_CENTRAL],
    'org.slf4j',
    'slf4j-api',
    '0.0.0-artemis-audit-no-such-version'
  )
  if (nowhere.verdict === 'unknown') {
    skip('the prober can still say no', 'maven central did not answer, so nothing below is verified')
  } else {
    check(
      'a version that cannot exist is reported missing',
      nowhere.verdict === 'no',
      `the prober answered "${nowhere.verdict}" for a coordinate nobody has ever published, so every pass below is worthless`
    )
  }
}

async function theBuild(): Promise<void> {
  console.log('\nthe build the exporter writes')

  const url = `https://services.gradle.org/distributions/gradle-${g.gradleVersion}-bin.zip`
  const code = await status(url)
  if (code === null) skip(`gradle ${g.gradleVersion}`, 'services.gradle.org did not answer')
  else
    check(
      `gradle ${g.gradleVersion} is still downloadable`,
      code >= 200 && code < 400,
      `${url} answered ${code}`
    )

  const loom = pluginMarker(g.loomPlugin)
  await coordinate(
    `the loom plugin ${g.loomPlugin}`,
    PLUGIN_REPOS,
    loom.group,
    loom.artifact,
    g.loomVersion
  )

  const foojay = pluginMarker('org.gradle.toolchains.foojay-resolver-convention')
  await coordinate(
    'the foojay resolver',
    PLUGIN_REPOS,
    foojay.group,
    foojay.artifact,
    g.foojayResolverVersion
  )

  await coordinate(
    'the fabric loader',
    DEPENDENCY_REPOS,
    g.fabricLoaderGroup,
    'fabric-loader',
    g.fabricLoaderVersion
  )
  await coordinate('slf4j', DEPENDENCY_REPOS, 'org.slf4j', 'slf4j-api', g.slf4jVersion)
  await coordinate('the LWJGL bom', DEPENDENCY_REPOS, 'org.lwjgl', 'lwjgl-bom', g.lwjglVersion)
  await coordinate(
    'proguard',
    DEPENDENCY_REPOS,
    'com.guardsquare',
    'proguard-gradle',
    mapping.obfuscation.proguardVersion
  )

  await coordinate(
    'the halplibe offline fallback',
    DEPENDENCY_REPOS,
    g.halplibe.mavenGroup,
    g.halplibe.artifact,
    `${g.halplibe.fallbackVersion}${g.halplibe.mavenSuffix}`
  )
}

async function theGame(): Promise<void> {
  console.log('\nthe game the build runs against')

  const body = await text(g.manifestUrl)
  if (body === null) skip('the BTA manifest', `${g.manifestUrl} did not answer`)
  else {
    let manifest: { id?: string; downloads?: { client?: { sha1?: string } } } | null = null
    try {
      manifest = JSON.parse(body)
    } catch {
      manifest = null
    }
    check('the BTA manifest is still served, and is JSON', manifest !== null)
    if (manifest) {

      check(
        `the manifest is for BTA ${mapping.btaVersion}`,
        manifest.id === `v${mapping.btaVersion}`,
        `manifest id is ${manifest.id}`
      )
    }
  }
}

async function theClientJar(): Promise<void> {
  const ivy = `https://piston-data.mojang.com/v1/objects/${g.clientJarHash}/client.jar`
  const code = await status(ivy)
  if (code === null) skip('the vanilla client jar', 'piston-data.mojang.com did not answer')
  else
    check(
      'the vanilla client jar is still served at its pinned hash',
      code >= 200 && code < 300,
      `${ivy} answered ${code}`
    )

  const list = await text('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json')
  if (list === null) skip('the client jar is the right version', 'Mojang did not answer')
  else {
    const versions = (JSON.parse(list) as { versions: { id: string; url: string }[] }).versions
    const entry = versions.find((v) => v.id === g.clientJarVersion)
    if (!entry) {
      check(
        `Mojang still lists ${g.clientJarVersion}`,
        false,
        'the version the mapping says the pinned jar belongs to is not in the version manifest'
      )
    } else {
      const detail = await text(entry.url)
      if (detail === null) skip('the client jar is the right version', 'Mojang did not answer')
      else {
        const sha = (JSON.parse(detail) as { downloads: { client: { sha1: string } } }).downloads
          .client.sha1
        check(
          `the pinned hash is ${g.clientJarVersion}'s client, as Mojang has it`,
          sha === g.clientJarHash,
          `Mojang says ${g.clientJarVersion} is ${sha}, the mapping pins ${g.clientJarHash}`
        )
      }
    }
  }
}

async function theTestClientMods(): Promise<void> {
  const spec = g.devMods?.modMenu
  if (!spec) skip('the test client mods', 'the mapping declares none')
  else {

    const url = `https://api.github.com/repos/${spec.githubRepo}/releases/latest`
    let body: string | null = null
    let why = 'GitHub did not answer'
    try {
      const res = await fetch(url, { headers: { ...UA, Accept: 'application/vnd.github+json' } })
      if (res.ok) body = await res.text()
      else {
        await res.body?.cancel()
        why =
          res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0'
            ? 'this address has spent its hourly GitHub allowance, so nothing could be asked'
            : `GitHub answered ${res.status}`
      }
    } catch {
      body = null
    }
    if (body === null) skip('ModMenu', why)
    else {
      const release = JSON.parse(body) as { tag_name?: string; assets?: { name: string }[] }
      const version = (release.tag_name ?? spec.fallbackVersion).replace(/^v/, '')
      const names = (release.assets ?? []).map((a) => a.name)

      check(
        `the ModMenu asset pattern still names a real asset (${version})`,
        names.includes(spec.assetPattern.replace('{version}', version)),
        `pattern makes ${spec.assetPattern.replace('{version}', version)}, release ${version} carries ${names.join(', ') || 'nothing'}`
      )

      if (spec.fallbackVersion !== version)
        console.log(
          `  note: the pinned ModMenu fallback is ${spec.fallbackVersion} and the latest release is ${version}`
        )
    }
  }
}

async function main(): Promise<void> {

  theMirror()
  theMappingAgainstItself()

  await theControl()
  await theBuild()
  await theGame()
  await theClientJar()
  await theTestClientMods()

  console.log(`\n${audit.passes} checks passed, ${audit.failures} failed, ${skipped} skipped`)
  if (skipped > 0)
    console.log(
      `${skipped} coordinate${skipped === 1 ? ' was' : 's were'} NOT verified. Offline, this harness proves nothing.`
    )
  console.log(audit.failures === 0 ? 'MANIFEST PASS' : 'MANIFEST: see above')
  if (audit.failures > 0) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
