import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

const STEPS = [
  ['typecheck', 'npm', ['run', '--silent', 'typecheck']],

  ['assertions', process.execPath, ['scripts/run.mjs', 'scripts/audit-assertions.ts']],

  ['platform', process.execPath, ['scripts/run.mjs', 'scripts/audit-platform.ts']],

  ['temp', process.execPath, ['scripts/run.mjs', 'scripts/temp-smoke.ts']],
  ['controls', process.execPath, ['scripts/run.mjs', 'scripts/audit-controls.ts']],
  ['forms', process.execPath, ['scripts/run.mjs', 'scripts/audit-forms.ts']],
  ['editors', process.execPath, ['scripts/run.mjs', 'scripts/audit-editors.ts']],
  ['declarations', process.execPath, ['scripts/run.mjs', 'scripts/audit-declarations.ts']],
  ['integrity', process.execPath, ['scripts/run.mjs', 'scripts/audit-integrity.ts']],
  ['ipc', process.execPath, ['scripts/run.mjs', 'scripts/audit-ipc.ts']],
  ['misc', process.execPath, ['scripts/run.mjs', 'scripts/audit-misc.ts']],
  ['icon', process.execPath, ['scripts/run.mjs', 'scripts/audit-icon.ts']],
  ['textures', process.execPath, ['scripts/run.mjs', 'scripts/audit-textures.ts']],

  ['vanilla art', process.execPath, ['scripts/run.mjs', 'scripts/audit-vanilla-art.ts']],
  ['workshop', process.execPath, ['scripts/run.mjs', 'scripts/audit-workshop.ts']],
  ['updater', process.execPath, ['scripts/run.mjs', 'scripts/audit-updater.ts']],
  ['gradle', process.execPath, ['scripts/run.mjs', 'scripts/audit-gradle.ts']],
  ['migrate', process.execPath, ['scripts/run.mjs', 'scripts/migrate-smoke.ts']],

  ['groups', process.execPath, ['scripts/run.mjs', 'scripts/groups-smoke.ts']],

  ['schematic', process.execPath, ['scripts/run.mjs', 'scripts/schematic-smoke.ts']],
  ['templates', process.execPath, ['scripts/run.mjs', 'scripts/templates-smoke.ts']],
  ['export', process.execPath, ['scripts/run.mjs', 'scripts/audit-export.ts']],

  ['manifest', process.execPath, ['scripts/run.mjs', 'scripts/audit-manifest.ts']]
]

let failed = null
for (const [name, cmd, args] of STEPS) {
  process.stdout.write(`\n--- ${name} ---\n`)
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: root, shell: cmd === 'npm' })
  if (r.status !== 0) {
    failed = name
    break
  }
}

if (failed) {
  console.log(`\nAUDIT FAILED at "${failed}"`)
  process.exit(1)
}
console.log('\nAUDIT PASS')
console.log('Not covered here, and still the only real proof of a generator change:')
console.log('  node scripts/run.mjs scripts/export-smoke.ts')
console.log('  then gradle build, and gradle runServer, in the printed workspace')
console.log('and the same run with assertions inside the game, which is the strongest evidence there is:')
console.log('  node scripts/run.mjs scripts/ingame-probe.ts')

console.log('and in a client, which is the only thing that sees textures, models and mob skins:')
console.log('  node scripts/run.mjs scripts/client-probe.ts')
console.log('and every fixture through both, which takes about an hour and is the overnight one:')
console.log('  node scripts/run.mjs scripts/probe-all.ts')
