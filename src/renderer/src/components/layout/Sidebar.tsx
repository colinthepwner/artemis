import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Box,
  ChevronRight,
  Droplets,
  Gem,
  Sprout,
  TreePine,
  UtensilsCrossed,
  Rabbit,
  Mountain,
  LayoutDashboard,
  Images,
  PackageOpen,
  Play,
  Plus,
  Settings,
  Wand2,
  type LucideIcon
} from 'lucide-react'
import { useAppStore, type SectionId } from '@/store/appStore'
import { useProjectStore } from '@/store/projectStore'
import { ELEMENT_KINDS, type ArtemisElement, type ElementKind } from '@shared/project'
import { elementRegistryEntries, type RegistryEntry } from '@shared/generator/registry'
import { titleCase } from '@shared/generator/templates/block'
import { cn } from '@/lib/cn'

export const KIND_ICONS: Record<ElementKind, LucideIcon> = {
  block: Box,
  liquid: Droplets,
  ore: Gem,
  plant: Sprout,
  tree: TreePine,
  recipe: UtensilsCrossed,
  mob: Rabbit,
  biome: Mountain
}

const KIND_PLURALS: Record<ElementKind, string> = {
  block: 'Blocks',
  liquid: 'Liquids',
  ore: 'Ores',
  plant: 'Plants',
  tree: 'Trees',
  recipe: 'Recipes',
  mob: 'Mobs',
  biome: 'Biomes'
}

export function Sidebar(): JSX.Element {
  const section = useAppStore((s) => s.section)
  const editingId = useAppStore((s) => s.editingId)
  const navigate = useAppStore((s) => s.navigate)
  const openEditor = useAppStore((s) => s.openEditor)
  const openCreateMenu = useAppStore((s) => s.openCreateMenu)
  const project = useProjectStore((s) => s.project)
  const elements = useProjectStore((s) => s.project?.elements)

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

  const [collapsed, setCollapsed] = useState<Set<ElementKind>>(new Set())
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

        <button
          onClick={openCreateMenu}
          disabled={!project}
          className={cn(
            'mb-1 mt-3 flex w-full items-center justify-center gap-1.5 rounded-md bg-gold-500 py-2 text-[13px] font-medium text-ink-950 transition-all duration-150 hover:bg-gold-400 active:scale-[0.98]',
            !project && 'pointer-events-none opacity-35'
          )}
        >
          <Plus size={15} strokeWidth={2.2} /> Create
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
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
          <div key={kind} className="mb-1.5">
            <GroupHeader
              kind={kind}
              count={items.length}
              active={section === kind && editingId === null}
              open={!collapsed.has(kind)}
              onNavigate={() => navigate(kind)}
              onToggle={() => toggleKind(kind)}
            />
            {!collapsed.has(kind) &&
              items.map((el) => (
                <ElementRow
                  key={el.id}
                  element={el}
                  active={section === el.kind && editingId === el.id}
                  onClick={() => openElement(el)}
                />
              ))}
          </div>
        ))}
      </div>

      <div className="border-t border-white/[0.04] px-3 py-3">
        <NavButton
          entry={{ id: 'test', label: 'Test', icon: Play }}
          active={section === 'test'}
          disabled={!project}
          onClick={() => navigate('test')}
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
          onClick={() => navigate('settings')}
        />
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
}): JSX.Element {
  const Icon = KIND_ICONS[props.kind]
  return (
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
        <Icon size={12} strokeWidth={2} className="shrink-0" />
        <span className="truncate">{KIND_PLURALS[props.kind]}</span>
        <span className="ml-auto font-mono font-normal text-mist-600">{props.count}</span>
      </button>
    </div>
  )
}

function ElementRow(props: {
  element: ArtemisElement
  active: boolean
  onClick: () => void
}): JSX.Element {
  const { element } = props
  const openTextureEditor = useAppStore((s) => s.openTextureEditor)
  const assignments = useProjectStore((s) => s.project?.textureAssignments)
  const [showGen, setShowGen] = useState(false)
  const display = (element.properties['displayName'] as string) || titleCase(element.name)

  const generated = elementRegistryEntries(element).filter((e) => e.registryName !== element.name)

  const editGenerated = (entry: RegistryEntry): void => {
    const slotKey = `item/${entry.registryName}`
    const texId = assignments?.[slotKey]
    if (texId) openTextureEditor({ textureId: texId })
    else
      openTextureEditor({
        textureId: null,
        kind: 'item',
        assignSlotAfter: slotKey,
        suggestedName: entry.registryName
      })
  }

  return (
    <>
      <button
        onClick={props.onClick}
        className={cn(
          'group flex w-full items-center gap-2 rounded-md py-[5px] pl-4 pr-2 text-[13px] transition-colors',
          props.active
            ? 'bg-ink-750 text-mist-50 shadow-panel'
            : 'text-mist-400 hover:bg-ink-750/60 hover:text-mist-200'
        )}
      >
        <span className="truncate">{display}</span>
      </button>
      {generated.length > 0 && (
        <button
          onClick={() => setShowGen((v) => !v)}
          className="flex w-full items-center gap-1.5 rounded-md py-[3px] pl-5 pr-2 text-2xs text-mist-600 transition-colors hover:bg-ink-750/40 hover:text-mist-400"
        >
          <ChevronRight
            size={10}
            className={cn('shrink-0 transition-transform duration-150', showGen && 'rotate-90')}
          />
          <Wand2 size={10} className="shrink-0 opacity-70" />
          {generated.length} auto-generated
        </button>
      )}
      {showGen &&
        generated.map((g) => (
          <button
            key={g.registryName}
            onClick={() => editGenerated(g)}
            title={`Made by ${display}. Click to edit its texture`}
            className={cn(
              'flex w-full items-center gap-1.5 rounded-md py-[3px] pl-9 pr-2 text-xs transition-colors hover:bg-ink-750/40',
              assignments?.[`item/${g.registryName}`]
                ? 'text-mist-500 hover:text-mist-300'
                : 'text-mist-600 hover:text-mist-400'
            )}
          >
            <span className="truncate">{g.displayName}</span>
            {!assignments?.[`item/${g.registryName}`] && (
              <span className="ml-auto shrink-0 text-[9px] uppercase tracking-wide text-ember-400/80">
                paint
              </span>
            )}
          </button>
        ))}
    </>
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
}): JSX.Element {
  const { entry, active, disabled, count, onClick } = props
  const Icon = entry.icon
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group relative mb-0.5 flex w-full items-center gap-2.5 rounded-md px-2 py-[7px] text-[13px] transition-colors duration-100',
        active ? 'text-mist-50' : 'text-mist-400 hover:bg-ink-750/60 hover:text-mist-200',
        disabled && 'pointer-events-none opacity-35'
      )}
    >
      {}
      {active && (
        <motion.span
          layoutId="nav-active"
          className="absolute inset-0 rounded-md bg-ink-750 shadow-panel"
          transition={{ type: 'spring', stiffness: 500, damping: 38 }}
        />
      )}
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
  )
}
