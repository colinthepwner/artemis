import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Dices, Stamp, X } from 'lucide-react'
import { useCloseOnEscape } from '@/components/ui/dismissDistant'
import { Switch } from '@/components/ui/controls'
import { newSeed } from '@/components/pixel/stencils'
import { applyStamp, useRefArt, useRefLabel, WorkshopBlockPicker, type RefArt } from './refArt'
import { VoxelSprite } from './VoxelSprite'
import {
  STRUCTURE_TEMPLATES,
  structureSilhouette,
  type StructureTemplate
} from './structureTemplates'
import { cn } from '@/lib/cn'

export function StructureTemplateDialog(props: {

  current: Record<string, string>
  onApply: (added: Record<string, string>) => void
  onClose: () => void
}): JSX.Element {
  const [templateId, setTemplateId] = useState(STRUCTURE_TEMPLATES[0].id)
  const template = STRUCTURE_TEMPLATES.find((t) => t.id === templateId) ?? STRUCTURE_TEMPLATES[0]
  const [seed, setSeed] = useState(() => newSeed())

  const [refs, setRefs] = useState<Record<string, string>>(() =>
    Object.fromEntries(STRUCTURE_TEMPLATES[0].slots.map((s) => [s.key, s.defaultRef]))
  )

  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const [enabled, setEnabled] = useState<Record<string, boolean>>({})
  const isOn = (key: string): boolean => enabled[key] ?? true

  const selectTemplate = (t: StructureTemplate): void => {
    setTemplateId(t.id)
    setRefs((prev) => {
      const next = { ...prev }
      for (const s of t.slots) {
        if (!touched[s.key] || !(s.key in next)) next[s.key] = s.defaultRef
      }
      return next
    })
  }
  const [pickerFor, setPickerFor] = useState<string | null>(null)

  const silhouettes = useMemo(
    () => new Map(STRUCTURE_TEMPLATES.map((t) => [t.id, structureSilhouette(t.build(7), t.slots)])),
    []
  )

  const cells = useMemo(() => template.build(seed), [template, seed])

  const added = useMemo(() => {
    const out: Record<string, string> = {}
    for (const slot of template.slots) {
      if (!(enabled[slot.key] ?? true)) continue
      const ref = refs[slot.key] ?? slot.defaultRef
      for (const k of cells[slot.key] ?? []) {
        if (!(k in props.current) && !(k in out)) out[k] = ref
      }
    }
    return out
  }, [cells, template, enabled, refs, props.current])

  const preview = useMemo(() => ({ ...props.current, ...added }), [props.current, added])
  const addedCount = Object.keys(added).length
  const keptCount =
    template.slots.reduce((n, s) => n + (isOn(s.key) ? (cells[s.key]?.length ?? 0) : 0), 0) -
    addedCount

  const refArt = useRefArt()

  useCloseOnEscape(props.onClose, () => !!pickerFor)

  const apply = (): void => applyStamp(added, props.onApply, props.onClose)

  const groups: StructureTemplate['group'][] = ['BTA', 'Artemis']

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center">
      <motion.div
        className="acrylic absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.12 }}
        onClick={props.onClose}
      />
      <motion.div
        className="relative flex h-[78vh] w-[880px] flex-col overflow-hidden rounded-xl bg-ink-850 shadow-raised"
        initial={{ opacity: 0, scale: 0.97, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-start gap-2 border-b border-white/[0.04] px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold tracking-tight">Structure shapes</h2>
            <p className="mt-0.5 text-2xs text-mist-500">
              A ready-made build, stamped on top of yours. Cells you already placed are left
              alone.
            </p>
          </div>
          <div className="flex-1" />
          <button
            onClick={props.onClose}
            className="rounded-md p-1.5 text-mist-500 transition-colors hover:bg-ink-750 hover:text-mist-200"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {}
          <div className="w-[210px] shrink-0 overflow-y-auto border-r border-white/[0.04] p-2">
            {groups.map((group) => (
              <div key={group} className="mb-3 last:mb-0">
                <div className="mb-1.5 flex items-center gap-3 px-1.5 pt-1">
                  <span className="text-2xs font-semibold uppercase tracking-wider text-mist-500">
                    {group}
                  </span>
                  <span className="h-px flex-1 bg-white/[0.05]" />
                </div>
                {STRUCTURE_TEMPLATES.filter((t) => t.group === group).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => selectTemplate(t)}
                    title={t.desc}
                    className={cn(
                      'mb-0.5 flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                      t.id === templateId
                        ? 'bg-ink-750 text-mist-50 shadow-panel'
                        : 'text-mist-400 hover:bg-ink-750/60 hover:text-mist-200'
                    )}
                  >
                    <img
                      src={silhouettes.get(t.id)}
                      alt=""
                      draggable={false}
                      className="h-7 w-6 shrink-0 rounded-[2px] bg-ink-900/70 object-contain p-0.5"
                      style={{ imageRendering: 'pixelated' }}
                    />
                    <span className="truncate">{t.name}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          {}
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 bg-ink-900/50 p-4">
            <VoxelSprite
              blocks={preview}
              size={330}
              maxCells={8000}
              fallback={
                <p className="max-w-xs text-center text-2xs leading-relaxed text-mist-500">
                  Too many blocks to draw a preview of the merge. The counts below still tell the
                  story, and undo takes the stamp back off in one step.
                </p>
              }
            />
            <p className="text-2xs text-mist-500">
              {addedCount === 0 ? (
                <span className="text-ember-400/90">
                  Nothing to add: every cell is filled or every part is off.
                </span>
              ) : (
                <>
                  Adds <span className="font-mono text-mist-300">{addedCount}</span> block
                  {addedCount === 1 ? '' : 's'}
                  {keptCount > 0 && (
                    <> · {keptCount} cell{keptCount === 1 ? '' : 's'} already yours, left alone</>
                  )}
                </>
              )}
            </p>
          </div>

          {}
          <div className="flex w-[240px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-white/[0.04] p-4">
            <div>
              <div className="text-[13px] font-medium text-mist-100">{template.name}</div>
              <p className="mt-0.5 text-2xs leading-relaxed text-mist-500">{template.desc}</p>
            </div>

            <button
              onClick={() => setSeed(newSeed())}
              className="flex items-center justify-center gap-1.5 rounded-md bg-ink-750 px-3 py-1.5 text-2xs text-mist-200 transition-colors hover:bg-ink-700"
              title="Same shape, different build"
            >
              <Dices size={13} /> Reroll the shape
            </button>

            <div className="flex flex-col gap-2 border-t border-white/[0.04] pt-3">
              {template.slots.map((slot) => (
                <div key={slot.key} className="flex flex-col gap-2">
                  <RefChip
                    label={slot.label}
                    refValue={refs[slot.key] ?? slot.defaultRef}
                    art={refArt(refs[slot.key] ?? slot.defaultRef)}
                    dim={!isOn(slot.key)}
                    onClick={() => setPickerFor(slot.key)}
                  />
                  <Switch
                    checked={isOn(slot.key)}
                    onChange={(v) => setEnabled((prev) => ({ ...prev, [slot.key]: v }))}
                    label={`Place the ${slot.label.toLowerCase()}`}
                    hint={
                      (cells[slot.key]?.length ?? 0) === 0
                        ? 'This roll has none of these to place.'
                        : undefined
                    }
                  />
                </div>
              ))}
            </div>

            <div className="flex-1" />
            <button
              onClick={apply}
              disabled={addedCount === 0}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-md bg-gold-500 px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-ink-950 transition-all',
                addedCount === 0
                  ? 'cursor-not-allowed opacity-40'
                  : 'hover:bg-gold-400 active:scale-[0.97]'
              )}
            >
              <Stamp size={13} /> Stamp it on
            </button>
            <p className="text-center text-2xs leading-relaxed text-mist-600">
              Lands on top of your build. Undo takes it back off in one step.
            </p>
          </div>
        </div>
      </motion.div>

      {pickerFor && (
        <WorkshopBlockPicker
          onClose={() => setPickerFor(null)}
          onPick={(ref) => {
            setRefs((prev) => ({ ...prev, [pickerFor]: ref }))
            setTouched((prev) => ({ ...prev, [pickerFor]: true }))
            setPickerFor(null)
          }}
        />
      )}
    </div>
  )
}

function RefChip(props: {
  label: string
  refValue: string
  art: RefArt
  dim: boolean
  onClick: () => void
}): JSX.Element {
  const name = useRefLabel(props.refValue)
  return (
    <button
      onClick={props.onClick}
      title={`${props.label}: ${name} (click to change)`}
      className={cn(
        'flex w-full items-center gap-2 rounded-md bg-ink-750 px-2 py-1.5 text-left transition-all hover:bg-ink-700',
        props.dim && 'opacity-45'
      )}
    >
      <span
        className="h-6 w-6 shrink-0 overflow-hidden rounded-[3px] shadow-panel"
        style={{
          backgroundColor: props.art.side ? undefined : props.art.color,
          backgroundImage: props.art.side ? `url(${props.art.side})` : undefined,
          backgroundSize: '100% 100%',
          imageRendering: 'pixelated'
        }}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-2xs uppercase tracking-wide text-mist-500">{props.label}</span>
        <span className="block truncate text-xs text-mist-100">{name}</span>
      </span>
    </button>
  )
}
