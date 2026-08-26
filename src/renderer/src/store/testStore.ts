import { create } from 'zustand'
import type { TestPhase, TestState } from '@shared/ipc'

interface TestStore {
  phase: TestPhase
  running: boolean
  exitCode: number | null
  lines: string[]
  appendLine: (line: string) => void
  setState: (state: TestState) => void
  clear: () => void
}

const MAX_LINES = 4000

export const useTestStore = create<TestStore>((set) => ({
  phase: 'idle',
  running: false,
  exitCode: null,
  lines: [],
  appendLine: (line) =>
    set((s) => {
      const lines = s.lines.length >= MAX_LINES ? [...s.lines.slice(-MAX_LINES + 1), line] : [...s.lines, line]
      return { lines }
    }),
  setState: (state) => set({ phase: state.phase, running: state.running, exitCode: state.exitCode ?? null }),
  clear: () => set({ lines: [], exitCode: null, phase: 'idle' })
}))
