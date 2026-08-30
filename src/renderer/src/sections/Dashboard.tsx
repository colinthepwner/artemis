import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { FolderOpen, Plus, Clock, X, Images, PackageOpen, FolderDown, ArrowLeft } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useProjectStore } from '@/store/projectStore'
import { useAppStore, type HeroMode } from '@/store/appStore'
import { useTypedText } from '@/components/ui/typing'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context'
import { toRegistryName, type ArtemisElement, type ElementKind } from '@shared/project'
import { titleCase } from '@shared/generator/templates/block'
import type { RecentProject } from '@shared/ipc'
import { KIND_ICONS } from '@/lib/kindIcons'
import { ContentThumb } from '@/components/ui/ContentThumb'
import { menuOwnsKeyboard } from '@/components/ui/dismissDistant'
import { KIND_LABELS } from '@/sections/forms/registry'
import { Select } from '@/components/ui/controls'
import { LATEST_BTA, SUPPORTED_BTA } from '@shared/generator/mappings'
import { cn } from '@/lib/cn'
import logoUrl from '@/assets/logo.png'

export function Dashboard(): JSX.Element {
  const project = useProjectStore((s) => s.project)
  return (

    <div className="flex-1 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-[clamp(1rem,4vh,2.5rem)]">
        {project ? <ProjectOverview /> : <WelcomeHero />}
      </div>
    </div>
  )
}

const TYPO_CHANCE = 0.34

const WORDMARK = 'ARTEMIS'

const HERO_LINES: Record<'new' | 'existing', string[]> = {

  new: [
    "THIS ONE'S GONNA BE THE ONE!",
    'BLANK CANVAS, INFINITE BLOCKS.',
    'EVERY MOD STARTS RIGHT HERE.',
    "LET'S BUILD SOMETHING WEIRD.",
    'DAY ONE OF THE MASTERPIECE.',
    'NEW WORLD, NEW PROBLEMS.',
    'THE IDEA IS THE HARD PART.',
    'MAKE THE THING YOU WANTED.',
    'NOBODY ELSE IS BUILDING THIS.',
    'START UGLY, FINISH PROUD.',
    'ONE BLOCK AT A TIME.',
    'THE GAME NEEDS THIS. PROBABLY.',
    'GREATNESS BEGINS WITH A MOD ID.',
    'FROM NOTHING, SOMETHING.',
    'YOUR BEST WORK IS UNWRITTEN.',
    'TODAY WE ADD ORE.',
    "LET'S RUIN SOME BALANCE.",
    'BRAND NEW, NO BUGS YET.',
    'IT COMPILES IN YOUR HEART.',
    'BOLD OF YOU. I LIKE IT.',
    'ANOTHER WORLD TO BREAK.',
    'THE FIRST BLOCK IS THE HARDEST.',
    'NAME IT SOMETHING RIDICULOUS.',
    'GO ON THEN. AMAZE ME.'
  ],

  existing: [
    'HERE TO ACTUALLY LOCK IN?',
    'BACK AT IT AGAIN, I SEE.',
    'WE MEET AGAIN.',
    'THE MOD MISSED YOU.',
    'STILL NOT FINISHED, HUH?',
    "LET'S PRETEND WE REMEMBER THIS.",
    'WHERE DID WE LEAVE OFF?',
    "IT'S BEEN WAITING PATIENTLY.",
    'OH, THIS OLD THING.',
    "TIME TO FIX PAST YOU'S WORK.",
    'THE BLOCKS ARE WHERE YOU LEFT THEM.',
    'READY TO BREAK IT AGAIN?',
    'UNFINISHED BUSINESS.',
    'YOUR MOD, STILL STANDING.',
    'ONE MORE FEATURE, YOU SAID.',
    'BACK FOR ROUND TWO.',
    "LET'S FINISH IT THIS TIME.",
    'PICKING UP THE PICKAXE.',
    "IT DIDN'T FIX ITSELF.",
    'WELCOME BACK, MODDER.',
    'THE TODO LIST REMEMBERS.',
    'SAME MOD, NEW RESOLVE.'
  ]
}

const EGG_LINES: string[] = [
  "YOU'RE NOT DOING THIS ALL DAY ARE YOU?",
  'STILL DECIDING?',
  'TAKE YOUR TIME. REALLY.',
  'THERE ARE ONLY TWO OPTIONS.',
  'I CAN DO THIS LONGER THAN YOU CAN.',
  "THE BUTTONS DON'T CHANGE, YOU KNOW.",
  'LOOKING FOR A THIRD ONE?',
  'THERE IS NO THIRD ONE.',
  "OKAY, NOW YOU'RE TESTING ME.",
  "I'M RUNNING OUT OF THINGS TO SAY.",
  'THAT WAS A LIE. I HAVE PLENTY.',
  'MY RECORD IS FORTY. BEAT IT.',
  "YOUR MOD ISN'T WRITING ITSELF.",
  'NEITHER AM I, TO BE FAIR.',
  'WE COULD HAVE ADDED A BLOCK BY NOW.',
  'PICK ONE. ANY ONE. PLEASE.',
  "I'VE SEEN CREEPERS COMMIT FASTER.",
  'IS THIS THE PRODUCTIVE PART?',
  'FINE. I RESPECT THE DEDICATION.',
  'YOU AND ME, FOREVER, IN THIS MENU.',
  "ALRIGHT, YOU WIN. I'M IMPRESSED.",
  'GO ON THEN. MAKE SOMETHING.'
]

const EGG_AFTER = 6

function lineFor(mode: HeroMode, switches: number): string {
  if (switches >= EGG_AFTER) {
    return EGG_LINES[Math.min(switches - EGG_AFTER, EGG_LINES.length - 1)]
  }
  if (mode === 'choose') return WORDMARK
  const lines = HERO_LINES[mode]
  return lines[Math.floor(Math.random() * lines.length)]
}

function TypedWordmark(props: { mode: HeroMode; switches: number }): JSX.Element {
  const { mode, switches } = props
  const noticeOpen = useAppStore((s) => s.startupNoticeOpen)
  const tourOpen = useAppStore((s) => s.activeTour !== null)

  const booting = useAppStore((s) => s.bootPhase) !== 'ready'

  const [phrase, setPhrase] = useState(WORDMARK)
  const [fumble, setFumble] = useState(false)
  useEffect(() => {
    setPhrase(lineFor(mode, switches))
    setFumble(Math.random() < TYPO_CHANCE)
  }, [mode, switches])

  const { text, done } = useTypedText(phrase, {
    paused: booting || noticeOpen || tourOpen,
    fumble
  })
  const isWordmark = phrase === WORDMARK

  const rest = phrase.slice(text.length)

  return (
    <div className="mt-4 flex justify-center px-4">
      {

}
      <span
        className={cn(
          'pixel-title block max-w-sm font-pixel',
          isWordmark
            ? 'text-2xl tracking-[0.18em] text-mist-100'
            : 'text-[13px] leading-relaxed tracking-[0.1em] text-gold-300/90'
        )}
      >
        {text}
        {

}
        {!done && (
          <span className="relative inline-block h-[1em] w-0 align-baseline">
            <span className="pixel-caret absolute bottom-0 left-[0.14em] h-[0.11em] w-[0.5em] bg-gold-400" />
          </span>
        )}
        <span className="invisible" aria-hidden>
          {rest}
        </span>
      </span>
    </div>
  )
}

function LogoHero(props: { mode: HeroMode; switches: number }): JSX.Element {

  const revealed = useAppStore((s) => s.bootPhase) === 'ready'
  return (

    <div className="mb-[clamp(0.75rem,4vh,2.25rem)] flex flex-col items-center">
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
          animate={revealed ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 8, scale: 0.96 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}

          className="relative h-[clamp(5rem,17vh,11rem)] w-auto select-none drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
        />
      </div>
      <TypedWordmark mode={props.mode} switches={props.switches} />
    </div>
  )
}

function WelcomeHero(): JSX.Element {
  const recents = useRecents()
  const openProject = useProjectStore((s) => s.openProject)
  const mode = useAppStore((s) => s.heroMode)
  const setMode = useAppStore((s) => s.setHeroMode)
  useEffect(() => () => setMode('choose'), [setMode])

  const [switches, setSwitches] = useState(0)

  const go = (next: HeroMode): void => {
    if (next === mode) return
    setMode(next)
    setSwitches((n) => n + 1)
  }

  const chooseExisting = (): void => {
    if (recents.list.length === 0) void openProject()
    else go('existing')
  }

  useEffect(() => {
    if (mode === 'choose') return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return

      if (menuOwnsKeyboard()) return
      setMode('choose')
      setSwitches((n) => n + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode])

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-md"
    >
      <LogoHero mode={mode} switches={switches} />

      {

}
      <motion.div
        key={mode}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        {mode === 'choose' && (
          <ChoosePanel
            recentCount={recents.list.length}
            onNew={() => go('new')}
            onExisting={chooseExisting}
          />
        )}
        {mode === 'new' && <NewModPanel onBack={() => go('choose')} />}
        {mode === 'existing' && (
          <ExistingModPanel recents={recents} onBack={() => go('choose')} />
        )}
      </motion.div>

      {recents.error && (
        <p className="mt-3 text-center text-2xs text-ember-400">{recents.error}</p>
      )}

      {
}
      <p className="mt-4 text-center font-mono text-2xs text-mist-700">
        Artemis v{window.artemis.app.version}
      </p>
    </motion.div>
  )
}

function ChoosePanel(props: {
  recentCount: number
  onNew: () => void
  onExisting: () => void
}): JSX.Element {
  return (
    <div data-tour="dashboard-doors" className="grid gap-3 sm:grid-cols-2">
      <HeroChoice
        anchor="dashboard-new"
        icon={Plus}
        title="New Mod"
        desc="Start from an empty project."
        onClick={props.onNew}
        primary
      />
      <HeroChoice
        anchor="dashboard-existing"
        icon={FolderOpen}
        title="Existing Mod"
        desc={
          props.recentCount > 0
            ? `${props.recentCount} recent ${props.recentCount === 1 ? 'project' : 'projects'}.`
            : 'Open a mod you already have.'
        }
        onClick={props.onExisting}
      />
    </div>
  )
}

function HeroChoice(props: {
  icon: LucideIcon
  title: string
  desc: string
  onClick: () => void
  primary?: boolean

  anchor?: string
}): JSX.Element {
  const Icon = props.icon
  return (
    <button
      data-tour={props.anchor}
      onClick={props.onClick}
      className={cn(

        'card group flex flex-col items-start gap-2 p-4 text-left transition-colors duration-150',
        props.primary ? 'hover:shadow-glow-gold' : 'hover:bg-ink-750'
      )}
    >
      {

}
      <Icon
        size={20}
        strokeWidth={2}
        className={cn(
          'transition-colors',
          props.primary ? 'text-gold-400' : 'text-mist-400 group-hover:text-mist-100'
        )}
      />
      <span className="text-[14px] font-medium text-mist-50">{props.title}</span>
      <span className="text-2xs leading-relaxed text-mist-500">{props.desc}</span>
    </button>
  )
}

function BackLink(props: { onBack: () => void }): JSX.Element {
  return (
    <button
      onClick={props.onBack}
      className="mb-2 flex items-center gap-1.5 text-2xs text-mist-500 transition-colors hover:text-mist-200"
    >
      <ArrowLeft size={12} /> Back
    </button>
  )
}

function NewModPanel(props: { onBack: () => void }): JSX.Element {
  const [name, setName] = useState('')
  const [modId, setModId] = useState('')
  const [modIdTouched, setModIdTouched] = useState(false)

  const [targetBta, setTargetBta] = useState(LATEST_BTA)
  const newProject = useProjectStore((s) => s.newProject)
  const saveProject = useProjectStore((s) => s.saveProject)
  const navigate = useAppStore((s) => s.navigate)
  const [projectsDir, setProjectsDir] = useState('')

  useEffect(() => {
    void window.artemis.project.dir().then(setProjectsDir)
  }, [])

  const effectiveModId = modIdTouched ? modId : toRegistryName(name)
  const valid = name.trim().length > 0 && /^[a-z][a-z0-9_]*$/.test(effectiveModId)

  const create = (): void => {
    if (!valid) return
    newProject(name.trim(), effectiveModId, targetBta)

    void saveProject()
    navigate('dashboard')
  }

  return (
    <div>
      <BackLink onBack={props.onBack} />
      <div data-tour="newmod-form" className="card space-y-4 p-5">
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
        <div>
          <label className="label-base">Game Version</label>
          <Select
            value={targetBta}
            onChange={setTargetBta}
            options={SUPPORTED_BTA.map((v) => ({
              value: v,
              label: v === LATEST_BTA ? `BTA ${v} (latest)` : `BTA ${v}`
            }))}
          />
          <p className="mt-1.5 text-2xs text-mist-600">
            The release this mod is built against. Fixed once the project exists.
          </p>
        </div>

        <button
          onClick={create}
          disabled={!valid}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-md bg-gold-500 py-2 text-[13px] font-medium text-ink-950 transition-all duration-150',
            valid ? 'hover:bg-gold-400 active:scale-[0.98]' : 'cursor-not-allowed opacity-40'
          )}
        >
          <Plus size={15} strokeWidth={2.2} /> Create Project
        </button>

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
    </div>
  )
}

function ExistingModPanel(props: { recents: RecentsApi; onBack: () => void }): JSX.Element {
  const openProject = useProjectStore((s) => s.openProject)
  const { recents } = props
  return (
    <div>
      <BackLink onBack={props.onBack} />
      <div className="card flex flex-col p-4">
        <div className="mb-2 flex items-center gap-2">
          <Clock size={13} className="text-gold-400" />
          <h2 className="text-2xs font-semibold uppercase tracking-wider text-mist-400">
            Recent Projects
          </h2>
          <span className="ml-auto font-mono text-2xs text-mist-600">{recents.list.length}</span>
        </div>
        {

}
        <div className="-mx-1.5 max-h-[19rem] space-y-0.5 overflow-y-auto">
          {recents.list.map((r) => (
            <RecentRow
              key={r.path}
              recent={r}
              onOpen={() => recents.open(r.path)}
              onRemove={() => recents.remove(r.path)}
            />
          ))}
        </div>
        <button
          onClick={() => void openProject()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-ink-750 py-2 text-[13px] text-mist-200 transition-colors hover:bg-ink-700"
        >
          <FolderDown size={15} strokeWidth={1.8} /> Browse for a file
        </button>
      </div>
    </div>
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

function RecentRow(props: { recent: RecentProject; onOpen: () => void; onRemove: () => void }): JSX.Element {
  const { recent } = props
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          onClick={props.onOpen}
          className="group flex cursor-pointer items-center gap-3 rounded-md px-1.5 py-2 transition-colors hover:bg-ink-750"
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
        </div>
      </ContextMenu.Trigger>
      <ContextMenuContent>
        <ContextMenuItem label="Open" icon={FolderOpen} onSelect={props.onOpen} />
        <ContextMenuSeparator />
        <ContextMenuItem label="Remove from Recents" icon={X} danger onSelect={props.onRemove} />
      </ContextMenuContent>
    </ContextMenu.Root>
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
              className="card group p-3.5 text-left transition hover:bg-ink-750 hover:shadow-raised"
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
              const display = (el.properties['displayName'] as string) || titleCase(el.name)
              return (
                <button
                  key={el.id}
                  onClick={() => openElement(el)}
                  className="flex w-full items-center gap-3 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-ink-750"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-ink-900/60 shadow-panel">
                    <ContentThumb element={el} size={20} />
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
