import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles, Wand2 } from 'lucide-react'
import type { ArtemisElement } from '@shared/project'
import { useAppStore } from '@/store/appStore'
import type { ElementFormProps } from './registry'
import { FormShell, TextureStrip, usePropEditor, type ReviewCheck, type WizardStep } from './FormShell'
import { Field, NumberInput, Select, Switch, SwitchList } from '@/components/ui/controls'
import { ITEM_DEFAULTS, itemTypeOf, type ItemProps, type AnySetProps } from '@shared/generator/props'
import { useProjectStore } from '@/store/projectStore'
import { kitFamily, TOOL_KINDS, ARMOR_KINDS } from '@shared/generator/family'
import { elementRegistryEntries } from '@shared/generator/registry'
import { getMapping } from '@shared/generator/mappings'
import { titleCase } from '@shared/generator/templates/block'
import {
  DEFAULT_KIT_ACCENT,
  generateKitTextures,
  suggestKitAccent
} from '@/components/pixel/kitGenerator'
import { BlockUsesFields } from './BlockUsesFields'

const CATEGORY_OPTIONS = [
  { value: 'material', label: 'Materials' },
  { value: 'drop', label: 'Drops' },
  { value: 'food', label: 'Food' },
  { value: 'misc', label: 'Miscellaneous' }
]

export function ItemForm({ element, onClose }: ElementFormProps): JSX.Element | null {
  if (!element) return null
  return <ItemFormInner element={element} onClose={onClose} />
}

function ItemFormInner({
  element,
  onClose
}: {
  element: NonNullable<ElementFormProps['element']>
  onClose: () => void
}): JSX.Element {
  const [p, patch] = usePropEditor<ItemProps>(element, ITEM_DEFAULTS)
  const set: AnySetProps = { ...ITEM_DEFAULTS.set, ...p.set }
  const patchSet = <K extends keyof AnySetProps>(key: K, value: AnySetProps[K]): void =>
    patch('set', { ...set, [key]: value })

  const targetBta = useProjectStore((s) => s.project?.meta.targetBta ?? '8.0.1')
  const mapping = getMapping(targetBta)
  const itemTagOptions = useMemo(
    () =>
      Object.keys(mapping.itemTags)
        .filter((k) => !k.startsWith('$'))
        .map((k) => ({ value: k, label: titleCase(k.replace(/([A-Z])/g, '_$1').toLowerCase()) })),
    [mapping]
  )

  const kindOfItem = itemTypeOf(p)
  const isFood = kindOfItem === 'food'
  const isPiece = Boolean(p.piece)
  const pieceIsTool = isPiece && (TOOL_KINDS as readonly string[]).includes(p.piece as string)

  const steps: WizardStep[] = [
    {
      id: 'paint',
      title: 'Texture',
      desc: 'Its icon in the inventory and in hand.',
      content: <TextureStrip element={element} />
    },
    isPiece
      ? {
          id: 'stats',
          title: pieceIsTool ? 'Tool Stats' : 'Armor Stats',
          desc: `The numbers this ${p.piece} is built with.`,
          content: (
            <>
              <p className="text-2xs leading-relaxed text-mist-600">
                {p.itemType
                  ? 'One piece with numbers of its own, rather than one of nine cut from the same set. Nothing else in the mod changes them.'
                  : 'This started as part of a gear set and became its own item when you edited it. It keeps its own numbers now, and nothing else in the mod changes them.'}
              </p>
              {

}
              {p.itemType && (
                <Field label={pieceIsTool ? 'Tool' : 'Piece'}>
                  <Select
                    value={p.piece ?? (pieceIsTool ? 'pickaxe' : 'helmet')}
                    onChange={(v) => patch('piece', v as ItemProps['piece'])}
                    options={(pieceIsTool ? TOOL_KINDS : ARMOR_KINDS).map((k) => ({
                      value: k,
                      label: titleCase(k)
                    }))}
                  />
                </Field>
              )}
              {pieceIsTool ? (
                <ToolStatFields set={set} patchSet={patchSet} />
              ) : (
                <ArmorStatFields set={set} patchSet={patchSet} />
              )}
            </>
          )
        }
      : {
          id: 'behavior',
          title: 'Behavior',
          desc: 'How it stacks and where creative mode shelves it.',
          content: (
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Stack Size"
                hint={
                  (p.durability ?? 0) > 0
                    ? 'Anything with durability sits at 1: wear is carried by the stack, so two half-worn ones in a slot would share it.'
                    : 'How many fit in one slot. Tools sit at 1.'
                }
              >
                <NumberInput
                  value={(p.durability ?? 0) > 0 ? 1 : p.stackSize}
                  onChange={(v) => patch('stackSize', Math.max(1, Math.min(64, Math.round(v))))}
                  min={1}
                  max={64}
                  disabled={(p.durability ?? 0) > 0}
                />
              </Field>
              <Field
                label="Durability"
                hint="Uses before it breaks. 0 for something that never wears out, which is most things."
              >
                <NumberInput
                  value={p.durability ?? 0}
                  onChange={(v) => patch('durability', Math.max(0, Math.round(v)))}
                  min={0}
                  max={4096}
                />
              </Field>
              {isFood && (
                <>
                  <Field
                    label="Restores"
                    hint="Half drumsticks. Vanilla bread is 5, steak is 8."
                  >
                    <NumberInput
                      value={p.healAmount ?? 0}
                      onChange={(v) => patch('healAmount', Math.max(0, Math.round(v)))}
                      min={0}
                      max={40}
                    />
                  </Field>
                  <Field label="Eating Time" hint="Ticks spent eating it. Most food is 32.">
                    <NumberInput
                      value={p.eatTicks ?? 32}
                      onChange={(v) => patch('eatTicks', Math.max(1, Math.round(v)))}
                      min={1}
                      max={200}
                    />
                  </Field>
                  <div className="col-span-2">
                    <Switch
                      checked={p.wolfMeat ?? false}
                      onChange={(v) => patch('wolfMeat', v)}
                      label="A wolf will take it"
                      hint="BTA keeps this on the food itself. There is no wolf-favourite item tag, which is where people go looking."
                    />
                  </div>
                </>
              )}
              <Field
                label="Burn Time"
                hint="Ticks it burns in a furnace. 0 for something that is not a fuel. Coal is 1600, which smelts eight."
              >
                <NumberInput
                  value={p.burnTime ?? 0}
                  onChange={(v) => patch('burnTime', Math.max(0, Math.round(v)))}
                  min={0}
                  max={100000}
                  step={100}
                />
              </Field>
              {

}
              <div className="col-span-2">
                <Field label="Behavior" hint="Optional. Most items want none of these.">
                  <SwitchList
                    options={itemTagOptions}
                    selected={p.tags ?? []}
                    onChange={(v) => patch('tags', v)}
                  />
                </Field>
              </div>
              <Field label="Creative Shelf">
                <Select
                  value={p.category}
                  onChange={(v) => patch('category', v)}
                  options={CATEGORY_OPTIONS}
                />
              </Field>
            </div>
          )
        },

    ...(isPiece
      ? []
      : [
          {
            id: 'uses',
            title: 'Right-click',
            desc: 'What happens when this is used on a block.',
            content: (
              <BlockUsesFields
                rules={p.blockUses ?? []}
                cost={p.blockUseCost ?? 0}
                onChange={(v) => patch('blockUses', v)}
                onCostChange={(v) => patch('blockUseCost', v)}
              />
            )
          }
        ]),
  ]

  const spendsNothing = (p.blockUseCost ?? 0) > 0 && (p.durability ?? 0) === 0
  const checks: ReviewCheck[] = [
    {
      label: 'Durability cost can be paid',
      ok: !spendsNothing,
      detail: spendsNothing
        ? 'This spends durability on every use, but the item has none, so it will never wear out. Give it a durability on the Behavior slide, or set the cost to 0.'
        : undefined,
      stepId: 'behavior'
    }
  ]

  return <FormShell element={element} onClose={onClose} steps={steps} checks={checks} />
}

export function ToolStatFields(props: {
  set: AnySetProps
  patchSet: <K extends keyof AnySetProps>(key: K, value: AnySetProps[K]) => void
}): JSX.Element {
  const { set, patchSet } = props
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Durability">
        <NumberInput value={set.durability} onChange={(v) => patchSet('durability', v)} min={1} />
      </Field>
      <Field label="Mining Speed">
        <NumberInput value={set.efficiency} onChange={(v) => patchSet('efficiency', v)} min={1} step={0.5} />
      </Field>
      <Field label="Mining Level" hint="0 wood · 1 stone · 2 iron · 3 diamond">
        <NumberInput value={set.miningLevel} onChange={(v) => patchSet('miningLevel', v)} min={0} max={4} />
      </Field>
      <Field label="Attack Damage">
        <NumberInput value={set.damage} onChange={(v) => patchSet('damage', v)} min={0} />
      </Field>
    </div>
  )
}

export function ArmorStatFields(props: {
  set: AnySetProps
  patchSet: <K extends keyof AnySetProps>(key: K, value: AnySetProps[K]) => void
}): JSX.Element {
  const { set, patchSet } = props
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Armor Durability">
        <NumberInput value={set.armorDurability} onChange={(v) => patchSet('armorDurability', v)} min={1} />
      </Field>
      <Field label="Melee Protection" hint="0 to 1">
        <NumberInput value={set.totalProtection} onChange={(v) => patchSet('totalProtection', v)} min={0} max={1} step={0.05} />
      </Field>
      <Field label="Blast Protection" hint="0 to 1">
        <NumberInput value={set.blastProtection} onChange={(v) => patchSet('blastProtection', v)} min={0} max={1} step={0.05} />
      </Field>
      <Field label="Fire Protection" hint="0 to 1">
        <NumberInput value={set.fireProtection} onChange={(v) => patchSet('fireProtection', v)} min={0} max={1} step={0.05} />
      </Field>
    </div>
  )
}
