import { useState } from 'react'
import { useOutsideClose } from '@/lib/useOutsideClose'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { useProjectStore } from '@/store/projectStore'
import { useAppStore } from '@/store/appStore'
import { WELCOME_TOUR } from '@/components/tutorial/steps'
import { useWindowDrag } from './useWindowDrag'
import { TITLEBAR_UNSCALE } from '@shared/ui'
import {
  MAC_CONTROLS_RESERVE,
  TITLEBAR_HEIGHT,
  controlsSide,
  usesControlsOverlay
} from '@shared/platform'

const BAR_HEIGHT = TITLEBAR_HEIGHT

const HAIRLINE = 1
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, Hammer, Images } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { SectionId } from '@/store/appStore'
import { Segmented } from '@/components/ui/controls'
import { cn } from '@/lib/cn'

export function TitleBar(): JSX.Element {
  const project = useProjectStore((s) => s.project)
  const dirty = useProjectStore((s) => s.dirty)

  const side = controlsSide(window.artemis.app.platform)

  const inSystemMenuBar = side === 'left'

  return (

    <header

      className="drag-region relative z-50 shrink-0 overflow-hidden bg-ink-950 shadow-chrome-edge"

      style={{ height: Math.ceil(BAR_HEIGHT * TITLEBAR_UNSCALE) + HAIRLINE }}
    >
      <div

        className="relative flex items-stretch"
        style={{
          height: BAR_HEIGHT,
          width: `${100 / TITLEBAR_UNSCALE}%`,
          transform: `scale(${TITLEBAR_UNSCALE})`,
          transformOrigin: 'top left'
        }}
      >
      {}
      {side === 'left' && <ControlsGap side="left" />}

      {

}
      <div className="no-drag flex items-stretch pl-1">
        <NavCluster />
        {!inSystemMenuBar && (
          <>
            <FileMenu />
            <SettingsMenu />
          </>
        )}
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
      {side === 'right' && <ControlsGap side="right" />}
      </div>

      {

}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 bg-white/[0.04]"
        style={{ height: HAIRLINE }}
      />
    </header>
  )
}

function useDraggableMenu(
  open: boolean,
  setOpen: (open: boolean) => void
): {
  triggerProps: { onPointerDown: (e: React.PointerEvent) => void }
  contentProps: {
    onPointerDownOutside: (e: { detail: { originalEvent: PointerEvent } }) => void
    onCloseAutoFocus: (e: Event) => void
  }
} {
  const { markOutside, onCloseAutoFocus } = useOutsideClose()

  const drag = useWindowDrag({
    onDragStart: () => {
      if (open) setOpen(false)
    }
  })

  return {
    triggerProps: { onPointerDown: drag.onPointerDown },
    contentProps: {
      onPointerDownOutside: (e: { detail: { originalEvent: PointerEvent } }) => {
        markOutside()

        const native = e.detail.originalEvent

        const target = native.target as HTMLElement
        if (target.closest('button, a, [role="menuitem"], [role="menuitemcheckbox"]')) return
        if (native.button !== 0) return

        drag.onPointerDown(native)
      },
      onCloseAutoFocus
    }
  }
}

function FileMenu(): JSX.Element {
  const [open, setOpen] = useState(false)
  const project = useProjectStore((s) => s.project)
  const navigate = useAppStore((s) => s.navigate)
  const menu = useDraggableMenu(open, setOpen)

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
    <Menu.Root modal={false} open={open} onOpenChange={setOpen}>
      <Menu.Trigger asChild>
        {
}
        <button
          {...menu.triggerProps}
          className="px-3 text-[13px] text-mist-300 transition-colors focus-visible:ring-0 hover:bg-ink-750 hover:text-mist-50 data-[state=open]:bg-ink-750 data-[state=open]:text-mist-50"
        >
          File
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="start"
          sideOffset={2}
          {...menu.contentProps}
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

const BUTTON_WIDTH = 28

function useYieldingNav(): (go: () => void) => {
  onClick: () => void
  onDoubleClick: () => void
} {
  const refuse = useAppStore((s) => s.refuse)
  return (go) => ({
    onClick: () => {
      const work = useAppStore.getState().pendingWork
      if (work?.has()) {
        refuse()
        return
      }
      go()
    },
    onDoubleClick: () => {
      const work = useAppStore.getState().pendingWork

      if (!work?.has()) return
      if (work.commit()) go()
      else refuse()
    }
  })
}

const EDITOR_HUBS = {
  texture: { section: 'gallery' as SectionId, label: 'Gallery', icon: Images },
  build: { section: 'workshop' as SectionId, label: 'Workshop', icon: Hammer }
}

const SLOT_MS = 200

function NavSlot(props: { open: boolean; children: React.ReactNode }): JSX.Element {
  const reduceAnimations = useAppStore((s) => s.reduceAnimations)
  return (
    <div
      className="overflow-hidden"
      style={{
        width: props.open ? BUTTON_WIDTH : 0,
        opacity: props.open ? 1 : 0,
        transition: reduceAnimations
          ? 'none'
          : `width ${SLOT_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${SLOT_MS}ms ease-out`
      }}
    >
      {props.children}
    </div>
  )
}

function NavCluster(): JSX.Element {

  const leaveEditorTo = useAppStore((s) => s.leaveEditorTo)
  const goBack = useAppStore((s) => s.goBack)
  const goForward = useAppStore((s) => s.goForward)
  const index = useAppStore((s) => s.historyIndex)
  const depth = useAppStore((s) => s.history.length)
  const inTextureEditor = useAppStore((s) => s.textureEditor !== null)
  const inBuildEditor = useAppStore((s) => s.workshopEditor !== null)

  const drag = useWindowDrag()

  const yielding = useYieldingNav()

  const inEditor = inTextureEditor || inBuildEditor

  const hub = inTextureEditor ? EDITOR_HUBS.texture : EDITOR_HUBS.build
  const HubIcon: LucideIcon = hub.icon

  const button = (
    slotOpen: boolean,
    label: string,
    title: string,
    Icon: LucideIcon,
    ownDisabled: boolean,
    go: () => void
  ): JSX.Element => {
    const dead = !slotOpen || ownDisabled
    return (
      <button
        onPointerDown={drag.onPointerDown}
        {...yielding(go)}
        disabled={dead}
        tabIndex={slotOpen && !ownDisabled ? 0 : -1}
        aria-hidden={!slotOpen}
        aria-label={label}
        title={title}
        className={cn(
          'flex h-full items-center justify-center transition-colors focus-visible:ring-0',
          dead ? 'text-mist-700' : 'text-mist-400 hover:bg-ink-750 hover:text-mist-50'
        )}
        style={{ width: BUTTON_WIDTH }}
      >
        <Icon size={14} strokeWidth={2} />
      </button>
    )
  }

  return (
    <div className="flex items-stretch">
      <NavSlot open={!inEditor}>
        {button(!inEditor, 'Back', 'Back', ArrowLeft, index <= 0, goBack)}
      </NavSlot>
      <NavSlot open={!inEditor}>
        {button(!inEditor, 'Forward', 'Forward', ArrowRight, index >= depth - 1, goForward)}
      </NavSlot>
      <NavSlot open={inEditor}>
        {button(
          inEditor,
          hub.label,
          `Leave this editor and go back to the ${hub.label}`,
          HubIcon,
          false,
          () => leaveEditorTo(hub.section)
        )}
      </NavSlot>
    </div>
  )
}

function SettingsMenu(): JSX.Element {
  const [open, setOpen] = useState(false)
  const menu = useDraggableMenu(open, setOpen)
  const autoCapitalize = useAppStore((s) => s.autoCapitalize)
  const setAutoCapitalize = useAppStore((s) => s.setAutoCapitalize)
  const bundleTestMods = useAppStore((s) => s.bundleTestMods)
  const setBundleTestMods = useAppStore((s) => s.setBundleTestMods)
  const inspectorOpen = useAppStore((s) => s.inspectorOpen)
  const toggleInspector = useAppStore((s) => s.toggleInspector)
  const reduceAnimations = useAppStore((s) => s.reduceAnimations)
  const setReduceAnimations = useAppStore((s) => s.setReduceAnimations)
  const showCheckerGrid = useAppStore((s) => s.showCheckerGrid)
  const setShowCheckerGrid = useAppStore((s) => s.setShowCheckerGrid)
  const discordPresence = useAppStore((s) => s.discordPresence)
  const setDiscordPresence = useAppStore((s) => s.setDiscordPresence)
  const savingMode = useAppStore((s) => s.savingMode)
  const setSavingMode = useAppStore((s) => s.setSavingMode)
  const startTutorial = useAppStore((s) => s.startTutorial)

  return (
    <Menu.Root modal={false} open={open} onOpenChange={setOpen}>
      <Menu.Trigger asChild>
        <button
          {...menu.triggerProps}
          data-tour="titlebar-settings"
          className="px-3 text-[13px] text-mist-300 transition-colors focus-visible:ring-0 hover:bg-ink-750 hover:text-mist-50 data-[state=open]:bg-ink-750 data-[state=open]:text-mist-50"
        >
          Artemis Settings
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="start"
          sideOffset={2}
          {...menu.contentProps}
          className="z-50 min-w-[260px] rounded-md bg-ink-750 p-1 shadow-raised outline-none focus-visible:ring-0"
        >
          <CheckItem
            label="Capitalize each word in names"
            hint="Type “wood block”, get “Wood Block”."
            checked={autoCapitalize}
            onChange={setAutoCapitalize}
          />
          <CheckItem
            label="Show the code preview"
            hint="The generated Java, beside the editor."
            checked={inspectorOpen}
            onChange={toggleInspector}
          />
          <CheckItem
            label="Reduce animations"
            hint="Panels and popups arrive without the movement."
            checked={reduceAnimations}
            onChange={setReduceAnimations}
          />
          <CheckItem
            label="Show checkered grid"
            hint="The squares behind a texture, marking what is see-through."
            checked={showCheckerGrid}
            onChange={setShowCheckerGrid}
          />
          <CheckItem
            label="Show what you are modding on Discord"
            hint="Your profile reads “Modding BTA 8.0.1 with Artemis.” and the mod's name."
            checked={discordPresence}
            onChange={setDiscordPresence}
          />
          <MenuSep />

          {
}
          <div className="px-2 pb-1.5 pt-1">
            <span className="label-base">Saving</span>
            <Segmented
              value={savingMode}
              onChange={setSavingMode}
              options={[
                { value: 'manual', label: 'Manual' },
                { value: 'periodic', label: 'Periodically' },
                { value: 'onChange', label: 'On Change' }
              ]}
            />
            <p className="mt-1.5 text-2xs leading-relaxed text-mist-500">
              {savingMode === 'manual'
                ? 'Only when you ask, with Ctrl+S or File > Save.'
                : savingMode === 'periodic'
                  ? 'About once a minute, while there is anything to save.'
                  : 'Shortly after each edit settles.'}
            </p>
          </div>
          <MenuSep />
          {
}
          <MenuItem label="Take the tour again" onSelect={() => startTutorial(WELCOME_TOUR)} />
          <MenuSep />
          <CheckItem
            label="Bundle ModMenu with the test client"
            hint="Test only. It never reaches an exported jar."
            checked={bundleTestMods}
            onChange={setBundleTestMods}
          />
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

function CheckItem(props: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <Menu.CheckboxItem
      checked={props.checked}

      onSelect={(e) => {
        e.preventDefault()
        props.onChange(!props.checked)
      }}
      className="flex cursor-default items-start gap-2 rounded px-2 py-1.5 text-[13px] text-mist-200 outline-none data-[highlighted]:bg-ink-600 data-[highlighted]:text-mist-50"
    >
      <span className="mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        {props.checked && <Check size={12} strokeWidth={3} className="text-gold-400" />}
      </span>
      <span className="min-w-0">
        <span className="block">{props.label}</span>
        {props.hint && <span className="mt-0.5 block text-2xs text-mist-500">{props.hint}</span>}
      </span>
    </Menu.CheckboxItem>
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

function ControlsGap(props: { side: 'left' | 'right' }): JSX.Element {
  const width = usesControlsOverlay(window.artemis.app.platform)
    ? `calc((100vw - env(titlebar-area-width, calc(100vw - 138px))) / ${TITLEBAR_UNSCALE})`
    : `${MAC_CONTROLS_RESERVE / TITLEBAR_UNSCALE}px`

  return (
    <div

      aria-hidden
      data-window-controls-gap={props.side}
      className="shrink-0"
      style={{ width }}
    />
  )
}
