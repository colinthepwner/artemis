import { useEffect, useState } from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { Hand } from 'lucide-react'
import { mix } from './presets'
import { swatchFor } from './blockSwatches'
import { useVanillaArt } from './useVanillaArt'
import { cn } from '@/lib/cn'
import { IsoBlock } from '../ui/ContentThumb'

const LEVELS = 16

const RAMP = (t: number): string => mix('#5c4a22', '#f2c77e', t)

const UNLIT = '#161b22'

const cellAt = (i: number, cells: number): string => `${((i * 2 + 1) / (cells * 2)) * 100}%`

function SegmentedTrack(props: {

  cells: number

  index: number
  onIndex: (i: number) => void

  ramp?: (t: number) => string

  glow?: boolean
}): JSX.Element {
  const { cells, index } = props
  const ramp = props.ramp ?? RAMP
  const last = cells - 1

  return (
    <SliderPrimitive.Root
      value={[index]}
      onValueChange={([v]) => props.onIndex(v)}
      min={0}
      max={last}
      step={1}
      className="relative flex h-8 w-full touch-none items-center"
    >
      <SliderPrimitive.Track
        className="relative flex h-5 flex-1 overflow-hidden rounded-[3px] bg-ink-950 shadow-panel"
        style={{
          boxShadow:
            props.glow && index > 0
              ? `0 0 ${2 + index}px rgba(255,214,130,${(index / last) * 0.45}), 0 0 0 1px rgba(255,255,255,0.045)`
              : undefined
        }}
      >
        {Array.from({ length: cells }, (_, i) => {
          const on = i > 0 && i <= index
          return (
            <span
              key={i}
              className="flex-1"
              style={{
                background: on ? ramp(i / last) : UNLIT,

                boxShadow:
                  'inset -1px 0 0 rgba(0,0,0,0.55)' + (on ? ', inset 0 -2px 0 rgba(0,0,0,0.28)' : '')
              }}
            />
          )
        })}
      </SliderPrimitive.Track>
      {

}
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 h-7 -translate-x-1/2 -translate-y-1/2 rounded-[4px] bg-mist-50/20 shadow-raised ring-2 ring-mist-50"
        style={{ left: cellAt(index, cells), width: `${100 / cells}%` }}
      />
      <SliderPrimitive.Thumb className="block h-7 w-1 opacity-0" />
    </SliderPrimitive.Root>
  )
}

const LIGHT_MARKS: { at: number; swatch: string; label: string }[] = [
  { at: 1, swatch: 'mushroom', label: 'Brown mushroom' },
  { at: 7, swatch: 'torchRedstone', label: 'Redstone torch' },
  { at: 14, swatch: 'torch', label: 'Torch' },
  { at: 15, swatch: 'glowstone', label: 'Glowstone' }
]

export function LightSlider(props: {
  value: number
  onChange: (v: number) => void
}): JSX.Element {
  const art = useVanillaArt()
  const lit = props.value

  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <SegmentedTrack
          cells={LEVELS}
          index={lit}
          onIndex={props.onChange}

          ramp={(t) => mix('#8a4a12', '#fff3cd', t)}
          glow
        />

        {}
        <div className="relative mt-0 h-[26px]">
          {LIGHT_MARKS.map((m) => {
            const swatch = swatchFor(m.swatch, art)
            return (
              <button
                key={m.at}
                type="button"
                onClick={() => props.onChange(m.at)}
                title={`${m.label}, light ${m.at}`}

                className="absolute top-0 flex w-5 -translate-x-1/2 flex-col items-center gap-0.5"
                style={{ left: cellAt(m.at, LEVELS) }}
              >
                <span className="h-[3px] w-px bg-mist-600" />
                {swatch ? (
                  swatch.item || swatch.flat ? (
                    <span
                      className={cn(
                        'h-5 w-5 shrink-0 transition-transform hover:scale-125',
                        lit === m.at && 'scale-125'
                      )}
                      style={{
                        backgroundImage: `url(${swatch.texture})`,
                        backgroundSize: swatch.scale ? `${swatch.scale}%` : swatch.flat ? '150%' : '125%',
                        backgroundPosition: swatch.flat ? 'center bottom' : 'center',
                        backgroundRepeat: 'no-repeat',
                        imageRendering: 'pixelated'
                      }}
                    />
                  ) : (
                    <span
                      className={cn(
                        'shrink-0 transition-transform hover:scale-125',
                        lit === m.at && 'scale-125'
                      )}
                    >
                      <IsoBlock
                        top={swatch.texture.split('||')[0]}
                        side={swatch.texture.split('||')[1] ?? swatch.texture.split('||')[0]}
                        size={20}
                      />
                    </span>
                  )
                ) : (
                  <span className="text-2xs text-mist-600">{m.at}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <span className="mt-1 w-8 shrink-0 text-right font-mono text-2xs text-mist-400">
        {lit}
      </span>
    </div>
  )
}

const CLIMATE_CELLS = 21

export function ClimateSlider(props: {
  value: number
  onChange: (v: number) => void
  marks: { at: number; swatch: string; label: string }[]
}): JSX.Element {
  const art = useVanillaArt()
  const cell = Math.round(props.value * (CLIMATE_CELLS - 1))

  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <SegmentedTrack
          cells={CLIMATE_CELLS}
          index={cell}
          onIndex={(i) => props.onChange(i / (CLIMATE_CELLS - 1))}
        />

        <div className="relative mt-0 h-[26px]">
          {props.marks.map((m) => {
            const swatch = swatchFor(m.swatch, art)
            return (
              <button
                key={m.at}
                type="button"
                onClick={() => props.onChange(m.at)}
                title={m.label}
                className="absolute top-0 flex w-5 -translate-x-1/2 flex-col items-center gap-0.5"

                style={{ left: cellAt(Math.round(m.at * (CLIMATE_CELLS - 1)), CLIMATE_CELLS) }}
              >
                <span className="h-[3px] w-px bg-mist-600" />
                {swatch ? (
                  swatch.item || swatch.flat ? (
                    <span
                      className={cn(
                        'h-5 w-5 shrink-0 transition-transform hover:scale-125',
                        props.value === m.at && 'scale-125'
                      )}
                      style={{
                        backgroundImage: `url(${swatch.texture})`,
                        backgroundSize: swatch.scale ? `${swatch.scale}%` : swatch.flat ? '150%' : '125%',
                        backgroundPosition: swatch.flat ? 'center bottom' : 'center',
                        backgroundRepeat: 'no-repeat',
                        imageRendering: 'pixelated'
                      }}
                    />
                  ) : (
                    <span
                      className={cn(
                        'shrink-0 transition-transform hover:scale-125',
                        props.value === m.at && 'scale-125'
                      )}
                    >
                      <IsoBlock
                        top={swatch.texture.split('||')[0]}
                        side={swatch.texture.split('||')[1] ?? swatch.texture.split('||')[0]}
                        size={20}
                      />
                    </span>
                  )
                ) : (
                  <span className="text-2xs text-mist-600">{m.at}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <span className="mt-1 w-8 shrink-0 text-right font-mono text-2xs text-mist-400">
        {props.value.toFixed(2)}
      </span>
    </div>
  )
}

export interface ScaleMark {
  at: number

  swatch: string
  label: string
}

export const RESISTANCE_MARKS: ScaleMark[] = [
  { at: 2.5, swatch: 'dirt', label: 'Dirt and sand' },
  { at: 5, swatch: 'wood', label: 'Wood, and most ores' },
  { at: 10, swatch: 'stone', label: 'Stone, and metal blocks' },
  { at: 2000, swatch: 'obsidian', label: 'Obsidian and steel' }
]

export const HARDNESS_MARKS: ScaleMark[] = [
  { at: 0.2, swatch: 'leaves', label: 'Leaves' },
  { at: 0.5, swatch: 'sand', label: 'Sand and dirt' },
  { at: 1.5, swatch: 'stone', label: 'Stone' },
  { at: 3, swatch: 'ore', label: 'Ore' },
  { at: 5, swatch: 'iron', label: 'Block of iron' },
  { at: 50, swatch: 'obsidian', label: 'Obsidian' }
]

const STEPS = 20

const SCALE_CELLS = STEPS + 1

function decimalsOf(step: number): number {
  const s = String(step)
  return s.includes('.') ? s.split('.')[1].length : 0
}

export function ScaleSlider(props: {
  value: number
  onChange: (v: number) => void
  max: number

  from?: number
  step?: number
  marks?: ScaleMark[]
}): JSX.Element {
  const art = useVanillaArt()
  const { max, value } = props
  const step = props.step ?? 0.1
  const from = props.from ?? 0.1
  const digits = decimalsOf(step)
  const span = Math.log(max / from)

  const toPos = (v: number): number => {
    if (v <= 0) return 0
    const t = Math.log(Math.min(max, Math.max(from, v)) / from) / span
    return 1 + Math.round(t * (STEPS - 1))
  }
  const fromPos = (p: number): number => {
    if (p <= 0) return 0
    const raw = from * Math.exp((span * (p - 1)) / (STEPS - 1))
    return parseFloat((Math.round(raw / step) * step).toFixed(digits))
  }

  const [text, setText] = useState(String(value))
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    if (!typing) setText(String(value))
  }, [value, typing])

  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <SegmentedTrack
          cells={SCALE_CELLS}
          index={toPos(value)}
          onIndex={(p) => props.onChange(fromPos(p))}
        />

        {props.marks && props.marks.length > 0 && (
          <div className="relative mt-0 h-[26px]">
            {props.marks.map((m) => {
              const swatch = swatchFor(m.swatch, art)

              return (
                <button
                  key={`${m.swatch}-${m.at}`}
                  type="button"
                  onClick={() => props.onChange(m.at)}
                  title={`${m.label}: ${m.at}`}

                  className="absolute top-0 flex w-5 -translate-x-1/2 flex-col items-center gap-0.5"
                  style={{ left: cellAt(toPos(m.at), SCALE_CELLS) }}
                >
                  <span className="h-[3px] w-px bg-mist-600" />
                  {swatch ? (
                    swatch.item || swatch.flat ? (
                      <span
                        className={cn(
                          'h-5 w-5 shrink-0 transition-transform hover:scale-125',
                          value === m.at && 'scale-125'
                        )}
                        style={{
                          backgroundImage: `url(${swatch.texture})`,
                          backgroundSize: swatch.scale ? `${swatch.scale}%` : swatch.flat ? '150%' : '125%',
                          backgroundPosition: swatch.flat ? 'center bottom' : 'center',
                          backgroundRepeat: 'no-repeat',
                          imageRendering: 'pixelated'
                        }}
                      />
                    ) : (
                      <span
                        className={cn(
                          'shrink-0 transition-transform hover:scale-125',
                          value === m.at && 'scale-125'
                        )}
                      >
                        <IsoBlock
                          top={swatch.texture.split('||')[0]}
                          side={swatch.texture.split('||')[1] ?? swatch.texture.split('||')[0]}
                          size={20}
                        />
                      </span>
                    )
                  ) : (
                    <span className="text-2xs text-mist-600">{m.at}</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <input
        type="number"
        min={0}
        step={step}
        value={text}
        onFocus={() => setTyping(true)}
        onBlur={() => {
          setTyping(false)
          setText(String(value))
        }}
        onChange={(e) => {
          setText(e.target.value)
          const v = parseFloat(e.target.value)
          if (!Number.isNaN(v) && v >= 0) props.onChange(v)
        }}
        className="input-base w-[68px] shrink-0 px-2 py-1 text-right font-mono text-2xs"
      />
    </div>
  )
}

export interface SwatchStop {

  swatch: string
  label: string

  fallback?: JSX.Element
}

export const HARVEST_TIERS: (SwatchStop & { level: number })[] = [
  { level: 0, swatch: 'tierAny', label: 'Any tool, or none' },
  { level: 1, swatch: 'tierStone', label: 'Stone or better' },
  { level: 2, swatch: 'tierIron', label: 'Iron or better' },
  { level: 3, swatch: 'tierDiamond', label: 'Diamond' }
]

export function SwatchStopSlider(props: {
  stops: SwatchStop[]
  index: number
  onChange: (index: number) => void
}): JSX.Element {
  const art = useVanillaArt()
  const stops = props.stops
  const index = Math.min(stops.length - 1, Math.max(0, Math.round(props.index)))
  const center = (i: number): string => `${((i * 2 + 1) / (stops.length * 2)) * 100}%`

  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <SliderPrimitive.Root
          value={[index]}
          onValueChange={([v]) => props.onChange(v)}
          min={0}
          max={stops.length - 1}
          step={1}
          className="relative flex h-8 w-full touch-none items-center"
        >
          <SliderPrimitive.Track className="relative flex h-5 flex-1 overflow-hidden rounded-[3px] bg-ink-950 shadow-panel">
            {stops.map((t, i) => (
              <span
                key={t.swatch + i}
                className="flex-1"
                style={{
                  background:
                    i <= index ? mix('#3a3f47', '#e6ad55', i / Math.max(1, stops.length - 1)) : '#161b22',
                  boxShadow: 'inset -1px 0 0 rgba(0,0,0,0.55)'
                }}
              />
            ))}
          </SliderPrimitive.Track>
          {}
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 h-7 -translate-x-1/2 -translate-y-1/2 rounded-[4px] bg-mist-50/20 shadow-raised ring-2 ring-mist-50"
            style={{ left: center(index), width: `${100 / stops.length}%` }}
          />
          <SliderPrimitive.Thumb className="block h-7 w-1 opacity-0" />
        </SliderPrimitive.Root>

        <div className="relative mt-0 h-[26px]">
          {stops.map((t, i) => {
            const swatch = t.swatch ? swatchFor(t.swatch, art) : undefined
            const selected = index === i
            return (
              <button
                key={t.swatch + i}
                type="button"
                onClick={() => props.onChange(i)}
                title={t.label}
                className="absolute top-0 flex w-5 -translate-x-1/2 flex-col items-center gap-0.5"
                style={{ left: center(i) }}
              >
                <span className="h-[3px] w-px bg-mist-600" />
                {swatch ? (
                  swatch.item || swatch.flat ? (
                    <span
                      className={cn(
                        'h-5 w-5 shrink-0 transition-transform hover:scale-125',
                        selected && 'scale-125'
                      )}
                      style={{
                        backgroundImage: `url(${swatch.texture})`,
                        backgroundSize: swatch.scale ? `${swatch.scale}%` : swatch.flat ? '150%' : '125%',
                        backgroundPosition: swatch.flat ? 'center bottom' : 'center',
                        backgroundRepeat: 'no-repeat',
                        imageRendering: 'pixelated'
                      }}
                    />
                  ) : (
                    <span className={cn('shrink-0 transition-transform hover:scale-125', selected && 'scale-125')}>
                      <IsoBlock
                        top={swatch.texture.split('||')[0]}
                        side={swatch.texture.split('||')[1] ?? swatch.texture.split('||')[0]}
                        size={20}
                      />
                    </span>
                  )
                ) : (
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center text-mist-600 transition-transform hover:scale-125',
                      selected && 'scale-125 text-mist-300'
                    )}
                  >
                    {t.fallback ?? <span className="text-2xs">{i}</span>}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <span className="mt-1 w-20 shrink-0 text-right text-2xs leading-tight text-mist-500">
        {stops[index].label}
      </span>
    </div>
  )
}

export function HarvestLevelSlider(props: {
  value: number
  onChange: (v: number) => void
}): JSX.Element {
  const level = Math.min(HARVEST_TIERS.length - 1, Math.max(0, Math.round(props.value)))
  return (
    <SwatchStopSlider
      stops={HARVEST_TIERS}
      index={level}
      onChange={(i) => props.onChange(HARVEST_TIERS[i].level)}
    />
  )
}

export const MINEABLE_TOOLS: (SwatchStop & { tag: string })[] = [
  { tag: '', swatch: '', label: 'Nothing in particular', fallback: <Hand size={14} /> },
  { tag: 'mineableByPickaxe', swatch: 'mineableByPickaxe', label: 'Pickaxe' },
  { tag: 'mineableByAxe', swatch: 'mineableByAxe', label: 'Axe' },
  { tag: 'mineableByShovel', swatch: 'mineableByShovel', label: 'Shovel' },
  { tag: 'mineableByHoe', swatch: 'mineableByHoe', label: 'Hoe' },
  { tag: 'mineableBySword', swatch: 'mineableBySword', label: 'Sword' },
  { tag: 'mineableByShears', swatch: 'mineableByShears', label: 'Shears' }
]

const TOOL_TAGS = new Set(MINEABLE_TOOLS.map((t) => t.tag).filter(Boolean))

export function isToolTag(tag: string): boolean {
  return TOOL_TAGS.has(tag)
}

export function MineableToolSlider(props: {
  tags: string[]
  onChange: (tags: string[]) => void
}): JSX.Element {

  const others = props.tags.filter((t) => !isToolTag(t))
  const current = props.tags.find(isToolTag) ?? ''
  const index = Math.max(0, MINEABLE_TOOLS.findIndex((t) => t.tag === current))

  return (
    <SwatchStopSlider
      stops={MINEABLE_TOOLS}
      index={index}
      onChange={(i) => {
        const tag = MINEABLE_TOOLS[i].tag
        props.onChange(tag ? [tag, ...others] : others)
      }}
    />
  )
}
