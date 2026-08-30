import type {
  ArtemisApi,
  JdkCandidate,
  RecentProject,
  SetupStatus,
  TestState,
  UpdateState,
  BootPhase
} from '@shared/ipc'

export interface BridgeCall {
  name: string
  args: unknown[]
}

export const bridgeCalls: BridgeCall[] = []

export const bridgeListeners = new Map<string, Array<(v: never) => void>>()

const record = (name: string, ...args: unknown[]): void => {
  bridgeCalls.push({ name, args })
}

const subscribe = (name: string, cb: (v: never) => void): (() => void) => {
  const list = bridgeListeners.get(name) ?? []
  list.push(cb)
  bridgeListeners.set(name, list)
  return () => {
    const l = bridgeListeners.get(name)
    if (l) bridgeListeners.set(name, l.filter((f) => f !== cb))
  }
}

export function resetBridge(): void {
  bridgeCalls.length = 0
  bridgeListeners.clear()
}

export const setupInbox: {
  status: SetupStatus
  scanResult: JdkCandidate[]
  pickResult: { ok: boolean; candidate?: JdkCandidate; error?: string }
  installResult: { ok: boolean; candidate?: JdkCandidate; error?: string }
} = {
  status: { permissions: [], jdk: null, minJava: 17 },
  scanResult: [],
  pickResult: { ok: false },
  installResult: { ok: false }
}

export const bridgeInbox: { openResult: { path: string; json: string } | null } = {
  openResult: null
}

const api: ArtemisApi = {
  window: {
    close: () => record('window.close'),
    relaunch: () => record('window.relaunch'),
    dragStart: () => record('window.dragStart'),
    dragMove: (dx, dy) => record('window.dragMove', dx, dy)
  },
  sound: { importOgg: async () => { record('sound.importOgg'); return null } },
  texture: {
    exportFile: async () => { record('texture.exportFile'); return null },
    exportClipboard: async () => { record('texture.exportClipboard'); return false }
  },
  app: { platform: 'win32', version: '0.0.0-probe', isDev: false, skipOnboarding: false },
  setup: {
    status: async () => setupInbox.status,
    openSettings: (issue) => record('setup.openSettings', issue.id),
    scanJdks: async () => {
      record('setup.scanJdks')
      return setupInbox.scanResult
    },
    pickJdk: async () => {
      record('setup.pickJdk')
      return setupInbox.pickResult
    },
    chooseJdk: async (home) => {
      record('setup.chooseJdk', home)
      return setupInbox.scanResult.find((c) => c.home === home) ?? null
    },
    installJdk: async () => {
      record('setup.installJdk')
      return setupInbox.installResult
    },
    onInstallProgress: (cb) => subscribe('setup.installProgress', cb as (v: never) => void)
  },
  menu: {
    onCommand: (cb) => subscribe('menu.command', cb as (v: never) => void),
    setState: (state) => record('menu.setState', state.savingMode)
  },
  project: {
    save: async (json, currentPath) => {
      record('project.save', currentPath)
      return currentPath ?? 'C:/probe/project.artemis'
    },
    saveAs: async (json, suggestedName) => {
      record('project.saveAs', suggestedName)
      return `C:/probe/${suggestedName}`
    },
    dir: async () => 'C:/probe',
    open: async () => {
      record('project.open')
      return bridgeInbox.openResult
    },
    openPath: async (path) => {
      record('project.openPath', path)
      return bridgeInbox.openResult
    },
    recents: async () => [] as RecentProject[],
    addRecent: (entry) => record('project.addRecent', entry.path),
    removeRecent: (path) => record('project.removeRecent', path),

    onOpenRequested: (cb) => subscribe('project.openRequested', cb as (v: never) => void)
  },
  export: {
    workspace: async () => {
      record('export.workspace')
      return { ok: true, path: 'C:/probe/workspace', log: [] }
    },
    openPath: (path) => record('export.openPath', path),
    revealJar: (path) => record('export.revealJar', path)
  },
  prefs: {
    load: async () => {
      record('prefs.load')
      return {}
    },
    save: (prefs) => record('prefs.save', Object.keys(prefs).length)
  },
  test: {
    start: async () => {
      record('test.start')
      return { ok: true }
    },
    stop: () => record('test.stop'),
    kill: (modId) => record('test.kill', modId),
    openWorkspace: (modId) => record('test.openWorkspace', modId),
    onLog: (cb) => subscribe('test.log', cb as (v: never) => void),
    onState: (cb) => subscribe('test.state', cb as unknown as (v: never) => void)
  },
  update: {
    onState: (cb) => subscribe('update.state', cb as unknown as (v: never) => void),
    install: () => record('update.install')
  },
  boot: {
    phase: async () => 'ready' as BootPhase,
    onPhase: (cb) => subscribe('boot.phase', cb as unknown as (v: never) => void)
  },

  session: {
    onYieldRequested: (cb) => subscribe('session.yield', cb as unknown as (v: never) => void)
  },
  presence: { update: () => record('presence.update') },
  vanilla: {

    art: async () => {
      record('vanilla.art')
      return { blocks: {}, items: {}, tops: {} }
    }
  }
}

export function emitBridge(channel: 'test.log', value: string): void
export function emitBridge(channel: 'test.state', value: TestState): void
export function emitBridge(channel: 'update.state', value: UpdateState): void
export function emitBridge(channel: 'boot.phase', value: BootPhase): void
export function emitBridge(channel: string, value: unknown): void {
  for (const cb of bridgeListeners.get(channel) ?? []) (cb as (v: unknown) => void)(value)
}

const g = globalThis as unknown as {
  window?: unknown
  artemis?: ArtemisApi
  addEventListener?: unknown
  removeEventListener?: unknown
  matchMedia?: unknown
  innerWidth?: number
  innerHeight?: number
  requestAnimationFrame?: unknown
  cancelAnimationFrame?: unknown
  document?: unknown
  localStorage?: unknown
}
if (!g.window) g.window = g

const listeners = new Map<string, Array<(e: unknown) => void>>()
g.addEventListener = (type: string, fn: (e: unknown) => void): void => {
  const l = listeners.get(type) ?? []
  l.push(fn)
  listeners.set(type, l)
}
g.removeEventListener = (type: string, fn: (e: unknown) => void): void => {
  const l = listeners.get(type)
  if (l) listeners.set(type, l.filter((f) => f !== fn))
}

export function emitWindowEvent(type: string, event: Record<string, unknown> = {}): void {
  for (const fn of [...(listeners.get(type) ?? [])]) {
    fn({ type, preventDefault(): void {}, stopPropagation(): void {}, ...event })
  }
}

export const windowListenerCount = (type: string): number => listeners.get(type)?.length ?? 0

g.innerWidth = 1440
g.innerHeight = 900
g.requestAnimationFrame = () => 0
g.cancelAnimationFrame = () => {}
const doc = (g.document ?? {}) as Record<string, unknown>
if (!doc.querySelector) doc.querySelector = () => null
g.document = doc

const stored = new Map<string, string>()
g.localStorage = {
  getItem: (k: string) => stored.get(k) ?? null,
  setItem: (k: string, v: string) => void stored.set(k, String(v)),
  removeItem: (k: string) => void stored.delete(k),
  clear: () => stored.clear()
}

export const fakeStorage = stored

g.matchMedia = (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {}
})

g.artemis = api
;(g.window as { artemis: ArtemisApi }).artemis = api

export { api as fakeArtemisApi }
