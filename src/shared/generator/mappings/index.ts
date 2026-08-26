import bta801 from './bta-8.0.1.json'

export interface BtaMapping {
  id: string
  btaVersion: string
  displayName: string
  imports: Record<string, string>
  idRanges: Record<string, { start: number }>
  materials: Record<string, string>
  sounds: Record<string, string>
  blockTags: Record<string, string>
  blockBuilder: { decl: string; build: string; methods: Record<string, string> }
  itemBuilder: { decl: string; build: string; methods: Record<string, string> }
  toolMaterial: { decl: string; tools: Record<string, string> }
  armorMaterial: { decl: string; pieces: Record<string, string> }
  recipes: Record<string, string>

  api: {
    classes: Record<string, { doc: string; members: string[] }>
    staticFields: Record<string, string>
    snippets: { label: string; detail: string; body: string }[]
  }

  oreGen: { mixinClass: string; vein: string; tree: string; mixinsJson: string }
  biome: { decl: string; methods: Record<string, string>; attach: string }
  tree: { featureClass: string }
  mob: { classTemplate: string; hostileBody: string; dropLine: string }
  entity: { decl: string; mobClassExtends: string }
  entrypoint: { interfaces: string[] }
  fabricModJson: Record<string, unknown>
  gradle: {
    javaVersion: number

    gradleVersion: string
    loomPlugin: string
    loomVersion: string
    fabricLoaderGroup: string
    fabricLoaderVersion: string
    btaChannel: string

    manifestUrl: string
    foojayResolverVersion: string
    slf4jVersion: string
    lwjglVersion: string

    clientJarHash: string
    pluginRepositories: string[]
    repositories: string[]
    halplibe: {
      githubRepo: string
      mavenGroup: string
      artifact: string
      fallbackVersion: string

      mavenSuffix: string
    }
  }
  obfuscation: {
    proguardVersion: string
    mixinPackage: string
    fabricApiPackage: string
    reflectiveClassPatterns: string[]
    minecraftPackages: string[]
  }
}

const MAPPINGS: Record<string, BtaMapping> = {
  '8.0.1': bta801 as unknown as BtaMapping
}

export const LATEST_BTA = '8.0.1'

export function getMapping(btaVersion: string): BtaMapping {
  const m = MAPPINGS[btaVersion]
  if (!m) {
    throw new Error(
      `No mapping for BTA ${btaVersion}. Available: ${Object.keys(MAPPINGS).join(', ')}`
    )
  }
  return m
}
