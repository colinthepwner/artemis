import type { ComponentType } from 'react'
import type { ArtemisElement, ElementKind } from '@shared/project'
import { BlockForm } from './BlockForm'
import { OreForm } from './OreForm'
import { LiquidForm } from './LiquidForm'
import { PlantForm } from './PlantForm'
import { TreeForm } from './TreeForm'
import { RecipeForm } from './RecipeForm'
import { MobForm } from './MobForm'
import { BiomeForm } from './BiomeForm'

export interface ElementFormProps {
  kind: ElementKind

  element: ArtemisElement | null
  onClose: () => void
}

export const KIND_LABELS: Record<ElementKind, { label: string; labelPlural: string }> = {
  block: { label: 'Block', labelPlural: 'Blocks' },
  liquid: { label: 'Liquid', labelPlural: 'Liquids' },
  ore: { label: 'Ore', labelPlural: 'Ores' },
  plant: { label: 'Plant', labelPlural: 'Plants' },
  tree: { label: 'Tree', labelPlural: 'Trees' },
  recipe: { label: 'Recipe', labelPlural: 'Recipes' },
  mob: { label: 'Mob', labelPlural: 'Mobs' },
  biome: { label: 'Biome', labelPlural: 'Biomes' }
}

export const FORM_REGISTRY: Partial<Record<ElementKind, ComponentType<ElementFormProps>>> = {
  block: BlockForm,
  ore: OreForm,
  liquid: LiquidForm,
  plant: PlantForm,
  tree: TreeForm,
  recipe: RecipeForm,
  mob: MobForm,
  biome: BiomeForm
}
