import * as SelectPrimitive from '@radix-ui/react-select'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'

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
}): JSX.Element {
  return (
    <input
      type="number"
      className="input-base font-mono"
      value={Number.isFinite(props.value) ? props.value : 0}
      min={props.min}
      max={props.max}
      step={props.step ?? 1}
      onChange={(e) => {
        const v = parseFloat(e.target.value)
        if (!Number.isNaN(v)) props.onChange(v)
      }}
    />
  )
}

export function Select(props: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}): JSX.Element {
  return (
    <SelectPrimitive.Root value={props.value} onValueChange={props.onChange}>
      <SelectPrimitive.Trigger className="input-base flex items-center justify-between gap-2 text-left data-[state=open]:shadow-glow-gold">
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon>
          <ChevronDown size={13} className="text-mist-500" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-y-auto rounded-md bg-ink-750 p-1 shadow-raised"
        >
          <SelectPrimitive.Viewport>
            {props.options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className="flex items-center justify-between rounded px-2 py-1.5 text-[13px] text-mist-200 outline-none data-[highlighted]:bg-ink-600 data-[highlighted]:text-mist-50"
              >
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator>
                  <Check size={12} className="text-gold-400" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
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
}): JSX.Element {
  return (
    <div className="flex items-center gap-3">
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
      <span className="w-8 text-right font-mono text-2xs text-mist-400">{props.value}</span>
    </div>
  )
}

export function Toggles(props: {
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (v: string[]) => void
}): JSX.Element {
  const toggle = (v: string): void => {
    props.onChange(
      props.selected.includes(v) ? props.selected.filter((s) => s !== v) : [...props.selected, v]
    )
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {props.options.map((o) => {
        const on = props.selected.includes(o.value)
        return (
          <button
            key={o.value}
            onClick={() => toggle(o.value)}
            className={cn(

              'relative rounded-full px-2.5 py-1 text-2xs transition-all duration-100',
              on
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
