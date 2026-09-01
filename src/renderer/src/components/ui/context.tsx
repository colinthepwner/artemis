import * as React from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { Check, ChevronRight, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

const MENU_FIT =
  'max-h-[min(20rem,var(--radix-context-menu-content-available-height))] overflow-y-auto overscroll-contain'

const ROW =
  'flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none transition-colors'

export function ContextMenuItem(props: {
  label: string
  icon?: LucideIcon
  disabled?: boolean
  danger?: boolean

  checked?: boolean

  swatch?: string
  onSelect: () => void
}): JSX.Element {
  const Icon = props.icon
  return (
    <ContextMenu.Item
      disabled={props.disabled}
      onSelect={props.onSelect}
      className={cn(
        ROW,
        props.disabled
          ? 'pointer-events-none text-mist-700'
          : props.danger
            ? 'text-mist-400 focus:bg-ember-500/15 focus:text-ember-400'
            : 'text-mist-200 focus:bg-ink-750 focus:text-white'
      )}
    >
      {props.swatch !== undefined ? (
        <span
          className="h-3 w-3 shrink-0 rounded-full ring-1 ring-inset ring-white/20"
          style={{ background: props.swatch }}
        />
      ) : (
        Icon && (
          <Icon size={12} className={props.danger && !props.disabled ? 'text-ember-400/80' : 'text-mist-500'} />
        )
      )}
      <span className="truncate">{props.label}</span>
      {props.checked && <Check size={12} className="ml-auto shrink-0 text-gold-400" />}
    </ContextMenu.Item>
  )
}

export function ContextMenuSub(props: {
  label: string
  icon?: LucideIcon
  disabled?: boolean
  children: React.ReactNode
}): JSX.Element {
  const Icon = props.icon
  return (
    <ContextMenu.Sub>
      <ContextMenu.SubTrigger
        disabled={props.disabled}
        className={cn(
          ROW,
          props.disabled
            ? 'pointer-events-none text-mist-700'
            : 'text-mist-200 focus:bg-ink-750 focus:text-white data-[state=open]:bg-ink-750'
        )}
      >
        {Icon && <Icon size={12} className="text-mist-500" />}
        <span className="truncate">{props.label}</span>
        <ChevronRight size={11} className="ml-auto shrink-0 text-mist-600" />
      </ContextMenu.SubTrigger>
      <ContextMenu.Portal>
        <ContextMenu.SubContent
          sideOffset={2}
          alignOffset={-4}
          collisionPadding={8}
          className={cn(MENU_FIT, 'z-50 min-w-[150px] rounded-md border border-white/[0.08] bg-ink-850 p-1 shadow-raised animate-in fade-in zoom-in-95')}
        >
          {props.children}
        </ContextMenu.SubContent>
      </ContextMenu.Portal>
    </ContextMenu.Sub>
  )
}

export function ContextMenuContent({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <ContextMenu.Portal>
      <ContextMenu.Content
        collisionPadding={8}

        className={cn(MENU_FIT, 'z-50 min-w-[140px] rounded-md border border-white/[0.08] bg-ink-850 p-1 shadow-raised animate-in fade-in zoom-in-95')}
      >
        {children}
      </ContextMenu.Content>
    </ContextMenu.Portal>
  )
}

export function ContextMenuSeparator(): JSX.Element {
  return <ContextMenu.Separator className="mx-1 my-1 h-px bg-white/[0.06]" />
}
