import { useEffect, useState } from 'react'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { useProjectStore } from '@/store/projectStore'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/lib/cn'

export function TitleBar(): JSX.Element {
  const [maximized, setMaximized] = useState(false)
  const project = useProjectStore((s) => s.project)
  const dirty = useProjectStore((s) => s.dirty)

  useEffect(() => {
    window.artemis.window.isMaximized().then(setMaximized)
    return window.artemis.window.onMaximizeChanged(setMaximized)
  }, [])

  return (
    <header className="drag-region relative z-50 flex h-10 shrink-0 items-stretch bg-ink-950">
      {}
      <div className="no-drag flex items-stretch pl-1">
        <FileMenu />
      </div>

      {}
      <div className="pointer-events-none absolute inset-x-0 flex h-full items-center justify-center">
        {project && (
          <span className="text-2xs text-mist-500">
            {project.meta.name}
            <span className="mx-1.5 text-mist-600">·</span>
            <span className="font-mono">BTA {project.meta.targetBta}</span>
            {dirty && <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-gold-400 align-middle" />}
          </span>
        )}
      </div>

      <div className="flex-1" />

      {}
      <div className="no-drag flex items-stretch">
        <ControlButton label="Minimize" onClick={() => window.artemis.window.minimize()}>
          <path d="M0 5h10" />
        </ControlButton>
        <ControlButton label="Maximize" onClick={() => window.artemis.window.maximizeToggle()}>
          {maximized ? (

            <>
              <path d="M2 2.5V.5h7.5V8h-2" />
              <path d="M.5 2.5h7v7h-7z" />
            </>
          ) : (
            <path d="M.5.5h9v9h-9z" />
          )}
        </ControlButton>
        <ControlButton label="Close" onClick={() => window.artemis.window.close()} danger>
          <path d="M0 0l10 10M10 0L0 10" />
        </ControlButton>
      </div>
    </header>
  )
}

function FileMenu(): JSX.Element {
  const project = useProjectStore((s) => s.project)
  const navigate = useAppStore((s) => s.navigate)

  const confirmDiscard = (): boolean => {
    const { dirty } = useProjectStore.getState()
    return !dirty || window.confirm('Discard unsaved changes to the current project?')
  }

  const newProject = (): void => {
    if (!confirmDiscard()) return
    useProjectStore.getState().closeProject()
    navigate('dashboard')
  }

  const openProject = (): void => {
    if (!confirmDiscard()) return
    void useProjectStore.getState().openProject()
  }

  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        {
}
        <button className="px-3 text-[13px] text-mist-300 transition-colors focus-visible:ring-0 hover:bg-ink-750 hover:text-mist-50 data-[state=open]:bg-ink-750 data-[state=open]:text-mist-50">
          File
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="start"
          sideOffset={2}
          className="z-50 min-w-[190px] rounded-md bg-ink-750 p-1 shadow-raised outline-none focus-visible:ring-0"
        >
          <MenuItem label="New Project" shortcut="" onSelect={newProject} />
          <MenuItem label="Open Project…" onSelect={openProject} />
          <MenuSep />
          <MenuItem
            label="Save"
            shortcut="Ctrl+S"
            disabled={!project}
            onSelect={() => void useProjectStore.getState().saveProject()}
          />
          <MenuSep />
          <MenuItem label="Export Mod" disabled={!project} onSelect={() => navigate('export')} />
          <MenuSep />
          <MenuItem label="Exit" onSelect={() => window.artemis.window.close()} />
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

function MenuItem(props: {
  label: string
  shortcut?: string
  disabled?: boolean
  onSelect: () => void
}): JSX.Element {
  return (
    <Menu.Item
      disabled={props.disabled}
      onSelect={props.onSelect}
      className={cn(
        'flex items-center justify-between gap-6 rounded px-2.5 py-1.5 text-[13px] outline-none',
        props.disabled
          ? 'text-mist-600'
          : 'text-mist-200 data-[highlighted]:bg-ink-600 data-[highlighted]:text-mist-50'
      )}
    >
      {props.label}
      {props.shortcut && <span className="font-mono text-2xs text-mist-500">{props.shortcut}</span>}
    </Menu.Item>
  )
}

function MenuSep(): JSX.Element {
  return <Menu.Separator className="mx-1 my-1 h-px bg-white/[0.06]" />
}

function ControlButton(props: {
  label: string
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      aria-label={props.label}
      onClick={props.onClick}
      className={
        'flex w-[46px] items-center justify-center text-mist-400 transition-colors duration-100 ' +
        (props.danger
          ? 'hover:bg-ember-500 hover:text-white active:bg-ember-400'
          : 'hover:bg-ink-750 hover:text-mist-50 active:bg-ink-700')
      }
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
        {props.children}
      </svg>
    </button>
  )
}
