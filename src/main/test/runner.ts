import { app, ipcMain, shell, type WebContents } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { IPC, type TestState } from '../../shared/ipc'
import type { ArtemisProject } from '../../shared/project'
import { getMapping } from '../../shared/generator/mappings'
import { exportWorkspace } from '../export/exporter'
import {
  runGradle,
  killGradle,
  powershellPath,
  warnIfNoJava,
  DEFAULT_GRADLE_VERSION,
  type GradleRun
} from '../gradle'

let child: ChildProcess | null = null
let sender: WebContents | null = null

function workspaceDir(modId: string): string {
  return join(app.getPath('userData'), 'artemis-workspaces', modId)
}

function emitLog(line: string): void {
  if (sender && !sender.isDestroyed()) sender.send(IPC.TestLog, line)
}

function emitState(state: TestState): void {
  if (sender && !sender.isDestroyed()) sender.send(IPC.TestState, state)
}

export function killClientProcesses(dir: string, onLine: (line: string) => void = () => {}): ChildProcess {
  const watched = (child: ChildProcess): ChildProcess => {
    child.on('error', () => onLine('Could not reach the client process. Close the game window by hand.'))
    return child
  }

  if (process.platform === 'win32') {

    return watched(
      spawn(
        powershellPath(),
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',

          'Get-CimInstance Win32_Process |' +
            " Where-Object { ($_.Name -eq 'java.exe' -or $_.Name -eq 'javaw.exe')" +
            " -and $_.CommandLine -like ('*' + $env:ARTEMIS_WORKSPACE + '*') } |" +
            ' ForEach-Object { Stop-Process -Id $_.ProcessId -Force }'
        ],

        { env: { ...process.env, ARTEMIS_WORKSPACE: dir }, windowsHide: true }
      )
    )
  }

  const killer = watched(spawn('pkill', ['-f', dir]))
  killer.on('error', () => {
    watched(
      spawn('sh', [
        '-c',

        'ps ax -o pid=,command= | grep -F "$0" | grep -v grep | ' +
          "awk '{print $1}' | xargs -r kill",
        dir
      ])
    )
  })
  return killer
}

export function registerTestIpc(): void {
  ipcMain.handle(IPC.TestStart, async (
    e,
    projectJson: string,
    options?: { bundleTestMods?: boolean }
  ): Promise<{ ok: boolean; error?: string }> => {
    if (child) return { ok: false, error: 'A test session is already running. Stop it first.' }
    sender = e.sender

    let project: ArtemisProject
    try {
      project = JSON.parse(projectJson) as ArtemisProject
    } catch {
      return { ok: false, error: 'Could not read project.' }
    }

    const dir = workspaceDir(project.meta.modId)

    emitState({ running: true, phase: 'exporting' })
    emitLog(`Preparing test workspace: ${dir}`)
    try {
      const exportLog: string[] = []

      await exportWorkspace(project, dir, exportLog, {
        devMods: options?.bundleTestMods !== false
      })
      exportLog.forEach(emitLog)
    } catch (err) {
      emitLog(`Export failed: ${err instanceof Error ? err.message : String(err)}`)
      emitState({ running: false, phase: 'error', message: 'Export failed' })
      sender = null
      return { ok: false, error: 'Export failed. See the log.' }
    }

    emitLog('')
    emitLog('Launching BTA via Gradle: runClient')
    emitLog('First run downloads Minecraft + dependencies and can take several minutes…')
    emitLog('─'.repeat(60))
    emitState({ running: true, phase: 'building' })

    let sawBuildRunning = false
    let gradleVersion = DEFAULT_GRADLE_VERSION
    try {
      gradleVersion = getMapping(project.meta.targetBta).gradle.gradleVersion
    } catch {

    }

    let run: GradleRun
    try {

      warnIfNoJava(emitLog)

      run = await runGradle(
        dir,
        'runClient --stacktrace',
        (line) => {
          emitLog(line)

          if (!sawBuildRunning && /(Backend library|LWJGL|Setting user|Started up in|Loaded .* mods)/i.test(line)) {
            sawBuildRunning = true
            emitState({ running: true, phase: 'running' })
          }
        },
        gradleVersion
      )
    } catch (err) {
      emitLog(`✗ Could not set up Gradle: ${err instanceof Error ? err.message : String(err)}`)
      emitState({ running: false, phase: 'error', message: 'Gradle setup failed' })
      sender = null
      return { ok: false, error: 'Gradle setup failed. See the log.' }
    }
    child = run.child

    void run.done.then(({ code, signal }) => {
      emitLog('─'.repeat(60))
      if (signal) emitLog(`Test session stopped (${signal}).`)
      else if (code == null) emitLog('Gradle failed to start.')
      else emitLog(`Game/Gradle exited with code ${code}.`)
      emitState({
        running: false,
        phase: signal ? 'stopped' : code === 0 ? 'stopped' : 'error',
        exitCode: code
      })
      child = null
      sender = null
    })

    return { ok: true }
  })

  ipcMain.on(IPC.TestStop, () => {
    if (!child) return
    emitLog('Stopping test session…')
    killGradle(child)
  })

  ipcMain.on(IPC.TestKill, (_e, modId: string) => {
    if (child) killGradle(child)
    const dir = workspaceDir(modId)
    emitLog('Killing the client…')

    try {
      killClientProcesses(dir, emitLog)
    } catch {
      emitLog('Could not reach the client process. Close the game window by hand.')
    }
  })

  ipcMain.on(IPC.TestOpenWorkspace, (_e, modId: string) => {
    const dir = workspaceDir(modId)
    if (existsSync(dir)) shell.openPath(dir)
  })
}
