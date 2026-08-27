import { screen, type BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { projectsRoot } from './ipc/project'

export interface WindowState {
  width: number
  height: number

  x?: number
  y?: number
  maximized: boolean
}

export interface WindowDefaults {
  width: number
  height: number
  minWidth: number
  minHeight: number
}

const SETTLE_MS = 400

const stateFile = (): string => join(projectsRoot(), 'window.json')

const isDev = (): boolean => !!process.env['ELECTRON_RENDERER_URL']

function reachableOn(x: number, y: number, width: number, height: number): boolean {
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea
    const acrossX = Math.min(x + width, area.x + area.width) - Math.max(x, area.x)
    const acrossY = Math.min(y + height, area.y + area.height) - Math.max(y, area.y)

    return acrossX >= 120 && acrossY >= 48
  })
}

const isFinitePair = (a: unknown, b: unknown): boolean =>
  typeof a === 'number' && Number.isFinite(a) && typeof b === 'number' && Number.isFinite(b)

function largestWorkArea(): { width: number; height: number } {
  return screen.getAllDisplays().reduce(
    (biggest, d) => {
      const area = d.workArea
      return area.width * area.height > biggest.width * biggest.height
        ? { width: area.width, height: area.height }
        : biggest
    },
    { width: 0, height: 0 }
  )
}

export function loadWindowState(defaults: WindowDefaults): WindowState {
  const fresh: WindowState = { width: defaults.width, height: defaults.height, maximized: false }
  if (isDev()) return fresh

  let saved: Partial<WindowState>
  try {
    saved = JSON.parse(readFileSync(stateFile(), 'utf-8')) as Partial<WindowState>
  } catch {

    return fresh
  }

  if (!isFinitePair(saved.width, saved.height)) return fresh

  const room = largestWorkArea()
  const width = Math.max(defaults.minWidth, Math.min(saved.width as number, room.width || Infinity))
  const height = Math.max(
    defaults.minHeight,
    Math.min(saved.height as number, room.height || Infinity)
  )

  const state: WindowState = { width, height, maximized: saved.maximized === true }
  if (isFinitePair(saved.x, saved.y) && reachableOn(saved.x as number, saved.y as number, width, height)) {
    state.x = Math.round(saved.x as number)
    state.y = Math.round(saved.y as number)
  }
  return state
}

export function rememberWindowState(win: BrowserWindow): void {
  if (isDev()) return

  let timer: NodeJS.Timeout | null = null

  const write = (): void => {
    if (win.isDestroyed()) return

    if (win.isMinimized()) return
    const bounds = win.getNormalBounds()
    const state: WindowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      maximized: win.isMaximized()
    }
    try {
      writeFileSync(stateFile(), JSON.stringify(state, null, 2), 'utf-8')
    } catch {

    }
  }

  const settle = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(write, SETTLE_MS)
  }

  win.on('resize', settle)
  win.on('move', settle)
  win.on('maximize', settle)
  win.on('unmaximize', settle)

  win.on('close', () => {
    if (timer) clearTimeout(timer)
    write()
  })
}
