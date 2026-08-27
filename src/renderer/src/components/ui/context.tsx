import * as React from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

export function ContextMenuItem(props: {
  label: string
  icon?: LucideIcon
  disabled?: boolean
  danger?: boolean
  onSelect: () => void
}): JSX.Element {
  const Icon = props.icon
  return (
    <ContextMenu.Item
      disabled={props.disabled}
      onSelect={props.onSelect}
      className={cn(
        'flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none transition-colors',
        props.disabled
          ? 'pointer-events-none text-mist-700'
          : props.danger
            ? 'text-mist-400 focus:bg-ember-500/15 focus:text-ember-400'
            : 'text-mist-200 focus:bg-ink-750 focus:text-white'
      )}
    >
      {Icon && (
        <Icon size={12} className={props.danger && !props.disabled ? 'text-ember-400/80' : 'text-mist-500'} />
      )}
      {props.label}
    </ContextMenu.Item>
  )
}

export function ContextMenuContent({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <ContextMenu.Portal>
      <ContextMenu.Content
        className="z-50 min-w-[140px] overflow-hidden rounded-md border border-white/[0.08] bg-ink-850 p-1 shadow-raised animate-in fade-in zoom-in-95"
      >
        {children}
      </ContextMenu.Content>
    </ContextMenu.Portal>
  )
}

export function ContextMenuSeparator(): JSX.Element {
  return <ContextMenu.Separator className="mx-1 my-1 h-px bg-white/[0.06]" />
}
