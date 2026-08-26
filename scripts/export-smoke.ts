import { tmpdir } from 'os'
import { join } from 'path'
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { exportWorkspace } from '../src/main/export/exporter'
import { createEmptyProject } from '../src/shared/project'
import { ORE_DEFAULTS, BLOCK_DEFAULTS } from '../src/shared/generator/props'

const PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC'

const project = createEmptyProject('Test Mod', 'testmod')
project.meta.authors = ['Colin']
project.textures = [{ id: 't1', name: 'ruby', data: PX, createdAt: 'x', updatedAt: 'x' }]
const now = 'x'
project.elements.push({
  id: 'e1', kind: 'block', name: 'marble',
  properties: { ...BLOCK_DEFAULTS, displayName: 'Marble' }, createdAt: now, updatedAt: now
})
project.elements.push({
  id: 'e2', kind: 'ore', name: 'ruby_ore',
  properties: { ...ORE_DEFAULTS, displayName: 'Ruby Ore', generateSet: true, set: { ...ORE_DEFAULTS.set } },
  createdAt: now, updatedAt: now
})

project.textureAssignments['block/ruby_ore'] = 't1'

const root = join(tmpdir(), `artemis-export-test-${Date.now()}`)

const walk = (dir: string, pre = ''): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p, `${pre}${f}/`) : [`${pre}${f}`]
  })

async function main(): Promise<void> {
  const log: string[] = []
  await exportWorkspace(project, root, log)
  console.log('=== LOG ===')
  console.log(log.join('\n'))
  console.log('\n=== FILE TREE ===')
  console.log(walk(root).sort().join('\n'))

  console.log('\n=== build.gradle (head) ===')
  console.log(readFileSync(join(root, 'build.gradle'), 'utf-8').split('\n').slice(0, 6).join('\n'))
  console.log('...\n=== obfuscateJar task present:', readFileSync(join(root, 'build.gradle'), 'utf-8').includes('ProGuardTask'))

  console.log('\n=== proguard-rules.pro (first 30 lines) ===')
  console.log(readFileSync(join(root, 'proguard-rules.pro'), 'utf-8').split('\n').slice(0, 30).join('\n'))

  const png = join(root, 'src/main/resources/assets/testmod/textures/block/ruby_ore.png')
  console.log('\n=== painted PNG written:', existsSync(png), existsSync(png) ? `(${statSync(png).size} bytes)` : '')
  console.log('=== credits tail ===')
  console.log(readFileSync(join(root, 'CREDITS.txt'), 'utf-8'))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
