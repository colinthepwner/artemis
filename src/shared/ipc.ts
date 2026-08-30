export const IPC = {

  WindowClose: 'window:close',
  WindowRelaunch: 'window:relaunch',

  WindowDragStart: 'window:drag-start',
  WindowDragMove: 'window:drag-move',

  ProjectSave: 'project:save',
  ProjectOpen: 'project:open',
  ProjectOpenPath: 'project:open-path',

  ProjectOpenRequested: 'project:open-requested',
  ProjectSaveAs: 'project:save-as',

  ProjectsDir: 'project:dir',

  PrefsLoad: 'prefs:load',
  PrefsSave: 'prefs:save',

  RecentsList: 'recents:list',
  RecentsAdd: 'recents:add',
  RecentsRemove: 'recents:remove',

  ExportWorkspace: 'export:workspace',
  ShellOpenPath: 'shell:open-path',

  ShellShowItemInFolder: 'shell:show-item-in-folder',

  TestStart: 'test:start',
  TestStop: 'test:stop',

  TestKill: 'test:kill',
  TestOpenWorkspace: 'test:open-workspace',

  TestLog: 'test:log',

  TestState: 'test:state',

  VanillaArt: 'vanilla:art',

  PresenceUpdate: 'presence:update',

  UpdateState: 'update:state',

  UpdateInstall: 'update:install',

  SetupStatus: 'setup:status',

  SetupOpenSettings: 'setup:open-settings',

  JdkScan: 'jdk:scan',

  JdkPick: 'jdk:pick',

  JdkChoose: 'jdk:choose',

  JdkInstall: 'jdk:install',

  JdkInstallProgress: 'jdk:install-progress',

  MenuCommand: 'menu:command',

  MenuState: 'menu:state',

  BootPhase: 'boot:phase',

  BootGetPhase: 'boot:get-phase',

  SessionYield: 'session:yield',

  SessionYielded: 'session:yielded'
} as const

export type BootPhase = 'boot' | 'expanding' | 'ready'

export type UpdateStatus =
  | 'idle'
  | 'checking'

  | 'available'
  | 'downloading'
  | 'installing'
  | 'error'

export interface UpdateState {
  status: UpdateStatus

  version?: string

  percent?: number

  transferred?: number
  total?: number
  message?: string

  page?: string

  selfInstall?: boolean

  notes?: string
}

export interface PresenceState {
  enabled: boolean

  projectName: string | null

  btaVersion: string
}

export interface RecentProject {
  path: string
  name: string
  modId: string
  version: string
  targetBta: string

  openedAt: string
}

export type TestPhase = 'idle' | 'exporting' | 'building' | 'running' | 'stopped' | 'error'

export interface TestState {
  running: boolean
  phase: TestPhase
  exitCode?: number | null
  message?: string
}

export interface PermissionIssue {
  id: 'documents' | 'appdata'
  title: string
  detail: string

  steps: string[]

  path: string

  reason: string

  canOpenSettings: boolean
}

export interface JdkCandidate {
  home: string
  version: string
  major: number
  source: string
}

export interface SetupStatus {
  permissions: PermissionIssue[]

  jdk: JdkCandidate | null

  minJava: number
}

export type MenuCommand =
  | 'file.new'
  | 'file.open'
  | 'file.save'
  | 'file.export'
  | 'settings.autoCapitalize'
  | 'settings.inspector'
  | 'settings.reduceAnimations'
  | 'settings.checkerGrid'
  | 'settings.discordPresence'
  | 'settings.bundleTestMods'
  | 'settings.saving.manual'
  | 'settings.saving.periodic'
  | 'settings.saving.onChange'
  | 'help.tour'

export type SavingMode = 'manual' | 'periodic' | 'onChange'

export interface MenuState {
  hasProject: boolean
  autoCapitalize: boolean
  inspectorOpen: boolean
  reduceAnimations: boolean
  showCheckerGrid: boolean
  discordPresence: boolean
  bundleTestMods: boolean
  savingMode: SavingMode
}

export interface ArtemisApi {
  window: {
    close: () => void
    relaunch: () => void

    dragStart(): void

    dragMove(dx: number, dy: number): void
  }
  app: {
    platform: NodeJS.Platform

    version: string

    isDev: boolean

    skipOnboarding: boolean
  }

  setup: {

    status(): Promise<SetupStatus>

    openSettings(issue: PermissionIssue): void

    scanJdks(): Promise<JdkCandidate[]>

    pickJdk(): Promise<{ ok: boolean; candidate?: JdkCandidate; error?: string }>

    chooseJdk(home: string): Promise<JdkCandidate | null>

    installJdk(): Promise<{ ok: boolean; candidate?: JdkCandidate; error?: string }>
    onInstallProgress(cb: (percent: number) => void): () => void
  }
  menu: {

    onCommand(cb: (command: MenuCommand) => void): () => void

    setState(state: MenuState): void
  }
  project: {

    save(json: string, currentPath: string | null): Promise<string | null>
    saveAs(json: string, suggestedName: string): Promise<string | null>

    dir(): Promise<string>

    open(): Promise<{ path: string; json: string } | null>

    openPath(path: string): Promise<{ path: string; json: string } | null>
    recents(): Promise<RecentProject[]>
    addRecent(entry: RecentProject): void
    removeRecent(path: string): void

    onOpenRequested(cb: (path: string) => void): () => void
  }
  export: {

    workspace(
      projectJson: string
    ): Promise<{ ok: boolean; path?: string; jarPath?: string; error?: string; log: string[] }>
    openPath(path: string): void

    revealJar(path: string): void
  }
  prefs: {

    load(): Promise<Record<string, unknown>>
    save(prefs: Record<string, unknown>): void
  }
  test: {

    start(
      projectJson: string,
      options?: { bundleTestMods?: boolean }
    ): Promise<{ ok: boolean; error?: string }>
    stop(): void

    kill(modId: string): void

    openWorkspace(modId: string): void
    onLog(cb: (line: string) => void): () => void
    onState(cb: (state: TestState) => void): () => void
  }
  update: {

    onState(cb: (state: UpdateState) => void): () => void

    install(): void
  }
  boot: {

    phase(): Promise<BootPhase>
    onPhase(cb: (phase: BootPhase) => void): () => void
  }
  session: {

    onYieldRequested(cb: () => Promise<void>): () => void
  }
  presence: {

    update(state: PresenceState): void
  }
  vanilla: {

    art(btaVersion: string): Promise<{
      blocks: Record<string, string>
      items: Record<string, string>
      tops: Record<string, string>
    }>
  }
}
