import { readFileSync } from 'fs'
import { join } from 'path'
import './_studio-env'
import { installCanvasShim } from './_canvas'
import { renderProbe, nodeText, h, liveProject, type ProbeNode, type ProbeRoot } from './_react-probe'
import { bridgeCalls, resetBridge, fakeStorage, emitBridge } from './_studio-env'
import { SCENARIOS, scenario } from './audit-fixtures'
import { useProjectStore } from '../src/renderer/src/store/projectStore'
import { useAppStore, type PendingWork, type SectionId } from '../src/renderer/src/store/appStore'
import { useTestStore } from '../src/renderer/src/store/testStore'
import { FORM_REGISTRY, KIND_LABELS } from '../src/renderer/src/sections/forms/registry'
import { createEmptyProject, type ArtemisElement, type ArtemisProject, type ElementKind } from '../src/shared/project'
import { KIND_DEFAULTS } from '../src/shared/generator/props'
import { MODES, buildProject } from './_modes'
import { textureSlotsForElement } from '../src/shared/generator/textures'
import { elementRegistryEntries } from '../src/shared/generator/registry'
import { png16DataUrl } from './_canvas'
import { Sidebar } from '../src/renderer/src/components/layout/Sidebar'
import { TitleBar } from '../src/renderer/src/components/titlebar/TitleBar'
import { Tutorial, tourWorld } from '../src/renderer/src/components/tutorial/Tutorial'
import { stepsFor, TOURS, WELCOME_TOUR } from '../src/renderer/src/components/tutorial/steps'
const TOUR_STEPS = TOURS[WELCOME_TOUR]
import { Dashboard } from '../src/renderer/src/sections/Dashboard'
import { GallerySection } from '../src/renderer/src/sections/GallerySection'
import { WorkshopSection } from '../src/renderer/src/sections/WorkshopSection'
import { TestingSection } from '../src/renderer/src/sections/TestingSection'
import { SettingsSection } from '../src/renderer/src/sections/SettingsSection'
import { ExportSection } from '../src/renderer/src/sections/ExportSection'
import { ElementSection } from '../src/renderer/src/sections/ElementSection'
import { UpdateBar } from '../src/renderer/src/components/layout/UpdateBar'
import { CreateMenu } from '../src/renderer/src/components/layout/CreateMenu'
import { PixelEditorOverlay } from '../src/renderer/src/components/pixel/PixelEditor'
import { VoxelEditorOverlay } from '../src/renderer/src/components/workshop/VoxelEditor'
import { kitPieces } from '../src/shared/generator/family'
import { titleCase } from '../src/shared/generator/templates/block'
import { harness } from './_harness'

installCanvasShim()

const audit = harness()
const check = audit.check

const ALL_KINDS = Object.keys(FORM_REGISTRY) as ElementKind[]

function seed(project: ArtemisProject): void {
  useProjectStore.setState({ project: structuredClone(project), filePath: null, dirty: false })
}

const live = liveProject

const elementNamed = (name: string): ArtemisElement => {
  const el = live().elements.find((e) => e.name === name)
  if (!el) throw new Error(`no element named ${name}`)
  return el
}

interface OpenForm extends ProbeRoot {

  stepTitles: () => string[]

  goTo: (title: string) => void

  current: () => string
  closed: () => boolean
}

function openForm(kind: ElementKind, elementId: string): OpenForm {
  const Form = FORM_REGISTRY[kind]
  let closed = false
  const Harness = (): ReturnType<typeof h> => {
    const el = useProjectStore((s) => s.project?.elements.find((e) => e.id === elementId)) ?? null
    return h(Form, { kind, element: el, onClose: () => (closed = true) })
  }
  const root = renderProbe(h(Harness)) as OpenForm

  const rail = (): ProbeNode[] =>
    root.findAll((n) => n.type === 'button' && typeof n.props['data-glide-id'] === 'string')

  const rowTitle = (n: ProbeNode): string =>
    nodeText(n.children[n.children.length - 1] ?? n).trim()

  root.stepTitles = () => rail().map(rowTitle)
  root.goTo = (title) => {
    const row = rail().find((n) => rowTitle(n) === title)
    if (!row) {
      throw new Error(`no step "${title}" in [${root.stepTitles().join(', ')}]`)
    }
    root.click(row)
  }

  root.current = () => {
    const heading = root.find((n) => n.type === 'h2')
    return heading ? nodeText(heading).trim() : ''
  }
  root.closed = () => closed
  return root
}

const rowLabel = (owner: ArtemisElement, registryName: string): string =>
  elementRegistryEntries(owner).find((e) => e.registryName === registryName)?.displayName ??
  registryName

interface Control {
  node: ProbeNode

  what: string

  drive: () => void
}

function labelOf(root: ProbeRoot, target: ProbeNode): string {
  const parents = new Map<ProbeNode, ProbeNode>()
  const walk = (n: ProbeNode): void => {
    for (const c of n.children) {
      parents.set(c, n)
      walk(c)
    }
  }
  walk(root.tree)
  let at: ProbeNode | undefined = parents.get(target)
  while (at) {
    const label = at.children.find((c) => c.type === 'label' && nodeText(c).trim().length > 0)
    if (label) return nodeText(label).trim()
    at = parents.get(at)
  }
  const own = target.props['aria-label'] ?? target.props.placeholder ?? target.props.title
  return own ? String(own) : 'unlabeled'
}

function controlsOn(root: ProbeRoot): Control[] {
  const out: Control[] = []
  for (const n of root.all()) {
    const label = String(
      n.props['aria-label'] ?? n.props.placeholder ?? n.props.title ?? labelOf(root, n)
    )

    if (n.type === 'input' && /^search/i.test(label)) continue
    if (n.type === 'input' && typeof n.props.onChange === 'function') {
      const type = String(n.props.type ?? 'text')
      const value = n.props.value
      if (type === 'number') {
        const cur = Number(value)
        const min = Number.isFinite(Number(n.props.min)) ? Number(n.props.min) : -Infinity
        const max = Number.isFinite(Number(n.props.max)) ? Number(n.props.max) : Infinity
        const step = Number.isFinite(Number(n.props.step)) ? Number(n.props.step) : 1

        const next = cur + step <= max ? cur + step : cur - step >= min ? cur - step : cur
        out.push({
          node: n,
          what: `number "${label}" ${cur} -> ${next}`,
          drive: () => root.change(n, next)
        })
      } else if (type === 'color') {
        const next = String(value) === '#123456' ? '#654321' : '#123456'
        out.push({
          node: n,
          what: `color "${label}" -> ${next}`,
          drive: () => root.change(n, next)
        })
      } else if (type === 'checkbox') {
        out.push({
          node: n,
          what: `checkbox "${label}"`,
          drive: () => root.change(n, !n.props.checked)
        })
      } else {
        const cur = String(value ?? '')
        const next = cur === 'probe_value' ? 'probe_other' : 'probe_value'
        out.push({
          node: n,
          what: `text "${label}" ${JSON.stringify(cur)} -> ${JSON.stringify(next)}`,
          drive: () => root.change(n, next)
        })
      }
      continue
    }
    if (n.type === 'textarea' && typeof n.props.onChange === 'function') {
      out.push({
        node: n,
        what: 'textarea',
        drive: () => root.change(n, 'probe_value')
      })
      continue
    }
    if (n.props.role === 'switch' && typeof n.props.onClick === 'function') {
      out.push({
        node: n,
        what: `switch "${labelOf(root, n)}" (${n.props['data-state']})`,
        drive: () => root.click(n)
      })
      continue
    }
    if (n.props.role === 'slider' && typeof n.props.onChange === 'function') {
      const cur = Number(n.props['data-value'])
      const max = Number(n.props['data-max'])
      const min = Number(n.props['data-min'])
      const step = Number(n.props['data-step'] ?? 1) || 1
      const next = cur + step <= max ? cur + step : cur - step >= min ? cur - step : cur
      out.push({
        node: n,
        what: `slider "${labelOf(root, n)}" ${cur} -> ${next}`,
        drive: () => root.change(n, next)
      })
    }
  }
  return out
}

function menusOn(root: ProbeRoot): Array<{ rows: ProbeNode[] }> {
  const menus: Array<{ rows: ProbeNode[] }> = []
  const rowsUnder = (n: ProbeNode, out: ProbeNode[]): void => {
    if (n.props.role === 'menuitem' || n.props.role === 'menuitemcheckbox') out.push(n)
    for (const c of n.children) rowsUnder(c, out)
  }
  for (const n of root.all()) {
    if (n.props.role !== 'menu') continue
    const rows: ProbeNode[] = []
    rowsUnder(n, rows)

    menus.push({ rows })
  }
  return menus
}

const snapshot = (): string =>
  JSON.stringify({
    elements: live().elements,
    assignments: live().textureAssignments,
    textures: live().textures.map((t) => ({ id: t.id, name: t.name })),
    meta: live().meta,
    app: Object.fromEntries(
      Object.entries(useAppStore.getState()).filter(([, v]) => typeof v !== 'function')
    )
  })

function everyKindMounts(): void {
  console.log('\n[renders] every kind, brand new and configured')
  for (const kind of ALL_KINDS) {

    seed(SCENARIOS[0].build())
    const id = useProjectStore.getState().createElement(kind)
    let form: OpenForm | null = null
    try {
      form = openForm(kind, id)
    } catch (e) {
      check(`${kind}: a new element opens`, false, String(e))
      continue
    }
    const titles = form.stepTitles()
    check(`${kind}: a new element opens`, titles.length >= 3, `steps: ${titles.join(', ')}`)
    check(
      `${kind}: the wizard starts on Name and ends on Check`,
      titles[0] === 'Name' && titles[titles.length - 1] === 'Check',
      titles.join(', ')
    )
    check(
      `${kind}: every step has a name`,
      titles.every((t) => t.length > 0),
      titles.join(' | ')
    )
    check(
      `${kind}: no step name is used twice`,
      new Set(titles).size === titles.length,
      titles.join(' | ')
    )

    for (const t of titles) {
      try {
        form.goTo(t)
        check(`${kind}: the ${t} slide opens`, form.current() === t, `showed "${form.current()}"`)
      } catch (e) {
        check(`${kind}: the ${t} slide opens`, false, String(e))
      }
    }
    form.unmount()
  }
}

function everyFixtureElementOpens(): void {
  console.log('\n[renders] every element of every fixture')
  for (const scenario of SCENARIOS) {
    seed(scenario.build())
    for (const el of [...live().elements]) {
      let form: OpenForm | null = null
      try {
        form = openForm(el.kind, el.id)
        const titles = form.stepTitles()
        for (const t of titles) form.goTo(t)
        check(`${scenario.name}: ${el.kind} "${el.name}" opens and walks`, true)
      } catch (e) {
        check(`${scenario.name}: ${el.kind} "${el.name}" opens and walks`, false, String(e))
      }
      form?.unmount()
    }
  }
}

function promotedPieces(): void {
  console.log('\n[promoted] a piece lifted out of a gear set')
  const kit = SCENARIOS.find((s) => s.name === 'kit with a promoted piece')
  if (!kit) {
    check('the kit fixture exists', false, 'no scenario named "kit with a promoted piece"')
    return
  }
  seed(kit.build())
  const owner = live().elements.find((e) => e.kind === 'gearset')
  if (!owner) {
    check('the kit fixture has a gear set in it', false)
    return
  }

  for (const [piece, expected, other] of [
    ['pickaxe', 'Tool Stats', 'Armor Stats'],
    ['helmet', 'Armor Stats', 'Tool Stats']
  ] as const) {
    seed(kit.build())
    const own = live().elements.find((e) => e.kind === 'gearset')
    if (!own) continue
    const id = useProjectStore.getState().promoteGenerated(own.id, `${own.name}_${piece}`)
    check(`${piece}: the sidebar can promote it`, typeof id === 'string', String(id))
    if (!id) continue

    const form = openForm('item', id)
    const titles = form.stepTitles()
    check(`${piece}: the wizard shows ${expected}`, titles.includes(expected), titles.join(', '))
    check(`${piece}: the wizard does not show ${other}`, !titles.includes(other), titles.join(', '))
    check(
      `${piece}: no Behavior step (stack size and creative shelf are not read for a piece)`,
      !titles.includes('Behavior'),
      titles.join(', ')
    )
    check(
      `${piece}: no Tools & Armor step (a promoted piece cannot generate a set)`,
      !titles.includes('Tools & Armor'),
      titles.join(', ')
    )

    if (!titles.includes(expected)) {
      form.unmount()
      continue
    }
    form.goTo(expected)
    const shown = nodeText(form.tree)
    const wanted =
      expected === 'Tool Stats'
        ? ['Durability', 'Mining Speed', 'Mining Level', 'Attack Damage']
        : ['Armor Durability', 'Melee Protection', 'Blast Protection', 'Fire Protection']
    for (const w of wanted) {
      check(`${piece}: ${expected} shows ${w}`, shown.includes(w))
    }

    form.goTo('Check')
    const fixes = form.findAll(
      (n) => n.type === 'button' && nodeText(n).trim().toLowerCase() === 'fix'
    )
    let stranded = 0
    for (const f of fixes) {
      const before = form.current()
      form.click(f)
      if (form.current() === before) stranded++
      form.goTo('Check')
    }
    check(`${piece}: every Fix button on the review slide goes somewhere`, stranded === 0,
      `${stranded} of ${fixes.length} did nothing`)
    form.unmount()
  }
}

function everyControlIsLive(): void {
  console.log('\n[live] every control and every dropdown, in every mode')
  let controlCount = 0
  let menuCount = 0
  let modeCount = 0
  for (const kind of ALL_KINDS) {
    for (const [modeName, modeProps] of Object.entries(MODES[kind])) {
      modeCount++
      seed(buildProject(kind, modeProps))
      const subject = live().elements.find((e) => e.kind === kind && e.name === `subject_${kind}`)
      if (!subject) {
        check(`${kind} [${modeName}]: the mode builds an element`, false)
        continue
      }
      const form = openForm(kind, subject.id)
      const dead: string[] = []

      for (let si = 0; si < form.stepTitles().length; si++) {
        const title = form.stepTitles()[si]
        if (!title || title === 'Check') continue
        form.goTo(title)

        const controls = controlsOn(form)
        for (let i = 0; i < controls.length; i++) {

          const c = controlsOn(form)[i]
          if (!c) break
          const before = snapshot()
          try {
            c.drive()
          } catch (e) {
            dead.push(`${title}/${c.what} threw ${String(e)}`)
            continue
          }
          controlCount++
          if (snapshot() === before) dead.push(`${title}/${c.what}`)
        }

        const menus = menusOn(form)
        for (let m = 0; m < menus.length; m++) {

          const rows = menusOn(form)[m]?.rows ?? []

          menuCount++
          if (rows.length === 0) continue
          let moved = false
          let threw = ''
          for (const row of rows.slice(0, 4)) {
            const before = snapshot()
            try {
              form.click(row)
            } catch (e) {
              threw = String(e)
              break
            }
            if (snapshot() !== before) {
              moved = true
              break
            }
          }
          if (threw) dead.push(`${title}/menu ${m} threw ${threw}`)
          else if (!moved) {
            dead.push(
              `${title}/menu ${m} of ${rows.length} rows: none of the first ` +
                `${Math.min(4, rows.length)} changed anything ` +
                `("${rows.slice(0, 4).map((r) => nodeText(r).trim()).join('", "')}")`
            )
          }
        }
      }
      check(
        `${kind} [${modeName}]: every control on every slide changes something`,
        dead.length === 0,
        dead.join('\n       ')
      )
      form.unmount()
    }
  }
  console.log(
    `         drove ${controlCount} controls and ${menuCount} dropdowns over ${modeCount} modes`
  )
}

function reviewSlideIsHonest(): void {
  console.log('\n[review] the last slide before export')
  let rows = 0
  let jumps = 0
  for (const kind of ALL_KINDS) {
    for (const [modeName, modeProps] of Object.entries(MODES[kind])) {
      seed(buildProject(kind, modeProps))
      const subject = live().elements.find((e) => e.kind === kind && e.name === `subject_${kind}`)
      if (!subject) continue
      const form = openForm(kind, subject.id)
      form.goTo('Check')
      const fixes = form.findAll((n) => n.type === 'button' && nodeText(n).trim() === 'Fix')
      rows += fixes.length
      let stranded = 0
      for (let i = 0; i < fixes.length; i++) {
        const fix = form.findAll((n) => n.type === 'button' && nodeText(n).trim() === 'Fix')[i]
        if (!fix) break
        form.click(fix)
        jumps++

        if (form.current() === 'Check') stranded++
        form.goTo('Check')
      }
      check(
        `${kind} [${modeName}]: every Fix button on the review slide goes somewhere`,
        stranded === 0,
        `${stranded} of ${fixes.length} did nothing`
      )

      const done = nodeText(form.tree).includes("Everything's done")
      check(
        `${kind} [${modeName}]: "done" and a list of what is missing are never both shown`,
        !(done && fixes.length > 0),
        done ? `says done with ${fixes.length} Fix buttons` : ''
      )
      form.unmount()
    }
  }
  console.log(`         ${rows} unfinished rows, ${jumps} jumps taken`)
}

function reviewSlideNoticesTheFix(): void {
  console.log('\n[review] filling a gap clears its row')
  seed(SCENARIOS[0].build())
  const block = live().elements.find((e) => e.kind === 'block')
  if (!block) {
    check('the ordinary fixture has a block', false)
    return
  }
  const form = openForm('block', block.id)
  form.goTo('Check')
  const before = nodeText(form.tree)
  check(
    'an unpainted block is told it has textures missing',
    /Textures painted/.test(before) && !before.includes("Everything's done"),
    before.slice(0, 300)
  )

  const texId = useProjectStore.getState().addTexture('probe_paint', png16DataUrl(), 'block')
  for (const slot of textureSlotsForElement(block)) {
    if (slot.paintable) useProjectStore.getState().assignTexture(slot.key, texId)
  }
  form.flush()
  const after = nodeText(form.tree)
  check(
    'painting every slot clears the textures row',
    !/\d+ of \d+ assigned/.test(after),
    after.slice(0, 300)
  )
  form.unmount()
}

function theKitSwitchDeliversNinePieces(): void {
  console.log('\n[kit] a gear set and its nine pieces')
  seed(buildProject('gearset', MODES.gearset['tools and armor']))
  const set = live().elements.find((e) => e.kind === 'gearset')
  if (!set) {
    check('the gear set fixture builds', false)
    return
  }

  const entries = elementRegistryEntries(set).map((e) => e.registryName)
  const expected = [
    'sword',
    'pickaxe',
    'axe',
    'shovel',
    'hoe',
    'helmet',
    'chestplate',
    'leggings',
    'boots'
  ].map((piece) => `${set.name}_${piece}`)
  const missing = expected.filter((n) => !entries.includes(n))
  check(
    'a gear set registers all nine pieces it is named for',
    missing.length === 0,
    `got ${entries.length}; missing ${missing.join(', ')}`
  )
  check('the pieces are named once each', new Set(entries).size === entries.length, entries.join(', '))

  check(
    'and nothing under its own bare name, so it can sit beside its material',
    !entries.includes(set.name),
    entries.join(', ')
  )

  const form = openForm('gearset', set.id)
  const titles = form.stepTitles()
  check(
    'the set has slides for its pieces, both sets of numbers and its art',
    ['Pieces', 'Tool Stats', 'Armor Stats', 'Textures'].every((t) => titles.includes(t)),
    titles.join(', ')
  )

  form.goTo('Pieces')
  const switches = form.findAll((n) => n.props.role === 'switch')
  check('the pieces slide has a switch for each half', switches.length >= 2, String(switches.length))
  if (switches.length >= 2) {
    form.click(switches[1])
    const off = elementRegistryEntries(live().elements.find((e) => e.id === set.id)!).map(
      (e) => e.registryName
    )
    const armor = ['helmet', 'chestplate', 'leggings', 'boots'].map((k) => `${set.name}_${k}`)
    const tools = ['sword', 'pickaxe', 'axe', 'shovel', 'hoe'].map((k) => `${set.name}_${k}`)
    check(
      'switching the armor off takes those four away and leaves the tools',
      armor.every((n) => !off.includes(n)) && tools.every((n) => off.includes(n)),
      off.join(', ')
    )
  }

  const formSrc = readFileSync(
    join(process.cwd(), 'src/renderer/src/sections/forms/GearSetForm.tsx'),
    'utf-8'
  )
  const pieceSwitches = formSrc.match(/<Switch[\s\S]{0,300}?\/>/g) ?? []
  check(
    'and no switch paints anything, so somebody drawing their own starts empty',
    pieceSwitches.length >= 2 &&
      pieceSwitches.every((sw) => !/generateKitTextures|generate\(/.test(sw)),
    `${pieceSwitches.length} switches`
  )
  form.unmount()
}

function deleteAndClose(): void {
  console.log('\n[actions] Delete and the ways out')
  seed(SCENARIOS[0].build())
  const victim = live().elements[0]
  const others = live().elements.length
  const form = openForm(victim.kind, victim.id)
  const del = form.findAll((n) => n.type === 'button' && nodeText(n).trim() === 'Delete')[0]
  check('every form has a Delete button', Boolean(del))
  if (del) {
    form.click(del)
    check(
      'Delete removes exactly the element being edited',
      live().elements.length === others - 1 && !live().elements.some((e) => e.id === victim.id),
      `${others} -> ${live().elements.length}`
    )
    check('Delete leaves the form', form.closed())
  }
  form.unmount()

  seed(SCENARIOS[0].build())
  const el = live().elements[0]
  const f2 = openForm(el.kind, el.id)
  const count = live().elements.length
  const later = f2.findAll(
    (n) => n.type === 'button' && nodeText(n).trim().startsWith('Finish later')
  )[0]
  check('a form can be left before the end', Boolean(later))
  if (later) {
    f2.click(later)
    check('leaving early closes the form', f2.closed())
    check('leaving early keeps the element', live().elements.length === count)
  }
  f2.unmount()
}

function nameGuard(): void {
  console.log('\n[guards] the name slide')
  const base = SCENARIOS[0].build()
  seed(base)
  const taken = live().elements[0]
  const mine = useProjectStore.getState().createElement('block')

  const form = openForm('block', mine)
  form.goTo('Name')
  const nameInput = form.find(
    (n) => n.type === 'input' && String(n.props.value ?? '').startsWith('new_')
  )
  check('a new element opens with a placeholder name in the name field', Boolean(nameInput))
  if (!nameInput) return

  form.change(nameInput, taken.name)
  const shown = nodeText(form.tree)
  check(
    'typing a name another element already owns is called out on the slide',
    shown.toLowerCase().includes(taken.name.toLowerCase()) &&
      /alread|taken|use|dupli/i.test(shown),
    shown.slice(0, 400)
  )
  form.goTo('Check')
  const review = nodeText(form.tree)
  check('the review slide refuses to call a duplicate name done', /Named/.test(review))

  const again = form.find((n) => n.type === 'input' && String(n.props.value ?? '') === taken.name)
  if (again) {
    form.change(again, 'a_name_nothing_else_owns')
    check(
      'a free name clears the warning',
      !/alread|taken|dupli/i.test(nodeText(form.tree)),
      nodeText(form.tree).slice(0, 300)
    )
  }
  form.unmount()
}

function readingIsQuiet(): void {
  console.log('\n[quiet] opening a form touches nothing outside the project')
  const forbidden = ['project.save', 'project.saveAs', 'export.workspace', 'test.start', 'prefs.save']
  for (const scenario of SCENARIOS) {
    seed(scenario.build())
    resetBridge()
    for (const el of [...live().elements]) {
      const form = openForm(el.kind, el.id)
      for (const t of form.stepTitles()) form.goTo(t)
      form.unmount()
    }
    const bad = bridgeCalls.filter((c) => forbidden.includes(c.name)).map((c) => c.name)
    check(`${scenario.name}: browsing every form saves and launches nothing`, bad.length === 0,
      [...new Set(bad)].join(', '))
  }
}

function openSidebar(): ProbeRoot {
  return renderProbe(h(Sidebar))
}

function rowName(n: ProbeNode): string {
  const span = (function find(node: ProbeNode): ProbeNode | null {
    for (const c of node.children) {
      if (c.type === 'span' && String(c.props.className ?? '').includes('truncate')) return c
      const deeper = find(c)
      if (deeper) return deeper
    }
    return null
  })(n)
  return nodeText(span ?? n).trim()
}

const treeRows = (root: ProbeRoot): string[] =>
  root
    .findAll((n) => n.type === 'button')
    .map(rowName)
    .filter((t) => t.length > 0)

function theTreeNamesEverythingOnce(): void {
  console.log('\n[tree] the sidebar')
  seed(buildProject('gearset', MODES.gearset['tools and armor']))
  const owner = live().elements.find((e) => e.kind === 'gearset')
  if (!owner) {
    check('the kit fixture has an owner', false)
    return
  }

  const bar = openSidebar()
  check('the tree lists every element of the mod', live().elements.every((el) => {
    const display = (el.properties['displayName'] as string) || ''
    return treeRows(bar).some((r) => r === display || r === titleCase(el.name))
  }), treeRows(bar).join(' | '))

  const toggle = bar.find(
    (n) => n.type === 'button' && /\d+ auto-generated/.test(nodeText(n))
  )
  check('an element that generates pieces says how many', Boolean(toggle), treeRows(bar).join(' | '))
  if (!toggle) return
  check(
    'the count on the fold matches what the generator will emit',
    nodeText(toggle).trim().startsWith(String(kitPieces(owner).length)),
    `${nodeText(toggle).trim()} vs ${kitPieces(owner).length} pieces`
  )
  bar.click(toggle)

  const shown = treeRows(bar)
  const pieces = kitPieces(owner).map((piece) => piece.name)
  const missing = pieces.filter((n) => !shown.some((r) => r === rowLabel(owner, n)))
  check(
    'every piece the kit generates has a row',
    missing.length === 0,
    `missing ${missing.join(', ')} from [${shown.join(' | ')}]`
  )

  const before = shown.filter((r) => r === rowLabel(owner, pieces[1])).length
  check(`"${rowLabel(owner, pieces[1])}" appears once before it is promoted`, before === 1, String(before))
  const id = useProjectStore.getState().promoteGenerated(owner.id, pieces[1])
  check('promoting the piece makes an element of it', typeof id === 'string')
  bar.flush()

  const after = treeRows(bar)
  const times = after.filter((r) => r === rowLabel(owner, pieces[1])).length
  check(
    `"${rowLabel(owner, pieces[1])}" is in the tree exactly once after it is promoted`,
    times === 1,
    `${times} times in [${after.join(' | ')}]`
  )
  const ownerNow = live().elements.find((e) => e.id === owner.id)!
  check(
    'the owner stops generating the piece it gave up',
    !kitPieces(ownerNow).some((piece) => piece.name === pieces[1]),
    kitPieces(ownerNow).map((piece) => piece.name).join(', ')
  )
  check(
    'the fold under the owner counts one fewer',
    kitPieces(ownerNow).length === pieces.length - 1,
    `${kitPieces(ownerNow).length} vs ${pieces.length - 1}`
  )
  bar.unmount()
}

function paintingAGhostRowPromotesIt(): void {
  console.log('\n[tree] painting a generated piece')
  seed(buildProject('gearset', MODES.gearset['tools and armor']))
  const owner = live().elements.find((e) => e.kind === 'gearset')
  if (!owner) return
  useAppStore.setState({ textureEditor: null })

  const bar = openSidebar()
  const toggle = bar.find((n) => n.type === 'button' && /\d+ auto-generated/.test(nodeText(n)))
  if (!toggle) {
    check('the kit owner has a fold', false)
    return
  }
  bar.click(toggle)

  const piece = kitPieces(owner)[0].name
  const row = bar.find((n) => n.type === 'button' && rowName(n) === rowLabel(owner, piece))
  check(`the tree has a row for ${piece}`, Boolean(row))
  if (!row) return

  const elementsBefore = live().elements.length
  bar.click(row)
  check(
    'clicking a generated row lifts it out into an element of its own',
    live().elements.length === elementsBefore + 1 &&
      live().elements.some((e) => e.name === piece),
    `${elementsBefore} -> ${live().elements.length}`
  )
  const editor = useAppStore.getState().textureEditor
  check('and opens the texture editor on it', Boolean(editor), JSON.stringify(editor))
  check(
    'the editor is aimed at the slot that piece paints into',
    editor?.assignSlotAfter === `item/${piece}` || Boolean(editor?.textureId),
    JSON.stringify(editor)
  )
  bar.unmount()
}

function everyWorkshopCardDrawsSomething(): void {
  console.log('\n[workshop] every card draws its build or says what it is')
  const project = createEmptyProject('cardmod', 'cardmod')
  const el = (kind: ElementKind, name: string, props: Record<string, unknown>): void => {
    project.elements.push({
      id: `c${project.elements.length}`,
      kind,
      name,
      properties: { ...(KIND_DEFAULTS[kind] ?? {}), ...props },
      createdAt: '2026-08-27T00:00:00Z',
      updatedAt: '2026-08-27T00:00:00Z'
    })
  }
  el('block', 'bark', {})

  const small = { '0,0,0': 'bark', '0,1,0': 'bark' }
  const huge: Record<string, string> = {}
  for (let x = 0; x < 20; x++)
    for (let y = 0; y < 15; y++) for (let z = 0; z < 20; z++) huge[`${x},${y},${z}`] = 'bark'

  const template: Record<string, string> = {}
  for (let x = 0; x < 9; x++)
    for (let y = 0; y < 9; y++) for (let z = 0; z < 7; z++) template[`${x},${y},${z}`] = 'bark'
  el('tree', 'small_tree', { design: 'built', variants: [{ id: 'v1', name: 'A', blocks: small }] })
  el('tree', 'template_tree', {
    design: 'built',
    variants: [{ id: 'v1', name: 'A', blocks: template }]
  })
  el('tree', 'huge_tree', { design: 'built', variants: [{ id: 'v1', name: 'A', blocks: huge }] })
  el('tree', 'grown_tree', { design: 'grown' })
  el('structure', 'huge_ruin', { variants: [{ id: 'v1', name: 'A', blocks: huge }] })
  seed(project)
  resetBridge()

  const root = renderProbe(h(WorkshopSection))
  const drawsSomething = (n: ProbeNode): boolean => {
    if (n.type === 'canvas' || n.type === 'svg') return true
    return n.children.some(drawsSomething)
  }
  const cards = (): ProbeNode[] =>
    root.findAll(
      (n) => typeof n.props.className === 'string' && n.props.className.includes('card group')
    )
  const sweep = (shelf: string, expected: number): void => {
    check(`the ${shelf} shelf lists a card per build`, cards().length === expected,
      `${cards().length} cards`)
    for (const card of cards()) {
      const name = nodeText(card).slice(0, 24)
      check(`the card for ${name} draws a build or an icon, never an empty box`,
        drawsSomething(card))
    }
  }
  sweep('tree', 4)

  const drawn = cards().find((c) => nodeText(c).startsWith('Template Tree'))
  const hasCanvas = (n: ProbeNode): boolean =>
    n.type === 'canvas' || n.children.some(hasCanvas)
  check('a tree the size of a stock template draws its build, not an icon',
    !!drawn && hasCanvas(drawn))

  const structures = root.clickable().find((n) => nodeText(n).startsWith('Structures'))
  check('the Workshop has a shelf for structures', !!structures)
  if (structures) {
    root.click(structures)
    root.flush()
    sweep('structure', 1)
  }
  root.unmount()
}

const SECTIONS: Array<[string, () => ReturnType<typeof h>]> = [
  ['dashboard', () => h(Dashboard)],
  ['gallery', () => h(GallerySection)],
  ['workshop', () => h(WorkshopSection)],
  ['test', () => h(TestingSection)],
  ['settings', () => h(SettingsSection)],
  ['export', () => h(ExportSection)],

  ['block', () => h(ElementSection, { kind: 'block' as ElementKind })]
]

function theWayOutOfAnEditor(): void {
  console.log('\n[titlebar] the way out of an editor, and where it leads')
  seed(scenario('a mod from before the element rework').build())
  useAppStore.setState({
    section: 'gallery',
    textureEditor: null,
    workshopEditor: null,
    pendingWork: null
  })

  const bar = renderProbe(h(TitleBar))

  const escape = (): ProbeNode | undefined =>
    bar.all().find((n) => n.props['aria-label'] === 'Gallery' || n.props['aria-label'] === 'Workshop')
  const reachable = (): boolean => {
    const b = escape()
    return !!b && !b.props.disabled && b.props['aria-hidden'] !== true && b.props.tabIndex === 0
  }

  const slotWidth = (label: string): number | null => {
    const btn = bar.all().find((n) => n.props['aria-label'] === label)
    if (!btn) return null
    const slot = bar.all().find((n) => n.children.includes(btn))
    const w = slot?.props.style?.width
    return typeof w === 'number' ? w : null
  }

  const iconOn = (b: ProbeNode | undefined): string => {
    const svg = b && [b, ...b.children].find((n) => n.type === 'svg')
    const cls = svg?.props.className
    return typeof cls === 'string' ? cls : ''
  }

  check('it is on the bar, folded away, when no editor is open', !!escape())
  check('and cannot be reached from there', !reachable(),
    JSON.stringify(escape()?.props.disabled) + ' ' + JSON.stringify(escape()?.props.tabIndex))
  check('with no width, so it is not merely transparent', slotWidth('Workshop') === 0,
    String(slotWidth('Workshop')))
  check('and the arrows have the strip to themselves',
    slotWidth('Back') === 28 && slotWidth('Forward') === 28,
    `${slotWidth('Back')} and ${slotWidth('Forward')}`)

  useAppStore.getState().openTextureEditor({ textureId: null, kind: 'block' })
  bar.flush()
  check('it becomes reachable once the texture editor covers the window', reachable())
  check('and it offers the Gallery, which is where a texture is painted from',
    escape()?.props['aria-label'] === 'Gallery', String(escape()?.props['aria-label']))
  check('with the Gallery´s own icon on it',
    iconOn(escape()).includes('lucide-images'), iconOn(escape()))
  check('and the arrows collapse into it rather than sitting beside it',
    slotWidth('Back') === 0 && slotWidth('Forward') === 0 && slotWidth('Gallery') === 28,
    `back ${slotWidth('Back')}, forward ${slotWidth('Forward')}, out ${slotWidth('Gallery')}`)
  check('the folded arrows go inert with their slot, or they are a trap',
    ['Back', 'Forward'].every((l) => {
      const b = bar.all().find((n) => n.props['aria-label'] === l)
      return !!b && b.props.disabled === true && b.props.tabIndex === -1 &&
        b.props['aria-hidden'] === true
    }))
  bar.click(escape()!)
  bar.flush()
  check('and it goes there', useAppStore.getState().section === 'gallery',
    useAppStore.getState().section)
  check(
    'closing the editor on the way, or it would still be covering the shelf',
    useAppStore.getState().textureEditor === null
  )
  check('and folds away again once there is no editor to leave', !reachable())
  check('the arrows coming back out as it goes',
    slotWidth('Back') === 28 && slotWidth('Forward') === 28 && slotWidth('Workshop') === 0,
    `back ${slotWidth('Back')}, forward ${slotWidth('Forward')}, out ${slotWidth('Workshop')}`)

  const build = live().elements.find((e) => e.kind === 'tree' || e.kind === 'structure')!
  useAppStore.getState().openWorkshopEditor(build.id)
  bar.flush()
  check('it comes back for the build editor too', reachable())
  check('and offers the Workshop instead, which is where a build is made',
    escape()?.props['aria-label'] === 'Workshop', String(escape()?.props['aria-label']))
  check('with the Workshop´s own icon on it',
    iconOn(escape()).includes('lucide-hammer'), iconOn(escape()))
  bar.click(escape()!)
  bar.flush()
  check('going there closes the build editor', useAppStore.getState().workshopEditor === null)
  check('and lands on the Workshop', useAppStore.getState().section === 'workshop',
    useAppStore.getState().section)

  useAppStore.getState().goForward()
  check('and the editor is one step forward, where a back arrow would leave it',
    useAppStore.getState().workshopEditor !== null,
    JSON.stringify(useAppStore.getState().workshopEditor))

  useAppStore.getState().goBack()
  const behind = { ...useAppStore.getState() }
  useAppStore.getState().goBack()
  check('while Back still leads out to where the editor was opened from',
    useAppStore.getState().section !== behind.section ||
      useAppStore.getState().historyIndex < behind.historyIndex,
    `${behind.section}@${behind.historyIndex} then ${useAppStore.getState().section}@${useAppStore.getState().historyIndex}`)

  bar.unmount()
  useAppStore.setState({ textureEditor: null, workshopEditor: null, section: 'dashboard' })
}

function theWaysOutYieldToUnsavedWork(): void {
  console.log('\n[titlebar] the ways out, refusing to throw a drawing away')
  seed(scenario('a mod from before the element rework').build())

  const holding = (canCommit: boolean): { commits: number } => {
    const counts = { commits: 0 }
    useAppStore.setState({
      pendingWork: {
        has: () => true,
        commit: () => {
          counts.commits++
          if (canCommit) useAppStore.setState({ pendingWork: null })
          return canCommit
        }
      }
    })
    return counts
  }

  const CONTROLS = ['Back', 'Gallery'] as const
  for (const label of CONTROLS) {

    const enter = (): void => {
      useAppStore.setState({ section: 'gallery', textureEditor: null, workshopEditor: null })
      useAppStore.getState().navigate('gallery')
      useAppStore.getState().openTextureEditor({ textureId: null, kind: 'block' })
    }

    enter()
    const bar = renderProbe(h(TitleBar))
    const control = (): ProbeNode =>
      bar.all().find((n) => n.props['aria-label'] === label)!

    const counts = holding(true)
    const before = useAppStore.getState().refusals
    bar.click(control())
    bar.flush()
    check(`${label}: one click does not leave an editor holding a drawing`,
      useAppStore.getState().textureEditor !== null)
    check(`${label}: and the window is shivered rather than nothing happening`,
      useAppStore.getState().refusals === before + 1,
      `${before} to ${useAppStore.getState().refusals}`)
    check(`${label}: and nothing was saved behind anybody´s back`, counts.commits === 0,
      String(counts.commits))

    bar.all().find((n) => n.props['aria-label'] === label)!.props.onDoubleClick()
    bar.flush()
    check(`${label}: a double click keeps the work`, counts.commits === 1, String(counts.commits))
    check(`${label}: and then leaves the editor`,
      useAppStore.getState().textureEditor === null,
      JSON.stringify(useAppStore.getState().textureEditor))
    bar.unmount()

    enter()
    const bar2 = renderProbe(h(TitleBar))
    const blocked = holding(false)
    const refusalsBefore = useAppStore.getState().refusals
    bar2.all().find((n) => n.props['aria-label'] === label)!.props.onDoubleClick()
    bar2.flush()
    check(`${label}: a drawing that cannot be saved is not left behind either`,
      useAppStore.getState().textureEditor !== null)
    check(`${label}: it tried`, blocked.commits === 1, String(blocked.commits))
    check(`${label}: and said so rather than going quiet`,
      useAppStore.getState().refusals === refusalsBefore + 1,
      `${refusalsBefore} to ${useAppStore.getState().refusals}`)
    bar2.unmount()
    useAppStore.setState({ pendingWork: null })
  }

  useAppStore.setState({ section: 'gallery', textureEditor: null, workshopEditor: null, pendingWork: null })
  useAppStore.getState().openTextureEditor({ textureId: null, kind: 'block' })
  const plain = renderProbe(h(TitleBar))
  const quiet = useAppStore.getState().refusals
  plain.click(plain.all().find((n) => n.props['aria-label'] === 'Gallery')!)
  plain.flush()
  check('with nothing to lose it just goes', useAppStore.getState().section === 'gallery',
    useAppStore.getState().section)
  check('and says nothing on the way', useAppStore.getState().refusals === quiet,
    `${quiet} to ${useAppStore.getState().refusals}`)
  plain.unmount()
  useAppStore.setState({ textureEditor: null, workshopEditor: null, section: 'dashboard' })
}

function theEditorDeclaresWhatItHolds(): void {
  console.log('\n[pixel] the editor declares the work it is holding')
  seed(scenario('a mod from before the element rework').build())
  useAppStore.setState({ pendingWork: null, textureEditor: null, workshopEditor: null })

  useAppStore.getState().openTextureEditor({ textureId: null, kind: 'block' })
  const editor = renderProbe(h(PixelEditorOverlay))
  const work = (): PendingWork | null => useAppStore.getState().pendingWork
  check('an open texture editor publishes itself', !!work())
  check('and a blank, unnamed canvas is nothing to lose', work()?.has() === false,
    String(work()?.has()))

  const nameBox = editor.findAll((n) => n.type === 'input')[0]
  check('the name box is on screen', !!nameBox)
  if (nameBox) {
    editor.change(nameBox, 'copper_ore')
    editor.flush()
    check('naming it is work the project does not have yet', work()?.has() === true,
      String(work()?.has()))
  }

  editor.unmount()
  check('and it takes the flag back on the way out, or every arrow jams', work() === null,
    JSON.stringify(work()))
  useAppStore.setState({ textureEditor: null, pendingWork: null })
}

function theUpdateBar(): void {
  console.log('\n[update] the bar that offers a newer version')
  seed(SCENARIOS[0].build())
  useAppStore.setState({ bootPhase: 'ready' })
  resetBridge()

  const root = renderProbe(h(UpdateBar))
  const offer = (state: Record<string, unknown>): void => {
    emitBridge('update.state', state as never)
    root.flush()
  }

  check('nothing is shown until there is something to say', root.text().trim() === '',
    root.text())

  offer({ status: 'idle' })
  check('and an idle check says nothing either', root.text().trim() === '', root.text())

  offer({ status: 'available', version: '9.9.9' })
  check('an offered update names the version', root.text().includes('9.9.9'), root.text())

  const button = (label: string): ProbeNode | undefined =>
    root.clickable().find((n) => nodeText(n).includes(label))
  check('there is a way to save first', !!button('Save and update'))
  check('and a way to leave it until later', !!button('Update when'))
  check(
    'and no way to update that throws the open project away',
    !button('without saving'),
    'a one-click discard of unsaved work is not a choice worth offering'
  )

  const since = (mark: number): string[] => bridgeCalls.slice(mark).map((c) => c.name)

  const later = bridgeCalls.length
  root.click(button('Update when')!)
  root.flush()
  check('leaving it until later installs nothing now', !since(later).includes('update.install'),
    since(later).join(', '))
  check('and says when it will happen instead',
    root.text().toLowerCase().includes('next time you open'), root.text())

  offer({ status: 'available', version: '9.9.9' })
  check('and the same version stays put away', !button('Save and update'), root.text())

  offer({ status: 'available', version: '9.9.10' })
  check('while a newer one asks again', !!button('Save and update'), root.text())

  const saved = bridgeCalls.length
  root.click(button('Save and update')!)
  root.flush()
  const names = since(saved)
  check('saving and updating writes the project', names.includes('project.save'), names.join(', '))
  check(
    'and the save happens before the restart',
    names.indexOf('project.save') < names.indexOf('update.install') ||
      !names.includes('update.install'),
    names.join(' > ')
  )

  offer({ status: 'available', version: '9.9.11' })
  check('a release with no notes has no Why? to press', !button('Why?'), root.text())

  offer({ status: 'available', version: '9.9.12', notes: 'It stops eating your mod.' })
  const why = button('Why?')
  check('a release with notes offers one', !!why)
  check('and keeps them out of the way until asked',
    !root.text().includes('It stops eating your mod.'), root.text())
  if (why) {
    root.click(why)
    root.flush()
    check('pressing it shows what changed',
      root.text().includes('It stops eating your mod.'), root.text())
  }

  offer({ status: 'downloading', version: '9.9.12', percent: 42 })
  check('a download in progress shows how far it has got', root.text().includes('42'), root.text())
  check('and stops offering a choice that has been made', !button('Save and update'))

  offer({ status: 'installing', version: '9.9.12' })
  check('and installing says the app is about to restart',
    root.text().toLowerCase().includes('restart'), root.text())

  offer({ status: 'available', version: '9.9.13' })
  const close = root.clickable().find((n) => n.props['aria-label'] === 'Not now')
  check('it can be put away', !!close)
  if (close) {
    root.click(close)
    root.flush()
    check('and stays away once it has been', root.text().trim() === '', root.text())
  }
  root.unmount()

  useAppStore.setState({ bootPhase: 'boot' })
  const booting = renderProbe(h(UpdateBar))
  emitBridge('update.state', { status: 'available', version: '9.9.9' })
  booting.flush()
  check('and it keeps quiet while the app is still starting', booting.text().trim() === '',
    booting.text())
  booting.unmount()
  useAppStore.setState({ bootPhase: 'ready' })
}

interface FakeClock {

  advance: (ms: number) => void
  restore: () => void
}

function fakeClock(): FakeClock {
  const g = globalThis as unknown as Record<string, unknown>
  const realSet = g.setTimeout
  const realClear = g.clearTimeout
  const timers = new Map<number, { at: number; fn: () => void }>()
  let now = 0
  let nextId = 1_000_000

  g.setTimeout = (fn: () => void, ms = 0): number => {
    const id = nextId++
    timers.set(id, { at: now + ms, fn })
    return id
  }
  g.clearTimeout = (id: number): void => {
    if (timers.delete(id)) return
    ;(realClear as (h: number) => void)(id)
  }

  return {
    advance(ms: number): void {
      const until = now + ms

      for (;;) {
        let dueId = -1
        let dueAt = Infinity
        for (const [id, t] of timers) {
          if (t.at <= until && t.at < dueAt) {
            dueAt = t.at
            dueId = id
          }
        }
        if (dueId < 0) break
        const t = timers.get(dueId)!
        timers.delete(dueId)
        now = t.at
        t.fn()
      }
      now = until
    },
    restore(): void {
      g.setTimeout = realSet
      g.clearTimeout = realClear
    }
  }
}

function typedSoFar(root: ProbeRoot): string {
  const title = root.find(
    (n) => typeof n.props.className === 'string' && n.props.className.includes('pixel-title')
  )
  if (!title) return ''
  return title.children
    .filter((c) => {
      const cls = c.props?.className
      return !(typeof cls === 'string' && cls.includes('invisible'))
    })
    .map(nodeText)
    .join('')
}

function theTitleTypesWhereItCanBeSeen(): void {
  console.log('\n[dashboard] the landing title types itself, once it is on screen')
  useProjectStore.setState({ project: null, filePath: null, dirty: false })
  resetBridge()

  const WELL_PAST_THE_END = 20_000
  const WORDMARK = 'ARTEMIS'

  useAppStore.setState({ heroMode: 'choose' })

  {
    const clock = fakeClock()
    useAppStore.setState({
      bootPhase: 'boot',
      startupNoticeOpen: false,
      activeTour: null,
      reduceAnimations: false
    })
    const root = renderProbe(h(Dashboard))
    clock.advance(WELL_PAST_THE_END)
    root.flush()
    check(
      'with onboarding skipped it still holds off while the splash is up',
      typedSoFar(root) === '',
      JSON.stringify(typedSoFar(root))
    )

    useAppStore.setState({ bootPhase: 'ready' })
    root.flush()
    check(
      'and nothing has been typed at the moment it lifts',
      typedSoFar(root) === '',
      JSON.stringify(typedSoFar(root))
    )

    clock.advance(400)
    root.flush()
    const partway = typedSoFar(root)
    check(
      'then it types, rather than appearing all at once',
      partway.length > 0 && partway.length < WORDMARK.length,
      `${JSON.stringify(partway)} after 400ms`
    )

    clock.advance(WELL_PAST_THE_END)
    root.flush()
    check(
      'and it finishes the word',
      typedSoFar(root) === WORDMARK,
      JSON.stringify(typedSoFar(root))
    )
    root.unmount()
    clock.restore()
  }

  const covers: Array<[string, Record<string, unknown>]> = [
    ['the first-run notice', { startupNoticeOpen: true, activeTour: null }],
    ['the tour', { startupNoticeOpen: false, activeTour: 'welcome' }]
  ]
  for (const [what, state] of covers) {
    const clock = fakeClock()
    useAppStore.setState({ bootPhase: 'ready', reduceAnimations: false, ...state })
    const root = renderProbe(h(Dashboard))
    clock.advance(WELL_PAST_THE_END)
    root.flush()
    check(`it holds off behind ${what}`, typedSoFar(root) === '', JSON.stringify(typedSoFar(root)))

    useAppStore.setState({ startupNoticeOpen: false, activeTour: null })
    root.flush()
    clock.advance(WELL_PAST_THE_END)
    root.flush()
    check(
      `and types once ${what} is gone`,
      typedSoFar(root) === WORDMARK,
      JSON.stringify(typedSoFar(root))
    )
    root.unmount()
    clock.restore()
  }

  {
    const clock = fakeClock()
    useAppStore.setState({
      bootPhase: 'ready',
      startupNoticeOpen: false,
      activeTour: null,
      reduceAnimations: true
    })
    const root = renderProbe(h(Dashboard))
    root.flush()
    check(
      'reduced motion gets the line without waiting for it',
      typedSoFar(root) === WORDMARK,
      JSON.stringify(typedSoFar(root))
    )
    root.unmount()
    clock.restore()
  }

  useAppStore.setState({ reduceAnimations: false, bootPhase: 'ready', startupNoticeOpen: false })
}

function theGuidedTour(): void {
  console.log('\n[tour] the guided tour, end to end')
  seed(scenario('a mod from before the element rework').build())

  const anchorsOn = (make: () => ReturnType<typeof h>): string[] => {
    const root = renderProbe(make())
    const found = root
      .all()
      .map((n) => n.props['data-tour'])
      .filter((v): v is string => typeof v === 'string')
    root.unmount()
    return found
  }

  const anchorsFor = (make: () => ReturnType<typeof h>): string[] => {
    const kept = useProjectStore.getState().project
    const keptMode = useAppStore.getState().heroMode
    const found = anchorsOn(make)
    useProjectStore.setState({ project: null, filePath: null, dirty: false })
    for (const heroMode of ['choose', 'new', 'existing'] as const) {
      useAppStore.setState({ heroMode })
      found.push(...anchorsOn(make))
    }
    useAppStore.setState({ heroMode: keptMode })
    useProjectStore.setState({ project: kept, filePath: null, dirty: false })
    return found
  }
  const shell = new Set([...anchorsFor(() => h(Sidebar)), ...anchorsFor(() => h(TitleBar))])

  const overlays = new Set(
    (() => {
      const found = anchorsOn(() => h(CreateMenu, { onClose: () => {} }))
      const first = live().elements[0]
      const keptEditing = useAppStore.getState().editingId
      useAppStore.setState({ editingId: first.id })
      found.push(...anchorsOn(() => h(ElementSection, { kind: first.kind })))
      useAppStore.setState({ editingId: keptEditing })
      return found
    })()
  )

  const TOOL_SURFACES: Record<string, () => ReturnType<typeof h>> = {
    pixel: () => {
      useAppStore.getState().openTextureEditor({ textureId: null, kind: 'block' })
      return h(PixelEditorOverlay)
    },
    workshop: () => {
      const build = live().elements.find((e) => e.kind === 'tree' || e.kind === 'structure')!
      useAppStore.getState().openWorkshopEditor(build.id)
      return h(VoxelEditorOverlay)
    }
  }

  const sectionNames = new Set(SECTIONS.map(([name]) => name))
  for (const [name, steps] of Object.entries(TOURS)) {
    check(`the "${name}" tour has steps to show`, steps.length >= 3, `${steps.length}`)

    const toolAnchors = TOOL_SURFACES[name] ? anchorsOn(TOOL_SURFACES[name]) : []
    useAppStore.getState().closeTextureEditor()
    useAppStore.getState().closeWorkshopEditor()

    for (const step of steps) {
      if (step.section) {
        check(
          `the ${name} tour's "${step.id}" opens a page that exists`,
          sectionNames.has(step.section),
          step.section
        )
      }
      if (!step.anchor) continue
      const make = step.section
        ? SECTIONS.find(([n]) => n === step.section)?.[1]
        : undefined
      const onPage = new Set([
        ...shell,
        ...overlays,
        ...toolAnchors,
        ...(make ? anchorsFor(make) : [])
      ])
      check(
        `and what the ${name} tour's "${step.id}" points at is really there`,
        onPage.has(step.anchor),
        `${step.anchor} is not among: ${[...onPage].join(', ')}`
      )
    }
  }

  useAppStore.setState({
    reduceAnimations: true,
    startupNoticeOpen: false,
    bootPhase: 'ready',
    activeTour: null,
    section: 'settings',

    editingId: 'an-element-id'
  })
  fakeStorage.clear()
  resetBridge()

  const root = renderProbe(h(Tutorial))

  check('it opens itself on a machine that has not seen it', useAppStore.getState().activeTour !== null)
  check('and it says what it is showing', root.text().includes(TOUR_STEPS[0].title), root.text())
  check('and the first line is on screen', root.text().includes(TOUR_STEPS[0].body))
  check(
    'and it has opened the page the first step names',
    useAppStore.getState().section === TOUR_STEPS[0].section,
    useAppStore.getState().section
  )

  const forward = (r: ProbeRoot): ProbeNode | undefined =>
    r.clickable().find((n) => n.props['data-tour-action'] === 'primary')

  const plan = stepsFor(WELCOME_TOUR, tourWorld())

  const seen: string[] = []
  const stood: SectionId[] = []
  for (let guard = 0; guard < plan.length * 3; guard++) {
    const at = plan[seen.length]
    if (!at) break
    seen.push(root.text().includes(at.title) ? at.id : `${at.id}(missing)`)
    stood.push(useAppStore.getState().section)
    const go = forward(root)
    if (!go) break
    root.click(go)
    root.flush()
    if (useAppStore.getState().activeTour === null) break
  }
  check(
    'its button walks every step of it, in order, and stops',
    seen.join('>') === plan.map((t) => t.id).join('>'),
    seen.join(' > ')
  )
  const misplaced = plan
    .map((t, i) =>
      t.section && stood[i] !== t.section ? `${t.id} wanted ${t.section}, stood on ${stood[i]}` : ''
    )
    .filter(Boolean)
  check('and every step that names a page had opened it', misplaced.length === 0, misplaced.join('; '))
  check('and the last step closes it',
    useAppStore.getState().activeTour === null, String(useAppStore.getState().activeTour))
  check('and closing it is remembered', fakeStorage.get('artemis.tutorial.seen') === '1')
  check(
    'and it puts you back where it found you',
    useAppStore.getState().section === 'settings',
    useAppStore.getState().section
  )
  check(
    'and back onto what you had open there',
    useAppStore.getState().editingId === 'an-element-id',
    String(useAppStore.getState().editingId)
  )
  root.unmount()

  useProjectStore.setState({ project: null, filePath: null, dirty: false })
  useAppStore.setState({
    activeTour: null,
    heroMode: 'choose',
    createMenuOpen: false,
    section: 'dashboard',
    editingId: null
  })
  fakeStorage.clear()
  resetBridge()
  {
    const fresh = stepsFor(WELCOME_TOUR, tourWorld())
    check(
      'with nothing open, the tour starts by making a project',
      fresh[1]?.id === 'project' && fresh[2]?.id === 'name',
      fresh.map((t) => t.id).join(' > ')
    )
    check(
      'and it drops those two for somebody who already has one',
      fresh.length === TOUR_STEPS.length &&
        plan.length === fresh.length - 2 &&
        !plan.some((t) => t.id === 'project' || t.id === 'name'),
      `${fresh.length} steps with nothing open, ${plan.length} with a mod already open`
    )

    const bubble = renderProbe(h(Tutorial))
    const press = (): void => {
      const go = forward(bubble)
      if (go) {
        bubble.click(go)
        bubble.flush()
      }
    }
    press()
    check(
      'it stops on the New Mod door rather than talking over it',
      bubble.text().includes(fresh[1].title) && !useProjectStore.getState().project,
      bubble.text().slice(0, 90)
    )
    press()
    check(
      'its button opens that door',
      useAppStore.getState().heroMode === 'new',
      useAppStore.getState().heroMode
    )
    check(
      'and the door opening moves it on by itself',
      bubble.text().includes(fresh[2].title),
      bubble.text().slice(0, 90)
    )
    press()
    const made = useProjectStore.getState().project
    check('the next offer really makes a project', made !== null, String(made?.meta.modId))
    check(
      'and writes it out, so it is a file rather than a session',
      bridgeCalls.some((c) => c.name === 'project.save'),
      bridgeCalls.map((c) => c.name).join(', ')
    )
    check(
      'and having one moves it on to the Create button',
      bubble.text().includes(fresh[3].title),
      bubble.text().slice(0, 90)
    )

    for (let guard = 0; guard < fresh.length * 3 && useAppStore.getState().activeTour; guard++) {
      press()
    }
    check(
      'and the same button carries it the whole way out',
      useAppStore.getState().activeTour === null,
      String(useAppStore.getState().activeTour)
    )
    check(
      'having made the first block on the way',
      useProjectStore.getState().project?.elements.some((e) => e.kind === 'block') === true,
      (useProjectStore.getState().project?.elements ?? []).map((e) => e.kind).join(', ')
    )
    bubble.unmount()
  }

  seed(scenario('a mod from before the element rework').build())
  useAppStore.setState({ section: 'dashboard', editingId: null, createMenuOpen: false })

  fakeStorage.clear()
  useAppStore.setState({ activeTour: null, section: 'gallery' })
  {
    const opened = renderProbe(TOOL_SURFACES.pixel())
    check('opening the texture editor for the first time starts its tour',
      useAppStore.getState().activeTour === 'pixel', String(useAppStore.getState().activeTour))
    const bubble = renderProbe(h(Tutorial))
    check('and the bubble is the tool tour rather than the welcome one',
      bubble.text().includes(TOURS.pixel[0].title), bubble.text().slice(0, 120))
    const skip = bubble.clickable().find((n) => nodeText(n).includes('Skip'))!
    bubble.click(skip)
    bubble.flush()
    check('leaving it leaves the tool where it was',
      useAppStore.getState().section === 'gallery' && !!useAppStore.getState().textureEditor,
      `${useAppStore.getState().section}, editor ${!!useAppStore.getState().textureEditor}`)
    bubble.unmount()
    opened.unmount()

    useAppStore.getState().closeTextureEditor()
    useAppStore.setState({ activeTour: null })
    const again = renderProbe(TOOL_SURFACES.pixel())
    check('and it is not shown again on the next open',
      useAppStore.getState().activeTour === null, String(useAppStore.getState().activeTour))
    again.unmount()
    useAppStore.getState().closeTextureEditor()
  }

  fakeStorage.clear()
  useAppStore.setState({ activeTour: 'welcome' })
  {
    const opened = renderProbe(TOOL_SURFACES.workshop())
    check('a tool tour never interrupts one already running',
      useAppStore.getState().activeTour === 'welcome', String(useAppStore.getState().activeTour))
    opened.unmount()
    useAppStore.getState().closeWorkshopEditor()
    useAppStore.setState({ activeTour: null })
  }

  fakeStorage.clear()
  useAppStore.setState({ activeTour: null, section: 'dashboard' })
  const walked = renderProbe(h(Tutorial))
  const btn = (label: string): ProbeNode | undefined =>
    walked.clickable().find((n) => nodeText(n).includes(label))
  check('there is no way back from the first step', !btn('Back'))
  const first = useAppStore.getState().section
  walked.click(btn('Next')!)
  walked.flush()
  check('and one appears on the second', !!btn('Back'))
  walked.click(btn('Back')!)
  walked.flush()
  check(
    'going back returns to the first step',
    walked.text().includes(TOUR_STEPS[0].title),
    walked.text().slice(0, 120)
  )
  check('and to the page that step opens', useAppStore.getState().section === first,
    useAppStore.getState().section)
  check('and the line is already up rather than typing again',
    walked.text().includes(TOUR_STEPS[0].body))

  walked.click(walked.clickable().find((n) => nodeText(n).includes('Skip'))!)
  walked.flush()
  walked.unmount()

  useAppStore.setState({ activeTour: null })
  const second = renderProbe(h(Tutorial))
  check('a machine that has seen it is not shown it again',
    useAppStore.getState().activeTour === null, String(useAppStore.getState().activeTour))
  second.unmount()

  const untouched = JSON.stringify(useProjectStore.getState().project)
  const quietFrom = bridgeCalls.length
  fakeStorage.clear()
  useAppStore.setState({ activeTour: null, section: 'export' })
  const third = renderProbe(h(Tutorial))
  check('it offers itself again once storage is clear', useAppStore.getState().activeTour !== null)
  const skip = third.clickable().find((n) => nodeText(n).includes('Skip'))
  check('Skip is on the first step', !!skip)
  if (skip) {
    third.click(skip)
    third.flush()
    check('and it leaves at once',
      useAppStore.getState().activeTour === null, String(useAppStore.getState().activeTour))
    check('and remembers that it was shown', fakeStorage.get('artemis.tutorial.seen') === '1')
    check(
      'and skipping comes home too',
      useAppStore.getState().section === 'export',
      useAppStore.getState().section
    )
  }
  third.unmount()

  check(
    'and a tour that was skipped leaves the mod exactly as it was',
    JSON.stringify(useProjectStore.getState().project) === untouched
  )
  check(
    'and writes nothing at all on its way out',
    bridgeCalls.slice(quietFrom).every((c) => c.name === 'prefs.save'),
    bridgeCalls.slice(quietFrom).map((c) => c.name).join(', ')
  )

  const forbidden = ['export.workspace', 'test.start', 'project.saveAs']
  const loud = bridgeCalls.filter((c) => forbidden.includes(c.name)).map((c) => c.name)
  check('and it exports nothing, launches nothing and renames nothing', loud.length === 0,
    [...new Set(loud)].join(', '))

  fakeStorage.clear()
  useAppStore.setState({ activeTour: null, startupNoticeOpen: true })
  const fourth = renderProbe(h(Tutorial))
  check('it waits for the first-run notice',
    useAppStore.getState().activeTour === null, String(useAppStore.getState().activeTour))
  fourth.unmount()
  useAppStore.setState({
    startupNoticeOpen: false,
    reduceAnimations: false,
    section: 'dashboard',

    heroMode: 'choose'
  })
}

function everySectionMounts(): void {
  console.log('\n[sections] every screen the sidebar can reach')
  for (const [name, make] of SECTIONS) {
    for (const withProject of [true, false]) {
      if (withProject) seed(scenario('a mod from before the element rework').build())
      else useProjectStore.setState({ project: null, filePath: null, dirty: false })
      resetBridge()
      try {
        const root = renderProbe(make())
        check(`${name}: mounts ${withProject ? 'with a project' : 'with no project open'}`, true)
        const loud = bridgeCalls
          .filter((c) => ['project.save', 'export.workspace', 'test.start'].includes(c.name))
          .map((c) => c.name)
        check(
          `${name}: opening it does not save, export or launch anything`,
          loud.length === 0,
          [...new Set(loud)].join(', ')
        )
        root.unmount()
      } catch (e) {
        check(
          `${name}: mounts ${withProject ? 'with a project' : 'with no project open'}`,
          false,
          String(e)
        )
      }
    }
  }
}

function theSettingsScreen(): void {
  console.log('\n[sections] the settings screen')
  seed(SCENARIOS[0].build())
  const root = renderProbe(h(SettingsSection))

  const inputs = root.findAll((n) => n.type === 'input' || n.type === 'textarea')
  check('the settings screen shows the mod´s fields', inputs.length >= 4, `${inputs.length} fields`)

  const modIdField = inputs.find((n) => labelOf(root, n) === 'Mod ID')
  check('the mod id is on the screen', Boolean(modIdField))
  check(
    'and it cannot be edited, because every package path and registry key is built from it',
    Boolean(modIdField?.props.readOnly),
    JSON.stringify(modIdField?.props.readOnly)
  )

  const dead: string[] = []
  for (let i = 0; i < inputs.length; i++) {
    const field = root.findAll((n) => n.type === 'input' || n.type === 'textarea')[i]
    if (!field || field.props.readOnly) continue

    if (field.props.type === 'file') continue
    const before = JSON.stringify(live().meta)
    root.change(field, `probe value ${i}`)
    if (JSON.stringify(live().meta) === before) dead.push(labelOf(root, field))
  }
  check('every editable settings field writes to the mod', dead.length === 0, dead.join(', '))

  {
    const upload = root.clickable().find((n) => nodeText(n).includes('Upload an image'))
    check('the icon can be uploaded from the settings screen', !!upload)
    check(
      'and there is a file picker behind that button',
      root.findAll((n) => n.props.type === 'file').length === 1
    )
    check(
      'with nothing uploaded, the project holds no icon of its own',
      !live().meta.icon,
      String(live().meta.icon)
    )

    useProjectStore.setState({
      project: { ...live(), meta: { ...live().meta, icon: 'data:image/png;base64,AAAA' } }
    })
    root.flush()
    const remove = root.clickable().find((n) => nodeText(n).includes('Remove'))
    check('an uploaded icon can be removed again', !!remove)
    if (remove) {
      root.click(remove)
      root.flush()
      check('and removing it puts the mod back to having none', !live().meta.icon,
        String(live().meta.icon))
    }
  }

  resetBridge()
  const saveButton = root.find((n) => n.type === 'button' && nodeText(n).includes('Save Project'))
  check('there is a save button', Boolean(saveButton))
  if (saveButton) {
    root.click(saveButton)
    check(
      'pressing it asks the main process to write the file',
      bridgeCalls.some((c) => c.name === 'project.save'),
      bridgeCalls.map((c) => c.name).join(', ')
    )
  }
  root.unmount()
}

function theTestScreenAndItsGate(): void {
  console.log('\n[sections] the test screen')

  seed(SCENARIOS[0].build())
  useProjectStore.getState().createElement('block')
  useTestStore.setState({ phase: 'idle', running: false, exitCode: null, lines: [] })
  resetBridge()

  const gated = renderProbe(h(TestingSection))
  const run = gated.find((n) => n.type === 'button' && nodeText(n).includes('Run Client'))
  check('the test screen offers to run the client', Boolean(run))
  if (run) {
    gated.click(run)
    check(
      'a mod with unfinished work does not launch',
      !bridgeCalls.some((c) => c.name === 'test.start'),
      bridgeCalls.map((c) => c.name).join(', ')
    )
    check(
      'and the press shows what is unfinished instead',
      /unfinished|still needs|missing|placeholder/i.test(nodeText(gated.tree)),
      nodeText(gated.tree).slice(0, 400)
    )
  }
  gated.unmount()

  seed(SCENARIOS[0].build())
  const texId = useProjectStore.getState().addTexture('probe_paint', png16DataUrl(), 'block')
  for (const el of live().elements) {
    for (const slot of textureSlotsForElement(el)) {
      if (slot.paintable) useProjectStore.getState().assignTexture(slot.key, texId)
    }
  }
  useTestStore.setState({ phase: 'idle', running: false, exitCode: null, lines: [] })
  resetBridge()

  const ready = renderProbe(h(TestingSection))
  const runReady = ready.find((n) => n.type === 'button' && nodeText(n).includes('Run Client'))
  if (runReady) {
    ready.click(runReady)
    check(
      'a mod with nothing outstanding launches',
      bridgeCalls.some((c) => c.name === 'test.start'),
      bridgeCalls.map((c) => c.name).join(', ')
    )
  }

  useTestStore.getState().appendLine('> Task :compileJava')
  useTestStore.getState().appendLine('BUILD SUCCESSFUL in 4s')
  ready.flush()
  const shown = nodeText(ready.tree)
  check('lines from the run reach the screen', shown.includes('BUILD SUCCESSFUL in 4s'), shown.slice(-300))

  useTestStore.getState().setState({ phase: 'running', running: true, exitCode: null })
  ready.flush()
  check(
    'a running session offers Stop, not another Run',
    ready.find((n) => n.type === 'button' && nodeText(n).includes('Stop')) !== null &&
      ready.find((n) => n.type === 'button' && nodeText(n).includes('Run Client')) === null,
    nodeText(ready.tree).slice(0, 300)
  )
  const stop = ready.find((n) => n.type === 'button' && nodeText(n).includes('Stop'))
  if (stop) {
    resetBridge()
    ready.click(stop)
    check(
      'and pressing it asks the main process to stop the run',
      bridgeCalls.some((c) => c.name === 'test.stop'),
      bridgeCalls.map((c) => c.name).join(', ')
    )
  }
  ready.unmount()
}

function theLogRingBuffer(): void {
  console.log('\n[sections] the test log ring buffer')
  useTestStore.setState({ phase: 'idle', running: false, exitCode: null, lines: [] })
  for (let i = 0; i < 4100; i++) useTestStore.getState().appendLine(`line ${i}`)
  const lines = useTestStore.getState().lines
  check('the log is capped', lines.length <= 4000, String(lines.length))
  check('and it keeps the newest line', lines[lines.length - 1] === 'line 4099', String(lines[lines.length - 1]))
  check('and drops from the oldest end', !lines.includes('line 0'), lines[0])
  useTestStore.getState().clear()
  check('clearing empties it', useTestStore.getState().lines.length === 0)
}

function theExportScreenAndItsGate(): void {
  console.log('\n[sections] the export screen')

  seed(SCENARIOS[0].build())
  useProjectStore.getState().createElement('block')
  resetBridge()
  const gated = renderProbe(h(ExportSection))
  const build = gated.find(
    (n) => n.type === 'button' && /export|build/i.test(nodeText(n)) && !/settings/i.test(nodeText(n))
  )
  check('the export screen offers to build', Boolean(build), nodeText(gated.tree).slice(0, 200))
  if (build) {
    gated.click(build)
    check(
      'a mod with unfinished work is not exported',
      !bridgeCalls.some((c) => c.name === 'export.workspace'),
      bridgeCalls.map((c) => c.name).join(', ')
    )
    check(
      'and the press shows what is unfinished instead',
      /unfinished|still needs|missing|placeholder/i.test(nodeText(gated.tree)),
      nodeText(gated.tree).slice(0, 300)
    )

    const anyway = gated.findAll(
      (n) => n.type === 'button' && /anyway|export anyway|build anyway|continue/i.test(nodeText(n))
    )
    check(
      'there is a separate way past the list',
      anyway.length > 0,
      nodeText(gated.tree).slice(0, 400)
    )
    if (anyway.length > 0) {
      resetBridge()
      gated.click(anyway[0])
      check(
        'and taking it does export',
        bridgeCalls.some((c) => c.name === 'export.workspace'),
        bridgeCalls.map((c) => c.name).join(', ')
      )
    }
  }
  gated.unmount()

  seed(SCENARIOS[0].build())
  const texId = useProjectStore.getState().addTexture('probe_paint', png16DataUrl(), 'block')
  for (const el of live().elements) {
    for (const slot of textureSlotsForElement(el)) {
      if (slot.paintable) useProjectStore.getState().assignTexture(slot.key, texId)
    }
  }
  resetBridge()
  const ready = renderProbe(h(ExportSection))
  const buildReady = ready.find(
    (n) => n.type === 'button' && /export|build/i.test(nodeText(n)) && !/settings/i.test(nodeText(n))
  )
  if (buildReady) {
    ready.click(buildReady)
    check(
      'a mod with nothing outstanding is exported on the first press',
      bridgeCalls.some((c) => c.name === 'export.workspace'),
      bridgeCalls.map((c) => c.name).join(', ')
    )
  }
  ready.unmount()
}

function registryIsTotal(): void {
  console.log('\n[logistics] the form registry')
  const kindsInDefaults = Object.keys(KIND_DEFAULTS) as ElementKind[]
  for (const k of kindsInDefaults) {
    check(`${k}: has a form`, typeof FORM_REGISTRY[k] === 'function')
    check(`${k}: has a label`, Boolean(KIND_LABELS[k]?.label))
  }
  check(
    'the registry declares no kind the defaults do not',
    ALL_KINDS.every((k) => kindsInDefaults.includes(k)),
    ALL_KINDS.filter((k) => !kindsInDefaults.includes(k)).join(', ')
  )
}

function theBootGuardIsArmedFirst(): void {
  console.log('\n[boot] the renderer says why it did not start')
  const src = readFileSync(join(process.cwd(), 'src/renderer/src/main.tsx'), 'utf-8')
  const imports = src.split('\n').filter((l) => l.startsWith('import '))
  check('the boot guard is the first import in main.tsx, or it guards nothing',
    imports[0]?.includes('./bootGuard') === true, imports[0] ?? '(no imports)')

  const guard = readFileSync(join(process.cwd(), 'src/renderer/src/bootGuard.ts'), 'utf-8')
  check('it listens for a throw during startup', guard.includes("addEventListener('error'"))
  check('and for a rejected promise', guard.includes("addEventListener('unhandledrejection'"))
  check('and for the silent case, where nothing is drawn and nothing is said',
    /setTimeout\(/.test(guard) && guard.includes('MOUNT_DEADLINE_MS'))
  check('it builds its panel from text rather than markup, since it is printing an error',
    !guard.includes('innerHTML'), 'innerHTML would make an error message executable')
  check('and it stands down once the app is up, so it cannot paint over a working window',
    guard.includes('bootGuardMounted') && src.includes('bootGuardMounted()'))

  const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf-8')
  check('the launch is not bound to ready-to-show alone',
    main.includes('beginSession') && main.includes('READY_TO_SHOW_GRACE_MS'),
    'ready-to-show can go missing, and everything hung off it')

  const single = readFileSync(join(process.cwd(), 'src/main/singleInstance.ts'), 'utf-8')
  check('losing the lock is not the end of a launch',
    !/requestSingleInstanceLock[\s\S]{0,200}app\.exit\(0\)/.test(single),
    'exiting on a lost lock is the bug: the holder may be one nobody can see')
  check('a launch that loses the lock asks for it again rather than giving up',
    (single.match(/requestSingleInstanceLock/g) ?? []).length >= 2 && single.includes('POLL_MS'))
  check('the copy being replaced is told to save first',
    /\.\s*yield\(\)/.test(single) && main.includes('IPC.SessionYield'),
    'a takeover that skips this throws away whatever was open')
  check('and the renderer answers that with a real save',
    readFileSync(join(process.cwd(), 'src/renderer/src/App.tsx'), 'utf-8')
      .includes('onYieldRequested'),
    'nothing reaches disk if the page never hears the request')
  check('and is killed if it will not answer, since it cannot be reasoned with',
    single.includes('kill(') && single.includes('YIELD_GRACE_MS'))
  check('one that is already past answering is told apart before the lock is touched',
    single.includes('responsive(') && single.includes('BEAT_STALE_MS'),
    'requestSingleInstanceLock blocks for twenty seconds on a holder that never replies')
  check('so a launch reports it is alive on a timer, not just that it exists',
    single.includes('setInterval') && single.includes('beat'),
    'a pid says the process is listed, not that its event loop is running')
  check('the kill goes by recorded pid, never by executable name',
    single.includes('process.kill') && !/taskkill|\/IM\b/.test(single),
    'a name sweep would also kill the portable stub the running app lives inside')
  check('and main wires the takeover up rather than declaring it',
    main.includes('claimSingleInstance') && main.includes('serveTakeovers'))
}

function everyPaneArrivesTheSameWay(): void {
  console.log('\n[motion] one entrance, shared by every pane that replaces another')
  const ROOT = process.cwd()
  const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf-8')

  const PANES = [
    ['App', 'src/renderer/src/App.tsx'],
    ['the wizard', 'src/renderer/src/sections/forms/FormShell.tsx'],
    ['an element section', 'src/renderer/src/sections/ElementSection.tsx']
  ]
  for (const [what, rel] of PANES) {
    const src = read(rel)
    check(`${what} uses the shared entrance`, src.includes('PANE_ENTER'), rel)

    const sideways = src.match(/initial=\{\{[^}]*\bx:/g) ?? []
    check(`${what} no longer slides a pane in sideways`, sideways.length === 0,
      sideways.join(' | '))
  }

  const shared = read('src/renderer/src/components/ui/enter.ts')
  check('the shared entrance moves on one axis, and it is not the sideways one',
    !/\bx:\s*-?\d/.test(shared))
  check('and promises the transform up front, so the glyphs are rasterised once',
    shared.includes('willChange'), 'without it the text can be redrawn every frame, and it crawls')
}

function main(): void {
  registryIsTotal()
  everyKindMounts()
  everyFixtureElementOpens()
  promotedPieces()
  nameGuard()
  reviewSlideIsHonest()
  reviewSlideNoticesTheFix()
  theKitSwitchDeliversNinePieces()
  deleteAndClose()
  theTreeNamesEverythingOnce()
  paintingAGhostRowPromotesIt()
  everyWorkshopCardDrawsSomething()
  theGuidedTour()
  theUpdateBar()
  theTitleTypesWhereItCanBeSeen()
  theWayOutOfAnEditor()
  theWaysOutYieldToUnsavedWork()
  theEditorDeclaresWhatItHolds()
  everyPaneArrivesTheSameWay()
  theBootGuardIsArmedFirst()
  everySectionMounts()
  theSettingsScreen()
  theTestScreenAndItsGate()
  theLogRingBuffer()
  theExportScreenAndItsGate()
  everyControlIsLive()
  readingIsQuiet()

  console.log(`\n${audit.passes} checks passed, ${audit.failures} failed`)
  if (audit.failures) {
    console.log('FORMS FAIL')
    process.exit(1)
  }
  console.log('FORMS PASS')
}

main()
