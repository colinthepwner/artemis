import type { ElementFormProps } from './registry'
import { FormShell, TextureStrip, usePropEditor, type WizardStep } from './FormShell'
import { Field, NumberInput, Select, Switch } from '@/components/ui/controls'
import { ItemRefField } from '@/components/pixel/ItemRefPicker'
import { BiomesField } from './BiomesField'
import { MOB_DEFAULTS, type MobProps } from '@shared/generator/props'

const SHAPE_OPTIONS = [
  { value: 'humanoid', label: 'Humanoid  ·  zombie build' },
  { value: 'quadruped', label: 'Four-legged  ·  cow build' }
]

export function MobForm({ element, onClose }: ElementFormProps): JSX.Element | null {
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
  const [p, patch] = usePropEditor<MobProps>(element, MOB_DEFAULTS)

  const steps: WizardStep[] = [
    {
      id: 'body',
      title: 'Body',
      desc: 'The build it is drawn on, and the 64×32 skin stretched over it.',
      content: (
        <>
          <Field label="Body" hint="Decides the skin layout and the hitbox.">
            <Select
              value={p.shape}
              onChange={(v) => patch('shape', v as MobProps['shape'])}
              options={SHAPE_OPTIONS}
            />
          </Field>
          <TextureStrip element={element} />
        </>
      )
    },
    {
      id: 'stats',
      title: 'Stats',
      desc: 'How tough it is and how it moves.',
      content: (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Health" hint="2 = one heart.">
              <NumberInput value={p.health} onChange={(v) => patch('health', v)} min={1} />
            </Field>
            <Field label="Move Speed">
              <NumberInput value={p.moveSpeed} onChange={(v) => patch('moveSpeed', v)} min={0} step={0.1} />
            </Field>
          </div>
          <Switch
            checked={p.hostile}
            onChange={(v) => patch('hostile', v)}
            label="Hostile"
            hint="It will chase and attack players."
          />
          {p.hostile && (
            <Field label="Attack Damage">
              <NumberInput value={p.attackDamage} onChange={(v) => patch('attackDamage', v)} min={0} />
            </Field>
          )}
        </>
      )
    },
    {
      id: 'spawning',
      title: 'Spawning',
      desc: 'Where it appears naturally, your biomes and vanilla ones alike.',
      content: (
        <>
          <Switch
            checked={p.spawnWeight > 0}
            onChange={(v) => patch('spawnWeight', v ? 10 : 0)}
            label="Spawns naturally"
            hint="Off, it only exists where something else places it."
          />
          {p.spawnWeight > 0 && (
            <>
              <Field label="Spawn Weight" hint="Against the vanilla table: a pig is 10.">
                <NumberInput
                  value={p.spawnWeight}
                  onChange={(v) => patch('spawnWeight', Math.max(1, Math.round(v)))}
                  min={1}
                  max={100}
                />
              </Field>
              <Field label="Spawns In" hint="Leave on all biomes for a mob that lives everywhere.">
                <BiomesField
                  value={p.spawnBiomes ?? []}
                  onChange={(v) => patch('spawnBiomes', v)}
                />
              </Field>
            </>
          )}
        </>
      )
    },
    {
      id: 'drops',
      title: 'Drops',
      desc: 'Loot when defeated. Leave empty for no drops.',
      content: (
        <div className="grid grid-cols-[1fr,110px] gap-3">
          <Field label="Drop Item">
            <ItemRefField value={p.dropItem} onChange={(v) => patch('dropItem', v)} placeholder="Pick drop…" />
          </Field>
          <Field label="Max Count">
            <NumberInput value={p.dropCountMax} onChange={(v) => patch('dropCountMax', v)} min={1} max={16} />
          </Field>
        </div>
      )
    }
  ]

  return <FormShell element={element} onClose={onClose} steps={steps} />
}
