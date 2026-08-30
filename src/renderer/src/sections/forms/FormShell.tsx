import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Check,
  CheckCircle2,
  Trash2,
  X
} from 'lucide-react'
import { useProjectStore } from '@/store/projectStore'
import type { ArtemisElement } from '@shared/project'
import { capitalizeWords, toRegistryName } from '@shared/project'
import { textureSlotsForElement } from '@shared/generator/textures'
import { elementRegistryEntries } from '@shared/generator/registry'
import { titleCase } from '@shared/generator/templates/block'
import { TexturePicker } from '@/components/pixel/TexturePicker'
import { ScenePanel } from '@/components/preview/ScenePreview'
import { Switch } from '@/components/ui/controls'
import { useAppStore } from '@/store/appStore'
import { GlideList } from '@/components/ui/glide'
import { PANE_ENTER } from '@/components/ui/enter'
import { cn } from '@/lib/cn'

export interface WizardStep {
  id: string

  title: string

  desc?: string

  done?: boolean
  content: React.ReactNode
}

export interface ReviewCheck {
  label: string
  ok: boolean
  detail?: string

  stepId?: string
}

const PAINT_STEP_ID = 'paint'

export function FormShell(props: {
  element: ArtemisElement
  onClose: () => void
  steps: WizardStep[]
  checks?: ReviewCheck[]
}): JSX.Element {
  const { element } = props
  const removeElement = useProjectStore((s) => s.removeElement)
  const project = useProjectStore((s) => s.project)

  const display = (element.properties['displayName'] as string) || titleCase(element.name)

  const takenNames = useMemo(() => {
    const map = new Map<string, DupInfo>()
    if (!project) return map
    for (const other of project.elements) {
      if (other.id === element.id) continue
      if (!map.has(other.name)) map.set(other.name, { owner: other, generated: false })
      for (const entry of elementRegistryEntries(other)) {
        if (!map.has(entry.registryName)) {
          map.set(entry.registryName, { owner: other, generated: entry.registryName !== other.name })
        }
      }
    }
    return map
  }, [project, element.id])

  const duplicate = takenNames.get(element.name) ?? null

  const placeholderName = element.name.startsWith('new_')
  const nameOk = !placeholderName && !duplicate

  const paintable = textureSlotsForElement(element).filter((s) => s.paintable)
  const assignedCount = paintable.filter((s) => project?.textureAssignments[s.key]).length
  const texturesOk = assignedCount === paintable.length

  const reviewChecks: ReviewCheck[] = [
    {
      label: 'Named',
      ok: nameOk,
      detail: duplicate
        ? duplicateMessage(element.name, duplicate)
        : placeholderName
          ? 'Still has its placeholder name.'
          : undefined,
      stepId: 'name'
    },
    ...(paintable.length > 0
      ? [
          {
            label: 'Textures painted',
            ok: texturesOk,
            detail: texturesOk ? undefined : `${assignedCount} of ${paintable.length} assigned.`,
            stepId: PAINT_STEP_ID
          }
        ]
      : []),
    ...(props.checks ?? [])
  ]
  const allOk = reviewChecks.every((c) => c.ok)

  const steps: WizardStep[] = [
    {
      id: 'name',
      title: 'Name',
      desc: 'What players will see in-game.',
      done: nameOk,
      content: <NameFields element={element} taken={takenNames} />
    },
    ...props.steps.map((s) =>
      s.id === PAINT_STEP_ID ? { ...s, done: paintable.length > 0 ? texturesOk : s.done } : s
    ),
    {
      id: 'check',
      title: 'Check',
      desc: "What's still missing.",
      done: allOk,
      content: null
    }
  ]

  const [rawIdx, setRawIdx] = useState(0)
  const idx = Math.min(rawIdx, steps.length - 1)
  const step = steps[idx]
  const jumpTo = (id: string): void => {
    const i = steps.findIndex((s) => s.id === id)
    if (i >= 0) setRawIdx(i)
  }

  return (
    <div className="flex h-full flex-col">
      {

}
      <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-white/[0.04] px-5 py-2.5">
        <button
          onClick={props.onClose}
          className="flex items-center gap-1.5 justify-self-start rounded-md px-2 py-1 text-2xs text-mist-400 transition-colors hover:bg-ink-750 hover:text-mist-200"
        >
          <ArrowLeft size={13} /> Back
        </button>
        <div className="flex min-w-0 items-baseline justify-center gap-2">
          <span className="truncate text-[13px] font-medium text-mist-100">{display}</span>
          <span className="shrink-0 font-mono text-2xs text-mist-600">{titleCase(element.kind)}</span>
        </div>
        <button
          onClick={() => {
            removeElement(element.id)
            props.onClose()
          }}
          className="flex items-center gap-1.5 justify-self-end rounded-md px-2 py-1 text-2xs text-mist-500 transition-colors hover:bg-ember-500/15 hover:text-ember-400"
        >
          <Trash2 size={13} /> Delete
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {}
        <nav
          data-tour="wizard-rail"
          className="w-44 shrink-0 overflow-y-auto border-r border-white/[0.04] px-3 py-4"
        >
          {
}
          <GlideList active={step.id}>
          {steps.map((s, i) => {
            const active = i === idx

            const done = s.done ?? true
            return (
              <button
                key={s.id}
                data-glide-id={s.id}
                onClick={() => setRawIdx(i)}
                className={cn(
                  'relative mb-1 flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
                  active ? 'text-mist-50' : 'text-mist-400 hover:bg-ink-800 hover:text-mist-200'
                )}
              >
                <span
                  className={cn(
                    'relative z-10 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full font-mono text-2xs font-semibold transition-colors',
                    done
                      ? 'bg-gold-500 text-ink-950'
                      : active
                        ? 'bg-ink-600 text-mist-100'
                        : 'bg-ink-800 text-mist-500'
                  )}
                >
                  {done ? <Check size={12} strokeWidth={3} /> : i + 1}
                </span>
                <span className="relative z-10 truncate">{s.title}</span>
              </button>
            )
          })}
          </GlideList>
        </nav>

        {}
        <div className="flex min-w-0 flex-1 flex-col">
          {

}
          <motion.div
            key={step.id}
            className="min-h-0 flex-1 overflow-y-auto px-8 py-6"
            {...PANE_ENTER}
          >
            <div className="mx-auto max-w-xl">
              <h2 className="text-base font-semibold tracking-tight text-mist-50">{step.title}</h2>
              {step.desc && <p className="mt-1 text-2xs leading-relaxed text-mist-500">{step.desc}</p>}
              <div className="card mt-4 space-y-4 p-4">
                {step.id === 'check' ? (
                  <>
                    <ReviewSlide checks={reviewChecks} allOk={allOk} jumpTo={jumpTo} />
                    {

}
                    {allOk && <ScenePanel element={element} />}
                  </>
                ) : (
                  step.content
                )}
              </div>
            </div>
          </motion.div>

          {}
          {

}
          <div className="flex shrink-0 items-center gap-3 border-t border-white/[0.04] px-8 py-3">
            <button
              onClick={() => setRawIdx(Math.max(0, idx - 1))}
              disabled={idx === 0}
              className={cn(
                'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-ink-750 px-4 py-1.5 text-2xs font-semibold uppercase tracking-wide text-mist-300 transition-colors hover:bg-ink-700',
                idx === 0 && 'opacity-35 disabled:hover:bg-ink-750'
              )}
            >
              <ArrowLeft size={12} /> Back
            </button>
            <span className="flex-1 text-center font-mono text-2xs text-mist-600">
              {idx + 1} / {steps.length}
            </span>
            {

}
            <div className="flex shrink-0 items-center gap-2">
              {idx < steps.length - 1 && (
                <button
                  onClick={props.onClose}
                  className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-ink-750 px-4 py-1.5 text-2xs font-semibold uppercase tracking-wide text-mist-300 transition-all hover:bg-ink-700 active:scale-[0.97]"
                >
                  Finish later <Check size={12} />
                </button>
              )}
              {idx < steps.length - 1 ? (
                <button
                  onClick={() => setRawIdx(idx + 1)}
                  className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-gold-500 px-4 py-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-950 transition-all hover:bg-gold-400 active:scale-[0.97]"
                >
                  Next <ArrowRight size={12} />
                </button>
              ) : (
                <button
                  onClick={props.onClose}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-4 py-1.5 text-2xs font-semibold uppercase tracking-wide transition-all active:scale-[0.97]',
                    allOk
                      ? 'bg-gold-500 text-ink-950 hover:bg-gold-400'
                      : 'bg-ink-750 text-mist-300 hover:bg-ink-700'
                  )}
                >
                  {allOk ? 'Done' : 'Finish later'} <Check size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface DupInfo {
  owner: ArtemisElement
  generated: boolean
}

function duplicateMessage(name: string, dup: DupInfo): string {
  const ownerName = (dup.owner.properties['displayName'] as string) || titleCase(dup.owner.name)
  return dup.generated
    ? `"${name}" is already auto-generated by ${ownerName}. You don't need to make it yourself.`
    : `"${name}" is already used by ${ownerName}.`
}

function NameFields(props: { element: ArtemisElement; taken: Map<string, DupInfo> }): JSX.Element {
  const { element, taken } = props
  const updateElement = useProjectStore((s) => s.updateElement)
  const autoCapitalize = useAppStore((s) => s.autoCapitalize)
  const setAutoCapitalize = useAppStore((s) => s.setAutoCapitalize)
  const displayName = (element.properties['displayName'] as string) ?? ''

  const [linked, setLinked] = useState(
    () => element.name.startsWith('new_') || element.name === toRegistryName(displayName)
  )

  const [idDraft, setIdDraft] = useState(element.name)
  useEffect(() => setIdDraft(element.name), [element.name])

  const draftDup = idDraft !== element.name ? taken.get(idDraft) : (taken.get(element.name) ?? null)

  const setDisplay = (raw: string): void => {
    const v = autoCapitalize ? capitalizeWords(raw) : raw
    const derived = toRegistryName(v)
    const canDerive = linked && derived.length > 0 && !taken.has(derived)
    updateElement(element.id, {

      name: canDerive ? derived : element.name,
      properties: { ...element.properties, displayName: v }
    })
  }

  const setId = (v: string): void => {
    const reg = toRegistryName(v)
    setLinked(false)
    setIdDraft(reg)
    if (reg && !taken.has(reg)) updateElement(element.id, { name: reg })
  }

  const derivedBlocked =
    linked && displayName && taken.has(toRegistryName(displayName)) && toRegistryName(displayName) !== element.name
      ? taken.get(toRegistryName(displayName))!
      : null
  const shownDup = draftDup ?? derivedBlocked

  return (
    <>
      <div>
        <label className="label-base">Name</label>
        <input
          className="input-base"
          value={displayName}
          autoFocus
          placeholder={titleCase(element.name)}
          onChange={(e) => setDisplay(e.target.value)}
        />
        <div className="mt-2">
          <Switch
            checked={autoCapitalize}
            onChange={setAutoCapitalize}
            label="Capitalize each word"
            hint="Type “wood block”, get “Wood Block”. Words you capitalize yourself are left alone."
          />
        </div>
      </div>
      <div>
        <label className="label-base">ID</label>
        <input
          className={cn('input-base font-mono text-xs', shownDup && 'shadow-glow-ember')}
          value={idDraft}
          onChange={(e) => setId(e.target.value)}
        />
        <p className="mt-1.5 text-2xs leading-relaxed text-mist-600">
          {idDraft !== element.name
            ? `Not saved. Still using "${element.name}".`
            : 'Fills in automatically from the name. Used for code, textures and recipes.'}
        </p>
      </div>
      {shownDup && (
        <div className="flex items-start gap-2 rounded-md bg-ember-500/10 p-3">
          <AlertTriangle size={13} className="mt-px shrink-0 text-ember-400" />
          <p className="text-2xs leading-relaxed text-ember-400">
            {duplicateMessage(
              derivedBlocked && !draftDup ? toRegistryName(displayName) : idDraft,
              shownDup
            )}
          </p>
        </div>
      )}
    </>
  )
}

function ReviewSlide(props: {
  checks: ReviewCheck[]
  allOk: boolean
  jumpTo: (stepId: string) => void
}): JSX.Element {
  return (
    <div className="space-y-1">
      {props.allOk && (
        <div className="mb-3 flex items-center gap-2.5 rounded-md bg-gold-500/10 p-3">
          <CheckCircle2 size={15} className="shrink-0 text-gold-400" />
          <p className="text-2xs leading-relaxed text-gold-300">
            Everything's done. This is ready to test and export.
          </p>
        </div>
      )}
      {props.checks.map((c) => (
        <div key={c.label} className="flex items-start gap-2.5 rounded-md px-1 py-1.5">
          <span
            className={cn(
              'mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
              c.ok ? 'bg-gold-500/20 text-gold-400' : 'bg-ember-500/15 text-ember-400'
            )}
          >
            {c.ok ? <Check size={10} strokeWidth={3} /> : <X size={10} strokeWidth={3} />}
          </span>
          <div className="min-w-0 flex-1">
            <span className={cn('text-[13px]', c.ok ? 'text-mist-300' : 'text-mist-100')}>{c.label}</span>
            {!c.ok && c.detail && (
              <p className="mt-0.5 text-2xs leading-relaxed text-mist-500">{c.detail}</p>
            )}
          </div>
          {!c.ok && c.stepId && (
            <button
              onClick={() => props.jumpTo(c.stepId!)}
              className="shrink-0 rounded-md bg-ink-750 px-2.5 py-1 text-2xs font-semibold uppercase tracking-wide text-mist-300 transition-colors hover:bg-ink-700 hover:text-mist-100"
            >
              Fix
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

export function TextureStrip({ element }: { element: ArtemisElement }): JSX.Element | null {
  const slots = textureSlotsForElement(element)
  if (slots.length === 0) return null
  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {slots.map((slot) => (
          <TexturePicker key={slot.key} slot={slot} />
        ))}
      </div>
      <p className="mt-3 text-2xs leading-relaxed text-mist-600">
        Click a square to pick from the Gallery or paint a new texture. Anything left empty also
        shows in the Gallery as "needs painting".
      </p>
    </div>
  )
}

export function usePropEditor<P extends object>(
  element: ArtemisElement,
  defaults: P
): [P, <K extends keyof P>(key: K, value: P[K]) => void, (updates: Partial<P>) => void] {
  const updateElement = useProjectStore((s) => s.updateElement)
  const props = { ...defaults, ...(element.properties as Partial<P>) } as P
  const patch = <K extends keyof P>(key: K, value: P[K]): void => {
    updateElement(element.id, { properties: { ...element.properties, [key]: value } })
  }
  const patchMany = (updates: Partial<P>): void => {
    updateElement(element.id, { properties: { ...element.properties, ...updates } })
  }
  return [props, patch, patchMany]
}
