import type { ElementKind } from '@shared/project'
import type { HeroMode, SectionId } from '@/store/appStore'

export interface TourWorld {
  hasProject: boolean

  heroMode: HeroMode
  createMenuOpen: boolean

  elementCount: number
  textureCount: number

  newest: { id: string; kind: ElementKind } | null
}

export interface TourHands {

  showSection: (section: SectionId, editingId?: string | null) => void
  setHeroMode: (mode: HeroMode) => void
  openCreateMenu: () => void
  closeCreateMenu: () => void

  startExampleProject: () => void

  createElement: (kind: ElementKind) => void
}

export interface TourGate {

  done: (w: TourWorld) => boolean

  offer: string

  run: (h: TourHands, w: TourWorld) => void
}

export interface TourStep {

  id: string

  title: string

  body: string

  made?: string

  section?: SectionId

  anchor?: string

  arrive?: (h: TourHands, w: TourWorld) => void

  gate?: TourGate

  when?: (w: TourWorld) => boolean
}

const noProject = (w: TourWorld): boolean => !w.hasProject

const WELCOME: TourStep[] = [
  {
    id: 'welcome',
    title: 'A quick look around',
    section: 'dashboard',
    body: 'A walk through the app, and you make something real on the way.',
    made: 'Skip whenever you want. It is in the Artemis Settings menu after that.'
  },
  {
    id: 'project',
    title: 'Start a project',
    section: 'dashboard',
    anchor: 'dashboard-new',
    body: 'A project is one mod. Open this door and we will fill it in together.',
    made: 'Everything you make from here on lives inside it.',
    when: noProject,

    arrive: (h) => h.setHeroMode('choose'),
    gate: {
      done: (w) => w.heroMode === 'new',
      offer: 'Open it for me',
      run: (h) => h.setHeroMode('new')
    }
  },
  {
    id: 'name',
    title: 'Name it',
    section: 'dashboard',
    anchor: 'newmod-form',
    body: 'A name, an id in lowercase, and the release of the game it is built for.',
    made: 'Create Project, and it writes itself to disk from then on.',
    when: noProject,
    gate: {
      done: (w) => w.hasProject,
      offer: 'Make one for me',
      run: (h) => h.startExampleProject()
    }
  },
  {
    id: 'create',
    title: 'Create',
    section: 'dashboard',
    anchor: 'sidebar-create',
    body: 'Blocks, items, ores, mobs, biomes, trees, structures, recipes, liquids, dimensions.',
    made: 'Open it and pick one.',
    gate: {
      done: (w) => w.createMenuOpen,
      offer: 'Open it for me',
      run: (h) => h.openCreateMenu()
    }
  },
  {

    id: 'pick',
    title: 'Pick a block',
    anchor: 'create-block',
    body: 'A solid block is the shortest road to something you can stand on in the game.',
    made: 'Any of them works. What comes after is the same shape for all of them.',
    gate: {

      done: (w) => !w.createMenuOpen && w.elementCount > 0,
      offer: 'Make one for me',
      run: (h) => h.createElement('block')
    }
  },
  {
    id: 'wizard',
    title: 'Filling it in',
    anchor: 'wizard-rail',
    body: 'Categories down the side, one screen at a time, and it keeps what you type.',
    made: 'What it is made of, how hard it is to break, and what it drops when you do.',
    arrive: (h, w) => {
      h.closeCreateMenu()
      if (w.newest) h.showSection(w.newest.kind, w.newest.id)
    }
  },
  {

    id: 'content',
    title: 'Your mod so far',
    anchor: 'sidebar-content',
    body: 'Everything you make is listed here by kind. Click one to open it again.',
    made: 'An ore asks for a block. A recipe asks for an item. You pick them off this list.'
  },
  {
    id: 'gallery',
    title: 'The Gallery',
    section: 'gallery',
    anchor: 'gallery-new',
    body: 'Textures are painted here, sixteen by sixteen, from scratch or from a stencil.',
    made: 'A block can wear one all over, or a different one on the top, sides and bottom.'
  },
  {
    id: 'workshop',
    title: 'The Workshop',
    section: 'workshop',
    anchor: 'workshop-new',
    body: 'Trees and structures are built here, block by block, out of blocks you have made.',
    made: 'Tell a tree which biomes it grows in and the world grows it for you.'
  },
  {
    id: 'icon',
    title: 'The mod itself',
    section: 'settings',
    anchor: 'settings-icon',
    body: 'Name, version, authors, and the icon people see before they read any of it.',
    made: 'Upload a picture and frame it, or let it wear the best texture you have painted.'
  },
  {
    id: 'test',
    title: 'Test',
    section: 'test',
    anchor: 'test-run',
    body: 'This builds your mod and opens the game with it already installed.',
    made: 'Change a number, run it again, go and stand in front of the block.'
  },
  {
    id: 'export',
    title: 'Export',
    section: 'export',
    anchor: 'export-run',
    body: 'This turns your project into a mod file you can hand to somebody.',
    made: 'It runs like any other BTA mod.'
  },
  {
    id: 'finish',
    title: 'Try this next',
    section: 'dashboard',
    body: 'Paint a texture, hang it on the block you just made, then an ore that buries it.',
    made: 'Then a recipe that turns nine of them back into the block.'
  }
]

const PIXEL: TourStep[] = [
  {
    id: 'canvas',
    title: 'Sixteen by sixteen',
    anchor: 'pixel-canvas',
    body: 'Drag to paint. That square is the whole of what a block wears in the game.',
    made: 'X mirrors as you paint, and Ctrl+Z takes back anything you regret.'
  },
  {
    id: 'layers',
    title: 'Layers',
    anchor: 'pixel-layers',
    body: 'Keep the outline on one and the shading on another, and change either alone.',
    made: 'There is a light you can drag around the canvas and bake into the pixels.'
  },
  {
    id: 'save',
    title: 'Saving it',
    anchor: 'pixel-save',
    body: 'This puts the texture in your Gallery, and onto the face you opened it from.',
    made: 'It is kept in the project file with its layers, so you can come back to it.'
  }
]

const WORKSHOP: TourStep[] = [
  {
    id: 'palette',
    title: 'Pick a block, then build',
    anchor: 'workshop-palette',
    body: 'Click to place one, right click to take one away, drag to turn the camera.',
    made: 'The blocks on offer are yours and the ones in the game, mixed together.'
  },
  {
    id: 'variants',
    title: 'Variants',
    anchor: 'workshop-variants',
    body: 'Several builds of the same thing. The world picks one of them at random.',
    made: 'Three rough versions of a tree read as a forest instead of as a stamp.'
  },
  {
    id: 'slice',
    title: 'Working inside',
    anchor: 'workshop-slice',
    body: 'Slice hides everything above a height, so you can build under a roof you made.',
    made: 'Done closes this. The build is kept as you go, so there is nothing to save.'
  }
]

export const TOURS: Record<string, TourStep[]> = {
  welcome: WELCOME,
  pixel: PIXEL,
  workshop: WORKSHOP
}

export const WELCOME_TOUR = 'welcome'

export function stepsFor(tour: string, world: TourWorld): TourStep[] {
  return (TOURS[tour] ?? []).filter((s) => !s.when || s.when(world))
}
