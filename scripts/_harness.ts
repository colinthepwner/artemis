import { readdirSync, statSync } from 'fs'
import { spawnSync, type ChildProcess } from 'child_process'
import { join } from 'path'
import { toConstantCase, type ArtemisProject } from '../src/shared/project'
import { kitFamily } from '../src/shared/generator/family'
import { CodeGenerator } from '../src/shared/generator/CodeGenerator'

export interface Harness {

  check(name: string, ok: boolean, detail?: string): void

  readonly passes: number
  readonly failures: number
}

export function harness(): Harness {
  let passes = 0
  let failures = 0
  return {
    check(name: string, ok: boolean, detail?: string): void {
      if (ok) passes++
      else {
        failures++
        console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`)
      }
    },
    get passes() {
      return passes
    },
    get failures() {
      return failures
    }
  }
}

export function generated(project: ArtemisProject): string {
  return new CodeGenerator(project)
    .generate()
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => `>>> ${f.path}\n${f.content}`)
    .join('\n')
}

export function walkFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory()
      ? walkFiles(p, `${prefix}${name}/`)
      : [`${prefix}${name}`]
  })
}

export function kitPieceNames(project: ArtemisProject): string[] {
  return project.elements.flatMap((el) => {
    const family = kitFamily(el)
    return [...(family?.tools ?? []), ...(family?.armor ?? [])].map(toConstantCase)
  })
}

export interface TreeKill {

  stop(reason: string): void

  readonly reason: string | null
}

export function treeKiller(child: ChildProcess): TreeKill {
  let reason: string | null = null
  return {
    stop(why: string): void {
      if (reason !== null) return
      reason = why
      setTimeout(() => {
        try {
          spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
        } catch {
          child.kill('SIGKILL')
        }
      }, 2000)
    },
    get reason() {
      return reason
    }
  }
}

export interface GameRun {
  out: string

  ending: string

  endedItself: boolean
}

const DAEMON_VANISHED = /daemon (?:has )?disappeared/i

export function endingLine(
  killer: TreeKill,
  code: number | null,
  signal: string | null,
  seconds: number,
  out: string
): string {
  const who =
    killer.reason !== null
      ? `this runner stopped it: ${killer.reason}`
      : DAEMON_VANISHED.test(out)
        ? 'the gradle daemon disappeared and took the forked game with it, so this is'
          + ' the build tool going away and not the mod'
        : 'it ended on its own, nothing here killed it'
  return `the game ended after ${seconds}s, exit ${code ?? 'none'}${signal ? `, signal ${signal}` : ''} :: ${who}`
}

export function onGameClose(
  child: ChildProcess,
  killer: TreeKill,
  timer: ReturnType<typeof setTimeout>,
  startedAt: number,
  read: () => string,
  done: (run: GameRun) => void
): void {
  child.on('close', (code, signal) => {
    clearTimeout(timer)

    const out = read()
    done({
      out,
      ending: endingLine(killer, code, signal, Math.round((Date.now() - startedAt) / 1000), out),
      endedItself: killer.reason === null
    })
  })
}

export function tailLines(out: string, n = 40): string {
  const lines = out
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter(
      (l) =>
        l.trim().length > 0 &&
        !l.includes('ARTEMIS-PROBE') &&
        !l.includes('ARTEMIS-WORLDGEN') &&
        !l.includes('ARTEMIS-CLIENT') &&
        !/^\s*>\s/.test(l) &&
        !/^<[-=]+>\s+\d+% /.test(l)
    )
  const shape = (l: string): string => l.replace(/\d+/g, '#')
  const runs: { shape: string; last: string; count: number }[] = []
  for (const line of lines) {
    const previous = runs[runs.length - 1]
    if (previous !== undefined && previous.shape === shape(line)) {
      previous.last = line
      previous.count++
    } else runs.push({ shape: shape(line), last: line, count: 1 })
  }
  return runs
    .map((r) => (r.count === 1 ? r.last : `${r.last}   (and the ${r.count - 1} before it like it)`))
    .slice(-n)
    .join('\n')
}

export function dropAbsentDependencies(modJson: {
  depends?: Record<string, unknown>
}): string[] {
  if (!modJson.depends) return []

  const provided = ['fabricloader', 'fabric-loader', 'minecraft', 'java', 'halplibe']
  const absent = Object.keys(modJson.depends).filter((id) => !provided.includes(id))
  for (const id of absent) delete modJson.depends[id]
  return absent
}
