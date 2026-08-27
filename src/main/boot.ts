import { ipcMain, screen, type BrowserWindow } from 'electron'
import { readFileSync } from 'fs'
import { IPC, type BootPhase } from '../shared/ipc'
import { prefsFile } from './ipc/project'
import type { WindowState } from './windowState'

export const BOOT_WIDTH = 520
export const BOOT_HEIGHT = 292

const MIN_SPLASH_MS = 1100
const EXPAND_MS = 460

let phase: BootPhase = 'boot'

export function registerBootIpc(): void {
  ipcMain.handle(IPC.BootGetPhase, (): BootPhase => phase)
}

function setPhase(win: BrowserWindow, next: BootPhase): void {
  phase = next
  if (!win.isDestroyed()) win.webContents.send(IPC.BootPhase, next)
}

function reduceMotion(): boolean {
  try {
    const prefs = JSON.parse(readFileSync(prefsFile(), 'utf-8')) as Record<string, unknown>
    return prefs['reduceAnimations'] === true
  } catch {
    return false
  }
}

const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3)

function animateBounds(
  win: BrowserWindow,
  to: { x: number; y: number; width: number; height: number },
  duration: number
): Promise<void> {
  const from = win.getBounds()
  const start = Date.now()
  const lerp = (a: number, b: number, k: number): number => a + (b - a) * k
  let last = ''
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (win.isDestroyed()) {
        clearInterval(timer)
        resolve()
        return
      }
      const t = Math.min(1, (Date.now() - start) / duration)
      const k = easeOut(t)
      const x = Math.round(lerp(from.x, to.x, k))
      const y = Math.round(lerp(from.y, to.y, k))
      const right = Math.round(lerp(from.x + from.width, to.x + to.width, k))
      const bottom = Math.round(lerp(from.y + from.height, to.y + to.height, k))

      const key = `${x},${y},${right},${bottom}`
      if (key !== last) {
        last = key
        win.setBounds({ x, y, width: right - x, height: bottom - y })
      }
      if (t >= 1) {
        clearInterval(timer)
        resolve()
      }
    }, 8)
  })
}

function targetBounds(win: BrowserWindow, saved: WindowState): {
  x: number
  y: number
  width: number
  height: number
} {
  if (saved.x !== undefined && saved.y !== undefined) {
    return { x: saved.x, y: saved.y, width: saved.width, height: saved.height }
  }
  const here = win.getBounds()
  const area = screen.getDisplayNearestPoint({
    x: here.x + Math.round(here.width / 2),
    y: here.y + Math.round(here.height / 2)
  }).workArea
  return {
    x: area.x + Math.round((area.width - saved.width) / 2),
    y: area.y + Math.round((area.height - saved.height) / 2),
    width: saved.width,
    height: saved.height
  }
}

export async function runBootSequence(
  win: BrowserWindow,
  saved: WindowState,
  minSize: { width: number; height: number },
  check: Promise<boolean>
): Promise<void> {
  let restarting = false
  try {
    const [willRestart] = await Promise.all([
      check,
      new Promise<false>((r) => setTimeout(() => r(false), MIN_SPLASH_MS))
    ])
    restarting = willRestart === true
  } catch (err) {

    console.error('[boot] update check failed:', err)
  }
  if (win.isDestroyed() || restarting) return

  try {
    setPhase(win, 'expanding')
    win.setResizable(true)

    await new Promise((r) => setTimeout(r, 170))
    const to = targetBounds(win, saved)
    if (reduceMotion()) win.setBounds(to)
    else await animateBounds(win, to, EXPAND_MS)
  } catch (err) {
    console.error('[boot] expansion failed:', err)
    if (!win.isDestroyed()) {
      try {
        win.setBounds(targetBounds(win, saved))
      } catch {

      }
    }
  }

  if (win.isDestroyed()) return

  win.setMinimumSize(minSize.width, minSize.height)
  if (saved.maximized) win.maximize()
  setPhase(win, 'ready')
}
