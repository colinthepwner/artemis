import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Dices, Stamp, X } from 'lucide-react'
import { useCloseOnEscape } from '@/components/ui/dismissDistant'
import { Switch } from '@/components/ui/controls'
import { newSeed } from '@/components/pixel/stencils'
import { useRefArt, useRefLabel, WorkshopBlockPicker, type RefArt } from './refArt'
import { VoxelSprite } from './VoxelSprite'
import { TREE_TEMPLATES, templateSilhouette, type TreeTemplate } from './treeTemplates'
import { cn } from '@/lib/cn'

export function TreeTemplateDialog(props: {

  current: Record<string, string>
  defaultTrunk: string
  defaultLeaves: string
  onApply: (added: Record<string, string>) => void
  onClose: () => void
}): JSX.Element {
  const [templateId, setTemplateId] = useState(TREE_TEMPLATES[0].id)
  const template = TREE_TEMPLATES.find((t) => t.id === templateId) ?? TREE_TEMPLATES[0]
  const [seed, setSeed] = useState(() => newSeed())
  const [trunkRef, setTrunkRef] = useState(props.defaultTrunk)
  const [leavesRef, setLeavesRef] = useState(props.defaultLeaves)

  const [trunkTouched, setTrunkTouched] = useState(false)

  const selectTemplate = (t: TreeTemplate): void => {
    setTemplateId(t.id)
    if (!trunkTouched) setTrunkRef(t.suggestedTrunk ?? props.defaultTrunk)
  }
  const [placeTrunk, setPlaceTrunk] = useState(true)
  const [placeLeaves, setPlaceLeaves] = useState(true)
  const [pickerFor, setPickerFor] = useState<'trunk' | 'leaves' | null>(null)

  const silhouettes = useMemo(
    () => new Map(TREE_TEMPLATES.map((t) => [t.id, templateSilhouette(t.build(7)) ])),
    []
  )

  const cells = useMemo(() => template.build(seed), [template, seed])

  const added = useMemo(() => {
    const out: Record<string, string> = {}
    if (placeTrunk) {
      for (const k of cells.trunk) {
        if (!(k in props.current)) out[k] = trunkRef
      }
    }
    if (placeLeaves) {
      for (const k of cells.leaves) {
        if (!(k in props.current) && !(k in out)) out[k] = leavesRef
      }
    }
    return out
  }, [cells, placeTrunk, placeLeaves, trunkRef, leavesRef, props.current])

  const preview = useMemo(() => ({ ...props.current, ...added }), [props.current, added])
  const addedCount = Object.keys(added).length
  const keptCount =
    (placeTrunk ? cells.trunk.length : 0) + (placeLeaves ? cells.leaves.length : 0) - addedCount

  const refArt = useRefArt()

  useCloseOnEscape(props.onClose, () => !!pickerFor)

  const apply = (): void => {
    if (addedCount === 0) return
    props.onApply(added)
    props.onClose()
  }

  const groups: TreeTemplate['group'][] = ['BTA', 'Artemis']

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
            <h2 className="text-[13px] font-semibold tracking-tight">Tree shapes</h2>
            <p className="mt-0.5 text-2xs text-mist-500">
              A ready-made silhouette, stamped on top of your build. Cells you already placed are
              left alone.
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
                {TREE_TEMPLATES.filter((t) => t.group === group).map((t) => (
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
            {
}
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
                  Nothing to add — every cell is filled or both halves are off.
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
          <div className="flex w-[240px] shrink-0 flex-col gap-3 border-l border-white/[0.04] p-4">
            <div>
              <div className="text-[13px] font-medium text-mist-100">{template.name}</div>
              <p className="mt-0.5 text-2xs leading-relaxed text-mist-500">{template.desc}</p>
            </div>

            <button
              onClick={() => setSeed(newSeed())}
              className="flex items-center justify-center gap-1.5 rounded-md bg-ink-750 px-3 py-1.5 text-2xs text-mist-200 transition-colors hover:bg-ink-700"
              title="Same species, different tree"
            >
              <Dices size={13} /> Reroll the shape
            </button>

            <div className="flex flex-col gap-2 border-t border-white/[0.04] pt-3">
              <RefChip
                label="Trunk"
                refValue={trunkRef}
                art={refArt(trunkRef)}
                dim={!placeTrunk}
                onClick={() => setPickerFor('trunk')}
              />
              {trunkRef === 'block:CACTUS' && (
                <p className="text-2xs leading-relaxed text-mist-600">
                  Vanilla cactus refuses to stand touching other blocks in-game, so wide shapes
                  fall apart. A block of your own wearing the cactus texture holds any shape.
                </p>
              )}
              <Switch checked={placeTrunk} onChange={setPlaceTrunk} label="Place the trunk" />
              <RefChip
                label="Leaves"
                refValue={leavesRef}
                art={refArt(leavesRef)}
                dim={!placeLeaves}
                onClick={() => setPickerFor('leaves')}
              />
              <Switch
                checked={placeLeaves}
                onChange={setPlaceLeaves}
                label="Place the leaves"
                hint={cells.leaves.length === 0 ? 'This shape has no leaves to place.' : undefined}
              />
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
            if (pickerFor === 'trunk') {
              setTrunkRef(ref)
              setTrunkTouched(true)
            } else {
              setLeavesRef(ref)
            }
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
      title={`${props.label}: ${name} — click to change`}
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
