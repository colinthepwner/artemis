import { create } from 'zustand'
import type { ElementKind } from '@shared/project'

export type SectionId =
  | 'dashboard'
  | 'gallery'
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

interface AppState {
  section: SectionId

  editingId: string | null
  inspectorOpen: boolean
  createMenuOpen: boolean
  textureEditor: TextureEditorState | null
  navigate: (section: SectionId) => void
  openEditor: (id: string | null) => void
  toggleInspector: () => void
  openCreateMenu: () => void
  closeCreateMenu: () => void
  openTextureEditor: (state: TextureEditorState) => void
  closeTextureEditor: () => void
}

export const useAppStore = create<AppState>((set) => ({
  section: 'dashboard',
  editingId: null,

  inspectorOpen: false,
  createMenuOpen: false,
  textureEditor: null,
  navigate: (section) => set({ section, editingId: null }),
  openEditor: (editingId) => set({ editingId }),
  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
  openCreateMenu: () => set({ createMenuOpen: true }),
  closeCreateMenu: () => set({ createMenuOpen: false }),
  openTextureEditor: (textureEditor) => set({ textureEditor }),
  closeTextureEditor: () => set({ textureEditor: null })
}))
