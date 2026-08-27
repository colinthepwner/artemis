import { useEffect, useMemo, useState } from 'react'
import {
  ChevronRight,
  Copy,
  Hammer,
  LayoutDashboard,
  Images,
  PackageOpen,
  Play,
  Palette,
  Pencil,
  Plus,
  Settings,
  Trash2,
  Wand2,
  type LucideIcon
} from 'lucide-react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context'
import { useAppStore, type SectionId } from '@/store/appStore'
import { useProjectStore } from '@/store/projectStore'
import { KIND_LABELS } from '@/sections/forms/registry'
import { ContentThumb, SlotThumb } from '@/components/ui/ContentThumb'
import { GlideList } from '@/components/ui/glide'
import { KIND_COLORS, KIND_ICONS } from '@/lib/kindIcons'
import { ELEMENT_KINDS, type ArtemisElement, type ElementKind } from '@shared/project'
import { elementRegistryEntries, type RegistryEntry } from '@shared/generator/registry'
import { titleCase } from '@shared/generator/templates/block'
import { cn } from '@/lib/cn'

export { KIND_ICONS }

export function Sidebar(): JSX.Element {
  const section = useAppStore((s) => s.section)
  const editingId = useAppStore((s) => s.editingId)
  const navigate = useAppStore((s) => s.navigate)
  const openEditor = useAppStore((s) => s.openEditor)
  const openCreateMenu = useAppStore((s) => s.openCreateMenu)
  const requestTestRun = useAppStore((s) => s.requestTestRun)
  const project = useProjectStore((s) => s.project)
  const elements = useProjectStore((s) => s.project?.elements)
  const createElement = useProjectStore((s) => s.createElement)
  const removeElement = useProjectStore((s) => s.removeElement)
  const duplicateElement = useProjectStore((s) => s.duplicateElement)

  const groups = useMemo(() => {
    const byKind = new Map<ElementKind, ArtemisElement[]>()
    for (const el of elements ?? []) {
      const list = byKind.get(el.kind) ?? []
      list.push(el)
      byKind.set(el.kind, list)
    }

    return ELEMENT_KINDS.filter((k) => byKind.has(k)).map((k) => ({
      kind: k,
      items: byKind.get(k)!
    }))
  }, [elements])

  const openElement = (el: ArtemisElement): void => {
    navigate(el.kind)
    openEditor(el.id)
  }

  const createIn = (kind: ElementKind): void => {
    navigate(kind)
    openEditor(createElement(kind))
  }

  const [collapsed, setCollapsed] = useState<Set<ElementKind>>(new Set())

  useEffect(() => {
    if (!(ELEMENT_KINDS as readonly string[]).includes(section)) return
    setCollapsed((prev) => {
      if (!prev.has(section as ElementKind)) return prev
      const next = new Set(prev)
      next.delete(section as ElementKind)
      return next
    })
  }, [section, editingId])
  const toggleKind = (kind: ElementKind): void =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })

  return (
    <nav className="panel flex w-[232px] shrink-0 flex-col border-r border-white/[0.04]">
      <div className="px-3 pt-3">
        <NavGroup section={section} ids={['dashboard', 'gallery', 'workshop']}>
          <NavButton
            entry={{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }}
            active={section === 'dashboard'}
            onClick={() => navigate('dashboard')}
          />
          <NavButton
            entry={{ id: 'gallery', label: 'Gallery', icon: Images }}
            active={section === 'gallery'}
            disabled={!project}
            count={project ? project.textures.length : undefined}
            onClick={() => navigate('gallery')}
          />
          {
}
          <NavButton
            entry={{ id: 'workshop', label: 'Workshop', icon: Hammer }}
            active={section === 'workshop'}
            disabled={!project}
            count={
              project
                ? project.elements.filter((e) => e.kind === 'tree' || e.kind === 'structure').length
                : undefined
            }
            onClick={() => navigate('workshop')}
          />
        </NavGroup>

        <button
          data-tour="sidebar-create"
          onClick={openCreateMenu}
          disabled={!project}
          className={cn(
            'mb-1 mt-3 flex w-full items-center justify-center gap-1.5 rounded-md bg-gold-500 py-2 text-[13px] font-medium text-ink-950 transition-all duration-150 hover:bg-gold-400 active:scale-[0.98]',

            !project && 'opacity-35 disabled:hover:bg-gold-500'
          )}
        >
          <Plus size={15} strokeWidth={2.2} /> Create
        </button>
      </div>

      <div data-tour="sidebar-content" className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <div className="label-base mb-1.5 mt-4 px-2">Mod Content</div>

        {!project && (
          <p className="px-2 text-2xs leading-relaxed text-mist-600">
            Create or open a project to start building.
          </p>
        )}

        {project && groups.length === 0 && (
          <p className="px-2 text-2xs leading-relaxed text-mist-600">
            Nothing yet. Hit <span className="text-gold-400">Create</span> to add your first
            block, ore, or mob.
          </p>
        )}

        {groups.map(({ kind, items }) => (
          <div key={kind} className="mb-2">
            <GroupHeader
              kind={kind}
              count={items.length}
              active={section === kind && editingId === null}
              open={!collapsed.has(kind)}
              onNavigate={() => navigate(kind)}
              onToggle={() => toggleKind(kind)}
              onCreate={() => createIn(kind)}
            />
            {

}
            {!collapsed.has(kind) && (
              <div
                className="ml-[13px] border-l pl-1.5 pt-0.5"
                style={{ borderColor: `${KIND_COLORS[kind]}2e` }}
              >
                {items.map((el) => (
                  <ElementRow
                    key={el.id}
                    element={el}
                    active={section === el.kind && editingId === el.id}
                    onClick={() => openElement(el)}
                    onDuplicate={() => {
                      const copy = duplicateElement(el.id)
                      if (copy) {
                        navigate(el.kind)
                        openEditor(copy)
                      }
                    }}
                    onDelete={() => removeElement(el.id)}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-white/[0.04] px-3 py-3">
        <NavGroup section={section} ids={['test', 'export', 'settings']}>
          <NavButton
            entry={{ id: 'test', label: 'Test', icon: Play }}
            active={section === 'test'}
            disabled={!project}
            onClick={() => navigate('test')}
            action={{
              label: 'Run client',
              onClick: () => {
                navigate('test')
                requestTestRun()
              }
            }}
          />
          <NavButton
            entry={{ id: 'export', label: 'Export Mod', icon: PackageOpen }}
            active={section === 'export'}
            disabled={!project}
            onClick={() => navigate('export')}
          />
          <NavButton
            entry={{ id: 'settings', label: 'Settings', icon: Settings }}
            active={section === 'settings'}
            disabled={!project}
            onClick={() => navigate('settings')}
          />
        </NavGroup>
      </div>
    </nav>
  )
}

function GroupHeader(props: {
  kind: ElementKind
  count: number
  active: boolean
  open: boolean
  onNavigate: () => void
  onToggle: () => void
  onCreate: () => void
}): JSX.Element {
  const Icon = KIND_ICONS[props.kind]
  const { label, labelPlural } = KIND_LABELS[props.kind]
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          className={cn(
            'flex w-full items-center gap-1 rounded-md pr-2 text-2xs font-semibold uppercase tracking-wider transition-colors',
            props.active ? 'text-gold-400' : 'text-mist-500 hover:text-mist-300'
          )}
        >
          <button
            onClick={props.onToggle}
            title={props.open ? 'Collapse' : 'Expand'}
            className="rounded p-1 text-mist-600 transition-colors hover:bg-ink-750 hover:text-mist-300"
          >
            <ChevronRight
              size={11}
              className={cn('transition-transform duration-150', props.open && 'rotate-90')}
            />
          </button>
          <button onClick={props.onNavigate} className="flex min-w-0 flex-1 items-center gap-2 py-1">
            {
}
            <Icon size={12} strokeWidth={2} className="shrink-0" style={{ color: KIND_COLORS[props.kind] }} />
            <span className="truncate">{labelPlural}</span>
            <span
              className="ml-auto rounded-full px-1.5 font-mono text-[10px] font-normal"
              style={{ color: KIND_COLORS[props.kind], background: `${KIND_COLORS[props.kind]}14` }}
            >
              {props.count}
            </span>
          </button>
        </div>
      </ContextMenu.Trigger>
      <ContextMenuContent>
        <ContextMenuItem label={`New ${label}`} icon={Plus} onSelect={props.onCreate} />
        <ContextMenuSeparator />
        <ContextMenuItem
          label={props.open ? 'Collapse' : 'Expand'}
          icon={ChevronRight}
          onSelect={props.onToggle}
        />
      </ContextMenuContent>
    </ContextMenu.Root>
  )
}

function ElementRow(props: {
  element: ArtemisElement
  active: boolean
  onClick: () => void
  onDuplicate: () => void
  onDelete: () => void
}): JSX.Element {
  const { element } = props
  const openTextureEditor = useAppStore((s) => s.openTextureEditor)
  const assignments = useProjectStore((s) => s.project?.textureAssignments)
  const promoteGenerated = useProjectStore((s) => s.promoteGenerated)
  const [showGen, setShowGen] = useState(false)
  const display = (element.properties['displayName'] as string) || titleCase(element.name)

  const generated = elementRegistryEntries(element).filter((e) => e.registryName !== element.name)

  const slotKeyOf = (entry: RegistryEntry): string => `${entry.kind}/${entry.registryName}`

  const editGenerated = (entry: RegistryEntry): void => {
    promoteGenerated(entry.elementId, entry.registryName)
    const slotKey = slotKeyOf(entry)
    const texId = assignments?.[slotKey]
    if (texId) openTextureEditor({ textureId: texId })
    else
      openTextureEditor({
        textureId: null,
        kind: entry.kind,
        assignSlotAfter: slotKey,
        suggestedName: entry.registryName
      })
  }

  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <button
            onClick={props.onClick}
            className={cn(

              'group flex w-full items-center gap-2 rounded-md py-[3px] pl-1.5 pr-2 text-xs transition-colors',
              props.active
                ? 'bg-ink-750 text-mist-50 shadow-panel'
                : 'text-mist-400 hover:bg-ink-750/60 hover:text-mist-200'
            )}
          >
            <ContentThumb element={element} size={14} />
            <span className="truncate">{display}</span>
          </button>
        </ContextMenu.Trigger>
        <ContextMenuContent>
          <ContextMenuItem label="Edit" icon={Pencil} onSelect={props.onClick} />
          <ContextMenuItem label="Duplicate" icon={Copy} onSelect={props.onDuplicate} />
          <ContextMenuSeparator />
          <ContextMenuItem label="Delete" icon={Trash2} danger onSelect={props.onDelete} />
        </ContextMenuContent>
      </ContextMenu.Root>
      {generated.length > 0 && (

        <div className="ml-[13px] border-l border-white/[0.06] pl-1.5">
          <button
            onClick={() => setShowGen((v) => !v)}
            className="flex w-full items-center gap-1.5 rounded-md py-[2px] pl-1 pr-2 text-2xs text-mist-600 transition-colors hover:bg-ink-750/40 hover:text-mist-400"
          >
            <ChevronRight
              size={10}
              className={cn('shrink-0 transition-transform duration-150', showGen && 'rotate-90')}
            />
            <Wand2 size={10} className="shrink-0 opacity-70" />
            {generated.length} auto-generated
          </button>
          {showGen &&
        generated.map((g) => (

          <ContextMenu.Root key={g.registryName}>
            <ContextMenu.Trigger asChild>
              <button
                onClick={() => editGenerated(g)}
                title={`Made by ${display}. Click to edit its texture`}
                className={cn(
                  'flex w-full items-center gap-1.5 rounded-md py-[2px] pl-4 pr-2 text-2xs transition-colors hover:bg-ink-750/40',
                  assignments?.[slotKeyOf(g)]
                    ? 'text-mist-500 hover:text-mist-300'
                    : 'text-mist-600 hover:text-mist-400'
                )}
              >
                <SlotThumb slotKey={slotKeyOf(g)} size={13} icon={Wand2} />
                <span className="truncate">{g.displayName}</span>
                {!assignments?.[slotKeyOf(g)] && (
                  <span className="ml-auto shrink-0 text-[9px] uppercase tracking-wide text-ember-400/80">
                    paint
                  </span>
                )}
              </button>
            </ContextMenu.Trigger>
            <ContextMenuContent>
              <ContextMenuItem
                label={assignments?.[slotKeyOf(g)] ? 'Edit texture' : 'Paint texture'}
                icon={Palette}
                onSelect={() => editGenerated(g)}
              />
            </ContextMenuContent>
          </ContextMenu.Root>
        ))}
        </div>
      )}
    </>
  )
}

function NavGroup(props: {
  section: SectionId

  ids: readonly SectionId[]
  children: React.ReactNode
}): JSX.Element {
  return (
    <GlideList active={props.section} present={props.ids.includes(props.section)}>
      {props.children}
    </GlideList>
  )
}

interface NavEntry {
  id: SectionId
  label: string
  icon: LucideIcon
}

function NavButton(props: {
  entry: NavEntry
  active: boolean
  disabled?: boolean
  count?: number
  onClick: () => void

  action?: { label: string; onClick: () => void }
}): JSX.Element {
  const { entry, active, disabled, count, onClick, action } = props
  const Icon = entry.icon

  return (

    <div className="group/row relative" data-glide-id={entry.id} data-tour={`sidebar-${entry.id}`}>
      {action && !disabled && (
        <button
          onClick={action.onClick}
          title={action.label}
          aria-label={action.label}
          className="absolute right-1.5 top-1/2 z-20 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded opacity-0 transition-all duration-100 focus-visible:opacity-100 group-hover/row:opacity-100 hover:bg-moss-500/20"
        >
          <Play size={11} className="text-moss-400" fill="currentColor" strokeWidth={0} />
        </button>
      )}
      <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group relative mb-0.5 flex w-full items-center gap-2.5 rounded-md px-2 py-[7px] text-[13px] transition-colors duration-100',

        active ? 'text-mist-50' : 'text-mist-400 hover:bg-white/[0.04] hover:text-mist-200',
        disabled && 'opacity-35'
      )}
    >
      {}
      <Icon
        size={15}
        strokeWidth={1.75}
        className={cn('relative z-10', active ? 'text-gold-400' : 'text-mist-500 group-hover:text-mist-400')}
      />
      <span className="relative z-10">{entry.label}</span>
      {count !== undefined && count > 0 && (
        <span className="relative z-10 ml-auto rounded-full bg-ink-700 px-1.5 py-px font-mono text-2xs text-mist-400">
          {count}
        </span>
      )}
      </button>
    </div>
  )
}
