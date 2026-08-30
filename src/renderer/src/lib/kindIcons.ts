import {
  Box,
  Castle,
  Diamond,
  Droplets,
  Gem,
  Swords,
  Globe,
  Sprout,
  TreePine,
  UtensilsCrossed,
  Rabbit,
  Mountain,
  type LucideIcon
} from 'lucide-react'
import type { ElementKind } from '@shared/project'

export const KIND_ICONS: Record<ElementKind, LucideIcon> = {
  block: Box,
  item: Diamond,
  gearset: Swords,
  liquid: Droplets,
  ore: Gem,
  plant: Sprout,
  tree: TreePine,
  structure: Castle,
  recipe: UtensilsCrossed,
  mob: Rabbit,
  biome: Mountain,
  dimension: Globe
}

export const KIND_COLORS: Record<ElementKind, string> = {
  block: '#d5a868',
  item: '#6fc7e8',
  gearset: '#c9a227',
  liquid: '#6f8fee',
  ore: '#e57fd2',
  plant: '#82ca70',
  tree: '#3fa273',

  structure: '#a8b4c6',
  recipe: '#e5c05a',
  mob: '#ea8070',
  biome: '#63c6b0',
  dimension: '#b48af2'
}
