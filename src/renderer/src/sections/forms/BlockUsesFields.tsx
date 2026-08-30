import { Plus, Trash2, ArrowRight } from 'lucide-react'
import { Field, NumberInput, Select } from '@/components/ui/controls'
import { ItemRefField } from '@/components/pixel/ItemRefPicker'
import type { BlockUseRule } from '@shared/generator/props'

const PARTICLE_OPTIONS = [
  { value: '', label: 'Nothing' },
  ...[
    'acidBoiling', 'arrowtrail', 'ashmote', 'blueflame', 'bubble', 'bubbleboiling',
    'dripAcid', 'dripLava', 'dripWater', 'explode', 'fallingleaf', 'fireflyBlue',
    'fireflyGreen', 'fireflyOrange', 'fireflyRed', 'flame', 'footstep', 'heart',
    'largesmoke', 'lava', 'note', 'portal', 'reddust', 'rubyglassLightning',
    'slimechunk', 'smoke', 'snowshovel', 'soulflame', 'splash', 'ventsmoke'
  ].map((n) => ({ value: n, label: n }))
]

export function BlockUsesFields(props: {
  rules: BlockUseRule[]
  cost: number
  onChange: (rules: BlockUseRule[]) => void
  onCostChange: (cost: number) => void
}): JSX.Element {
  const { rules, cost, onChange, onCostChange } = props

  const patchRule = (i: number, patch: Partial<BlockUseRule>): void =>
    onChange(rules.map((r, n) => (n === i ? { ...r, ...patch } : r)))

  const add = (): void =>
    onChange([
      ...rules,
      { target: '', becomes: '', drops: '', dropCount: 1, sound: '', particle: '', particleCount: 8 }
    ])

  const remove = (i: number): void => onChange(rules.filter((_, n) => n !== i))

  return (
    <>
      <Field
        label="Right-click rules"
        hint="Leave this empty and the item does nothing when you click a block, which is what every item does until you say otherwise."
      >
        <div className="space-y-2">
          {rules.map((rule, i) => (

            <div key={i} className="rounded-md bg-ink-900/60 p-2.5 shadow-panel">
              <div className="flex items-center gap-2">
                <ItemRefField
                  value={rule.target}
                  onChange={(v) => patchRule(i, { target: v })}
                  filter="block"
                  placeholder="Any block"
                  className="min-w-0 flex-1"
                />
                <ArrowRight size={13} className="shrink-0 text-mist-600" />
                <ItemRefField
                  value={rule.becomes}
                  onChange={(v) => patchRule(i, { becomes: v })}
                  filter="block"
                  placeholder="Leave it alone"
                  className="min-w-0 flex-1"
                />
                {
}
                <button
                  onClick={() => remove(i)}
                  title="Remove this rule"
                  className="shrink-0 rounded-md p-1.5 text-mist-500 transition-colors hover:bg-ember-500/15 hover:text-ember-400"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="w-14 shrink-0 text-2xs text-mist-600">drops</span>
                <ItemRefField
                  value={rule.drops}
                  onChange={(v) => patchRule(i, { drops: v })}
                  placeholder="Nothing"
                  className="min-w-0 flex-1"
                />
                {rule.drops.trim() !== '' && (
                  <span className="w-16 shrink-0">
                  <NumberInput
                    value={rule.dropCount || 1}
                    onChange={(v) => patchRule(i, { dropCount: Math.max(1, Math.round(v)) })}
                    min={1}
                    max={64}
                  />
                  </span>
                )}
              </div>

              {
}
              <div className="mt-2 flex items-center gap-2">
                <span className="w-14 shrink-0 text-2xs text-mist-600">puffs</span>
                <span className="min-w-0 flex-1">
                  <Select
                    value={rule.particle ?? ''}
                    onChange={(v) => patchRule(i, { particle: v })}
                    options={PARTICLE_OPTIONS}
                  />
                </span>
                {(rule.particle ?? '').trim() !== '' && (
                  <span className="w-16 shrink-0">
                    <NumberInput
                      value={rule.particleCount || 8}
                      onChange={(v) => patchRule(i, { particleCount: Math.max(1, Math.round(v)) })}
                      min={1}
                      max={64}
                    />
                  </span>
                )}
              </div>

              <div className="mt-2 flex items-center gap-2">
                <span className="w-14 shrink-0 text-2xs text-mist-600">plays</span>
                <input
                  className="input-base min-w-0 flex-1 font-mono text-2xs"
                  value={rule.sound ?? ''}
                  onChange={(e) => patchRule(i, { sound: e.target.value.trim() })}
                  placeholder="nothing"
                  title="A sound key: one of your own from Artemis Settings, or one of the game's"
                />
              </div>
            </div>
          ))}
          <button
            onClick={add}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-ink-750 py-2 text-2xs text-mist-300 transition-colors hover:bg-ink-700"
          >
            <Plus size={13} /> Add a rule
          </button>
        </div>
      </Field>

      {
}
      {rules.length > 0 && (
        <Field
          label="Durability Cost"
          hint="Taken off the item each time a rule fires. 0 for an item that never wears out."
        >
          <NumberInput
            value={cost}
            onChange={(v) => onCostChange(Math.max(0, Math.round(v)))}
            min={0}
            max={100}
          />
        </Field>
      )}
    </>
  )
}
