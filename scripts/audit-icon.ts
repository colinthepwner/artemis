import { installCanvasShim, decodeDataUrl, pngDataUrl } from './_canvas'
import { ICON_SIZE, pickIcon, scoreIcon } from '../src/shared/iconPick'
import { harness } from './_harness'
import {
  MAX_ZOOM,
  centeredView,
  clampView,
  coverScale,
  scaleView,
  zoomAt
} from '../src/shared/imageCrop'

installCanvasShim()

const audit = harness()
const check = audit.check

const tile = (a: string, b: string): Uint8Array => decodeDataUrl(pngDataUrl(16, 16, a, b)).rgba

function speck(color: string): Uint8Array {
  const rgba = new Uint8Array(16 * 16 * 4)
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  for (let i = 0; i < 4; i++) {
    const at = i * 4
    rgba[at] = r
    rgba[at + 1] = g
    rgba[at + 2] = b
    rgba[at + 3] = 255
  }
  return rgba
}

console.log('the score')

{
  const white = scoreIcon(tile('#ffffff', '#ffffff'))
  const black = scoreIcon(tile('#000000', '#000000'))
  check('a white tile is brighter than a black one', white.brightness > black.brightness)
  check('and scores higher for it', white.score > black.score)

  const gray = scoreIcon(tile('#808080', '#808080'))
  const colorful = scoreIcon(tile('#c02020', '#20c060'))
  check('gray has no color in it', gray.color < 0.02, String(gray.color))
  check('and a two color tile has both color and variety',
    colorful.color > 0.3 && colorful.variety > 0, JSON.stringify(colorful))
  check('so the colorful one beats the gray one', colorful.score > gray.score,
    `${colorful.score} vs ${gray.score}`)

  const empty = scoreIcon(new Uint8Array(16 * 16 * 4))
  check('a blank square scores nothing at all', empty.score === 0)
  check('and nothing is not a candidate', pickIcon([{ id: 'blank', rgba: new Uint8Array(1024) }]) === null)

  const dust = scoreIcon(speck('#ffffff'))
  const painted = scoreIcon(tile('#7a5c3a', '#8b6a44'))
  check('four bright pixels lose to a whole painted tile', painted.score > dust.score,
    `${painted.score} vs ${dust.score}`)
  check('because coverage is what separates them', dust.coverage < 0.05 && painted.coverage === 1,
    `${dust.coverage} vs ${painted.coverage}`)
}

console.log('\nthe pick')

{
  const candidates = [
    { id: 'dim', rgba: tile('#1a1c22', '#202430') },
    { id: 'bright', rgba: tile('#ffd479', '#ff8a3d') },
    { id: 'speck', rgba: speck('#ffffff') }
  ]
  const best = pickIcon(candidates)
  check('the bright colorful one wins', best?.id === 'bright', JSON.stringify(best))

  const reversed = pickIcon([...candidates].reverse())
  check('and the order it was given in makes no difference', reversed?.id === best?.id)

  const twins = [
    { id: 'b-twin', rgba: tile('#ffd479', '#ff8a3d') },
    { id: 'a-twin', rgba: tile('#ffd479', '#ff8a3d') }
  ]
  check('two identical textures always give the same one', pickIcon(twins)?.id === 'a-twin')
}

console.log('\nthe framing')

{
  const S = 280

  const wide = { w: 800, h: 400 }
  const cover = coverScale(wide.w, wide.h, S)
  check('cover fills the square rather than fitting inside it', cover === S / wide.h, String(cover))
  check('and the scaled picture is at least as big as the square in both directions',
    wide.w * cover >= S - 0.001 && wide.h * cover >= S - 0.001)

  const centered = centeredView(wide.w, wide.h, S)
  check('centered leaves the same amount off each side',
    Math.abs(centered.ox - (S - wide.w * centered.scale) / 2) < 0.001, JSON.stringify(centered))
  check('and the top edge sits exactly on the square', Math.abs(centered.oy) < 0.001)

  for (const [dx, dy] of [[9999, 9999], [-9999, -9999], [400, -50]]) {
    const dragged = clampView({ ...centered, ox: centered.ox + dx, oy: centered.oy + dy }, wide.w, wide.h, S)
    const covered =
      dragged.ox <= 0.001 &&
      dragged.oy <= 0.001 &&
      dragged.ox + wide.w * dragged.scale >= S - 0.001 &&
      dragged.oy + wide.h * dragged.scale >= S - 0.001
    check(`a drag of ${dx},${dy} cannot pull the picture off the square`, covered, JSON.stringify(dragged))
  }

  check('it cannot be zoomed out past cover',
    clampView({ ...centered, scale: 0.001 }, wide.w, wide.h, S).scale === cover)
  check('and not in past the limit',
    Math.abs(clampView({ ...centered, scale: cover * 999 }, wide.w, wide.h, S).scale - cover * MAX_ZOOM) < 0.001)

  const at = { x: 90, y: 200 }
  const zoomed = zoomAt(centered, 2, at, wide.w, wide.h, S)
  const beforeX = (at.x - centered.ox) / centered.scale
  const afterX = (at.x - zoomed.ox) / zoomed.scale
  check('zooming holds the pixel under the pointer', Math.abs(beforeX - afterX) < 0.5,
    `${beforeX} vs ${afterX}`)

  const saved = scaleView(centered, S, ICON_SIZE)
  const sameFraction = Math.abs(saved.ox / (wide.w * saved.scale) - centered.ox / (wide.w * centered.scale))
  check('the saved square frames what the big one framed', sameFraction < 0.001, String(sameFraction))
  check('and it covers the icon square too',
    saved.ox <= 0.001 && saved.ox + wide.w * saved.scale >= ICON_SIZE - 0.001)

  const tall = centeredView(300, 900, S)
  check('a tall picture is covered as well',
    tall.oy <= 0.001 && tall.oy + 900 * tall.scale >= S - 0.001, JSON.stringify(tall))
  check('and it is the width that fills the square there', Math.abs(tall.ox) < 0.001)
}

console.log(`\n${audit.passes} checks passed, ${audit.failures} failed`)
console.log(audit.failures === 0 ? 'ICON PASS' : 'ICON: see above')
if (audit.failures > 0) process.exitCode = 1
