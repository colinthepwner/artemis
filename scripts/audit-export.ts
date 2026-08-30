import {
  mkdirSync,
  readFileSync,
  existsSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { exportWorkspace } from '../src/main/export/exporter'
import {
  createEmptyProject,
  toConstantCase,
  type ArtemisProject,
  type ElementKind
} from '../src/shared/project'
import { KIND_DEFAULTS } from '../src/shared/generator/props'
import { textureSlotsFor } from '../src/shared/generator/textures'
import { ICON_SIZE } from '../src/shared/iconPick'
import { SCENARIOS } from './audit-fixtures'
import { png16DataUrl, pngDataUrl, decodeDataUrl, decodePng } from './_canvas'
import { collectTextureIds } from './_texture-ids'
import { tempDir, sweepTempDirs } from './_temp'
import { getMapping, LATEST_BTA } from '../src/shared/generator/mappings'
import { harness } from './_harness'
import { walkFiles } from './_harness'

const PX = png16DataUrl()

const SKIN = pngDataUrl(64, 32)

const audit = harness()
const check = audit.check

const skip = (name: string, why: string): void => console.log(`  SKIP ${name}: ${why}`)

async function halplibeResolves(root: string): Promise<void> {
  const props = readFileSync(join(root, 'gradle.properties'), 'utf8')
  const version = /^halplibe_version=(.+)$/m.exec(props)?.[1]?.trim()
  if (!version) {
    check('the export names a halplibe version', false, 'no halplibe_version in gradle.properties')
    return
  }
  const g = getMapping(LATEST_BTA).gradle
  const path = `${g.halplibe.mavenGroup.replace(/\./g, '/')}/${g.halplibe.artifact}/maven-metadata.xml`
  for (const repo of g.repositories) {
    let xml: string
    try {
      const res = await fetch(`${repo.replace(/\/+$/, '')}/${path}`, {
        headers: { 'User-Agent': 'artemis-audit' }
      })
      if (!res.ok) continue
      xml = await res.text()
    } catch {
      continue
    }
    const published = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1].trim())
    if (published.length === 0) continue
    check(
      `halplibe ${version} is published and gradle can resolve it`,
      published.includes(version),
      `${repo} lists ${published.length} versions, newest ${published[published.length - 1]}, and ${version} is not among them`
    )
    return
  }
  skip('halplibe resolves', 'no maven answered, so nothing could be verified')
}

function paint(project: ArtemisProject): void {
  project.textures = [
    { id: 'flat', name: 'checker', data: PX, createdAt: '2026-08-27', updatedAt: '2026-08-27' },

    {
      id: 'glow',
      name: 'glowing',
      data: PX,
      emissive: PX,
      createdAt: '2026-08-27',
      updatedAt: '2026-08-27'
    },
    { id: 'skin', name: 'skin', data: SKIN, createdAt: '2026-08-27', updatedAt: '2026-08-27' }
  ]
  let first = true
  for (const slot of textureSlotsFor(project)) {
    if (!slot.paintable) {
      project.textureAssignments[slot.key] = 'skin'
      continue
    }
    project.textureAssignments[slot.key] = first ? 'glow' : 'flat'
    first = false
  }
}

async function exportTo(project: ArtemisProject, root: string): Promise<string[]> {
  const log: string[] = []
  await exportWorkspace(project, root, log)
  return log
}

async function main(): Promise<void> {

  const scenario = SCENARIOS.find((s) => s.name === 'kitchen sink')!
  const project = scenario.build()
  paint(project)
  const modId = project.meta.modId

  const root = tempDir('artemis-audit-export-')
  await exportTo(project, root)

  let lastWorkspace = root
  const tree = walkFiles(root)
  const read = (rel: string): string => readFileSync(join(root, rel), 'utf-8')
  const javaFiles = tree.filter((f) => f.endsWith('.java'))
  const allJava = javaFiles.map((f) => read(f)).join('\n')

  console.log(`export audit: ${tree.length} files in the workspace\n`)

  check(
    'HalpLibe.registerMod is emitted',
    /HalpLibe\.registerMod\s*\(/.test(allJava),
    'without it the mod has no textures and no names, silently'
  )

  const langPath = `src/main/resources/assets/${modId}/lang/en_US/${modId}.lang`
  check(`the lang file is at ${langPath}`, existsSync(join(root, langPath)), tree.filter((f) => f.endsWith('.lang')).join(', ') || 'no .lang written at all')

  if (existsSync(join(root, langPath))) {
    const langLines = read(langPath).split('\n').filter((l) => l.includes('='))
    const langKeys = new Set(langLines.map((l) => l.slice(0, l.indexOf('='))))
    check('the lang file is not empty', langKeys.size > 0)

    const mustHaveValue = langLines.filter((l) => !l.slice(0, l.indexOf('=')).endsWith('.desc'))
    check(
      'every lang line has a value, descriptions aside',
      mustHaveValue.every((l) => l.slice(l.indexOf('=') + 1).trim().length > 0),
      mustHaveValue.filter((l) => !l.slice(l.indexOf('=') + 1).trim()).join(', ')
    )

    const describable = langLines
      .map((l) => l.slice(0, l.indexOf('=')))
      .filter((k) => k.endsWith('.name') && /^(tile|item)\./.test(k))
      .map((k) => k.replace(/\.name$/, '.desc'))
    const undescribed = describable.filter((k) => !langKeys.has(k))
    check(
      'every block and item has a description line, so none of them shows a raw key',
      undescribed.length === 0,
      undescribed.join(', ')
    )

    const keyPattern = new RegExp(`\\b(?:tile|item)\\.${modId}\\.[\\w.]+\\.name\\b`, 'g')
    const referenced = new Set(allJava.match(keyPattern) ?? [])
    const unmatched = [...referenced].filter((k) => !langKeys.has(k))
    check(
      'every translation key the code uses has a lang line',
      unmatched.length === 0,
      unmatched.join(', ')
    )

    const KEY_SHAPES: [string, RegExp][] = [
      ['tile', new RegExp(`^tile\\.${modId}\\.[a-z0-9_]+\\.(?:name|desc)$`)],
      ['item', new RegExp(`^item\\.${modId}\\.[a-z0-9_]+\\.(?:name|desc)$`)],
      ['entity', new RegExp(`^entity\\.${modId}\\.[a-z0-9_]+\\.name$`)],
      ['biome', new RegExp(`^biome\\.${modId}\\.[a-z0-9_]+$`)],
      ['dimension', new RegExp(`^dimension\\.${modId}\\.[a-z0-9_]+\\.name$`)],
      ['worldType', new RegExp(`^worldType\\.${modId}\\.[a-z0-9_]+\\.name$`)]
    ]
    const malformed = [...langKeys].filter((k) => {
      const family = KEY_SHAPES.find(([prefix]) => k.startsWith(`${prefix}.`))
      return !family || !family[1].test(k)
    })
    check(
      'every translation key is composed, not chosen',
      malformed.length === 0,
      malformed.join(', ')
    )

    for (const [prefix] of KEY_SHAPES) {
      check(
        `the kitchen sink exercises ${prefix} translation keys`,
        [...langKeys].some((k) => k.startsWith(`${prefix}.`))
      )
    }
  }

  const unrendered = javaFiles.filter((f) => /\{\{\s*\w+\s*\}\}/.test(read(f)))
  check('no generated Java has an unrendered template placeholder', unrendered.length === 0, unrendered.join(', '))

  const todos = javaFiles.filter((f) => /\bTODO\b/.test(read(f)))
  check('no generated Java ships a TODO', todos.length === 0, todos.join(', '))

  const empties = javaFiles.filter((f) => read(f).trim().length === 0)
  check('no generated Java file is empty', empties.length === 0, empties.join(', '))

  const idArgs = [...allJava.matchAll(/new\s+Item\w*(?:<>)?\(\s*"([^"]+)"\s*,\s*"([^"]+)"/g)]
  check('items are registered with a namespaced texture id', idArgs.length > 0, 'no item registrations found at all')
  const colonless = idArgs.filter(([, , texture]) => !texture.includes(':'))
  check(
    'every item texture id has its namespace colon',
    colonless.length === 0,
    colonless.map(([, name, tex]) => `${name} -> ${tex}`).join(', ')
  )

  const modelSrc = javaFiles.filter((f) => /Models\.java$/.test(f)).map((f) => read(f)).join('\n')
  check('a models class is generated', modelSrc.length > 0, javaFiles.join(', '))

  const dispatched = (marker: RegExp): Set<string> => {
    const out = new Set<string>()
    for (const line of modelSrc.split('\n')) {
      if (!marker.test(line)) continue
      for (const m of line.matchAll(/Mod(?:Blocks|Items)\.([A-Z0-9_]+)/g)) out.add(m[1])
    }
    return out
  }
  const blockModeled = dispatched(/BlockModel/)
  const itemModeled = dispatched(/ItemModel/)

  const registeredBlocks = [
    ...allJava.matchAll(/\.build\(\s*new\s+Block\w*(?:<>)?\(\s*"([^"]+)"/g)
  ].map((m) => m[1])
  const registeredItems = idArgs.map(([, name]) => name)

  const blocksWithoutModel = registeredBlocks.filter((n) => !blockModeled.has(toConstantCase(n)))
  check(
    'every registered block has a block model registration',
    blocksWithoutModel.length === 0,
    blocksWithoutModel.join(', ')
  )

  const itemsWithoutModel = registeredItems.filter(
    (n) => !itemModeled.has(toConstantCase(n)) && !blockModeled.has(toConstantCase(n))
  )
  check(
    'every registered item has an item model registration',
    itemsWithoutModel.length === 0,
    itemsWithoutModel.join(', ')
  )
  check(
    'the mod registers some models at all',
    blockModeled.size + itemModeled.size > 0,
    'no model dispatches found, everything would be invisible'
  )

  {

    const collected = collectTextureIds(modelSrc, allJava)

    const texIds = new Set([...collected.atlas, ...collected.entity])

    const missing: string[] = []
    const vanilla: string[] = []
    for (const id of texIds) {
      const [ns, path] = id.split(':')
      if (ns !== modId) {

        vanilla.push(id)
        continue
      }
      if (path.endsWith('/')) {

        const dir = join(root, `src/main/resources/assets/${ns}/models/${path}`)
        if (!existsSync(dir)) {
          missing.push(`${id} (no model folder at models/${path})`)
          continue
        }
        const jsons = readdirSync(dir).filter((f) => f.endsWith('.json'))
        if (jsons.length === 0) {
          missing.push(`${id} (model folder holds no json)`)
          continue
        }
        for (const json of jsons) {
          const model = JSON.parse(readFileSync(join(dir, json), 'utf-8')) as {
            textures?: Record<string, string>
          }
          for (const value of Object.values(model.textures ?? {})) {
            const [tns, tpath] = value.split(':')
            if (tns !== modId) continue
            const png = join(root, `src/main/resources/assets/${tns}/textures/${tpath}.png`)
            if (!existsSync(png)) missing.push(`${value} (named by models/${path}${json})`)
          }
        }
        continue
      }
      const png = join(root, `src/main/resources/assets/${ns}/textures/${path}.png`)
      if (!existsSync(png)) missing.push(id)
    }

    check(
      `every texture id the generated code names resolves to a file (${texIds.size} ids)`,
      missing.length === 0,
      missing.join(', ')
    )
    check(
      'every texture id this mod names is in this mod´s namespace',
      vanilla.every((id) => id.startsWith('minecraft:')),
      vanilla.filter((id) => !id.startsWith('minecraft:')).join(', ')
    )

    const namedPaths = new Set(
      [...texIds]
        .filter((id) => id.startsWith(`${modId}:`))
        .map((id) => id.slice(modId.length + 1))
    )

    for (const id of texIds) {
      const [ns, path] = id.split(':')
      if (ns !== modId || !path.endsWith('/')) continue
      const dir = join(root, `src/main/resources/assets/${ns}/models/${path}`)
      if (!existsSync(dir)) continue
      for (const json of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
        const model = JSON.parse(readFileSync(join(dir, json), 'utf-8')) as {
          textures?: Record<string, string>
        }
        for (const value of Object.values(model.textures ?? {})) {
          if (value.startsWith(`${modId}:`)) namedPaths.add(value.slice(modId.length + 1))
        }
      }
    }
    const written = tree
      .filter((f) => f.startsWith(`src/main/resources/assets/${modId}/textures/`) && f.endsWith('.png'))
      .map((f) => f.slice(`src/main/resources/assets/${modId}/textures/`.length, -'.png'.length))

    const glowing = written.filter((path) => path.endsWith('.emiss'))
    check(
      'a texture with a glowing layer writes the second png beside it',
      glowing.length === 1 && written.includes(glowing[0].slice(0, -'.emiss'.length)),
      glowing.join(', ') || 'no emissive file was written'
    )
    check(
      'and a texture without one writes no second file',
      glowing.length < written.length / 2,
      `${glowing.length} glowing of ${written.length}`
    )

    const orphans = written.filter((path) => {
      if (path.endsWith('.emiss')) return !namedPaths.has(path.slice(0, -'.emiss'.length))
      return !namedPaths.has(path)
    })
    check(
      `every texture written is one the code asks for (${written.length} written)`,
      orphans.length === 0,
      orphans.join(', ')
    )
  }

  const mixinsJsonPath = tree.find((f) => f.endsWith('mixins.json'))
  check('a mixins.json is written', Boolean(mixinsJsonPath), tree.join(', '))
  if (mixinsJsonPath) {
    const mj = JSON.parse(read(mixinsJsonPath)) as {
      package?: string
      mixins?: string[]
      client?: string[]
      server?: string[]
    }
    const listed = [...(mj.mixins ?? []), ...(mj.client ?? []), ...(mj.server ?? [])]
    const pkgPath = (mj.package ?? '').replace(/\./g, '/')
    const missing = listed.filter((c) => !tree.includes(`src/main/java/${pkgPath}/${c.replace(/\./g, '/')}.java`))
    check('every mixin listed in mixins.json exists as a file', missing.length === 0, missing.join(', '))

    const mixinDir = `src/main/java/${pkgPath}/`
    const inMixinDir = tree.filter((f) => f.startsWith(mixinDir) && f.endsWith('.java'))
    const listedFiles = new Set(listed.map((c) => `${mixinDir}${c.replace(/\./g, '/')}.java`))
    const strays = inMixinDir.filter((f) => !listedFiles.has(f))
    check('the mixin package holds nothing but mixins', strays.length === 0, strays.join(', '))

    const dupes = listed.filter((c, i) => listed.indexOf(c) !== i)
    check('no mixin is listed twice', dupes.length === 0, dupes.join(', '))
  }

  {
    const dir = `src/main/resources/assets/${modId}/sounds`
    const ogg = join(root, dir, 'clang.ogg')
    check('the ogg is written', existsSync(ogg))
    check(
      'and comes back out of the project byte for byte',
      existsSync(ogg) &&
        readFileSync(ogg).equals(Buffer.from('OggS' + 'x'.repeat(2048), 'binary')),
      'the gzip round trip changed the file'
    )
    const manifestPath = join(root, dir, 'sounds.json')
    check('the manifest is written beside it', existsSync(manifestPath))
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Record<
        string,
        { sounds?: string[] }
      >
      check(
        'keyed on the event a mod would play, not on the file name',
        manifest['block.clang']?.sounds?.[0] === 'clang.ogg',
        JSON.stringify(manifest)
      )
    }
  }

  const fmjPath = 'src/main/resources/fabric.mod.json'
  check('fabric.mod.json is written', existsSync(join(root, fmjPath)))
  if (existsSync(join(root, fmjPath))) {
    const fmj = JSON.parse(read(fmjPath)) as {
      id?: string
      description?: string
      entrypoints?: Record<string, unknown[]>
      mixins?: string[]
      depends?: Record<string, string>
      suggests?: Record<string, string>
      custom?: { credits?: string[] }
    }
    check('its id is the mod id', fmj.id === modId, String(fmj.id))

    check(
      'a needed mod goes in depends',
      fmj.depends?.['someothermod'] === '>=1.2.0',
      JSON.stringify(fmj.depends)
    )
    check(
      'an optional one goes in suggests, so the mod still starts without it',
      fmj.suggests?.['prettymod'] === '*' && !fmj.depends?.['prettymod'],
      JSON.stringify(fmj.suggests)
    )
    check(
      'and the scaffold still pins what the generated code needs',
      fmj.depends?.['halplibe'] !== undefined && fmj.depends?.['fabricloader'] !== undefined,
      JSON.stringify(fmj.depends)
    )
    const entryCount = Object.values(fmj.entrypoints ?? {}).reduce((n, v) => n + v.length, 0)
    check(
      'it declares exactly one entrypoint',
      entryCount === 1,
      `${entryCount} entrypoints: ${JSON.stringify(fmj.entrypoints)}`
    )
    check(
      'it lists the mixin config',
      (fmj.mixins ?? []).some((m) => m.includes(modId)),
      JSON.stringify(fmj.mixins)
    )

    check(
      'the credits end with "Made using Artemis"',
      (fmj.custom?.credits ?? []).some((c) => c.includes('Made using Artemis')),
      JSON.stringify(fmj.custom?.credits)
    )

    check(
      'the description carries the credit too',
      (fmj.description ?? '').includes('Made using Artemis'),
      JSON.stringify(fmj.description)
    )

    check(
      'and the description is one line, because the game cannot draw a second',

      !/[\u0000-\u001f]/.test(fmj.description ?? ''),
      JSON.stringify(fmj.description)
    )
  }

  {
    const iconRel = `src/main/resources/assets/${modId}/icon.png`
    check('an icon is written even though none was uploaded', existsSync(join(root, iconRel)))
    if (existsSync(join(root, iconRel))) {
      const { width, height } = decodePng(readFileSync(join(root, iconRel)))
      check(
        `and it is ${ICON_SIZE} square`,
        width === ICON_SIZE && height === ICON_SIZE,
        `${width}x${height}`
      )
    }
    if (existsSync(join(root, fmjPath))) {
      const fmj = JSON.parse(read(fmjPath)) as { icon?: string }
      check('fabric.mod.json points at it', fmj.icon === `assets/${modId}/icon.png`, String(fmj.icon))
      check(
        'and the path it claims is a file that exists',
        !!fmj.icon && existsSync(join(root, 'src/main/resources', fmj.icon)),
        String(fmj.icon)
      )
    }
  }

  {
    const uploaded = SCENARIOS[0].build()

    uploaded.meta.icon = pngDataUrl(ICON_SIZE, ICON_SIZE, '#3aa0ff', '#123a5a')
    const upRoot = tempDir('artemis-audit-export-icon-')
    await exportTo(uploaded, upRoot)
    lastWorkspace = upRoot
    const rel = `src/main/resources/assets/${uploaded.meta.modId}/icon.png`
    check('an uploaded icon is written', existsSync(join(upRoot, rel)))
    if (existsSync(join(upRoot, rel))) {
      const onDisk = decodePng(readFileSync(join(upRoot, rel)))
      const source = decodeDataUrl(uploaded.meta.icon)
      check(
        'and it is the picture that was uploaded, pixel for pixel',
        Buffer.from(onDisk.rgba).equals(Buffer.from(source.rgba)),
        `${onDisk.width}x${onDisk.height} vs ${source.width}x${source.height}`
      )
    }

    const bare = SCENARIOS[0].build()
    bare.textures = []
    bare.textureAssignments = {}
    const bareRoot = tempDir('artemis-audit-export-noicon-')
    await exportTo(bare, bareRoot)
    lastWorkspace = bareRoot
    check(
      'a mod with no art and no upload writes no icon',
      !existsSync(join(bareRoot, `src/main/resources/assets/${bare.meta.modId}/icon.png`))
    )
    const bareFmj = JSON.parse(
      readFileSync(join(bareRoot, 'src/main/resources/fabric.mod.json'), 'utf-8')
    ) as { icon?: string }
    check('and claims none either', bareFmj.icon === undefined, String(bareFmj.icon))
  }

  check(
    'every generated Java file carries the Artemis header',
    javaFiles.every((f) => read(f).includes('Made using Artemis')),
    javaFiles.filter((f) => !read(f).includes('Made using Artemis')).join(', ')
  )

  const wantedSlots = textureSlotsFor(project).filter((s) => project.textureAssignments[s.key])

  const missingArt = wantedSlots.filter(
    (s) =>
      !existsSync(join(root, `src/main/resources/assets/${modId}/textures/${s.path ?? s.key}.png`))
  )
  check(
    'every assigned texture is written as a PNG',
    missingArt.length === 0,
    missingArt.map((s) => s.key).join(', ')
  )

  const wrongSize = wantedSlots
    .filter((s) => !missingArt.includes(s))
    .map((s) => {
      const abs = join(root, `src/main/resources/assets/${modId}/textures/${s.path ?? s.key}.png`)
      const png = readFileSync(abs)
      const url = `data:image/png;base64,${png.toString('base64')}`

      const [w, h] = s.paintable ? [16, 16] : [64, 32]
      try {
        const d = decodeDataUrl(url)
        return d.width === w && d.height === h
          ? null
          : `${s.key} is ${d.width}x${d.height}, expected ${w}x${h}`
      } catch (e) {
        return `${s.key} is not a readable PNG: ${String(e)}`
      }
    })
    .filter(Boolean)
  check(
    'and is a readable PNG on disk at its slot´s size',
    wrongSize.length === 0,
    wrongSize.join(', ')
  )

  {

    const keeperDir = join(root, 'src/main/java/com/handwritten')
    mkdirSync(keeperDir, { recursive: true })
    const keeperPath = join(keeperDir, 'Keeper.java')
    writeFileSync(keeperPath, 'package com.handwritten;\npublic class Keeper {}\n')
    writeFileSync(join(root, 'src/main/resources/assets/keepme.txt'), 'not Artemis\n')
    const stale = join(root, `src/main/java/com/${modId}/init/ModGhosts.java`)
    writeFileSync(stale, '// left over from an older Artemis\n')

    const handPainted = join(
      root,
      `src/main/resources/assets/${modId}/textures/block/hand_painted.png`
    )
    writeFileSync(handPainted, Buffer.from(PX.replace(/^data:image\/png;base64,/, ''), 'base64'))

    const smaller = createEmptyProject(project.meta.name, modId)
    let n = 0
    const add = (kind: ElementKind, name: string, props: Record<string, unknown>): void => {
      smaller.elements.push({
        id: `x${n++}`,
        kind,
        name,
        properties: { ...(KIND_DEFAULTS[kind] ?? {}), ...props },
        createdAt: '2026-08-27',
        updatedAt: '2026-08-27'
      })
    }
    add('block', 'only_block', { displayName: 'Only Block' })
    paint(smaller)
    await exportTo(smaller, root)

    check('a re-export deletes stale generated Java', !existsSync(stale))
    check(
      'and leaves files it does not own alone',
      existsSync(join(root, 'src/main/resources/assets/keepme.txt'))
    )
    check('and a hand-written package outside its own is untouched', existsSync(keeperPath))
    check('and a texture the modder dropped in by hand is still there', existsSync(handPainted))
    const after = walkFiles(root)
    check(
      'the smaller mod still exports its own block',
      after.some((f) => f.endsWith(`init/ModBlocks.java`)),
      after.filter((f) => f.endsWith('.java')).join(', ')
    )

    const cleanDir = tempDir('artemis-audit-clean-')
    await exportTo(smaller, cleanDir)
    const cleanFiles = new Set(walkFiles(cleanDir))
    const planted = new Set([
      'src/main/java/com/handwritten/Keeper.java',
      'src/main/resources/assets/keepme.txt',
      `src/main/resources/assets/${modId}/textures/block/hand_painted.png`
    ])
    const leftovers = after.filter((f) => !cleanFiles.has(f) && !planted.has(f))
    check(
      'a re-export leaves nothing a fresh export would not have written',
      leftovers.length === 0,
      leftovers.join(', ')
    )
    const absent = [...cleanFiles].filter((f) => !after.includes(f))
    check(
      'and writes everything a fresh export would have',
      absent.length === 0,
      absent.join(', ')
    )
  }

  {
    const dir = tempDir('artemis-audit-nomanifest-')
    await exportTo(project, dir)
    const manifest = join(dir, '.artemis-generated')
    check('the export records what it generated', existsSync(manifest))
    check(
      'and the record stays out of src/, so it never reaches the jar',
      !walkFiles(dir).some((f) => f.startsWith('src/') && f.includes('.artemis-generated')),
      walkFiles(dir).filter((f) => f.includes('.artemis-generated')).join(', ')
    )
    const before = walkFiles(dir)
    rmSync(manifest)

    const smaller = createEmptyProject(project.meta.name, project.meta.modId)
    smaller.elements.push({
      id: 'y0',
      kind: 'block',
      name: 'only_block',
      properties: { ...(KIND_DEFAULTS['block'] ?? {}), displayName: 'Only Block' },
      createdAt: '2026-08-27',
      updatedAt: '2026-08-27'
    })
    paint(smaller)
    await exportTo(smaller, dir)
    const survivors = walkFiles(dir)

    const lost = before.filter(
      (f) =>
        !f.startsWith(`src/main/java/com/${project.meta.modId}/`) &&
        f !== '.artemis-generated' &&
        !survivors.includes(f)
    )
    check(
      'with no record of the last export, a re-export deletes nothing',
      lost.length === 0,
      lost.join(', ')
    )
    check('and writes a record for the next one', existsSync(manifest))
  }

  for (const s of SCENARIOS) {
    const p = s.build()
    paint(p)
    const dir = tempDir('artemis-audit-exp-')
    let threw: string | null = null
    try {
      await exportTo(p, dir)
    } catch (e) {
      threw = (e as Error).message
    }
    check(`"${s.name}" exports without throwing`, threw === null, threw ?? '')
    const files = walkFiles(dir)
    check(
      `"${s.name}" writes a build script`,
      files.some((f) => f === 'build.gradle' || f === 'build.gradle.kts'),
      files.slice(0, 20).join(', ')
    )
    lastWorkspace = dir
  }

  await halplibeResolves(lastWorkspace)

  console.log(`\n${audit.passes} checks passed, ${audit.failures} failed`)
  sweepTempDirs()
  console.log(audit.failures === 0 ? 'EXPORT PASS' : 'EXPORT: see above')
  if (audit.failures > 0) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
