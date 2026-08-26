import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { FolderOpen, Plus, Clock, X, Images, PackageOpen } from 'lucide-react'
import { useProjectStore } from '@/store/projectStore'
import { useAppStore } from '@/store/appStore'
import { toRegistryName, type ArtemisElement, type ElementKind } from '@shared/project'
import { titleCase } from '@shared/generator/templates/block'
import type { RecentProject } from '@shared/ipc'
import { KIND_ICONS } from '@/components/layout/Sidebar'
import { KIND_LABELS } from '@/sections/forms/registry'
import { cn } from '@/lib/cn'
import logoUrl from '@/assets/logo.png'

export function Dashboard(): JSX.Element {
  const project = useProjectStore((s) => s.project)
  return (

    <div className="flex-1 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-10">
        {project ? <ProjectOverview /> : <WelcomeHero />}
      </div>
    </div>
  )
}

function LogoHero(): JSX.Element {
  return (
    <div className="mb-9 flex justify-center">
      <div className="relative flex items-center justify-center">
        {
}
        <motion.div
          className="pointer-events-none absolute h-52 w-52 rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(230,173,85,0.5), rgba(230,173,85,0) 68%)' }}
          animate={{ opacity: [0.3, 0.55, 0.3], scale: [0.92, 1.08, 0.92] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="pointer-events-none absolute h-44 w-44 rounded-full blur-2xl"
          style={{ background: 'radial-gradient(circle, rgba(106,174,232,0.28), rgba(106,174,232,0) 70%)' }}
          animate={{ opacity: [0.25, 0.45, 0.25], scale: [1.05, 0.95, 1.05] }}
          transition={{ duration: 7.5, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.img
          src={logoUrl}
          alt="Artemis"
          draggable={false}
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative h-44 w-auto select-none drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
        />
      </div>
    </div>
  )
}

function WelcomeHero(): JSX.Element {
  const [name, setName] = useState('')
  const [modId, setModId] = useState('')
  const [modIdTouched, setModIdTouched] = useState(false)
  const newProject = useProjectStore((s) => s.newProject)
  const saveProject = useProjectStore((s) => s.saveProject)
  const openProject = useProjectStore((s) => s.openProject)
  const navigate = useAppStore((s) => s.navigate)
  const recents = useRecents()
  const [projectsDir, setProjectsDir] = useState('')

  useEffect(() => {
    void window.artemis.project.dir().then(setProjectsDir)
  }, [])

  const effectiveModId = modIdTouched ? modId : toRegistryName(name)
  const valid = name.trim().length > 0 && /^[a-z][a-z0-9_]*$/.test(effectiveModId)

  const create = (): void => {
    if (!valid) return
    newProject(name.trim(), effectiveModId)

    void saveProject()
    navigate('dashboard')
  }

  const showRecents = recents.list.length > 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-md"
    >
      <LogoHero />

      <div className="space-y-3">
        <div className="card space-y-4 p-5">
          <div>
            <label className="label-base">Mod Name</label>
            <input
              className="input-base"
              placeholder="My Adventure Mod"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
          </div>
          <div>
            <label className="label-base">Mod ID</label>
            <input
              className="input-base font-mono"
              placeholder="my_adventure_mod"
              value={effectiveModId}
              onChange={(e) => {
                setModIdTouched(true)
                setModId(toRegistryName(e.target.value))
              }}
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
            <p className="mt-1.5 text-2xs text-mist-600">
              Fills in automatically. The lowercase namespace for everything you create.
            </p>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={create}
              disabled={!valid}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-md bg-gold-500 py-2 text-[13px] font-medium text-ink-950 transition-all duration-150',
                valid ? 'hover:bg-gold-400 active:scale-[0.98]' : 'cursor-not-allowed opacity-40'
              )}
            >
              <Plus size={15} strokeWidth={2.2} /> Create Project
            </button>
            <button
              onClick={() => void openProject()}
              className="flex items-center gap-2 rounded-md bg-ink-750 px-4 py-2 text-[13px] text-mist-200 transition-colors hover:bg-ink-700"
            >
              <FolderOpen size={15} strokeWidth={1.8} /> Open
            </button>
          </div>

          {projectsDir && (
            <button
              onClick={() => window.artemis.export.openPath(projectsDir)}
              title={projectsDir}
              className="flex w-full items-center gap-1.5 truncate text-left text-2xs text-mist-600 transition-colors hover:text-mist-400"
            >
              <FolderOpen size={11} className="shrink-0" />
              <span className="truncate">Saved to {projectsDir}</span>
            </button>
          )}
        </div>

        {showRecents && <RecentPanel recents={recents} />}
      </div>

      {recents.error && (
        <p className="mt-3 text-center text-2xs text-ember-400">{recents.error}</p>
      )}
    </motion.div>
  )
}

interface RecentsApi {
  list: RecentProject[]
  error: string | null
  open: (path: string) => void
  remove: (path: string) => void
}

function useRecents(): RecentsApi {
  const [list, setList] = useState<RecentProject[]>([])
  const [error, setError] = useState<string | null>(null)
  const openByPath = useProjectStore((s) => s.openProjectByPath)

  useEffect(() => {
    void window.artemis.project.recents().then(setList)
  }, [])

  const open = (path: string): void => {
    setError(null)
    openByPath(path).catch((e) => {
      setError(e instanceof Error ? e.message : String(e))

      setList((l) => l.filter((r) => r.path !== path))
    })
  }

  const remove = (path: string): void => {
    window.artemis.project.removeRecent(path)
    setList((l) => l.filter((r) => r.path !== path))
  }

  return { list, error, open, remove }
}

function RecentPanel({ recents }: { recents: RecentsApi }): JSX.Element {
  return (
    <div className="card flex max-h-64 flex-col p-4">
      <div className="mb-2 flex items-center gap-2">
        <Clock size={13} className="text-gold-400" />
        <h2 className="text-2xs font-semibold uppercase tracking-wider text-mist-400">Recent Projects</h2>
        <span className="ml-auto font-mono text-2xs text-mist-600">{recents.list.length}</span>
      </div>
      <div className="-mx-1.5 min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {recents.list.map((r) => (
          <RecentRow key={r.path} recent={r} onOpen={() => recents.open(r.path)} onRemove={() => recents.remove(r.path)} />
        ))}
      </div>
    </div>
  )
}

function RecentRow(props: { recent: RecentProject; onOpen: () => void; onRemove: () => void }): JSX.Element {
  const { recent } = props
  return (
    <div
      onClick={props.onOpen}
      className="group flex cursor-default items-center gap-3 rounded-md px-1.5 py-2 transition-colors hover:bg-ink-750"
      title={recent.path}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ink-800 font-mono text-sm font-semibold text-gold-400/90 shadow-panel">
        {recent.name.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] text-mist-100">{recent.name}</div>
        <div className="truncate font-mono text-2xs text-mist-600">
          {recent.modId} · BTA {recent.targetBta} · {relativeTime(recent.openedAt)}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          props.onRemove()
        }}
        title="Remove from list"
        className="rounded p-1 text-mist-600 opacity-0 transition-all hover:bg-ink-700 hover:text-mist-300 group-hover:opacity-100"
      >
        <X size={13} />
      </button>
    </div>
  )
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function ProjectOverview(): JSX.Element {
  const project = useProjectStore((s) => s.project)!
  const navigate = useAppStore((s) => s.navigate)
  const openEditor = useAppStore((s) => s.openEditor)
  const openCreateMenu = useAppStore((s) => s.openCreateMenu)

  const counts = project.elements.reduce<Record<string, number>>((acc, el) => {
    acc[el.kind] = (acc[el.kind] ?? 0) + 1
    return acc
  }, {})

  const recentElements = [...project.elements]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5)

  const openElement = (el: ArtemisElement): void => {
    navigate(el.kind)
    openEditor(el.id)
  }

  return (
    <div className="w-full max-w-2xl">
      <div className="text-center">
        <h1 className="text-xl font-semibold tracking-tight">{project.meta.name}</h1>
        <p className="mt-1 font-mono text-2xs text-mist-500">
          {project.meta.modId} · v{project.meta.version} · BTA {project.meta.targetBta}
        </p>

        <div className="mt-5 flex justify-center gap-2">
          <button
            onClick={openCreateMenu}
            className="flex items-center gap-1.5 rounded-md bg-gold-500 px-4 py-2 text-[13px] font-medium text-ink-950 transition-all hover:bg-gold-400 active:scale-[0.98]"
          >
            <Plus size={15} strokeWidth={2.2} /> Create
          </button>
          <button
            onClick={() => navigate('gallery')}
            className="flex items-center gap-1.5 rounded-md bg-ink-750 px-4 py-2 text-[13px] text-mist-200 transition-colors hover:bg-ink-700"
          >
            <Images size={14} /> Gallery
          </button>
          <button
            onClick={() => navigate('export')}
            className="flex items-center gap-1.5 rounded-md bg-ink-750 px-4 py-2 text-[13px] text-mist-200 transition-colors hover:bg-ink-700"
          >
            <PackageOpen size={14} /> Export
          </button>
        </div>
      </div>

      <div className="mt-7 grid grid-cols-4 gap-2.5">
        {(Object.keys(KIND_ICONS) as ElementKind[]).map((kind) => {
          const Icon = KIND_ICONS[kind]
          const count = counts[kind] ?? 0
          return (
            <button
              key={kind}
              onClick={() => navigate(kind)}
              className="card group p-3.5 text-left transition-all hover:bg-ink-750 hover:shadow-raised"
            >
              <div className="flex items-center justify-between">
                <Icon size={15} strokeWidth={1.75} className="text-mist-500 transition-colors group-hover:text-gold-400" />
                <span className={cn('text-lg font-semibold', count > 0 ? 'text-gold-400' : 'text-mist-600')}>
                  {count}
                </span>
              </div>
              <div className="mt-1 text-2xs uppercase tracking-wider text-mist-500">
                {KIND_LABELS[kind].labelPlural}
              </div>
            </button>
          )
        })}
      </div>

      {recentElements.length > 0 ? (
        <div className="card mt-4 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Clock size={13} className="text-gold-400" />
            <h2 className="text-2xs font-semibold uppercase tracking-wider text-mist-400">
              Recently edited
            </h2>
          </div>
          <div className="-mx-1.5 space-y-0.5">
            {recentElements.map((el) => {
              const Icon = KIND_ICONS[el.kind]
              const display = (el.properties['displayName'] as string) || titleCase(el.name)
              return (
                <button
                  key={el.id}
                  onClick={() => openElement(el)}
                  className="flex w-full items-center gap-3 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-ink-750"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-ink-900/60 shadow-panel">
                    <Icon size={13} className="text-mist-400" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-mist-100">{display}</span>
                  <span className="shrink-0 font-mono text-2xs text-mist-600">{relativeTime(el.updatedAt)}</span>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <p className="mt-6 text-center text-[13px] leading-relaxed text-mist-500">
          Hit <span className="text-gold-400">Create</span> to add your first element. Each one has a
          short wizard, and the generated Java shows live on the right.
        </p>
      )}
    </div>
  )
}
