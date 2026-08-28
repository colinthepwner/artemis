import { installCanvasShim, decodeDataUrl, pngDataUrl } from './_canvas'
import { getVanillaRegistry } from '../src/shared/generator/vanilla'
import {
  FOLIAGE_TINTS,
  TINTED_BLOCKS,
  isColorless,
  multiplyPixels,
  tintTexture,
  tintVanillaArt,
  vanillaTint
} from '../src/renderer/src/components/pixel/foliageTints'
import { loadVanillaArt } from '../src/main/vanillaTextures'
import { harness } from './_harness'

installCanvasShim()

const audit = harness()
const check = audit.check
const skip = (name: string, why: string): void => console.log(`  SKIP ${name}: ${why}`)

const BTA = '8.0.1'

async function main(): Promise<void> {

  console.log('the tint table')

  {

    const registry = getVanillaRegistry(BTA)
    const fields = new Set(registry.blocks.map((b) => b.field))
    const missing = Object.keys(TINTED_BLOCKS).filter((f) => !fields.has(f))
    check('every tinted block is a real BTA constant', missing.length === 0, missing.join(', '))

    const families = new Set(Object.keys(FOLIAGE_TINTS))
    const strays = [...new Set(Object.values(TINTED_BLOCKS))].filter((f) => !families.has(f))
    check('and every one names a colormap that has a color', strays.length === 0, strays.join(', '))

    const badHex = Object.entries(FOLIAGE_TINTS).filter(([, hex]) => !/^#[0-9a-f]{6}$/.test(hex))
    check('and every color is a six-digit hex', badHex.length === 0, JSON.stringify(badHex))

    check(
      'cherry blossom is pink rather than a green guess',
      vanillaTint('LEAVES_CHERRY') === '#ffcceb'
    )
    check('a painted block is not tinted at all', vanillaTint('LOG_OAK') === undefined)
  }

  console.log('\nthe multiply itself')

  {

    const px = new Uint8ClampedArray([255, 255, 255, 255, 128, 128, 128, 255, 0, 0, 0, 0])
    check('a grayscale buffer is recognized as one', isColorless(px))
    multiplyPixels(px, '#ffcceb')
    check(
      'white takes the tint exactly',
      px[0] === 255 && px[1] === 204 && px[2] === 235,
      `${px[0]},${px[1]},${px[2]}`
    )
    check(
      'and mid gray takes half of it',
      px[4] === 128 && px[5] === 102 && px[6] === 118,
      `${px[4]},${px[5]},${px[6]}`
    )
    check('and a fully transparent pixel keeps its alpha', px[11] === 0)

    const colored = new Uint8ClampedArray([200, 40, 40, 255])
    check('painted art is not mistaken for grayscale', !isColorless(colored))
  }

  console.log('\nthe round trip through a real PNG')

  {

    const gray = pngDataUrl(16, 16, '#ffffff', '#808080')
    const out = await tintTexture(gray, FOLIAGE_TINTS.cherry)
    check('a grayscale texture comes back changed', out !== gray)
    const px = decodeDataUrl(out).rgba
    const first = [px[0], px[1], px[2]].join(',')
    check('and its white pixels are the colormap color', first === '255,204,235', first)

    const painted = pngDataUrl(16, 16, '#b03a3a', '#6e1f1f')
    const same = await tintTexture(painted, FOLIAGE_TINTS.cherry)
    check('painted art is handed back untouched', same === painted)
  }

  console.log('\nthe game jar')

  {
    let art: Awaited<ReturnType<typeof loadVanillaArt>> | null = null
    try {
      art = await loadVanillaArt(BTA)
    } catch (e) {
      art = null
      skip('extraction', `no game jar and no network (${(e as Error).message})`)
    }
    if (art && Object.keys(art.blocks).length === 0) {
      skip('extraction', 'the extractor produced nothing, so there is no jar here')
      art = null
    }
    if (art) {
      const blocks = art.blocks
      const transparent = (field: string): number => {
        const px = decodeDataUrl(blocks[field]).rgba
        let n = 0
        for (let i = 3; i < px.length; i += 4) if (px[i] === 0) n++
        return n
      }

      const leaves = Object.keys(blocks).filter((f) => f.startsWith('LEAVES_'))
      check('the jar gave up its leaves', leaves.length >= 10, `${leaves.length} found`)
      const solid = leaves.filter((f) => transparent(f) === 0)
      check('every leaf face has holes in it', solid.length === 0, `solid: ${solid.join(', ')}`)

      check('a block with no fancy twin keeps its own solid face', transparent('STONE') === 0)

      const tinted = await tintVanillaArt(art)
      const before = decodeDataUrl(blocks['LEAVES_CHERRY']).rgba
      const after = decodeDataUrl(tinted.blocks['LEAVES_CHERRY']).rgba
      check('cherry leaves come out of the jar gray', isColorless(before))
      check('and reach the studio pink', !isColorless(after))

      const holes = (px: Uint8Array): number => {
        let n = 0
        for (let i = 3; i < px.length; i += 4) if (px[i] === 0) n++
        return n
      }
      check(
        'and keep every one of their holes',
        holes(before) > 0 && holes(before) === holes(after),
        `${holes(before)} before, ${holes(after)} after`
      )

      check('a painted block is the same picture after the pass',
        tinted.blocks['LOG_OAK'] === blocks['LOG_OAK'])
      check('and the pass reports which blocks it colored',
        tinted.tints['LEAVES_CHERRY'] === FOLIAGE_TINTS.cherry)
    }
  }

  console.log(`\n${audit.passes} checks passed, ${audit.failures} failed`)
  console.log(audit.failures === 0 ? 'VANILLA ART PASS' : 'VANILLA ART: see above')
  if (audit.failures > 0) process.exitCode = 1
}

void main()
