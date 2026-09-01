import './_studio-env'
import { installCanvasShim } from './_canvas'
import { renderProbe, nodeText, h, liveProject, type ProbeNode, type ProbeRoot } from './_react-probe'
import { useProjectStore } from '../src/renderer/src/store/projectStore'
import { useAppStore } from '../src/renderer/src/store/appStore'
import { VoxelEditorOverlay } from '../src/renderer/src/components/workshop/VoxelEditor'
import {
  PixelEditorOverlay,
  rectBetween,
  insideMarquee,
  liftFrom,
  withMarquee,
  undoDropsTheCarry,
  type Marquee
} from '../src/renderer/src/components/pixel/PixelEditor'
import { HALF, keyOf } from '../src/renderer/src/components/workshop/voxel'
import { createEmptyProject, type ArtemisProject } from '../src/shared/project'
import { KIND_DEFAULTS, type BuildVariant } from '../src/shared/generator/props'
import { harness } from './_harness'

installCanvasShim()

const audit = harness()
const check = audit.check

const CUBE = 34

const GROUND_RES = 2
const groundOffset = (x: number, z: number): { offsetX: number; offsetY: number } => ({

  offsetX: ((x + HALF) * CUBE + CUBE / 2) * GROUND_RES,
  offsetY: ((z + HALF) * CUBE + CUBE / 2) * GROUND_RES
})

let seq = 0
function projectWithBuild(kind: 'tree' | 'structure', variants: BuildVariant[]): ArtemisProject {
  const project = createEmptyProject('editors', 'editors')
  project.meta.authors = ['Colin']
  project.elements.push({
    id: `e${seq++}`,
    kind,
    name: `subject_${kind}`,
    properties: {
      ...(KIND_DEFAULTS[kind] ?? {}),
      displayName: 'Subject',
      variants,
      ...(kind === 'tree' ? { design: 'grown' } : {})
    },
    createdAt: '2026-08-27T00:00:00Z',
    updatedAt: '2026-08-27T00:00:00Z'
  })
  return project
}

const live = liveProject

const subject = (): { id: string; variants: BuildVariant[]; design?: string } => {
  const el = live().elements[0]
  return {
    id: el.id,
    variants: (el.properties['variants'] as BuildVariant[]) ?? [],
    design: el.properties['design'] as string | undefined
  }
}

const blocksOf = (variantId: string): Record<string, string> =>
  subject().variants.find((v) => v.id === variantId)?.blocks ?? {}

function openWorkshop(): ProbeRoot {
  const el = live().elements[0]
  useAppStore.getState().openWorkshopEditor(el.id)
  return renderProbe(h(VoxelEditorOverlay))
}

const groundOf = (root: ProbeRoot): ProbeNode => {
  const node = root.find(
    (n) =>
      n.type === 'div' &&
      typeof n.props.onContextMenu === 'function' &&
      n.props.style?.width === (HALF * 2 + 1) * CUBE * GROUND_RES
  )
  if (!node) throw new Error('the workshop has no ground plane')
  return node
}

const buildOnGround = (root: ProbeRoot, x: number, z: number): void => {
  root.contextMenu(groundOf(root), { nativeEvent: groundOffset(x, z) })
}

const buttonTitled = (root: ProbeRoot, title: string): ProbeNode => {
  const node = root.find((n) => n.type === 'button' && String(n.props.title ?? '').startsWith(title))
  if (!node) {
    throw new Error(
      `no button titled "${title}" in [${root
        .findAll((n) => n.type === 'button')
        .map((n) => String(n.props.title ?? nodeText(n).trim()))
        .join(' | ')}]`
    )
  }
  return node
}

function facesAt(root: ProbeRoot, x: number, y: number, z: number): ProbeNode[] {
  const s = CUBE
  const centers = [
    [x * s, -(y * s + s), z * s],
    [x * s, -(y * s), z * s],
    [x * s, -(y * s + s / 2), z * s + s / 2],
    [x * s, -(y * s + s / 2), z * s - s / 2],
    [x * s + s / 2, -(y * s + s / 2), z * s],
    [x * s - s / 2, -(y * s + s / 2), z * s]
  ].map(([cx, cy, cz]) => `translate3d(${cx}px, ${cy}px, ${cz}px)`)
  return root.findAll(
    (n) =>
      typeof n.props.onClick === 'function' &&
      typeof n.props.onContextMenu === 'function' &&
      centers.some((c) => String(n.props.style?.transform ?? '').startsWith(c))
  )
}

const faceMiddle = { nativeEvent: { offsetX: CUBE * 2, offsetY: CUBE * 2 } }

function placingAndErasing(): void {
  console.log('\n[workshop] a click puts a block where it was aimed')
  useProjectStore.setState({
    project: projectWithBuild('structure', [{ id: 'v1', name: 'A', blocks: {} }]),
    filePath: null,
    dirty: false
  })
  const w = openWorkshop()

  buildOnGround(w, 2, -3)
  const after = blocksOf('v1')
  check(
    'right-clicking the ground places one block, at the cell that was clicked',
    Object.keys(after).length === 1 && keyOf(2, 0, -3) in after,
    JSON.stringify(after)
  )
  const placedRef = after[keyOf(2, 0, -3)]

  buildOnGround(w, 0, 0)
  check(
    'a second click adds a second block and leaves the first',
    Object.keys(blocksOf('v1')).length === 2 && keyOf(2, 0, -3) in blocksOf('v1'),
    JSON.stringify(blocksOf('v1'))
  )

  buildOnGround(w, 0, 0)
  check(
    'clicking a cell that already holds that block is not an edit',
    Object.keys(blocksOf('v1')).length === 2,
    JSON.stringify(blocksOf('v1'))
  )

  w.contextMenu(groundOf(w), { nativeEvent: { offsetX: -400, offsetY: -400 } })
  check(
    'a click outside the buildable grid places nothing',
    Object.keys(blocksOf('v1')).length === 2,
    JSON.stringify(blocksOf('v1'))
  )

  const faces = facesAt(w, 0, 0, 0)
  check('the block that was placed is drawn with faces', faces.length > 0, `${faces.length} faces`)
  if (faces.length > 0) {
    w.click(faces[0], faceMiddle)
    check(
      'left-clicking a face breaks exactly that block',
      !(keyOf(0, 0, 0) in blocksOf('v1')) && keyOf(2, 0, -3) in blocksOf('v1'),
      JSON.stringify(blocksOf('v1'))
    )
  }

  check('the block placed is a real reference', Boolean(placedRef), String(placedRef))
  w.unmount()
}

function undoAndRedo(): void {
  console.log('\n[workshop] undo takes back one edit, and only one')
  useProjectStore.setState({
    project: projectWithBuild('structure', [
      { id: 'v1', name: 'A', blocks: {} },
      { id: 'v2', name: 'B', blocks: {} }
    ]),
    filePath: null,
    dirty: false
  })
  const w = openWorkshop()

  buildOnGround(w, 1, 1)
  buildOnGround(w, 2, 2)
  buildOnGround(w, 3, 3)
  check('three clicks, three blocks', Object.keys(blocksOf('v1')).length === 3, JSON.stringify(blocksOf('v1')))

  w.click(buttonTitled(w, 'Undo'))
  check(
    'one undo takes back exactly one block, the last one',
    Object.keys(blocksOf('v1')).length === 2 && !(keyOf(3, 0, 3) in blocksOf('v1')),
    JSON.stringify(blocksOf('v1'))
  )

  w.click(buttonTitled(w, 'Redo'))
  check(
    'redo puts back exactly what undo took',
    Object.keys(blocksOf('v1')).length === 3 && keyOf(3, 0, 3) in blocksOf('v1'),
    JSON.stringify(blocksOf('v1'))
  )

  for (let i = 0; i < 8; i++) w.click(buttonTitled(w, 'Undo'))
  check(
    'undoing past the first edit empties the build and stops there',
    Object.keys(blocksOf('v1')).length === 0,
    JSON.stringify(blocksOf('v1'))
  )
  for (let i = 0; i < 8; i++) w.click(buttonTitled(w, 'Redo'))
  check(
    'redoing past the last edit puts everything back and stops there',
    Object.keys(blocksOf('v1')).length === 3,
    JSON.stringify(blocksOf('v1'))
  )
  w.unmount()
}

function theStackIsPerVariant(): void {
  console.log('\n[workshop] the undo stack belongs to the variant, not the editor')
  useProjectStore.setState({
    project: projectWithBuild('structure', [
      { id: 'v1', name: 'A', blocks: {} },
      { id: 'v2', name: 'B', blocks: {} }
    ]),
    filePath: null,
    dirty: false
  })
  const w = openWorkshop()

  buildOnGround(w, 1, 1)
  buildOnGround(w, 2, 2)
  check('two blocks in the first variant', Object.keys(blocksOf('v1')).length === 2)

  const row = w.find((n) => n.type === 'button' && nodeText(n).includes('B'))
  check('the second variant has a row to click', Boolean(row))
  if (!row) return
  w.click(row)

  w.click(buttonTitled(w, 'Undo'))
  check(
    'undo in a variant with nothing to undo does nothing',
    Object.keys(blocksOf('v2')).length === 0,
    JSON.stringify(blocksOf('v2'))
  )
  check(
    'and does not reach into the variant that does have history',
    Object.keys(blocksOf('v1')).length === 2,
    JSON.stringify(blocksOf('v1'))
  )

  buildOnGround(w, 4, 4)
  check('a block in the second variant', Object.keys(blocksOf('v2')).length === 1, JSON.stringify(blocksOf('v2')))

  w.click(buttonTitled(w, 'Undo'))
  check(
    'undo in the second variant takes back the second variant´s edit',
    Object.keys(blocksOf('v2')).length === 0,
    JSON.stringify(blocksOf('v2'))
  )
  check(
    'and leaves the first variant alone',
    Object.keys(blocksOf('v1')).length === 2,
    JSON.stringify(blocksOf('v1'))
  )
  w.unmount()
}

function theEyedropper(): void {
  console.log('\n[workshop] picking a block off the build')
  const first = 'block:STONE'
  const second = 'block:SAND'
  useProjectStore.setState({
    project: projectWithBuild('structure', [
      {
        id: 'v1',
        name: 'A',

        blocks: { [keyOf(0, 0, 0)]: first, [keyOf(2, 0, 0)]: second }
      }
    ]),
    filePath: null,
    dirty: false
  })
  const w = openWorkshop()

  w.click(buttonTitled(w, 'Pick block'))
  const faces = facesAt(w, 0, 0, 0)
  check('the block to pick from is on screen', faces.length > 0)
  if (faces.length === 0) return
  w.click(faces[0], faceMiddle)

  buildOnGround(w, -3, -3)
  const placed = blocksOf('v1')[keyOf(-3, 0, -3)]
  check(
    'the next block placed is the one that was picked',
    placed === first,
    `placed ${String(placed)}, picked ${first}`
  )
  check(
    'and picking put the tool back to placing, so the click built instead of picking again',
    Object.keys(blocksOf('v1')).length === 3,
    JSON.stringify(blocksOf('v1'))
  )
  w.unmount()
}

function buildingATreeSwitchesItToBuilt(): void {
  console.log('\n[workshop] building in a grown tree')
  useProjectStore.setState({
    project: projectWithBuild('tree', [{ id: 'v1', name: 'A', blocks: {} }]),
    filePath: null,
    dirty: false
  })
  check('the tree starts on its grown shape', subject().design === 'grown', String(subject().design))
  const w = openWorkshop()
  buildOnGround(w, 0, 0)
  check(
    'the first block built switches the tree to its built shape',
    subject().design === 'built',
    String(subject().design)
  )
  check('and the block is in the variant', Object.keys(blocksOf('v1')).length === 1)
  w.unmount()
}

async function settle(root: ProbeRoot): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve()
  root.flush()
}

function openPixelEditor(state: {
  textureId: string | null
  assignSlotAfter?: string
  kind?: 'block' | 'item'
  suggestedName?: string
}): ProbeRoot {
  useAppStore.getState().openTextureEditor(state)
  return renderProbe(h(PixelEditorOverlay))
}

const layerRows = (root: ProbeRoot): ProbeNode[] =>
  root.findAll(
    (n) =>
      typeof n.props.title === 'string' &&
      n.props.title.startsWith('Click to select, click again to rename')
  )

async function theLayerStack(): Promise<void> {
  console.log('\n[pixel] the layer stack and its undo')
  const project = createEmptyProject('editors', 'editors')
  project.meta.authors = ['Colin']
  useProjectStore.setState({ project, filePath: null, dirty: false })

  const root = openPixelEditor({ textureId: null, kind: 'block', suggestedName: 'probe_art' })
  await settle(root)

  const before = layerRows(root).length
  check('a new texture opens with a layer to paint on', before >= 1, `${before} rows`)

  const add = root.find(
    (n) => n.type === 'button' && String(n.props.title ?? '').startsWith('Add layer')
  )
  check('there is a way to add a layer', Boolean(add))
  if (!add) {
    root.unmount()
    return
  }
  root.click(add)
  check('adding a layer adds a row', layerRows(root).length === before + 1, `${layerRows(root).length} rows`)

  const undo = root.find(
    (n) => n.type === 'button' && /undo/i.test(String(n.props.title ?? ''))
  )
  check('the editor has an undo button', Boolean(undo))
  if (undo) {
    root.click(undo)
    check(
      'undo takes the added layer back off the stack',
      layerRows(root).length === before,
      `${layerRows(root).length} rows`
    )
    const redo = root.find(
      (n) => n.type === 'button' && /redo/i.test(String(n.props.title ?? ''))
    )
    if (redo) {
      root.click(redo)
      check(
        'redo puts it back',
        layerRows(root).length === before + 1,
        `${layerRows(root).length} rows`
      )
    }
  }
  root.unmount()
}

async function savingLandsInTheSlotItWasAimedAt(): Promise<void> {
  console.log('\n[pixel] saving into the slot the editor was opened for')
  const project = createEmptyProject('editors', 'editors')
  project.meta.authors = ['Colin']
  project.elements.push({
    id: 'blk1',
    kind: 'block',
    name: 'probe_block',
    properties: { ...(KIND_DEFAULTS.block ?? {}), displayName: 'Probe Block' },
    createdAt: '2026-08-27T00:00:00Z',
    updatedAt: '2026-08-27T00:00:00Z'
  })
  useProjectStore.setState({ project, filePath: null, dirty: false })

  const slot = 'block/probe_block'
  const root = openPixelEditor({
    textureId: null,
    kind: 'block',
    assignSlotAfter: slot,
    suggestedName: 'probe_block'
  })
  await settle(root)

  const save = root.find((n) => n.type === 'button' && nodeText(n).includes('Save Texture'))
  check('the editor has a save button', Boolean(save))
  if (!save) {
    root.unmount()
    return
  }
  root.click(save)

  const saved = live().textures
  check('saving adds one texture to the library', saved.length === 1, `${saved.length} textures`)
  check(
    'and it keeps the name the editor was opened with',
    saved[0]?.name === 'probe_block',
    String(saved[0]?.name)
  )
  check(
    'and its layer stack is kept, so the next open is an edit and not a redraw',
    (saved[0]?.layers?.length ?? 0) >= 1,
    JSON.stringify(saved[0]?.layers?.map((l) => l.name))
  )
  check(
    'and the slot the editor was aimed at now holds it',
    live().textureAssignments[slot] === saved[0]?.id,
    JSON.stringify(live().textureAssignments)
  )
  check('saving closes the editor', useAppStore.getState().textureEditor === null)
  root.unmount()
}

function theRectangularSelection(): void {
  console.log('\n[pixel] the rectangular selection')

  const downRight = rectBetween(2 * 16 + 3, 5 * 16 + 7)
  const upLeft = rectBetween(5 * 16 + 7, 2 * 16 + 3)
  check(
    'a rectangle is the same one dragged from either corner',
    JSON.stringify(downRight) === JSON.stringify(upLeft),
    `${JSON.stringify(downRight)} vs ${JSON.stringify(upLeft)}`
  )
  check(
    'and it covers both corners rather than the gap between them',
    downRight.left === 3 && downRight.top === 2 && downRight.w === 5 && downRight.h === 4,
    JSON.stringify(downRight)
  )

  const grid = Array(256).fill('') as string[]
  grid[1 * 16 + 1] = '#ff0000'
  grid[1 * 16 + 2] = '#00ff00'
  grid[2 * 16 + 1] = '#0000ff'
  grid[2 * 16 + 2] = '#ffffff'

  const sel: Marquee = { left: 1, top: 1, w: 2, h: 2, lifted: null, dx: 0, dy: 0 }
  const lifted = liftFrom(grid, sel)
  check(
    'lifting takes the pixels under the selection, in reading order',
    lifted.join(',') === '#ff0000,#00ff00,#0000ff,#ffffff',
    lifted.join(',')
  )

  const unmoved = withMarquee(grid, { ...sel, lifted })
  check(
    'putting it straight back down changes nothing at all',
    unmoved.join('|') === grid.join('|')
  )

  const moved = withMarquee(grid, { ...sel, lifted, dx: 5, dy: 3 })
  check(
    'moving it empties where it came from',
    [1 * 16 + 1, 1 * 16 + 2, 2 * 16 + 1, 2 * 16 + 2].every((i) => moved[i] === ''),
    'something was left behind'
  )
  check(
    'and lands the whole block where it was taken to',
    moved[4 * 16 + 6] === '#ff0000' &&
      moved[4 * 16 + 7] === '#00ff00' &&
      moved[5 * 16 + 6] === '#0000ff' &&
      moved[5 * 16 + 7] === '#ffffff',
    'the block did not arrive intact'
  )
  check(
    'and touches nothing else on the layer',
    moved.filter((c) => c !== '').length === 4,
    `${moved.filter((c) => c !== '').length} painted cells, expected 4`
  )

  const offEdge = withMarquee(grid, { ...sel, lifted, dx: 14, dy: 0 })
  check(
    'a block dragged off the edge loses what went over it',
    offEdge[1 * 16 + 15] === '#ff0000' && offEdge.filter((c) => c !== '').length === 2,
    `${offEdge.filter((c) => c !== '').length} painted cells, expected 2`
  )
  check(
    'and nothing wraps around to the far side',
    offEdge[2 * 16 + 0] === '' && offEdge[1 * 16 + 0] === '',
    'a pixel came back on the other edge'
  )

  check(
    'undoing a carried selection undoes the carry rather than the history',
    undoDropsTheCarry({ ...sel, lifted, dx: 3, dy: 0 }) &&
      undoDropsTheCarry({ ...sel, lifted, dx: 0, dy: -2 }),
    'a moved selection did not claim the undo'
  )
  check(
    'a selection that has not been carried leaves the history alone',
    !undoDropsTheCarry({ ...sel, lifted, dx: 0, dy: 0 }) &&
      !undoDropsTheCarry({ ...sel, lifted: null, dx: 4, dy: 4 }) &&
      !undoDropsTheCarry(null),
    'an unmoved selection swallowed an undo'
  )

  const carried: Marquee = { ...sel, lifted, dx: 5, dy: 3 }
  check(
    'a moved selection is grabbed where it now sits',
    insideMarquee(carried, 4 * 16 + 6) && insideMarquee(carried, 5 * 16 + 7),
    'the moved selection could not be picked up again'
  )
  check(
    'and no longer where it was drawn',
    !insideMarquee(carried, 1 * 16 + 1),
    'the empty source still answers to a grab'
  )
}

function theProjectStack(): void {
  console.log('\n[project] one undo stack behind the sidebar and the forms')
  const store = (): ReturnType<typeof useProjectStore.getState> => useProjectStore.getState()
  const names = (): string[] => (store().project?.elements ?? []).map((e) => e.name)
  const groups = (): string[] => (store().project?.groups ?? []).map((g) => g.name)

  store().newProject('Undo Test', 'undotest')
  check('a new project has nothing to undo', !store().canUndo && !store().canRedo, 'stack not empty')

  const a = store().createElement('block')

  const b = store().createElement('block')
  check('two elements exist', names().length === 2, names().join())

  store().undo()
  check('undo takes back the second element only', names().length === 1, names().join())
  store().undo()
  check('a second undo takes back the first', names().length === 0, names().join())
  check('and then there is nothing left to undo', !store().canUndo, 'still offering an undo')

  store().undo()
  check('undoing past the start is harmless', names().length === 0, names().join())

  store().redo()
  store().redo()
  check('redo puts both back', names().length === 2, names().join())
  check('and then there is nothing left to redo', !store().canRedo, 'still offering a redo')

  const g = store().createGroup('Ores')
  store().setElementGroup(a, g)
  store().setElementGroup(b, g)
  check('both elements joined the group', membersOf(g).length === 2, JSON.stringify(membersOf(g)))

  store().undo()
  check('undo takes an element back out of a group', membersOf(g).length === 1, JSON.stringify(membersOf(g)))
  store().undo()
  store().undo()
  check('undo removes the group itself', groups().length === 0, groups().join())

  store().redo()
  store().redo()
  store().redo()
  check('redo rebuilds the group and its members', groups().length === 1 && membersOf(g).length === 2, groups().join())

  const before = names()[0]
  for (const name of ['R', 'Ru', 'Rub', 'Ruby']) store().updateElement(a, { name })
  check('the rename landed', names().includes('Ruby'), names().join())
  store().undo()
  check(
    'one undo takes back the whole typed word, not one letter',
    names().includes(before) && !names().includes('Ruby'),
    names().join()
  )

  store().updateElement(a, { name: 'One' })
  store().updateElement(b, { name: 'Two' })
  store().undo()
  check(
    'renaming a different element starts its own step',
    names().includes('One') && !names().includes('Two'),
    names().join()
  )

  store().updateElement(a, { name: 'Three' })
  store().removeElement(b)
  check('the element is gone', names().length === 1, names().join())
  store().undo()
  check('undo brings back a deleted element on its own step', names().length === 2, names().join())

  store().undo()
  check('there is a redo waiting', store().canRedo, 'no redo offered')
  store().createElement('block')
  check('editing after an undo drops the redo', !store().canRedo, 'redo survived a new edit')

  store().newProject('Second', 'second')
  check('opening a project clears the history', !store().canUndo && !store().canRedo, 'history survived a load')

  useProjectStore.setState({ dirty: false })
  store().createElement('block')
  store().undo()
  check('an undo leaves the project needing a save', store().dirty, 'undo left the project clean')

  store().closeProject()
}

function membersOf(groupId: string): string[] {
  const found = (useProjectStore.getState().project?.groups ?? []).find((g) => g.id === groupId)
  return found ? found.members : []
}

function actionsThatChangeNothingChangeNothing(): void {
  console.log('\n[project] an action with nothing to do touches nothing')
  const store = (): ReturnType<typeof useProjectStore.getState> => useProjectStore.getState()
  store().newProject('No Ops', 'no_ops')
  const held = store().createElement('block')
  const group = store().createGroup('Group')

  const nothing: [string, () => void][] = [
    ['clearing a code override that was never set', () => store().setCodeOverride('Foo.java', null)],
    ['editing an element that is not there', () => store().updateElement('nope', { name: 'x' })],
    ['deleting an element that is not there', () => store().removeElement('nope')],
    ['duplicating an element that is not there', () => void store().duplicateElement('nope')],
    ['editing a group that is not there', () => store().updateGroup('nope', { name: 'x' })],
    ['deleting a group that is not there', () => store().removeGroup('nope')],
    ['grouping an element that is not there', () => store().setElementGroup('nope', group)],
    ['ungrouping an element that was never grouped', () => store().setElementGroup(held, null)],
    ['reordering inside a group that is not there', () => store().moveInGroup('nope', 0, 1)],
    ['moving a group to where it already is', () => store().moveGroup(0, 0)],
    ['editing a texture that is not there', () => store().updateTexture('nope', { name: 'x' })],
    ['promoting from an element that is not there', () => void store().promoteGenerated('nope', 'x')]
  ]

  for (const [what, run] of nothing) {
    const before = store().project
    useProjectStore.setState({ dirty: false })
    run()
    const after = store().project
    check(
      what,
      after === before && !store().dirty,
      after === before ? 'it marked the project unsaved' : 'it replaced the project'
    )
  }

  store().undo()
  check(
    'the first undo takes back the group, not a no-op',
    (store().project?.groups ?? []).length === 0,
    JSON.stringify(store().project?.groups)
  )
  store().undo()
  check(
    'the second takes back the element',
    (store().project?.elements ?? []).length === 0,
    JSON.stringify((store().project?.elements ?? []).map((e) => e.name))
  )
  check('and the stack is empty, with nothing left over', !store().canUndo, 'a step survived')

  store().closeProject()
}

async function main(): Promise<void> {
  placingAndErasing()
  undoAndRedo()
  theStackIsPerVariant()
  theEyedropper()
  theRectangularSelection()
  buildingATreeSwitchesItToBuilt()
  theProjectStack()
  actionsThatChangeNothingChangeNothing()
  await theLayerStack()
  await savingLandsInTheSlotItWasAimedAt()

  console.log(`\n${audit.passes} checks passed, ${audit.failures} failed`)
  if (audit.failures) {
    console.log('EDITORS FAIL')
    process.exit(1)
  }
  console.log('EDITORS PASS')
}

void main()
