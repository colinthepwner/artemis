import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const [, , entry, ...rest] = process.argv
if (!entry) {
  console.error('usage: node scripts/run.mjs <script.ts> [args...]')
  process.exit(2)
}

const outdir = mkdtempSync(join(tmpdir(), 'artemis-run-'))
const outfile = join(outdir, basename(entry).replace(/\.tsx?$/, '') + '.cjs')

await build({
  entryPoints: [resolve(root, entry)],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile,
  sourcemap: 'inline',

  jsx: 'automatic',
  loader: { '.json': 'json', '.png': 'dataurl', '.css': 'empty' },

  define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
  alias: {

    electron: resolve(root, 'scripts/_electron-stub.cjs'),

    '@shared': resolve(root, 'src/shared'),
    '@': resolve(root, 'src/renderer/src'),

    'framer-motion': resolve(root, 'scripts/_ui-stubs/framer-motion.cjs'),
    '@radix-ui/react-switch': resolve(root, 'scripts/_ui-stubs/radix-switch.cjs'),
    '@radix-ui/react-slider': resolve(root, 'scripts/_ui-stubs/radix-slider.cjs'),
    '@radix-ui/react-dropdown-menu': resolve(root, 'scripts/_ui-stubs/radix-menu.cjs'),
    '@radix-ui/react-context-menu': resolve(root, 'scripts/_ui-stubs/radix-menu.cjs')
  },
  logLevel: 'warning'
})

const r = spawnSync(process.execPath, ['--enable-source-maps', outfile, ...rest], {
  stdio: 'inherit',
  cwd: root
})

try {
  rmSync(outdir, { recursive: true, force: true })
} catch {

}
process.exit(r.status ?? 1)
