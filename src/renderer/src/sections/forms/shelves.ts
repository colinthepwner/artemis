import type { SelectOption } from '@/components/ui/controls'

interface Shelf extends SelectOption {

  block?: boolean

  item?: boolean
}

const SHELVES: Shelf[] = [
  { value: 'natural', label: 'Natural', block: true },
  { value: 'stone', label: 'Stone', block: true },
  { value: 'ore', label: 'Ore', block: true },
  { value: 'redstone', label: 'Redstone', block: true },
  { value: 'logs', label: 'Logs', block: true },
  { value: 'workbenches', label: 'Workbenches', block: true },
  { value: 'wood', label: 'Wood', block: true },
  { value: 'organic', label: 'Organic', block: true },
  { value: 'tool', label: 'Tools' },
  { value: 'armor', label: 'Armor' },
  { value: 'food', label: 'Food', item: true },
  { value: 'oreDrop', label: 'Ore Products' },
  { value: 'material', label: 'Materials', item: true },
  { value: 'basics', label: 'Basics', block: true },
  { value: 'drop', label: 'Drops', item: true },
  { value: 'storage', label: 'Storage', block: true },
  { value: 'block', label: 'Placeables', block: true },
  { value: 'misc', label: 'Miscellaneous', block: true, item: true }
]

export const BLOCK_SHELVES: SelectOption[] = SHELVES.filter((s) => s.block).map(strip)

export const ITEM_SHELVES: SelectOption[] = SHELVES.filter((s) => s.item).map(strip)

export const GROUP_SHELVES: SelectOption[] = [
  { value: '', label: 'Organize only' },
  ...SHELVES.map(strip)
]

export function shelfLabel(key: string): string {
  return SHELVES.find((s) => s.value === key)?.label ?? 'Organize only'
}

function strip(s: Shelf): SelectOption {
  return { value: s.value, label: s.label }
}
