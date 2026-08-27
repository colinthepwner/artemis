import { useMemo } from 'react'
import type { ElementFormProps } from './registry'
import { FormShell, usePropEditor, type ReviewCheck, type WizardStep } from './FormShell'
import { Field, Select, Slider, Switch, SwitchList } from '@/components/ui/controls'
import { ItemRefField } from '@/components/pixel/ItemRefPicker'
import { BIOME_DEFAULTS, type BiomeProps } from '@shared/generator/props'
import { HostBiomeField } from './BiomesField'
import { useProjectStore } from '@/store/projectStore'
import { titleCase } from '@shared/generator/templates/block'
import { ClimateSlider } from '@/components/pixel/blockControls'

const WEATHER_OPTIONS = [
  { value: 'rain', label: 'Rain' },
  { value: 'snow', label: 'Snow' },
  { value: 'storm', label: 'Storms' },
  { value: 'fog', label: 'Fog' }
]

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

  const claimants = useMemo(
    () =>
      allElements?.filter(
        (e) =>
          e.kind === 'tree' &&
          ((e.properties['biomes'] as string[] | undefined) ?? []).some(
            (r) => r.trim() === element.name
          )
      ) ?? [],
    [allElements, element.name]
  )
  const inOverworld = p.generateInOverworld
  const genStyle = p.generationStyle ?? 'substitute'

  const steps: WizardStep[] = [
    {
      id: 'placement',
      title: 'Where',
      desc: 'Whether this biome generates naturally in the overworld.',
      content: (
        <>
          <Field label="Generate in Overworld">
            <Switch
              checked={inOverworld}
              onChange={(v) => patch('generateInOverworld', v)}
              label="Generate in Overworld"
              hint="Turn off to reserve this biome exclusively for custom dimensions."
            />
          </Field>
          {inOverworld ? (
            <>
              <Field label="Generation Style">
                <Select
                  value={genStyle}
                  onChange={(v) => patch('generationStyle', v as BiomeProps['generationStyle'])}
                  options={[
                    { value: 'substitute', label: 'Replaces Vanilla Biome (Reliable)' },
                    { value: 'climate', label: 'Natural Climate (Advanced)' }
                  ]}
                />
              </Field>
              {genStyle === 'substitute' && (
                <Field label="Replaces Vanilla Biome" hint="Your biome will automatically generate anywhere this vanilla biome would have.">
                  <HostBiomeField value={p.hostBiome} onChange={(v) => patch('hostBiome', v)} />
                </Field>
              )}
              <Field
                label={genStyle === 'substitute' ? 'How Much Of It' : 'Frequency'}
                hint={genStyle === 'substitute' ? "1 replaces it everywhere. Lower carves patches out of it and leaves the rest." : "1 attempts to spawn everywhere the climate matches. Lower scatters it in patches."}
              >
                <Slider value={p.rarity} onChange={(v) => patch('rarity', v)} min={0.05} max={1} step={0.05} />
              </Field>
            </>
          ) : (
            <p className="text-2xs leading-relaxed text-mist-600">
              The overworld is left alone. Create a Dimension element and pick this biome there;
              it appears nowhere else.
            </p>
          )}
        </>
      )
    },
    {
      id: 'climate',
      title: 'Climate',
      desc: 'Not where it goes, but what it is like there: weather, and the colour of the grass.',
      content: (
        <>
          <Field label="Temperature" hint="Below about 0.15 it snows instead of raining.">
            <ClimateSlider
              value={p.temperature}
              onChange={(v) => patch('temperature', v)}
              marks={[
                { at: 0.1, swatch: 'snow', label: 'Snow' },
                { at: 0.5, swatch: 'dirt', label: 'Grass' },
                { at: 0.9, swatch: 'sand', label: 'Desert' }
              ]}
            />
          </Field>
          <Field label="Humidity" hint="Drier reads yellower, wetter reads greener.">
            <ClimateSlider
              value={p.humidity}
              onChange={(v) => patch('humidity', v)}
              marks={[
                { at: 0.1, swatch: 'deadbush', label: 'Dry' },
                { at: 0.5, swatch: 'grass', label: 'Lush' },
                { at: 0.9, swatch: 'water', label: 'Wet' }
              ]}
            />
          </Field>
          <Field label="Never Has" hint="Weather that skips this biome entirely. Most places want none of these.">
            <SwitchList
              options={WEATHER_OPTIONS}
              selected={p.blockedWeathers ?? []}
              onChange={(v) => patch('blockedWeathers', v)}
            />
          </Field>
          <OptionalColorField
            label="Custom grass colour"
            hint="A fixed tint for grass here, all year: setting it is what turns seasons off for this biome. Off, grass follows the climate and the calendar."
            value={p.grassColor}
            fallback="5cb04a"
            onChange={(v) => patch('grassColor', v)}
          />
        </>
      )
    },
    {
      id: 'colors',
      title: 'Sky & Water',
      desc: 'The colour overhead and in the water. Vanilla paints both from the climate; set one only if this place should feel different.',
      content: (
        <>
          <OptionalColorField
            label="Custom sky colour"
            hint="A fixed sky, the way the Drift wears its own. Off, the sky follows temperature."
            value={p.skyColor}
            fallback="78a7ff"
            onChange={(v) => patch('skyColor', v)}
          />
          <OptionalColorField
            label="Custom water colour"
            hint="Tints water standing in this biome. Off, water follows the climate."
            value={p.waterColor}
            fallback="3f76e4"
            onChange={(v) => patch('waterColor', v)}
          />
        </>
      )
    },
    {
      id: 'surface',
      title: 'Surface',
      desc: 'What the ground is built from, and how it reads on a map.',
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
          <Field
            label="Trees"
            hint="Which of your trees grow here is the trees' own choice: tick this biome on the tree's World Gen slide. Any tree that claims it replaces the oaks."
          >
            <div className="flex flex-col gap-2">
              {claimants.length > 0 ? (
                <p className="text-2xs leading-relaxed text-mist-400">
                  Claimed by{' '}
                  <span className="text-mist-200">
                    {claimants
                      .map((t) => (t.properties['displayName'] as string) || t.name)
                      .join(', ')}
                  </span>
                  {' — '}vanilla oaks are replaced here regardless of the switch below.
                </p>
              ) : (
                <Switch
                  checked={p.vanillaTrees !== false}
                  onChange={(v) => patch('vanillaTrees', v)}
                  label="Spawn vanilla trees"
                  hint="Off makes this biome treeless until one of your trees claims it."
                />
              )}
            </div>
          </Field>
          {

}
          <ColorField
            label="Map Colour"
            value={p.mapColor}
            onChange={(v) => patch('mapColor', v)}
          />
        </>
      )
    },

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

function OptionalColorField(props: {
  label: string
  hint: string
  value: string

  fallback: string
  onChange: (v: string) => void
}): JSX.Element {
  const on = props.value.trim() !== ''
  return (
    <div className="space-y-3">
      <Switch
        checked={on}
        onChange={(v) => props.onChange(v ? props.fallback : '')}
        label={props.label}
        hint={props.hint}
      />
      {on && <ColorRow value={props.value} onChange={props.onChange} />}
    </div>
  )
}

function ColorField(props: { label: string; value: string; onChange: (v: string) => void }): JSX.Element {
  return (
    <Field label={props.label}>
      <ColorRow value={props.value} onChange={props.onChange} />
    </Field>
  )
}

function ColorRow(props: { value: string; onChange: (v: string) => void }): JSX.Element {
  const hex = props.value.replace(/[^0-9a-fA-F]/g, '').padEnd(6, '0').slice(0, 6)
  return (
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
  )
}
