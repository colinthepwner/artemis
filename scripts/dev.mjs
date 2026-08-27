import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const clean = process.argv.includes('--clean')

const child = spawn('npx', ['electron-vite', 'dev'], {
  cwd: root,
  stdio: 'inherit',

  shell: true,
  env: clean ? { ...process.env, ARTEMIS_SKIP_ONBOARDING: '1' } : process.env
})
child.on('exit', (code) => process.exit(code ?? 0))
