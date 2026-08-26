export const IPC = {

  WindowMinimize: 'window:minimize',
  WindowMaximizeToggle: 'window:maximize-toggle',
  WindowClose: 'window:close',
  WindowIsMaximized: 'window:is-maximized',

  WindowMaximizeChanged: 'window:maximize-changed',

  ProjectSave: 'project:save',
  ProjectOpen: 'project:open',
  ProjectOpenPath: 'project:open-path',
  ProjectSaveAs: 'project:save-as',

  ProjectsDir: 'project:dir',

  RecentsList: 'recents:list',
  RecentsAdd: 'recents:add',
  RecentsRemove: 'recents:remove',

  GeneratorPreview: 'generator:preview',
  ExportWorkspace: 'export:workspace',
  ShellOpenPath: 'shell:open-path',

  ShellShowItemInFolder: 'shell:show-item-in-folder',

  TestStart: 'test:start',
  TestStop: 'test:stop',
  TestOpenWorkspace: 'test:open-workspace',

  TestLog: 'test:log',

  TestState: 'test:state',

  UpdateState: 'update:state'
} as const

export type UpdateStatus = 'idle' | 'checking' | 'downloading' | 'installing' | 'error'

export interface UpdateState {
  status: UpdateStatus

  version?: string

  percent?: number

  transferred?: number
  total?: number
  message?: string
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

export interface ArtemisApi {
  window: {
    minimize(): void
    maximizeToggle(): void
    close(): void
    isMaximized(): Promise<boolean>
    onMaximizeChanged(cb: (maximized: boolean) => void): () => void
  }
  app: {
    platform: NodeJS.Platform
    version: string
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
  }
  export: {

    workspace(
      projectJson: string
    ): Promise<{ ok: boolean; path?: string; jarPath?: string; error?: string; log: string[] }>
    openPath(path: string): void

    revealJar(path: string): void
  }
  test: {

    start(projectJson: string): Promise<{ ok: boolean; error?: string }>
    stop(): void

    openWorkspace(modId: string): void
    onLog(cb: (line: string) => void): () => void
    onState(cb: (state: TestState) => void): () => void
  }
  update: {

    onState(cb: (state: UpdateState) => void): () => void
  }
}
