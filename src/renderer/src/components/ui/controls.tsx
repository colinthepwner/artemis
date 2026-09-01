import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import * as Menu from '@radix-ui/react-dropdown-menu'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useOutsideClose } from '@/lib/useOutsideClose'
import { IsoBlock } from './ContentThumb'

export function Field(props: {
  label: string
  hint?: string
  children: React.ReactNode
  className?: string
}): JSX.Element {
  return (
    <div className={props.className}>
      <label className="label-base">{props.label}</label>
      {props.children}
      {props.hint && <p className="mt-1.5 text-2xs leading-relaxed text-mist-600">{props.hint}</p>}
    </div>
  )
}

export function TextInput(props: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
}): JSX.Element {
  return (
    <input
      className={cn('input-base', props.mono && 'font-mono')}
      value={props.value}
      placeholder={props.placeholder}
      onChange={(e) => props.onChange(e.target.value)}
    />
  )
}

export function NumberInput(props: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number

  disabled?: boolean
}): JSX.Element {
  const [local, setLocal] = useState<string | null>(null)

  useEffect(() => {
    setLocal(null)
  }, [props.value])

  return (
    <input
      type="number"
      className={cn('input-base font-mono', props.disabled && 'cursor-not-allowed opacity-50')}
      value={local !== null ? local : (Number.isFinite(props.value) ? props.value : 0)}
      min={props.min}
      max={props.max}
      step={props.step ?? 1}
      disabled={props.disabled}
      onChange={(e) => {
        setLocal(e.target.value)
        const v = parseFloat(e.target.value)
        if (!Number.isNaN(v)) props.onChange(v)
      }}
      onBlur={() => setLocal(null)}
    />
  )
}

export interface SelectOption {
  value: string
  label: string

  texture?: string

  strip?: string
  tint?: string

  item?: boolean

  flat?: boolean

  scale?: number
}

function OptionSwatch(props: {
  texture?: string
  item?: boolean
  flat?: boolean
  size?: number

  scale?: number

  plain?: boolean
}): JSX.Element | null {
  if (!props.texture) return null
  const size = props.size ?? 18
  const faces = props.texture.split('||')
  const top = faces[0]
  const side = faces[1] ?? faces[0]

  if (!props.item && !props.flat) {
    return (
      <span className={cn('flex shrink-0 items-center justify-center', !props.plain && 'drop-shadow-sm')}>
        <IsoBlock top={top} side={side} size={size} />
      </span>
    )
  }

  return (
    <span className="flex shrink-0 items-center gap-px">
      {faces.map((face, i) => (
        <span
          key={i}
          className={cn('shrink-0 rounded-[3px]', !props.plain && !props.flat && 'shadow-panel')}
          style={{
            width: size,
            height: size,
            backgroundImage: `url(${face})`,
            backgroundSize: props.scale ? `${props.scale}%` : props.flat ? '150%' : '125%',
            backgroundPosition: props.flat ? 'center bottom' : 'center',
            backgroundRepeat: 'no-repeat',
            imageRendering: 'pixelated'
          }}
        />
      ))}
    </span>
  )
}

function OptionTexture(props: {
  texture?: string
  strip?: string
  opacity?: number
}): JSX.Element | null {
  if (!props.strip && !props.texture) return null
  const face = props.strip ?? props.texture!.split('||')[0]
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 right-0 w-2/3"
      style={{
        backgroundImage: `url(${face})`,

        backgroundSize: 'auto 100%',
        backgroundRepeat: 'repeat-x',

        backgroundPosition: 'right center',
        imageRendering: 'pixelated',
        opacity: props.opacity ?? 0.42,

        maskImage: 'linear-gradient(to right, transparent, black 65%)',
        WebkitMaskImage: 'linear-gradient(to right, transparent, black 65%)'
      }}
    />
  )
}

export function Select(props: {
  value: string
  onChange: (v: string) => void
  options: SelectOption[]

  onPreview?: (value: string | null) => void
}): JSX.Element {
  const current = props.options.find((o) => o.value === props.value)
  const { markOutside, onCloseAutoFocus } = useOutsideClose()
  return (
    <Menu.Root
      modal={false}

      onOpenChange={(open) => !open && props.onPreview?.(null)}
    >
      <Menu.Trigger asChild>
        <button className="input-base relative flex items-center justify-between gap-2 overflow-hidden text-left focus-visible:ring-0 data-[state=open]:shadow-glow-gold">
          <OptionTexture texture={current?.texture} strip={current?.strip} opacity={0.26} />
          <span className="relative flex min-w-0 items-center gap-2">
            <OptionSwatch texture={current?.texture} item={current?.item} flat={current?.flat} scale={current?.scale} size={16} />
            <span className="truncate">{current?.label ?? ''}</span>
          </span>
          <ChevronDown size={13} className="relative shrink-0 text-mist-500" />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="start"
          sideOffset={4}
          onPointerDownOutside={markOutside}
          onCloseAutoFocus={onCloseAutoFocus}
          onPointerLeave={() => props.onPreview?.(null)}

          collisionPadding={8}

          className="z-50 flex max-h-[min(18rem,var(--radix-dropdown-menu-content-available-height))] w-[var(--radix-dropdown-menu-trigger-width)] min-w-[180px] flex-col gap-1 overflow-y-auto overscroll-contain rounded-md bg-ink-750 p-1.5 shadow-raised outline-none focus-visible:ring-0"
        >
          {props.options.map((o) => (
            <Menu.Item
              key={o.value}
              onSelect={() => props.onChange(o.value)}
              onPointerEnter={() => props.onPreview?.(o.value)}

              onFocus={() => props.onPreview?.(o.value)}

              className="relative flex shrink-0 items-center justify-between gap-2 overflow-hidden rounded px-2 py-1.5 text-[13px] text-mist-200 outline-none data-[highlighted]:bg-ink-600 data-[highlighted]:text-mist-50"
            >
              <OptionTexture texture={o.texture} strip={o.strip} />
              <span className="relative flex min-w-0 items-center gap-2">
                <OptionSwatch texture={o.texture} item={o.item} flat={o.flat} scale={o.scale} />
                <span className="truncate">{o.label}</span>
              </span>
              {o.value === props.value && (
                <Check size={12} className="relative shrink-0 text-gold-400" />
              )}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

export function Switch(props: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}): JSX.Element {
  return (
    <label className="flex cursor-default items-center justify-between gap-4 py-1">
      <span>
        <span className="block text-[13px] text-mist-200">{props.label}</span>
        {props.hint && <span className="mt-0.5 block text-2xs text-mist-600">{props.hint}</span>}
      </span>
      <SwitchPrimitive.Root
        checked={props.checked}
        onCheckedChange={props.onChange}
        className="relative h-[18px] w-8 shrink-0 rounded-full bg-ink-700 shadow-panel transition-colors duration-150 data-[state=checked]:bg-gold-500"
      >
        <SwitchPrimitive.Thumb className="block h-3.5 w-3.5 translate-x-0.5 rounded-full bg-mist-200 transition-transform duration-150 ease-swift data-[state=checked]:translate-x-[15px] data-[state=checked]:bg-ink-950" />
      </SwitchPrimitive.Root>
    </label>
  )
}

export function Slider(props: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  iconLeft?: React.ReactNode
  iconRight?: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex items-center gap-3">
      {props.iconLeft}
      <SliderPrimitive.Root
        value={[props.value]}
        onValueChange={([v]) => props.onChange(v)}
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        className="relative flex h-4 flex-1 touch-none items-center"
      >
        <SliderPrimitive.Track className="relative h-[3px] flex-1 rounded-full bg-ink-700">
          <SliderPrimitive.Range className="absolute h-full rounded-full bg-gold-500" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="block h-3 w-3 rounded-full bg-mist-50 shadow-raised transition-transform hover:scale-110" />
      </SliderPrimitive.Root>
      {props.iconRight}
      <span className="w-8 text-right font-mono text-2xs text-mist-400">{props.value}</span>
    </div>
  )
}

function toggledMembership(selected: string[], value: string): string[] {
  return selected.includes(value) ? selected.filter((s) => s !== value) : [...selected, value]
}

export function SwitchList(props: {
  options: SelectOption[]
  selected: string[]
  onChange: (v: string[]) => void
}): JSX.Element {
  const toggle = (v: string): void => props.onChange(toggledMembership(props.selected, v))
  return (
    <div className="flex flex-col">
      {props.options.map((o) => {
        const on = props.selected.includes(o.value)
        return (
          <label
            key={o.value}
            className="flex cursor-default items-center justify-between gap-3 py-1"
          >
            <span className="flex min-w-0 items-center gap-2">
              <OptionSwatch
                texture={o.texture}
                item={o.item}
                flat={o.flat}
                scale={o.scale}
                size={16}
                plain
              />
              <span className="truncate text-[13px] text-mist-200">{o.label}</span>
            </span>
            <SwitchPrimitive.Root
              checked={on}
              onCheckedChange={() => toggle(o.value)}
              className="relative h-[18px] w-8 shrink-0 rounded-full bg-ink-700 shadow-panel transition-colors duration-150 data-[state=checked]:bg-gold-500"
            >
              <SwitchPrimitive.Thumb className="block h-3.5 w-3.5 translate-x-0.5 rounded-full bg-mist-200 transition-transform duration-150 ease-swift data-[state=checked]:translate-x-[15px] data-[state=checked]:bg-ink-950" />
            </SwitchPrimitive.Root>
          </label>
        )
      })}
    </div>
  )
}

export interface MultiSelectOption {
  value: string
  label: string

  tint?: string
}

export interface MultiSelectGroup {
  label: string
  options: MultiSelectOption[]
}

export function MultiSelect(props: {
  selected: string[]
  onChange: (v: string[]) => void
  groups: MultiSelectGroup[]

  allLabel: string

  noun: string
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const { markOutside, onCloseAutoFocus } = useOutsideClose()

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const known = useMemo(() => {
    const m = new Map<string, MultiSelectOption>()
    for (const g of props.groups) for (const o of g.options) m.set(o.value, o)
    return m
  }, [props.groups])

  const orphans = props.selected.filter((v) => !known.has(v))
  const groups: MultiSelectGroup[] = orphans.length
    ? [
        ...props.groups,
        { label: 'No longer exists', options: orphans.map((v) => ({ value: v, label: v })) }
      ]
    : props.groups

  const q = query.trim().toLowerCase()
  const shown = groups
    .map((g) => ({
      label: g.label,
      options: q ? g.options.filter((o) => o.label.toLowerCase().includes(q)) : g.options
    }))
    .filter((g) => g.options.length > 0)

  const summary =
    props.selected.length === 0
      ? props.allLabel
      : props.selected.length === 1
        ? (known.get(props.selected[0])?.label ?? props.selected[0])
        : `${props.selected.length} ${props.noun}`

  const toggle = (v: string): void => props.onChange(toggledMembership(props.selected, v))

  return (

    <Menu.Root open={open} onOpenChange={setOpen} modal={false}>
      <Menu.Trigger asChild>
        {
}
        <button className="input-base flex items-center justify-between gap-2 text-left focus-visible:ring-0 data-[state=open]:shadow-glow-gold">
          <span className={cn('truncate', props.selected.length === 0 && 'text-mist-400')}>
            {summary}
          </span>
          <ChevronDown size={13} className="shrink-0 text-mist-500" />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="start"
          sideOffset={4}
          onPointerDownOutside={markOutside}
          onCloseAutoFocus={onCloseAutoFocus}

          onKeyDown={(e) => {
            if (e.target === searchRef.current) return
            const printable = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey
            if (!printable && e.key !== 'Backspace') return
            e.preventDefault()
            setQuery((q) => (printable ? q + e.key : q.slice(0, -1)))
            searchRef.current?.focus()
          }}
          className="z-50 w-[var(--radix-dropdown-menu-trigger-width)] min-w-[220px] rounded-md bg-ink-750 p-1 shadow-raised outline-none focus-visible:ring-0"
        >
          <input
            ref={searchRef}
            value={query}
            placeholder="Search"
            onChange={(e) => setQuery(e.target.value)}

            onKeyDown={(e) => {
              if (!['ArrowDown', 'ArrowUp', 'Escape', 'Tab'].includes(e.key)) e.stopPropagation()
            }}
            className="mb-1 w-full rounded bg-ink-800 px-2 py-1.5 text-[13px] text-mist-50 shadow-panel transition-shadow placeholder:text-mist-600 focus:shadow-glow-gold focus-visible:ring-0"
          />
          <div className="max-h-64 overflow-y-auto">
            <MultiSelectRow
              label={props.allLabel}
              checked={props.selected.length === 0}
              onSelect={() => props.onChange([])}
            />
            {shown.map((g) => (
              <div key={g.label}>
                <div className="px-2 pb-1 pt-2 text-2xs font-medium uppercase tracking-wider text-mist-600">
                  {g.label}
                </div>
                {g.options.map((o) => (
                  <MultiSelectRow
                    key={o.value}
                    label={o.label}
                    tint={o.tint}
                    checked={props.selected.includes(o.value)}
                    onSelect={() => toggle(o.value)}
                  />
                ))}
              </div>
            ))}
            {shown.length === 0 && (
              <p className="px-2 py-4 text-center text-2xs text-mist-600">Nothing matches that.</p>
            )}
          </div>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

function MultiSelectRow(props: {
  label: string
  tint?: string
  checked: boolean
  onSelect: () => void
}): JSX.Element {
  return (
    <Menu.CheckboxItem
      checked={props.checked}

      onSelect={(e) => {
        e.preventDefault()
        props.onSelect()
      }}
      className="flex items-center gap-2 rounded px-2 py-1.5 text-[13px] text-mist-200 outline-none data-[highlighted]:bg-ink-600 data-[highlighted]:text-mist-50"
    >
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        {props.checked && <Check size={12} className="text-gold-400" />}
      </span>
      {props.tint && (
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-sm shadow-panel"
          style={{ background: props.tint }}
        />
      )}
      <span className="truncate">{props.label}</span>
    </Menu.CheckboxItem>
  )
}

export function Segmented<T extends string>(props: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}): JSX.Element {

  const pill = useId()
  return (
    <div className="flex gap-0.5 rounded-md bg-ink-800 p-0.5 shadow-panel">
      {props.options.map((o) => {
        const on = o.value === props.value
        return (
          <button
            key={o.value}
            onClick={() => props.onChange(o.value)}
            className={cn(

              'relative flex-1 rounded px-2 py-1 text-2xs transition-colors duration-100 focus-visible:ring-0 translate-y-[0.5px]',
              on ? 'z-10 font-medium text-ink-950' : 'text-mist-400 hover:text-mist-100'
            )}
          >
            {on && (
              <motion.span
                layoutId={pill}
                className="absolute inset-0 rounded bg-gold-500"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            {

}
            <span className="relative z-10 inline-block">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
