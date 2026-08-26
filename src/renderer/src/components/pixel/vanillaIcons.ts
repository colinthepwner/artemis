import {
  Axe,
  Box,
  Circle,
  Droplets,
  Flame,
  Gem,
  Hammer,
  Layers,
  Leaf,
  Package,
  Pickaxe,
  Shield,
  Shirt,
  Sparkles,
  Sprout,
  Squircle,
  Swords,
  TreePine,
  Utensils,
  type LucideIcon
} from 'lucide-react'

const RULES: { match: RegExp; icon: LucideIcon }[] = [
  { match: /^ORE_|^RAW_|^ORE_RAW/, icon: Gem },
  { match: /^TOOL_SWORD|SWORD/, icon: Swords },
  { match: /^TOOL_PICKAXE|PICKAXE/, icon: Pickaxe },
  { match: /^TOOL_AXE|_AXE$/, icon: Axe },
  { match: /^TOOL_|^HANDCANNON|^WAND_/, icon: Hammer },
  { match: /^ARMOR_HELMET|HELMET/, icon: Shield },
  { match: /^ARMOR_/, icon: Shirt },
  { match: /^INGOT_|^NUGGET_|^BLOCK_(IRON|GOLD|STEEL|DIAMOND|COAL|LAPIS)/, icon: Layers },
  { match: /^DIAMOND$|^OLIVINE$|^QUARTZ$|^RUBYGLASS|GEM/, icon: Gem },
  { match: /^FOOD_|^CAKE|^DOUGH|^WHEAT|^BREAD/, icon: Utensils },
  { match: /^LOG_|^PLANKS_|^BOOKSHELF|WOOD/, icon: TreePine },
  { match: /^LEAVES_|^SAPLING_/, icon: Leaf },
  { match: /^TALLGRASS|^FLOWER|^MUSHROOM|^CACTUS|^SPINIFEX|^ALGAE|^DEADBUSH|^SEEDS_|^CROPS_/, icon: Sprout },
  { match: /^WATER|^LAVA|^BUCKET_|^ICE$|^SNOW/, icon: Droplets },
  { match: /^TORCH|^FIRE|^LANTERN|^GLOWSTONE|^MAGMA|^EMBER|^BRIMSTONE/, icon: Flame },
  { match: /^GLASS|^RUBYGLASS/, icon: Squircle },
  { match: /^DUST_|^GUNPOWDER|^SUGAR|^FLINT|^COAL$|^CLAY$/, icon: Circle },
  { match: /^RECORD_|^PAINTING|^FLAG|^STATUE_|^JAR_/, icon: Sparkles }
]

export function vanillaIcon(field: string, kind: 'block' | 'item'): LucideIcon {
  for (const rule of RULES) if (rule.match.test(field)) return rule.icon
  return kind === 'block' ? Box : Package
}
