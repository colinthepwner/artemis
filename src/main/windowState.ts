import { screen, type BrowserWindow } from 'electron'
import { writeFileSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
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

const EDGE_MARGIN = 24

function fittedToScreen(
  width: number,
  height: number,
  room: { width: number; height: number },
  defaults: WindowDefaults
): { width: number; height: number } {
  const roomW = room.width ? room.width - EDGE_MARGIN : Infinity
  const roomH = room.height ? room.height - EDGE_MARGIN : Infinity
  return {
    width: Math.max(defaults.minWidth, Math.min(width, roomW)),
    height: Math.max(defaults.minHeight, Math.min(height, roomH))
  }
}

export async function loadWindowState(defaults: WindowDefaults): Promise<WindowState> {

  const room = screen.getPrimaryDisplay().workArea
  const fitted = fittedToScreen(defaults.width, defaults.height, room, defaults)
  const fresh: WindowState = { width: fitted.width, height: fitted.height, maximized: false }
  if (isDev()) return fresh

  let saved: Partial<WindowState>
  try {
    saved = JSON.parse(await readFile(stateFile(), 'utf-8')) as Partial<WindowState>
  } catch {

    return fresh
  }

  if (!isFinitePair(saved.width, saved.height)) return fresh

  const { width, height } = fittedToScreen(
    saved.width as number,
    saved.height as number,
    largestWorkArea(),
    defaults
  )

  const state: WindowState = { width, height, maximized: saved.maximized === true }
  if (isFinitePair(saved.x, saved.y) && reachableOn(saved.x as number, saved.y as number, width, height)) {
    state.x = Math.round(saved.x as number)
    state.y = Math.round(saved.y as number)
  }
  return state
}

function snapshot(win: BrowserWindow): WindowState | null {
  if (win.isDestroyed() || win.isMinimized()) return null
  const bounds = win.getNormalBounds()
  return {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    maximized: win.isMaximized()
  }
}

export function flushWindowState(win: BrowserWindow): void {
  if (isDev()) return
  const state = snapshot(win)
  if (!state) return
  try {
    writeFileSync(stateFile(), JSON.stringify(state, null, 2), 'utf-8')
  } catch {

  }
}

export function rememberWindowState(win: BrowserWindow): void {
  if (isDev()) return

  let timer: NodeJS.Timeout | null = null

  const write = (): void => {
    const state = snapshot(win)
    if (!state) return
    void writeFile(stateFile(), JSON.stringify(state, null, 2), 'utf-8').catch(() => {

    })
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
    flushWindowState(win)
  })
}
