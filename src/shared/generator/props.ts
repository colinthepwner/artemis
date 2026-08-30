import { TOOL_KINDS, ARMOR_KINDS, type ToolKind, type ArmorKind } from './family'

export interface BlockProps {
  displayName: string
  material: string
  sound: string
  hardness: number
  resistance: number
  luminance: number
  tags: string[]
  textureMode: 'all' | 'topBottomSides' | 'perFace'

  drops: 'default' | 'self' | 'nothing' | 'item'

  dropItem: string

  dropCountMin: number
  dropCountMax: number

  harvestLevel: number

  creativeCategory: string
  notInCreativeMenu: boolean
}

export const BLOCK_DEFAULTS: BlockProps = {
  displayName: '',
  material: 'stone',
  sound: 'stone',
  hardness: 1.5,
  resistance: 6,
  luminance: 0,
  tags: ['mineableByPickaxe'],
  textureMode: 'all',
  drops: 'default',
  dropItem: '',
  dropCountMin: 1,
  dropCountMax: 1,
  harvestLevel: 0,
  creativeCategory: 'block',
  notInCreativeMenu: false
}

export interface LiquidProps {
  displayName: string
  materialKind: 'water' | 'lava'
  luminance: number
}

export const LIQUID_DEFAULTS: LiquidProps = {
  displayName: '',
  materialKind: 'water',
  luminance: 0
}

export interface BlockUseRule {

  target: string

  becomes: string

  drops: string

  dropCount: number
}

export interface ItemProps {
  displayName: string

  stackSize: number

  itemType?: 'material' | 'tool' | 'armor' | 'food'

  category: string

  healAmount: number

  eatTicks: number

  wolfMeat: boolean

  durability: number

  tags: string[]

  burnTime: number

  blockUses: BlockUseRule[]

  blockUseCost: number

  generateSet: boolean
  set: AnySetProps

  piece?: ToolKind | ArmorKind
}

export function itemTypeOf(p: Partial<ItemProps>): 'material' | 'tool' | 'armor' | 'food' {
  if (p.itemType) return p.itemType
  if (p.piece && (TOOL_KINDS as readonly string[]).includes(p.piece)) return 'tool'
  if (p.piece && (ARMOR_KINDS as readonly string[]).includes(p.piece)) return 'armor'
  return 'material'
}

export interface AnySetProps {
  tools: boolean
  armor: boolean
  durability: number
  efficiency: number
  miningLevel: number
  damage: number
  armorDurability: number

  totalProtection: number
  blastProtection: number
  fireProtection: number
}

export interface GearSetProps extends AnySetProps {
  displayName: string
}

export const ANYSET_DEFAULTS: AnySetProps = {
  tools: true,
  armor: true,
  durability: 512,
  efficiency: 8,
  miningLevel: 2,
  damage: 4,
  armorDurability: 600,
  totalProtection: 0.25,
  blastProtection: 0.3,
  fireProtection: 0.2
}

export const GEARSET_DEFAULTS: GearSetProps = {
  displayName: '',
  ...ANYSET_DEFAULTS
}

export const ITEM_DEFAULTS: ItemProps = {
  displayName: '',
  stackSize: 64,
  category: 'material',
  healAmount: 4,
  eatTicks: 32,
  wolfMeat: false,
  durability: 0,
  tags: [],
  burnTime: 0,
  blockUses: [],
  blockUseCost: 0,
  generateSet: false,
  set: ANYSET_DEFAULTS
}

export interface OreProps {
  displayName: string

  blockRef: string
  veinSize: number
  veinsPerChunk: number
  minY: number
  maxY: number

  biomes: string[]
}

export const ORE_DEFAULTS: OreProps = {
  displayName: '',
  blockRef: '',
  veinSize: 8,
  veinsPerChunk: 6,
  minY: 0,
  maxY: 48,
  biomes: []
}

export interface PlantProps {
  displayName: string
  luminance: number

  harvestLevel: number

  growsOn: string[]

  maxHeight: number

  shearsOnly: boolean

  drops: 'self' | 'nothing' | 'item'
  dropItem: string
  dropCountMin: number
  dropCountMax: number

  patchesPerChunk: number

  biomes: string[]
}

export const PLANT_DEFAULTS: PlantProps = {
  displayName: '',
  luminance: 0,
  harvestLevel: 0,
  growsOn: ['block:GRASS', 'block:DIRT'],
  maxHeight: 1,
  shearsOnly: false,
  drops: 'self',
  dropItem: '',
  dropCountMin: 1,
  dropCountMax: 1,
  patchesPerChunk: 0,
  biomes: []
}

export interface DimensionProps {
  displayName: string

  biomes: string[]

  portalFrame: string
}

export const DIMENSION_DEFAULTS: DimensionProps = {
  displayName: '',
  biomes: [],
  portalFrame: 'block:OBSIDIAN'
}

export interface BuildVariant {

  id: string

  name: string

  blocks: Record<string, string>
}

export interface TreeProps {
  displayName: string

  design: 'grown' | 'built'
  minHeight: number
  maxHeight: number

  logBlock: string
  leavesBlock: string

  variants: BuildVariant[]

  treesPerChunk: number

  biomes: string[]
}

export const TREE_DEFAULTS: TreeProps = {
  displayName: '',
  design: 'grown',
  minHeight: 4,
  maxHeight: 7,
  logBlock: 'block:LOG_OAK',
  leavesBlock: 'block:LEAVES_OAK',
  variants: [],
  treesPerChunk: 1,
  biomes: []
}

export interface StructureProps {
  displayName: string
  variants: BuildVariant[]

  placement: 'surface' | 'buried'

  oneInChunks: number

  minY: number
  maxY: number

  biomes: string[]
}

export const STRUCTURE_DEFAULTS: StructureProps = {
  displayName: '',
  variants: [],
  placement: 'surface',
  oneInChunks: 24,
  minY: 10,
  maxY: 40,
  biomes: []
}

export interface RecipeProps {
  displayName: string
  recipeType: 'shaped' | 'shapeless' | 'furnace'

  output: string
  outputCount: number

  grid: string[]

  inputs: string[]
}

export const RECIPE_DEFAULTS: RecipeProps = {
  displayName: '',
  recipeType: 'shaped',
  output: '',
  outputCount: 1,
  grid: ['', '', '', '', '', '', '', '', ''],
  inputs: []
}

export interface MobProps {
  displayName: string

  shape: 'humanoid' | 'quadruped'
  health: number
  moveSpeed: number
  hostile: boolean
  attackDamage: number
  dropItem: string
  dropCountMax: number

  spawnWeight: number

  spawnBiomes: string[]
}

export const MOB_DEFAULTS: MobProps = {
  displayName: '',
  shape: 'humanoid',
  health: 10,
  moveSpeed: 0.7,
  hostile: false,
  attackDamage: 2,
  dropItem: '',
  dropCountMax: 2,
  spawnWeight: 10,
  spawnBiomes: []
}

export interface BiomeProps {
  displayName: string

  temperature: number
  humidity: number

  variance: number

  generateInOverworld: boolean

  generationStyle: 'substitute' | 'climate'

  hostBiome: string

  rarity: number

  mapColor: string

  skyColor: string

  waterColor: string

  grassColor: string

  blockedWeathers: string[]

  vanillaTrees: boolean
  topBlock: string
  fillerBlock: string

}

export const BIOME_DEFAULTS: BiomeProps = {
  displayName: '',
  temperature: 0.7,
  humidity: 0.6,
  variance: 0.5,
  generateInOverworld: true,
  generationStyle: 'substitute',
  hostBiome: 'biome:OVERWORLD_FOREST',

  rarity: 0.5,
  mapColor: '5cb04a',
  skyColor: '',
  waterColor: '',
  grassColor: '',
  blockedWeathers: [],
  vanillaTrees: true,
  topBlock: 'block:GRASS',
  fillerBlock: 'block:DIRT'
}

export const KIND_DEFAULTS: Record<string, Record<string, unknown>> = {
  block: BLOCK_DEFAULTS as unknown as Record<string, unknown>,
  item: ITEM_DEFAULTS as unknown as Record<string, unknown>,
  gearset: GEARSET_DEFAULTS as unknown as Record<string, unknown>,
  liquid: LIQUID_DEFAULTS as unknown as Record<string, unknown>,
  ore: ORE_DEFAULTS as unknown as Record<string, unknown>,
  plant: PLANT_DEFAULTS as unknown as Record<string, unknown>,
  tree: TREE_DEFAULTS as unknown as Record<string, unknown>,
  structure: STRUCTURE_DEFAULTS as unknown as Record<string, unknown>,
  recipe: RECIPE_DEFAULTS as unknown as Record<string, unknown>,
  mob: MOB_DEFAULTS as unknown as Record<string, unknown>,
  biome: BIOME_DEFAULTS as unknown as Record<string, unknown>,
  dimension: DIMENSION_DEFAULTS as unknown as Record<string, unknown>
}
