import { create } from 'zustand'
import type { ElementKind } from '@shared/project'
import type { BootPhase } from '@shared/ipc'

export type SectionId =
  | 'dashboard'
  | 'gallery'
  | 'workshop'
  | ElementKind
  | 'test'
  | 'export'
  | 'settings'

export interface TextureEditorState {
  textureId: string | null
  assignSlotAfter?: string
  kind?: 'block' | 'item'

  suggestedName?: string
}

import type { SavingMode } from '@shared/ipc'
export type { SavingMode }

export interface PendingWork {

  has: () => boolean

  commit: () => boolean
}

interface Place {
  section: SectionId
  editingId: string | null
  textureEditor: TextureEditorState | null
  workshopEditor: { elementId: string } | null
}

const HISTORY_LIMIT = 60

function record(state: AppState, place: Place): Partial<AppState> {

  const past = state.history.slice(0, state.historyIndex + 1)
  const last = past[past.length - 1]
  if (
    last &&
    last.section === place.section &&
    last.editingId === place.editingId &&
    last.textureEditor === place.textureEditor &&
    last.workshopEditor?.elementId === place.workshopEditor?.elementId
  ) {
    return {}
  }
  const history = [...past, place].slice(-HISTORY_LIMIT)
  return { history, historyIndex: history.length - 1 }
}

function leaveEditor(state: AppState, section: SectionId): Partial<AppState> {
  const place: Place = { section, editingId: null, textureEditor: null, workshopEditor: null }
  const prev = state.history[state.historyIndex - 1]
  if (
    prev &&
    prev.section === section &&
    prev.editingId === null &&
    prev.textureEditor === null &&
    !prev.workshopEditor
  ) {
    return { ...place, historyIndex: state.historyIndex - 1 }
  }
  const history = [...state.history]
  history.splice(state.historyIndex, 0, place)

  if (history.length > HISTORY_LIMIT) {
    history.shift()
    return { ...place, history, historyIndex: Math.max(0, state.historyIndex - 1) }
  }
  return { ...place, history, historyIndex: state.historyIndex }
}

interface AppState {
  section: SectionId

  editingId: string | null
  inspectorOpen: boolean
  createMenuOpen: boolean
  textureEditor: TextureEditorState | null

  workshopEditor: { elementId: string } | null

  autoCapitalize: boolean

  testRunRequested: boolean

  history: Place[]
  historyIndex: number

  bundleTestMods: boolean

  reduceAnimations: boolean

  showCheckerGrid: boolean

  discordPresence: boolean

  startupNoticeOpen: boolean

  activeTour: string | null

  bootPhase: BootPhase

  savingMode: SavingMode

  pendingWork: PendingWork | null
  setPendingWork: (work: PendingWork | null) => void

  refusals: number
  refuse: () => void
  navigate: (section: SectionId) => void

  leaveEditorTo: (section: SectionId) => void
  openEditor: (id: string | null) => void
  toggleInspector: () => void
  openCreateMenu: () => void
  closeCreateMenu: () => void
  openTextureEditor: (state: TextureEditorState) => void
  closeTextureEditor: () => void
  openWorkshopEditor: (elementId: string) => void
  closeWorkshopEditor: () => void
  setAutoCapitalize: (v: boolean) => void
  setBundleTestMods: (v: boolean) => void
  setReduceAnimations: (v: boolean) => void
  setShowCheckerGrid: (v: boolean) => void
  setDiscordPresence: (v: boolean) => void
  setStartupNoticeOpen: (v: boolean) => void
  startTutorial: (tour: string) => void
  endTutorial: () => void

  showSection: (section: SectionId, editingId?: string | null) => void
  setBootPhase: (v: BootPhase) => void
  setSavingMode: (v: SavingMode) => void
  goBack: () => void
  goForward: () => void
  requestTestRun: () => void

  takeTestRunRequest: () => boolean
}

export const useAppStore = create<AppState>((set, get) => ({
  section: 'dashboard',
  editingId: null,
  history: [{ section: 'dashboard', editingId: null, textureEditor: null, workshopEditor: null }],
  historyIndex: 0,

  inspectorOpen: false,
  createMenuOpen: false,
  textureEditor: null,
  workshopEditor: null,

  autoCapitalize: true,
  testRunRequested: false,
  bundleTestMods: true,
  reduceAnimations: false,
  showCheckerGrid: true,
  discordPresence: true,
  startupNoticeOpen: true,
  activeTour: null,
  bootPhase: 'boot',

  savingMode: 'onChange',
  pendingWork: null,
  setPendingWork: (pendingWork) => set({ pendingWork }),
  refusals: 0,
  refuse: () => set((s) => ({ refusals: s.refusals + 1 })),
  navigate: (section) =>
    set((s) => {
      const place: Place = { section, editingId: null, textureEditor: null, workshopEditor: null }
      return { ...place, ...record(s, place) }
    }),
  leaveEditorTo: (section) => set((s) => leaveEditor(s, section)),
  openEditor: (editingId) =>
    set((s) => {
      const place: Place = { section: s.section, editingId, textureEditor: null, workshopEditor: null }
      return { ...place, ...record(s, place) }
    }),

  goBack: () =>
    set((s) =>
      s.historyIndex > 0
        ? { ...s.history[s.historyIndex - 1], historyIndex: s.historyIndex - 1 }
        : {}
    ),
  goForward: () =>
    set((s) =>
      s.historyIndex < s.history.length - 1
        ? { ...s.history[s.historyIndex + 1], historyIndex: s.historyIndex + 1 }
        : {}
    ),
  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
  openCreateMenu: () => set({ createMenuOpen: true }),
  closeCreateMenu: () => set({ createMenuOpen: false }),

  openTextureEditor: (textureEditor) =>
    set((s) => ({
      textureEditor,
      ...record(s, { section: s.section, editingId: s.editingId, textureEditor, workshopEditor: null })
    })),
  closeTextureEditor: () =>
    set((s) => ({
      textureEditor: null,
      ...record(s, { section: s.section, editingId: s.editingId, textureEditor: null, workshopEditor: null })
    })),
  openWorkshopEditor: (elementId) =>
    set((s) => {
      const workshopEditor = { elementId }
      return {
        workshopEditor,
        ...record(s, { section: s.section, editingId: s.editingId, textureEditor: null, workshopEditor })
      }
    }),
  closeWorkshopEditor: () =>
    set((s) => ({
      workshopEditor: null,
      ...record(s, { section: s.section, editingId: s.editingId, textureEditor: null, workshopEditor: null })
    })),
  setAutoCapitalize: (autoCapitalize) => set({ autoCapitalize }),
  setBundleTestMods: (bundleTestMods) => set({ bundleTestMods }),
  setReduceAnimations: (reduceAnimations) => set({ reduceAnimations }),
  setShowCheckerGrid: (showCheckerGrid) => set({ showCheckerGrid }),
  setDiscordPresence: (discordPresence) => set({ discordPresence }),
  setStartupNoticeOpen: (startupNoticeOpen) => set({ startupNoticeOpen }),

  startTutorial: (tour) => set((s) => (s.activeTour ? {} : { activeTour: tour })),
  endTutorial: () => set({ activeTour: null }),

  showSection: (section, editingId = null) =>
    set({ section, editingId, textureEditor: null, workshopEditor: null }),
  setBootPhase: (bootPhase) => set({ bootPhase }),
  setSavingMode: (savingMode) => set({ savingMode }),
  requestTestRun: () => set({ testRunRequested: true }),
  takeTestRunRequest: () => {
    if (!get().testRunRequested) return false
    set({ testRunRequested: false })
    return true
  }
}))

const PERSISTED = [
  'autoCapitalize',
  'bundleTestMods',
  'reduceAnimations',
  'showCheckerGrid',

  'inspectorOpen',
  'discordPresence',
  'savingMode'
] as const

type Persisted = Pick<AppState, (typeof PERSISTED)[number]>

function persistable(state: AppState): Persisted {
  return {
    autoCapitalize: state.autoCapitalize,
    bundleTestMods: state.bundleTestMods,
    reduceAnimations: state.reduceAnimations,
    showCheckerGrid: state.showCheckerGrid,
    inspectorOpen: state.inspectorOpen,
    discordPresence: state.discordPresence,
    savingMode: state.savingMode
  }
}

export async function loadPreferences(): Promise<void> {
  const saved: Record<string, unknown> = await window.artemis.prefs
    .load()
    .catch(() => ({}) as Record<string, unknown>)
  const patch: Partial<Persisted> = {}
  if (typeof saved.autoCapitalize === 'boolean') patch.autoCapitalize = saved.autoCapitalize
  if (typeof saved.bundleTestMods === 'boolean') patch.bundleTestMods = saved.bundleTestMods
  if (typeof saved.reduceAnimations === 'boolean') patch.reduceAnimations = saved.reduceAnimations
  if (typeof saved.showCheckerGrid === 'boolean') patch.showCheckerGrid = saved.showCheckerGrid
  if (typeof saved.inspectorOpen === 'boolean') patch.inspectorOpen = saved.inspectorOpen
  if (typeof saved.discordPresence === 'boolean') patch.discordPresence = saved.discordPresence
  if (saved.savingMode === 'manual' || saved.savingMode === 'periodic' || saved.savingMode === 'onChange') {
    patch.savingMode = saved.savingMode
  }
  if (Object.keys(patch).length) useAppStore.setState(patch)

  let last = JSON.stringify(persistable(useAppStore.getState()))
  useAppStore.subscribe((state) => {
    const next = JSON.stringify(persistable(state))
    if (next === last) return
    last = next
    window.artemis.prefs.save(JSON.parse(next))
  })
}
