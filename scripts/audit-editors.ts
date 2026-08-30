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
const groundOffset = (x: number, z: number): { offsetX: number; offsetY: number } => ({

  offsetX: (x + HALF) * CUBE + CUBE / 2,
  offsetY: (z + HALF) * CUBE + CUBE / 2
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
    (n) => n.type === 'div' && typeof n.props.onClick === 'function' && n.props.style?.width === (HALF * 2 + 1) * CUBE
  )
  if (!node) throw new Error('the workshop has no ground plane')
  return node
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
  const want = `translate3d(${x * CUBE}px, ${-y * CUBE - CUBE / 2}px, ${z * CUBE}px)`
  const cube = root.find((n) => n.props.style?.transform === want)
  if (!cube) return []
  return cube.children.filter((c) => typeof c.props.onClick === 'function')
}

function placingAndErasing(): void {
  console.log('\n[workshop] a click puts a block where it was aimed')
  useProjectStore.setState({
    project: projectWithBuild('structure', [{ id: 'v1', name: 'A', blocks: {} }]),
    filePath: null,
    dirty: false
  })
  const w = openWorkshop()

  const ground = groundOf(w)
  w.click(ground, { nativeEvent: groundOffset(2, -3) })
  const after = blocksOf('v1')
  check(
    'clicking the ground places one block, at the cell that was clicked',
    Object.keys(after).length === 1 && keyOf(2, 0, -3) in after,
    JSON.stringify(after)
  )
  const placedRef = after[keyOf(2, 0, -3)]

  w.click(groundOf(w), { nativeEvent: groundOffset(0, 0) })
  check(
    'a second click adds a second block and leaves the first',
    Object.keys(blocksOf('v1')).length === 2 && keyOf(2, 0, -3) in blocksOf('v1'),
    JSON.stringify(blocksOf('v1'))
  )

  w.click(groundOf(w), { nativeEvent: groundOffset(0, 0) })
  check(
    'clicking a cell that already holds that block is not an edit',
    Object.keys(blocksOf('v1')).length === 2,
    JSON.stringify(blocksOf('v1'))
  )

  w.click(groundOf(w), { nativeEvent: { offsetX: -400, offsetY: -400 } })
  check(
    'a click outside the buildable grid places nothing',
    Object.keys(blocksOf('v1')).length === 2,
    JSON.stringify(blocksOf('v1'))
  )

  const faces = facesAt(w, 0, 0, 0)
  check('the block that was placed is drawn as a cube with faces', faces.length > 0, `${faces.length} faces`)
  if (faces.length > 0) {
    w.contextMenu(faces[0])
    check(
      'right-clicking a face erases exactly that block',
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

  w.click(groundOf(w), { nativeEvent: groundOffset(1, 1) })
  w.click(groundOf(w), { nativeEvent: groundOffset(2, 2) })
  w.click(groundOf(w), { nativeEvent: groundOffset(3, 3) })
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

  w.click(groundOf(w), { nativeEvent: groundOffset(1, 1) })
  w.click(groundOf(w), { nativeEvent: groundOffset(2, 2) })
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

  w.click(groundOf(w), { nativeEvent: groundOffset(4, 4) })
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
  w.click(faces[0])

  w.click(groundOf(w), { nativeEvent: groundOffset(-3, -3) })
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
  w.click(groundOf(w), { nativeEvent: groundOffset(0, 0) })
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

async function main(): Promise<void> {
  placingAndErasing()
  undoAndRedo()
  theStackIsPerVariant()
  theEyedropper()
  theRectangularSelection()
  buildingATreeSwitchesItToBuilt()
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
