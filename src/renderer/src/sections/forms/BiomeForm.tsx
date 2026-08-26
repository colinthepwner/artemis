import { useMemo } from 'react'
import { Plus, X } from 'lucide-react'
import type { ElementFormProps } from './registry'
import { FormShell, usePropEditor, type ReviewCheck, type WizardStep } from './FormShell'
import { Field, NumberInput, Select, Slider } from '@/components/ui/controls'
import { ItemRefField } from '@/components/pixel/ItemRefPicker'
import { BIOME_DEFAULTS, type BiomeProps } from '@shared/generator/props'
import { useProjectStore } from '@/store/projectStore'
import { titleCase } from '@shared/generator/templates/block'

export function BiomeForm({ element, onClose }: ElementFormProps): JSX.Element | null {
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
  const [p, patch] = usePropEditor<BiomeProps>(element, BIOME_DEFAULTS)

  const allElements = useProjectStore((s) => s.project?.elements)
  const mobs = useMemo(() => allElements?.filter((e) => e.kind === 'mob') ?? [], [allElements])
  const mobOptions = mobs.map((m) => ({
    value: m.name,
    label: (m.properties['displayName'] as string) || titleCase(m.name)
  }))

  const steps: WizardStep[] = [
    {
      id: 'climate',
      title: 'Climate',
      desc: 'Where this biome sits in the world climate table.',
      content: (
        <>
          <Field label="Temperature" hint="0 frozen · 1 scorching.">
            <Slider value={p.temperature} onChange={(v) => patch('temperature', v)} min={0} max={1} step={0.05} />
          </Field>
          <Field label="Humidity">
            <Slider value={p.humidity} onChange={(v) => patch('humidity', v)} min={0} max={1} step={0.05} />
          </Field>
          <Field label="Climate Range" hint="How wide a climate band this biome claims.">
            <Slider value={p.variance} onChange={(v) => patch('variance', v)} min={0.05} max={0.5} step={0.05} />
          </Field>
        </>
      )
    },
    {
      id: 'colors',
      title: 'Colors',
      desc: 'The tint of grass and leaves inside the biome.',
      content: (
        <div className="grid grid-cols-2 gap-3">
          <ColorField label="Grass" value={p.grassColor} onChange={(v) => patch('grassColor', v)} />
          <ColorField label="Foliage" value={p.foliageColor} onChange={(v) => patch('foliageColor', v)} />
        </div>
      )
    },
    {
      id: 'surface',
      title: 'Surface',
      desc: 'What the ground is built from.',
      content: (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Top Block" hint="The grass-layer block.">
              <ItemRefField
                filter="block"
                value={p.topBlock}
                onChange={(v) => patch('topBlock', v)}
                placeholder="Pick block…"
              />
            </Field>
            <Field label="Filler Block" hint="The dirt-layer block underneath.">
              <ItemRefField
                filter="block"
                value={p.fillerBlock}
                onChange={(v) => patch('fillerBlock', v)}
                placeholder="Pick block…"
              />
            </Field>
          </div>
          <Field label="Tree Density">
            <Slider value={p.treeDensity} onChange={(v) => patch('treeDensity', v)} min={0} max={20} />
          </Field>
        </>
      )
    },
    {
      id: 'spawns',
      title: 'Spawns',
      desc: 'Which of your mobs appear here. Vanilla spawns still apply.',
      content: (
        <>
          {p.spawns.length === 0 && (
            <p className="text-2xs text-mist-600">
              {mobs.length === 0
                ? 'Create a mob first. Spawns pick from the mobs in this mod.'
                : 'No custom spawns yet.'}
            </p>
          )}
          {p.spawns.map((spawn, i) => (
            <div key={i} className="flex items-end gap-2">
              <Field label="Mob" className="flex-1">
                <Select
                  value={spawn.entity}
                  onChange={(v) => {
                    const next = [...p.spawns]
                    next[i] = { ...spawn, entity: v }
                    patch('spawns', next)
                  }}
                  options={mobOptions}
                />
              </Field>
              <Field label="Weight" className="w-24">
                <NumberInput
                  value={spawn.weight}
                  onChange={(v) => {
                    const next = [...p.spawns]
                    next[i] = { ...spawn, weight: v }
                    patch('spawns', next)
                  }}
                  min={1}
                  max={100}
                />
              </Field>
              <button
                onClick={() => patch('spawns', p.spawns.filter((_, j) => j !== i))}
                className="mb-1 shrink-0 rounded-md p-2 text-mist-500 transition-colors hover:bg-ember-500/15 hover:text-ember-400"
              >
                <X size={13} />
              </button>
            </div>
          ))}
          {mobs.length > 0 && (
            <button
              onClick={() => patch('spawns', [...p.spawns, { entity: mobs[0].name, weight: 10 }])}
              className="flex items-center gap-1.5 rounded-md bg-ink-800 px-3 py-1.5 text-2xs text-mist-400 shadow-panel transition-colors hover:bg-ink-750 hover:text-mist-200"
            >
              <Plus size={12} /> Add spawn
            </button>
          )}
        </>
      )
    }
  ]

  const checks: ReviewCheck[] = [
    {
      label: 'Surface blocks picked',
      ok: Boolean(p.topBlock.trim() && p.fillerBlock.trim()),
      detail: 'The biome needs a top block and a filler block.',
      stepId: 'surface'
    }
  ]

  return <FormShell element={element} onClose={onClose} steps={steps} checks={checks} />
}

function ColorField(props: { label: string; value: string; onChange: (v: string) => void }): JSX.Element {
  const hex = props.value.replace(/[^0-9a-fA-F]/g, '').padEnd(6, '0').slice(0, 6)
  return (
    <Field label={props.label}>
      <div className="flex items-center gap-2">
        {}
        <label
          className="relative h-7 w-7 shrink-0 cursor-default overflow-hidden rounded-md shadow-panel"
          style={{ background: `#${hex}` }}
        >
          <input
            type="color"
            className="absolute inset-0 h-full w-full opacity-0"
            value={`#${hex}`}
            onChange={(e) => props.onChange(e.target.value.slice(1))}
          />
        </label>
        <input
          className="input-base font-mono"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value.replace(/^#/, ''))}
        />
      </div>
    </Field>
  )
}
