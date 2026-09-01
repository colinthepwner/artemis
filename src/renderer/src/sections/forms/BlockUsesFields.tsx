import { useState } from 'react'
import { Plus, Trash2, Copy, ClipboardPaste, ChevronUp, ChevronDown, X } from 'lucide-react'
import { Field, NumberInput, Select } from '@/components/ui/controls'
import { ItemRefField } from '@/components/pixel/ItemRefPicker'
import { ParticleHover } from '@/components/pixel/ParticleHover'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/lib/cn'
import { effectAllowedOn } from '@shared/generator/props'
import type { UseEffect, UseEffectKind, UseRule, UseTrigger } from '@shared/generator/props'

const TRIGGERS: { value: UseTrigger; label: string }[] = [
  { value: 'block', label: 'a specific block' },
  { value: 'anyBlock', label: 'any block' },
  { value: 'item', label: 'nothing (just the item)' }
]

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

const EFFECTS: {
  kind: UseEffectKind
  label: string

  hint: string
  make: () => UseEffect
}[] = [
  {
    kind: 'becomes',
    label: 'Change the block',
    hint: 'The block you clicked turns into another one.',
    make: () => ({ kind: 'becomes', block: '' })
  },
  {
    kind: 'drops',
    label: 'Drop an item',
    hint: 'A stack falls out where you clicked.',
    make: () => ({ kind: 'drops', item: '', count: 1 })
  },
  {
    kind: 'sound',
    label: 'Play a sound',
    hint: 'One of your own sounds, or one of the game’s.',
    make: () => ({ kind: 'sound', event: '' })
  },
  {
    kind: 'particles',
    label: 'Particles',
    hint: 'A burst of a named particle.',
    make: () => ({ kind: 'particles', name: '', count: 8 })
  },
  {
    kind: 'cost',
    label: 'Spend durability',
    hint: 'Wears the item down each time this rule fires.',
    make: () => ({ kind: 'cost', amount: 1 })
  }
]

const labelOf = (kind: UseEffectKind): string =>
  EFFECTS.find((e) => e.kind === kind)?.label ?? kind

const freshId = (): string => `use-${Math.random().toString(36).slice(2, 10)}`

export function BlockUsesFields(props: {
  rules: UseRule[]
  onChange: (rules: UseRule[]) => void

  label?: string
  hint?: string
}): JSX.Element {
  const { rules, onChange } = props

  const clipboard = useAppStore((s) => s.useRuleClipboard)
  const setClipboard = useAppStore((s) => s.setUseRuleClipboard)

  const patchRule = (i: number, patch: Partial<UseRule>): void =>
    onChange(rules.map((r, n) => (n === i ? { ...r, ...patch } : r)))

  const patchEffect = (ri: number, ei: number, next: UseEffect): void =>
    patchRule(ri, { effects: rules[ri].effects.map((e, n) => (n === ei ? next : e)) })

  const addRule = (): void => onChange([...rules, { id: freshId(), on: 'block', target: '', effects: [] }])

  const duplicateRule = (i: number): void => {
    const copy: UseRule = { ...rules[i], id: freshId(), effects: rules[i].effects.map((e) => ({ ...e })) }
    onChange([...rules.slice(0, i + 1), copy, ...rules.slice(i + 1)])
  }

  const removeRule = (i: number): void => onChange(rules.filter((_, n) => n !== i))

  const moveRule = (i: number, by: number): void => {
    const to = i + by
    if (to < 0 || to >= rules.length) return
    const next = [...rules]
    ;[next[i], next[to]] = [next[to], next[i]]
    onChange(next)
  }

  const addEffect = (ri: number, kind: UseEffectKind): void => {
    const make = EFFECTS.find((e) => e.kind === kind)?.make
    if (make) patchRule(ri, { effects: [...rules[ri].effects, make()] })
  }

  const duplicateEffect = (ri: number, ei: number): void => {
    const list = rules[ri].effects
    patchRule(ri, { effects: [...list.slice(0, ei + 1), { ...list[ei] }, ...list.slice(ei + 1)] })
  }

  const removeEffect = (ri: number, ei: number): void =>
    patchRule(ri, { effects: rules[ri].effects.filter((_, n) => n !== ei) })

  const moveEffect = (ri: number, ei: number, by: number): void => {
    const list = rules[ri].effects
    const to = ei + by
    if (to < 0 || to >= list.length) return
    const next = [...list]
    ;[next[ei], next[to]] = [next[to], next[ei]]
    patchRule(ri, { effects: next })
  }

  return (
    <Field
      label={props.label ?? 'Right-click rules'}
      hint={
        props.hint ??
        'Leave this empty and the item does nothing when you click a block, which is what every item does until you say otherwise.'
      }
    >
      <div className="space-y-2">
        {rules.map((rule, ri) => (

          <div key={rule.id} className="rounded-md bg-ink-900/60 p-2.5 shadow-panel">
            {}
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-2xs text-mist-600">when you right-click</span>
              <span className="w-40 shrink-0">
                <Select
                  value={rule.on ?? 'block'}
                  onChange={(v) => patchRule(ri, { on: v as UseTrigger })}
                  options={TRIGGERS}
                />
              </span>
              {

}
              {(rule.on ?? 'block') === 'block' && (
                <ItemRefField
                  value={rule.target}
                  onChange={(v) => patchRule(ri, { target: v })}
                  filter="block"
                  placeholder="which block"
                  className="min-w-0 flex-1"
                />
              )}
              {(rule.on ?? 'block') !== 'block' && <span className="min-w-0 flex-1" />}
              <RowButton
                icon={ChevronUp}
                title="Move this rule up. Rules are tried top to bottom."
                disabled={ri === 0}
                onClick={() => moveRule(ri, -1)}
              />
              <RowButton
                icon={ChevronDown}
                title="Move this rule down"
                disabled={ri === rules.length - 1}
                onClick={() => moveRule(ri, 1)}
              />
              <RowButton
                icon={Copy}
                title="Duplicate this rule"
                onClick={() => duplicateRule(ri)}
              />
              <RowButton
                icon={ClipboardPaste}
                title="Copy this rule, to paste onto another item"
                onClick={() => setClipboard(rule)}
              />
              <RowButton icon={Trash2} danger title="Remove this rule" onClick={() => removeRule(ri)} />
            </div>

            {}
            <div className="mt-2 space-y-1.5 border-l border-white/[0.06] pl-2.5">
              {rule.effects.length === 0 && (
                <p className="py-1 text-2xs text-mist-600">
                  Nothing happens yet. Add an effect below.
                </p>
              )}
              {rule.effects.map((effect, ei) => (
                <div key={ei} className="rounded bg-ink-850/70 p-2">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-2xs font-medium text-mist-300">
                      {labelOf(effect.kind)}
                      {

}
                      {!effectAllowedOn(effect.kind, rule.on ?? 'block') && (
                        <span className="ml-1.5 font-normal text-ember-400">
                          skipped, needs a block
                        </span>
                      )}
                    </span>
                    <RowButton
                      icon={ChevronUp}
                      title="Run this earlier"
                      disabled={ei === 0}
                      onClick={() => moveEffect(ri, ei, -1)}
                    />
                    <RowButton
                      icon={ChevronDown}
                      title="Run this later"
                      disabled={ei === rule.effects.length - 1}
                      onClick={() => moveEffect(ri, ei, 1)}
                    />
                    <RowButton
                      icon={Copy}
                      title="Duplicate this effect"
                      onClick={() => duplicateEffect(ri, ei)}
                    />
                    <RowButton
                      icon={X}
                      danger
                      title="Remove this effect"
                      onClick={() => removeEffect(ri, ei)}
                    />
                  </div>
                  <EffectEditor effect={effect} onChange={(e) => patchEffect(ri, ei, e)} />
                </div>
              ))}

              <AddEffect on={rule.on ?? 'block'} onAdd={(kind) => addEffect(ri, kind)} />
            </div>
          </div>
        ))}

        <div className="flex gap-2">
          <button
            onClick={addRule}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-ink-750 py-2 text-2xs text-mist-300 transition-colors hover:bg-ink-700"
          >
            <Plus size={13} /> Add a rule
          </button>
          {clipboard && (
            <button
              onClick={() =>
                onChange([
                  ...rules,
                  { ...clipboard, id: freshId(), effects: clipboard.effects.map((e) => ({ ...e })) }
                ])
              }
              title="Paste the rule you copied, from this item or any other"
              className="flex items-center justify-center gap-1.5 rounded-md bg-ink-750 px-3 py-2 text-2xs text-mist-300 transition-colors hover:bg-ink-700"
            >
              <ClipboardPaste size={13} /> Paste rule
            </button>
          )}
        </div>
      </div>
    </Field>
  )
}

function RowButton(props: {
  icon: typeof Plus
  title: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}): JSX.Element {
  const Icon = props.icon
  return (
    <button
      type="button"
      title={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
      className={cn(
        'shrink-0 rounded p-1 transition-colors disabled:pointer-events-none disabled:opacity-25',
        props.danger
          ? 'text-mist-500 hover:bg-ember-500/15 hover:text-ember-400'
          : 'text-mist-500 hover:bg-ink-750 hover:text-mist-200'
      )}
    >
      <Icon size={12} />
    </button>
  )
}

function AddEffect(props: {
  on: UseTrigger
  onAdd: (kind: UseEffectKind) => void
}): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1 pt-0.5">
      {

}
      {EFFECTS.filter((e) => effectAllowedOn(e.kind, props.on)).map((e) => (
        <button
          key={e.kind}
          type="button"
          title={e.hint}
          onClick={() => props.onAdd(e.kind)}
          className="flex items-center gap-1 rounded bg-ink-800 px-2 py-1 text-2xs text-mist-400 transition-colors hover:bg-ink-750 hover:text-mist-100"
        >
          <Plus size={10} /> {e.label}
        </button>
      ))}
    </div>
  )
}

function EffectEditor(props: {
  effect: UseEffect
  onChange: (e: UseEffect) => void
}): JSX.Element {
  const { effect, onChange } = props

  const [preview, setPreview] = useState<string | null>(null)

  switch (effect.kind) {
    case 'becomes':
      return (
        <ItemRefField
          value={effect.block}
          onChange={(v) => onChange({ ...effect, block: v })}
          filter="block"
          placeholder="which block it turns into"
        />
      )

    case 'drops':
      return (
        <div className="flex items-center gap-2">
          <ItemRefField
            value={effect.item}
            onChange={(v) => onChange({ ...effect, item: v })}
            placeholder="what falls out"
            className="min-w-0 flex-1"
          />
          <span className="w-16 shrink-0">
            <NumberInput
              value={effect.count || 1}
              onChange={(v) => onChange({ ...effect, count: Math.max(1, Math.round(v)) })}
              min={1}
              max={64}
            />
          </span>
        </div>
      )

    case 'sound':
      return (
        <input
          className="input-base w-full font-mono text-2xs"
          value={effect.event}
          onChange={(e) => onChange({ ...effect, event: e.target.value.trim() })}
          placeholder="a sound key"
          title="One of your own from Artemis Settings, or one of the game's"
        />
      )

    case 'particles':
      return (
        <div className="flex items-center gap-2">
          {

}
          <ParticleHover

            particle={preview ?? effect.name}
            follow={preview !== null}
            className="min-w-0 flex-1"
          >
            <Select
              value={effect.name}
              onChange={(v) => onChange({ ...effect, name: v })}
              options={PARTICLE_OPTIONS}
              onPreview={setPreview}
            />
          </ParticleHover>
          <span className="w-16 shrink-0">
            <NumberInput
              value={effect.count || 8}
              onChange={(v) => onChange({ ...effect, count: Math.max(1, Math.round(v)) })}
              min={1}
              max={64}
            />
          </span>
        </div>
      )

    case 'cost':
      return (
        <span className="block w-24">
          <NumberInput
            value={effect.amount || 1}
            onChange={(v) => onChange({ ...effect, amount: Math.max(1, Math.round(v)) })}
            min={1}
            max={100}
          />
        </span>
      )
  }
}
