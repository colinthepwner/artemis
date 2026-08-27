import { Plus, X } from 'lucide-react'
import type { ElementFormProps } from './registry'
import { FormShell, TextureStrip, usePropEditor, type ReviewCheck, type WizardStep } from './FormShell'
import { Field, NumberInput, Select } from '@/components/ui/controls'
import { HarvestLevelSlider, LightSlider } from '@/components/pixel/blockControls'
import { ItemRefField } from '@/components/pixel/ItemRefPicker'
import { BiomesField } from './BiomesField'
import { DropsFields } from './DropsFields'
import { PLANT_DEFAULTS, type PlantProps } from '@shared/generator/props'

const HARVEST_OPTIONS = [
  { value: 'hand', label: 'Anything, even bare hands' },
  { value: 'shears', label: 'Shears only' }
]

export function PlantForm({ element, onClose }: ElementFormProps): JSX.Element | null {
  if (!element) return null
  return <Inner element={element} onClose={onClose} />
}

function Inner({
  element,
  onClose
}: {
  element: NonNullable<ElementFormProps['element']>
  onClose: () => void
}): JSX.Element {
  const [p, patch] = usePropEditor<PlantProps>(element, PLANT_DEFAULTS)
  const growsOn = p.growsOn ?? []

  const steps: WizardStep[] = [
    {
      id: 'paint',
      title: 'Textures',
      desc: 'Drawn as a criss-cross, like flowers and saplings.',
      content: <TextureStrip element={element} />
    },
    {
      id: 'behavior',
      title: 'Growing',
      desc: 'Where it stands and how tall it gets.',
      content: (
        <>
          <Field
            label="Grows On"
            hint="Every block it can be planted on, your own blocks included. It pops off anything else."
          >
            <GrowsOnList value={growsOn} onChange={(v) => patch('growsOn', v)} />
          </Field>
          <Field
            label="Max Height"
            hint="1 is an ordinary flower. Higher and it grows upward over time like sugarcane, up to this many blocks."
          >
            <NumberInput
              value={p.maxHeight ?? 1}
              onChange={(v) => patch('maxHeight', Math.max(1, Math.min(8, Math.round(v))))}
              min={1}
              max={8}
            />
          </Field>
          <Field label="Light Emission" hint="Leave at 0 unless it should glow.">
            <LightSlider value={p.luminance} onChange={(v) => patch('luminance', v)} />
          </Field>
        </>
      )
    },
    {
      id: 'world',
      title: 'World Gen',
      desc: 'Whether the world grows it on its own.',
      content: (
        <>
          <Field
            label="Patches per Chunk"
            hint="0 keeps it crafted-only. Each attempt lands only where its ground allows, so a plant for your own blocks appears exactly where they do."
          >
            <NumberInput
              value={p.patchesPerChunk ?? 0}
              onChange={(v) => patch('patchesPerChunk', Math.max(0, Math.round(v)))}
              min={0}
              max={64}
            />
          </Field>
          {(p.patchesPerChunk ?? 0) > 0 && (
            <Field label="Biomes In" hint="Leave on all biomes unless it belongs to a particular place.">
              <BiomesField value={p.biomes ?? []} onChange={(v) => patch('biomes', v)} />
            </Field>
          )}
        </>
      )
    },
    {
      id: 'harvest',
      title: 'Harvest',
      desc: 'What breaking it takes, and what it leaves behind.',
      content: (
        <>
          <Field
            label="Harvested With"
            hint="Shears cut a plant whole; anything else tears it apart and it drops nothing. The tall grass rule."
          >
            <Select
              value={p.shearsOnly ? 'shears' : 'hand'}
              onChange={(v) => patch('shearsOnly', v === 'shears')}
              options={HARVEST_OPTIONS}
            />
          </Field>
          <DropsFields p={p} patch={patch} selfValue="self" />
          <Field
            label="Harvest Level"
            hint="Plants break instantly, so this only decides whether they leave anything behind."
          >
            <HarvestLevelSlider
              value={p.harvestLevel ?? 0}
              onChange={(v) => patch('harvestLevel', v)}
            />
          </Field>
        </>
      )
    }
  ]

  const checks: ReviewCheck[] = [
    {
      label: 'Ground picked',
      ok: growsOn.some((r) => r.trim()),
      detail: 'It has nowhere it can be planted. Add at least one ground block.',
      stepId: 'behavior'
    },
    {
      label: 'Drop picked',
      ok: p.drops !== 'item' || !!p.dropItem.trim(),
      detail: 'Set to drop a chosen item, but no item is picked yet.',
      stepId: 'harvest'
    }
  ]

  return <FormShell element={element} onClose={onClose} steps={steps} checks={checks} />
}

function GrowsOnList(props: { value: string[]; onChange: (v: string[]) => void }): JSX.Element {
  const rows = props.value
  const setRow = (i: number, ref: string): void =>
    props.onChange(rows.map((r, n) => (n === i ? ref : r)))
  const removeRow = (i: number): void => props.onChange(rows.filter((_, n) => n !== i))

  return (
    <div className="space-y-2">
      {rows.map((ref, i) => (
        <div key={i} className="flex items-center gap-2">
          <ItemRefField
            value={ref}
            onChange={(v) => setRow(i, v)}
            filter="block"
            placeholder="Pick a block"
            className="flex-1"
          />
          <button
            onClick={() => removeRow(i)}
            title="Remove"
            className="shrink-0 rounded-md p-1.5 text-mist-500 transition-colors hover:bg-ember-500/15 hover:text-ember-400"
          >
            <X size={13} />
          </button>
        </div>
      ))}
      <button
        onClick={() => props.onChange([...rows, ''])}
        className="flex items-center gap-1.5 rounded-md bg-ink-750 px-2.5 py-1.5 text-2xs font-semibold uppercase tracking-wide text-mist-300 transition-colors hover:bg-ink-700 hover:text-mist-100"
      >
        <Plus size={12} /> Add ground
      </button>
    </div>
  )
}
