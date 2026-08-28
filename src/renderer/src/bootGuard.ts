const MOUNT_DEADLINE_MS = 15_000

let mounted = false
let reported = false

function rootIsEmpty(): boolean {
  const root = document.getElementById('root')
  return !root || root.childElementCount === 0
}

function report(why: string, detail?: string): void {
  if (reported || mounted || !rootIsEmpty()) return
  reported = true

  console.error(`[boot-guard] ${why}${detail ? `\n${detail}` : ''}`)

  const root = document.getElementById('root') ?? document.body
  const panel = document.createElement('div')
  panel.setAttribute(
    'style',
    'margin:0;display:flex;align-items:center;justify-content:center;height:100vh;' +
      'background:#07090c;color:#e6e8eb;font:14px/1.6 system-ui,Segoe UI,sans-serif'
  )
  const inner = document.createElement('div')
  inner.setAttribute('style', 'max-width:34rem;padding:2rem')

  const title = document.createElement('h1')
  title.setAttribute('style', 'font-size:1.1rem;margin:0 0 .75rem')
  title.textContent = 'Artemis started but its interface did not'

  const line = document.createElement('p')
  line.setAttribute('style', 'margin:0 0 .75rem;opacity:.85')
  line.textContent = why

  inner.appendChild(title)
  inner.appendChild(line)

  if (detail) {

    const pre = document.createElement('pre')
    pre.setAttribute(
      'style',
      'margin:0 0 .75rem;padding:.75rem;max-height:12rem;overflow:auto;' +
        'background:#0d1117;border-radius:6px;font-size:12px;white-space:pre-wrap;opacity:.75'
    )
    pre.textContent = detail
    inner.appendChild(pre)
  }

  const help = document.createElement('p')
  help.setAttribute('style', 'margin:0;opacity:.6')
  help.textContent =
    'Reinstalling usually fixes this. If it does not, this message is the useful half of a bug report.'
  inner.appendChild(help)

  panel.appendChild(inner)
  root.appendChild(panel)
}

function describe(value: unknown): string {
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

window.addEventListener('error', (e: ErrorEvent) => {
  report(
    'Something failed while it was starting up.',
    describe(e.error) || `${e.message} (${e.filename}:${e.lineno})`
  )
})

window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
  report('Something failed while it was starting up.', describe(e.reason))
})

window.setTimeout(() => {
  report('It did not finish starting, and did not say why.')
}, MOUNT_DEADLINE_MS)

export function bootGuardMounted(): void {
  mounted = true
}
