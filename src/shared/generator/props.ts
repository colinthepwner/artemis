export interface BlockProps {
  displayName: string
  material: string
  sound: string
  hardness: number
  resistance: number
  luminance: number
  tags: string[]
  textureMode: 'all' | 'topBottomSides'
  drops: 'default' | 'self' | 'nothing'
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

export interface OreProps extends BlockProps {

  dropMode: 'block' | 'item'
  dropItemName: string
  veinSize: number
  veinsPerChunk: number
  minY: number
  maxY: number
  generateSet: boolean
  set: AnySetProps
}

export const ORE_DEFAULTS: OreProps = {
  ...BLOCK_DEFAULTS,
  hardness: 3,
  resistance: 5,
  dropMode: 'item',
  dropItemName: '',
  veinSize: 8,
  veinsPerChunk: 6,
  minY: 0,
  maxY: 48,
  generateSet: false,
  set: ANYSET_DEFAULTS
}

export interface PlantProps {
  displayName: string
  plantType: 'flower' | 'shrub'
  luminance: number
}

export const PLANT_DEFAULTS: PlantProps = { displayName: '', plantType: 'flower', luminance: 0 }

export interface TreeProps {
  displayName: string
  minHeight: number
  maxHeight: number

  logBlock: string
  leavesBlock: string
}

export const TREE_DEFAULTS: TreeProps = {
  displayName: '',
  minHeight: 4,
  maxHeight: 7,
  logBlock: 'block:LOG_OAK',
  leavesBlock: 'block:LEAVES_OAK'
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
  health: number
  moveSpeed: number
  hostile: boolean
  attackDamage: number
  dropItem: string
  dropCountMax: number
  texturePath: string
}

export const MOB_DEFAULTS: MobProps = {
  displayName: '',
  health: 10,
  moveSpeed: 0.7,
  hostile: false,
  attackDamage: 2,
  dropItem: '',
  dropCountMax: 2,
  texturePath: ''
}

export interface BiomeProps {
  displayName: string
  temperature: number
  humidity: number
  variance: number
  grassColor: string
  foliageColor: string
  topBlock: string
  fillerBlock: string
  treeDensity: number
  spawns: { entity: string; weight: number }[]
}

export const BIOME_DEFAULTS: BiomeProps = {
  displayName: '',
  temperature: 0.6,
  humidity: 0.5,
  variance: 0.1,
  grassColor: '5cb04a',
  foliageColor: '48a03a',
  topBlock: 'grass',
  fillerBlock: 'dirt',
  treeDensity: 4,
  spawns: []
}

export const KIND_DEFAULTS: Record<string, Record<string, unknown>> = {
  block: BLOCK_DEFAULTS as unknown as Record<string, unknown>,
  liquid: LIQUID_DEFAULTS as unknown as Record<string, unknown>,
  ore: ORE_DEFAULTS as unknown as Record<string, unknown>,
  plant: PLANT_DEFAULTS as unknown as Record<string, unknown>,
  tree: TREE_DEFAULTS as unknown as Record<string, unknown>,
  recipe: RECIPE_DEFAULTS as unknown as Record<string, unknown>,
  mob: MOB_DEFAULTS as unknown as Record<string, unknown>,
  biome: BIOME_DEFAULTS as unknown as Record<string, unknown>
}
