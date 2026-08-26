import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Dices, Layers, Scissors, Stamp, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Switch } from '@/components/ui/controls'
import { gridToDataUrl, type Grid } from './presets'
import {
  defaultParams,
  newSeed,
  previewStencil,
  STENCILS,
  type ParamValue,
  type Stencil,
  type StencilResult
} from './stencils'

export interface StencilApplyOptions {

  newLayer: boolean

  allLayers: boolean
}

export function StencilDialog(props: {

  below: Grid

  full: Grid

  angle: number

  canAddLayer: boolean
  onApply: (stencil: Stencil, result: StencilResult, opts: StencilApplyOptions) => void
  onClose: () => void
}): JSX.Element {
  const [stencilId, setStencilId] = useState(STENCILS[0].id)
  const [seed, setSeed] = useState(() => newSeed())
  const [newLayer, setNewLayer] = useState(true)
  const [allLayers, setAllLayers] = useState(true)

  const [params, setParams] = useState<Record<string, Record<string, ParamValue>>>(() =>
    Object.fromEntries(STENCILS.map((s) => [s.id, defaultParams(s)]))
  )
  const [colors, setColors] = useState<Record<string, string>>(() =>
    Object.fromEntries(STENCILS.map((s) => [s.id, s.suggestedColor ?? '#7d7d7d']))
  )

  const stencil = STENCILS.find((s) => s.id === stencilId) ?? STENCILS[0]
  const source = stencil.mode === 'cut' ? props.full : props.below
  const color = colors[stencil.id]

  const input = {
    below: source,
    color,
    seed,
    angle: props.angle,
    params: params[stencil.id]
  }

  const preview = useMemo(
    () => gridToDataUrl(previewStencil(stencil, input)),

    [stencil, source, color, seed, params[stencil.id], props.angle]
  )
  const beforeUrl = useMemo(() => gridToDataUrl(source), [source])

  const thumbs = useMemo(() => {
    const out: Record<string, string> = {}
    for (const s of STENCILS) {
      const src = s.mode === 'cut' ? props.full : props.below
      out[s.id] = gridToDataUrl(
        previewStencil(s, {
          below: src,
          color: s.suggestedColor ?? '#7d7d7d',
          seed: 1337,
          angle: props.angle,
          params: defaultParams(s)
        })
      )
    }
    return out

  }, [props.below, props.full, props.angle])

  const groups = useMemo(() => {
    const seen: string[] = []
    for (const s of STENCILS) if (!seen.includes(s.group)) seen.push(s.group)
    return seen
  }, [])

  const setParam = (key: string, value: ParamValue): void =>
    setParams((p) => ({ ...p, [stencil.id]: { ...p[stencil.id], [key]: value } }))

  const cutting = stencil.mode === 'cut'
  const apply = (): void =>
    props.onApply(stencil, stencil.run(input), {
      newLayer: newLayer && props.canAddLayer,
      allLayers
    })

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <motion.div
        className="acrylic absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.12 }}
        onClick={props.onClose}
      />
      <motion.div
        className="relative flex h-[80vh] w-[790px] flex-col overflow-hidden rounded-xl bg-ink-850 shadow-raised"
        initial={{ opacity: 0, scale: 0.97, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-start gap-2 border-b border-white/[0.04] px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 text-[13px] font-semibold tracking-tight">
              <Stamp size={13} className="text-gold-400" /> Stencils
            </h2>
            <p className="mt-0.5 text-2xs text-mist-500">
              Generated overlays, seeded. Reroll until the arrangement suits, then drop it in as a
              layer.
            </p>
          </div>
          <div className="flex-1" />
          <button
            onClick={props.onClose}
            className="rounded-md p-1.5 text-mist-500 transition-colors hover:bg-ink-750 hover:text-mist-200 focus-visible:ring-0"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {}
          <div className="w-[212px] shrink-0 overflow-y-auto border-r border-white/[0.04] px-2.5 py-3">
            {groups.map((group) => (
              <div key={group} className="mb-3 last:mb-0">
                <div className="mb-1.5 flex items-center gap-2 px-1">
                  <span className="text-2xs font-semibold uppercase tracking-wider text-mist-500">
                    {group}
                  </span>
                  <span className="h-px flex-1 bg-white/[0.05]" />
                </div>
                {STENCILS.filter((s) => s.group === group).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setStencilId(s.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md p-1.5 text-left transition-colors focus-visible:ring-0',
                      s.id === stencil.id ? 'bg-ink-750 shadow-panel' : 'hover:bg-ink-800'
                    )}
                  >
                    <span
                      className="h-8 w-8 shrink-0 overflow-hidden rounded"
                      style={{
                        backgroundImage: 'repeating-conic-gradient(#31363e 0% 25%, #262b32 0% 50%)',
                        backgroundSize: '8px 8px'
                      }}
                    >
                      <img
                        src={thumbs[s.id]}
                        alt=""
                        className="h-full w-full"
                        style={{ imageRendering: 'pixelated' }}
                        draggable={false}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block truncate text-xs',
                          s.id === stencil.id ? 'text-mist-100' : 'text-mist-400'
                        )}
                      >
                        {s.label}
                      </span>
                      {s.mode === 'cut' && (
                        <span className="flex items-center gap-1 text-[10px] leading-tight text-ember-400/80">
                          <Scissors size={9} /> cuts out
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          {}
          <div className="min-w-0 flex-1 overflow-y-auto p-5">
            <div className="flex items-start gap-4">
              <span
                className="shrink-0 overflow-hidden rounded-lg shadow-panel"
                style={{
                  backgroundImage: 'repeating-conic-gradient(#31363e 0% 25%, #262b32 0% 50%)',
                  backgroundSize: '14px 14px'
                }}
              >
                <img
                  src={preview}
                  alt="stencil preview"
                  className="block h-[176px] w-[176px]"
                  style={{ imageRendering: 'pixelated' }}
                  draggable={false}
                />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className="overflow-hidden rounded shadow-panel"
                    style={{
                      backgroundImage: 'repeating-conic-gradient(#31363e 0% 25%, #262b32 0% 50%)',
                      backgroundSize: '8px 8px'
                    }}
                  >
                    <img
                      src={beforeUrl}
                      alt="before"
                      className="block h-11 w-11"
                      style={{ imageRendering: 'pixelated' }}
                      draggable={false}
                    />
                  </span>
                  <span className="text-2xs leading-snug text-mist-600">
                    before
                    <br />
                    the stencil
                  </span>
                </div>
                <p className="text-2xs leading-relaxed text-mist-500">{stencil.blurb}</p>
              </div>
            </div>

            <div className="mt-4 space-y-3 rounded-lg bg-ink-900/50 p-3 shadow-panel">
              <div className="flex items-center gap-2">
                <span className="w-20 shrink-0 text-2xs uppercase tracking-wider text-mist-500">
                  Seed
                </span>
                <input
                  className="input-base w-24 py-1 text-center font-mono text-2xs"
                  value={seed}
                  onChange={(e) => {
                    const v = Number(e.target.value.replace(/\D/g, ''))
                    if (Number.isFinite(v)) setSeed(v)
                  }}
                  onFocus={(e) => e.target.select()}
                />
                <button
                  onClick={() => setSeed(newSeed())}
                  title="Roll a different arrangement"
                  className="flex items-center gap-1.5 rounded-md bg-ink-750 px-2.5 py-1 text-2xs uppercase tracking-wide text-mist-300 transition-colors hover:bg-ink-700 hover:text-gold-300 focus-visible:ring-0"
                >
                  <Dices size={12} /> Reroll
                </button>
                <div className="flex-1" />
                {stencil.usesColor && (
                  <>
                    <span className="text-2xs uppercase tracking-wider text-mist-500">Color</span>
                    <label
                      className="relative h-6 w-10 shrink-0 cursor-default overflow-hidden rounded-md shadow-panel"
                      style={{ background: color }}
                      title="Base color the stencil builds its tones from"
                    >
                      <input
                        type="color"
                        value={color}
                        className="absolute inset-0 h-full w-full opacity-0"
                        onChange={(e) =>
                          setColors((c) => ({ ...c, [stencil.id]: e.target.value.toLowerCase() }))
                        }
                      />
                    </label>
                  </>
                )}
              </div>

              {stencil.params.map((p) =>
                p.kind === 'slider' ? (
                  <div key={p.key} className="flex items-center gap-2" title={p.hint}>
                    <span className="w-20 shrink-0 text-2xs text-mist-500">{p.label}</span>
                    <input
                      type="range"
                      min={p.min ?? 0}
                      max={p.max ?? 100}
                      step={p.step ?? 1}
                      value={Number(params[stencil.id][p.key])}
                      onChange={(e) => setParam(p.key, Number(e.target.value))}
                      className="fx-slider min-w-0 flex-1"
                    />
                    <span className="w-8 shrink-0 text-right font-mono text-2xs text-mist-400">
                      {String(params[stencil.id][p.key])}
                    </span>
                  </div>
                ) : p.kind === 'switch' ? (
                  <Switch
                    key={p.key}
                    label={p.label}
                    hint={p.hint}
                    checked={Boolean(params[stencil.id][p.key])}
                    onChange={(v) => setParam(p.key, v)}
                  />
                ) : (
                  <div key={p.key} className="flex items-center gap-2" title={p.hint}>
                    <span className="w-20 shrink-0 text-2xs text-mist-500">{p.label}</span>
                    <Segmented
                      options={p.options ?? []}
                      value={String(params[stencil.id][p.key])}
                      onChange={(v) => setParam(p.key, v)}
                    />
                  </div>
                )
              )}
            </div>

            <div className="mt-3 rounded-lg bg-ink-900/50 p-3 shadow-panel">
              {cutting ? (
                <div className="flex items-center gap-2">
                  <span className="flex w-20 shrink-0 items-center gap-1.5 text-2xs text-mist-500">
                    <Scissors size={11} /> Cut from
                  </span>
                  <Segmented
                    options={[
                      { value: 'all', label: 'Every layer' },
                      { value: 'active', label: 'This layer' }
                    ]}
                    value={allLayers ? 'all' : 'active'}
                    onChange={(v) => setAllLayers(v === 'all')}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="flex w-20 shrink-0 items-center gap-1.5 text-2xs text-mist-500">
                    <Layers size={11} /> Land on
                  </span>
                  <Segmented
                    options={[
                      { value: 'new', label: 'A new layer' },
                      { value: 'active', label: 'The active layer' }
                    ]}
                    value={newLayer && props.canAddLayer ? 'new' : 'active'}
                    onChange={(v) => setNewLayer(v === 'new')}
                    disabled={props.canAddLayer ? undefined : 'new'}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {
}
        <div className="flex items-center gap-3 border-t border-white/[0.04] px-5 py-3">
          <span className="min-w-0 flex-1 truncate text-2xs text-mist-600">
            {cutting
              ? 'Erases pixels. Undo puts them back.'
              : props.canAddLayer
                ? 'Added as pixels you can paint over, not as an effect.'
                : 'Layer limit reached, so this merges into the active layer.'}
          </span>
          <button
            onClick={props.onClose}
            className="shrink-0 rounded-md px-4 py-1.5 text-[13px] text-mist-400 transition-colors hover:bg-ink-750 hover:text-mist-200 focus-visible:ring-0"
          >
            Cancel
          </button>
          <button
            onClick={apply}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-gold-500 px-4 py-1.5 text-[13px] font-medium text-ink-950 transition-all hover:bg-gold-400 active:scale-[0.98] focus-visible:ring-0"
          >
            <Stamp size={14} /> {cutting ? 'Cut it out' : 'Add stencil'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

function Segmented(props: {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void

  disabled?: string
}): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1.5">
      {props.options.map((o) => {
        const off = o.value === props.disabled
        const on = o.value === props.value && !off
        return (
          <button
            key={o.value}
            onClick={() => !off && props.onChange(o.value)}
            className={cn(

              'relative rounded-full px-2.5 py-1 text-2xs transition-all duration-100 focus-visible:ring-0',
              off
                ? 'pointer-events-none bg-ink-800/60 text-mist-700'
                : on
                  ? 'z-10 bg-gold-500/15 text-gold-300 shadow-glow-gold'
                  : 'bg-ink-800 text-mist-500 shadow-panel hover:bg-ink-750 hover:text-mist-300'
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
