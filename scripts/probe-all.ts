import { spawn } from 'child_process'
import { SCENARIOS } from './audit-fixtures'
import { harness } from './_harness'

const audit = harness()
const check = audit.check

interface Probe {

  key: 'ingame' | 'client'
  script: string

  verdict: string

  summaries: [string, RegExp][]
}

const PROBES: Probe[] = [
  {
    key: 'ingame',
    script: 'scripts/ingame-probe.ts',
    verdict: 'INGAME PASS',
    summaries: [
      ['probe', /ARTEMIS-PROBE SUMMARY (\d+) (\d+)/],
      ['worldgen', /ARTEMIS-WORLDGEN SUMMARY (\d+) (\d+)/]
    ]
  },
  {
    key: 'client',
    script: 'scripts/client-probe.ts',
    verdict: 'CLIENT PASS',
    summaries: [['client', /ARTEMIS-CLIENT SUMMARY (\d+) (\d+)/]]
  }
]

interface Result {
  scenario: string
  probe: Probe['key']

  round: number
  code: number | null
  verdict: boolean

  counts: [string, number, number][]
  seconds: number
}

function runOne(probe: Probe, scenario: string, round: number): Promise<Result> {
  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn(process.execPath, ['scripts/run.mjs', probe.script, scenario], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let out = ''
    const onData = (buf: Buffer): void => {
      const text = buf.toString()
      out += text
      for (const line of text.split('\n')) {
        if (line.trim()) process.stdout.write(`    | ${line.trimEnd()}\n`)
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('close', (code) => {
      const counts: [string, number, number][] = []
      for (const [label, pattern] of probe.summaries) {
        const m = out.match(pattern)
        if (m) counts.push([label, Number(m[1]), Number(m[2])])
      }
      resolve({
        scenario,
        probe: probe.key,
        round,
        code,
        verdict: out.includes(probe.verdict),
        counts,
        seconds: Math.round((Date.now() - started) / 1000)
      })
    })
  })
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const wantIngame = !args.includes('--client')
  const wantClient = !args.includes('--ingame')
  const probes = PROBES.filter((p) =>
    p.key === 'ingame' ? wantIngame : wantClient
  )

  const all = SCENARIOS.map((s) => s.name)
  let names = all
  const onlyAt = args.indexOf('--only')
  if (onlyAt !== -1) {

    const rest = args.slice(onlyAt + 1)
    const nextFlag = rest.findIndex((a) => a.startsWith('--'))
    names = nextFlag === -1 ? rest : rest.slice(0, nextFlag)
  }

  let repeat = 1
  const repeatAt = args.indexOf('--repeat')
  if (repeatAt !== -1) {
    repeat = Number(args[repeatAt + 1])
    if (!Number.isInteger(repeat) || repeat < 1) {
      console.log(`--repeat wants a whole number of runs, not "${args[repeatAt + 1] ?? ''}"`)
      process.exit(2)
      return
    }
  }

  const fromAt = args.indexOf('--from')
  if (fromAt !== -1) {
    const start = all.indexOf(args[fromAt + 1])
    names = start === -1 ? [] : all.slice(start)
  }

  const unknown = names.filter((n) => !all.includes(n))
  if (unknown.length > 0) {
    console.log(`No scenario named ${unknown.map((n) => `"${n}"`).join(', ')}. Known scenarios:`)
    for (const n of all) console.log(`  ${n}`)
    process.exit(2)
    return
  }
  if (names.length === 0 || probes.length === 0) {
    console.log('nothing selected to run')
    process.exit(2)
    return
  }

  console.log(
    `${names.length} of ${all.length} fixtures, ${probes.map((p) => p.key).join(' and ')}, ` +
      `${repeat > 1 ? `${repeat} times each, ` : ''}` +
      `${names.length * probes.length * repeat} game boots\n`
  )

  const results: Result[] = []

  for (let round = 1; round <= repeat; round++) {
    if (repeat > 1) console.log(`=== run ${round} of ${repeat} ===\n`)
    for (const name of names) {
      for (const probe of probes) {
        console.log(`--- ${probe.key}: ${name} ---`)
        const result = await runOne(probe, name, round)
        results.push(result)
        const counts = result.counts.map(([l, p, f]) => `${l} ${p}/${f}`).join(', ')
        console.log(
          `  ${result.verdict && result.code === 0 ? 'PASS' : 'FAIL'} ${probe.key}: ${name} ` +
            `(${result.seconds}s${counts ? `, ${counts}` : ''})\n`
        )
      }
    }
  }

  console.log('\n--- what ran ---')
  for (const r of results) {
    const counts = r.counts.map(([l, p, f]) => `${l} ${p} passed ${f} failed`).join(', ')
    console.log(
      `  ${r.verdict && r.code === 0 ? 'PASS' : 'FAIL'} ${r.probe.padEnd(7)} ${r.scenario.padEnd(34)} ` +
        `${repeat > 1 ? `run ${String(r.round).padStart(2)}  ` : ''}` +
        `${r.seconds}s  ${counts || 'no summary printed'}`
    )
  }
  console.log('')

  const where = (r: Result): string =>
    `${r.probe}: ${r.scenario}${repeat > 1 ? ` (run ${r.round})` : ''}`
  for (const r of results) {
    check(
      where(r),
      r.code === 0 && r.verdict,
      `exit ${r.code}, ${r.verdict ? 'printed its verdict' : 'never printed its verdict'}`
    )
  }

  for (const r of results) {
    const wanted = PROBES.find((p) => p.key === r.probe)!.summaries.length
    check(
      `${where(r)} printed every game-side summary`,
      r.counts.length === wanted,
      `${r.counts.length} of ${wanted} summaries, so a phase ran and said nothing`
    )
    for (const [label, passed, failed] of r.counts) {
      check(
        `${where(r)} had nothing fail in the game (${label})`,
        failed === 0,
        `${passed} passed, ${failed} failed`
      )
    }
  }

  for (const probe of probes) {
    for (const [label] of probe.summaries) {
      const total = results
        .filter((r) => r.probe === probe.key)
        .flatMap((r) => r.counts.filter(([l]) => l === label))
        .reduce((n, [, passed]) => n + passed, 0)
      check(
        `${probe.key}: something was asserted in a game at all (${label})`,
        total > 0,
        `${total} assertions across ${names.length} fixtures`
      )
    }
  }

  const green = (name: string): boolean =>
    results.filter((r) => r.scenario === name).every((r) => r.code === 0 && r.verdict)
  const covered = new Set(names.filter(green))
  const attempted = new Set(results.map((r) => r.scenario))
  check(
    'every fixture selected was attempted',
    names.every((n) => attempted.has(n)),
    names.filter((n) => !attempted.has(n)).join(', ')
  )
  check(
    'and every fixture attempted came back green',
    names.every((n) => covered.has(n)),
    names.filter((n) => !covered.has(n)).join(', ')
  )

  if (names.length === all.length) {
    check(
      `all ${all.length} fixtures have now been through ${probes.map((p) => p.key).join(' and ')}`,
      covered.size === all.length,
      `${covered.size} of ${all.length}`
    )
  } else {
    console.log(
      `NOT a whole sweep: ${names.length} of ${all.length} fixtures. ` +
        'Nothing here says anything about the ones that were not selected.'
    )
  }

  console.log(`\n${audit.passes} checks passed, ${audit.failures} failed`)
  if (audit.failures > 0) {
    console.log('PROBE-ALL FAIL')
    process.exit(1)
  }
  console.log('PROBE-ALL PASS')
}

void main()
