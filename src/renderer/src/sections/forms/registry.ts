import type { ComponentType } from 'react'
import type { ArtemisElement, ElementKind } from '@shared/project'
import { BlockForm } from './BlockForm'
import { DimensionForm } from './DimensionForm'
import { ItemForm } from './ItemForm'
import { OreForm } from './OreForm'
import { LiquidForm } from './LiquidForm'
import { PlantForm } from './PlantForm'
import { TreeForm } from './TreeForm'
import { StructureForm } from './StructureForm'
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
  item: { label: 'Item', labelPlural: 'Items' },
  liquid: { label: 'Liquid', labelPlural: 'Liquids' },
  ore: { label: 'Ore Veins', labelPlural: 'Ore Veins' },
  plant: { label: 'Plant', labelPlural: 'Plants' },
  tree: { label: 'Tree', labelPlural: 'Trees' },
  structure: { label: 'Structure', labelPlural: 'Structures' },
  recipe: { label: 'Recipe', labelPlural: 'Recipes' },
  mob: { label: 'Mob', labelPlural: 'Mobs' },
  biome: { label: 'Biome', labelPlural: 'Biomes' },
  dimension: { label: 'Dimension', labelPlural: 'Dimensions' }
}

export const FORM_REGISTRY: Record<ElementKind, ComponentType<ElementFormProps>> = {
  block: BlockForm,
  item: ItemForm,
  ore: OreForm,
  liquid: LiquidForm,
  plant: PlantForm,
  tree: TreeForm,
  structure: StructureForm,
  recipe: RecipeForm,
  mob: MobForm,
  biome: BiomeForm,
  dimension: DimensionForm
}
