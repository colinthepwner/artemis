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

  harvestLevel: { put: string; import: string }

  registration: {
    registerMod: string
    initNamespace: string
    langDir: string
    tileLangKey: string
    itemLangKey: string
    biomeLangKey: string
  }
  blockBuilder: {
    decl: string
    build: string
    methods: Record<string, string>
    logicPlain: string
    logicFlower: string
    logicCustom: string
  }
  itemBuilder: { decl: string; build: string; methods: Record<string, string> }
  toolMaterial: { decl: string; tools: Record<string, string>; standalone: Record<string, string> }
  armorMaterial: { decl: string; pieces: Record<string, string>; standalone: Record<string, string> }

  models: Record<string, string>

  drops: {
    logicClass: string
    bodyNothing: string
    bodyItem: string

    bodyShears: string

    method: string
  }

  liquid: Record<string, string>

  plant: { logicClass: string; growth: string }

  creative: { call: string; categories: Record<string, string> }
  recipes: Record<string, string>

  api: {
    classes: Record<string, { doc: string; members: string[] }>
    staticFields: Record<string, string>
    snippets: { label: string; detail: string; body: string }[]
  }

  oreGen: {
    mixinClass: string
    vein: string
    tree: string

    structureSurface: string
    structureBuried: string
    plantPatch: string
    mixinsJson: string

    mixinPackage: string
  }
  biome: {
    decl: string
    classTemplate: string
    spawnCreature: string
    spawnMonster: string

    skyOverride: string

    treeOverrideMulti: string
    treeOverrideCase: string
    treeOverrideNone: string

    weathers: Record<string, string>
    blockedWeathersChain: string

    waterColorMixinClass: string
    waterColorCase: string

    rainTintMixinClass: string
    rainTintCase: string

    grassColorMixinClass: string
    grassColorCase: string

    rangeMixinClass: string
    range: string

    rangeBand: string
    rangeClimate: string

    rangeClimateBand: string

    climateRange: { minTemperature: number; maxTemperature: number; window: number }
  }

  dimension: {
    worldTypeClass: string
    providerSingle: string
    providerMulti: string
    providerClass: string
    typeDecl: string
    idDecl: string
    dimDecl: string
    attachCall: string
    registerCall: string
    classTemplate: string
    portalLogic: string

    fireMixinClass: string

    fireCase: string

    reservedFrames: string[]
    serverMixinClass: string
    portalModelJson: string
    portalColorIds: string[]
  }
  tree: { featureClass: string }

  structure: {
    featureClass: string
    caseLine: string
    variantMethod: string
    placeLine: string

    placeLineIfAir: string

    treeGuard: string
  }
  mob: Record<string, string> & {

    shapes: Record<
      string,
      {
        renderer: string
        geometry: string
        shadowSize: number
        width: number
        height: number
      }
    >
  }
  entity: {
    decl: string

    spawnHelper: string
    spawnCall: string
    spawnAllCall: string
  }
  entrypoint: {
    interfaces: string[]

    listen: string

    clientGuard: string

    events: Record<string, string>
  }
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

    clientJarVersion: string
    pluginRepositories: string[]
    repositories: string[]
    halplibe: {
      githubRepo: string
      mavenGroup: string
      artifact: string
      fallbackVersion: string

      mavenSuffix: string
    }

    devMods?: {
      modMenu?: { githubRepo: string; fallbackVersion: string; assetPattern: string }
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

export function compareBtaVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export const SUPPORTED_BTA: string[] = Object.keys(MAPPINGS).sort(compareBtaVersions)

export function getMapping(btaVersion: string): BtaMapping {
  const m = MAPPINGS[btaVersion]
  if (!m) {
    throw new Error(
      `No mapping for BTA ${btaVersion}. Available: ${Object.keys(MAPPINGS).join(', ')}`
    )
  }
  return m
}
