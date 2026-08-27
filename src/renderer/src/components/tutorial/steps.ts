import type { SectionId } from '@/store/appStore'

export interface TourStep {

  id: string

  title: string

  body: string

  made?: string

  section?: SectionId

  anchor?: string
}

const WELCOME: TourStep[] = [
  {
    id: 'welcome',
    title: 'A quick look around',
    section: 'dashboard',
    body: 'About a minute of it. Skip whenever you want.',
    made: 'You can open it again from the Artemis Settings menu.'
  },
  {
    id: 'project',
    title: 'Start a project',
    section: 'dashboard',
    anchor: 'dashboard-doors',
    body: 'A project is one mod. Name it, pick a BTA version, and it saves as you work.',
    made: 'Everything you make from here on lives inside it.'
  },
  {
    id: 'create',
    title: 'Create',
    section: 'dashboard',
    anchor: 'sidebar-create',
    body: 'Blocks, items, ores, mobs, biomes, trees, structures, recipes, liquids, dimensions.',
    made: 'Pick one, fill in the form, and it is in your mod.'
  },
  {
    id: 'content',
    title: 'Your mod so far',
    section: 'dashboard',
    anchor: 'sidebar-content',
    body: 'Everything you make is listed here by kind. Click one to open it again.',
    made: 'An ore asks for a block. A recipe asks for an item. You pick them off this list.'
  },
  {
    id: 'making',
    title: 'Making one',
    section: 'block',
    anchor: 'section-new',
    body: 'Every kind has a page like this one, and a form that asks what it should be.',
    made: 'Name it, pick how hard it is to break and what it drops, and it exists.'
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
    title: 'Try this one first',
    section: 'dashboard',
    body: 'Paint a texture, make a block from it, then an ore that puts that block underground.',
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
