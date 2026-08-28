import { installCanvasShim, decodeDataUrl } from './_canvas'

installCanvasShim()

import {
  TEXTURE_PRESETS,
  GRID_SIZE,
  gridToDataUrl,
  rgbaToDataUrl,
  dataUrlToGrid,
  mix,
  type Grid
} from '../src/renderer/src/components/pixel/presets'
import {
  adjustedGrid,
  compositeLayers,
  bakeLighting,
  mergePair,
  applyDirectionalShading,
  DEFAULT_FX,
  type LitLayer
} from '../src/renderer/src/components/pixel/effects'
import {
  STENCILS,
  defaultParams,
  previewStencil,
  type StencilInput
} from '../src/renderer/src/components/pixel/stencils'
import {
  generateKitTextures,
  suggestKitAccent,
  DEFAULT_KIT_ACCENT
} from '../src/renderer/src/components/pixel/kitGenerator'
import { useProjectStore } from '../src/renderer/src/store/projectStore'
import { TOOL_KINDS, ARMOR_KINDS, kitFamily } from '../src/shared/generator/family'
import { textureSlotsFor } from '../src/shared/generator/textures'
import { ITEM_DEFAULTS } from '../src/shared/generator/props'
import { harness } from './_harness'

const audit = harness()
const check = audit.check

async function main(): Promise<void> {
  const HEX = /^#[0-9a-f]{6}$/
  const painted = (g: Grid): number => g.filter(Boolean).length
  const sameGrid = (a: Grid, b: Grid): boolean => a.length === b.length && a.every((c, i) => c === b[i])

  function testGrid(color = '#4a8fd8'): Grid {
    const g: Grid = Array(256).fill('')
    for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) g[y * 16 + x] = color
    g[0] = '#ffffff'
    g[255] = '#1b1b1b'
    g[8 * 16 + 8] = ''
    g[3] = '#d85555'
    return g
  }

  console.log('the shim itself (a codec that lies proves nothing)')

  {

    const grid: Grid = Array(256).fill('')
    const alpha: number[] = Array(256).fill(0)
    for (let i = 0; i < 256; i++) {
      grid[i] = `#${i.toString(16).padStart(2, '0')}${(255 - i).toString(16).padStart(2, '0')}80`

      alpha[i] = (i + 1) / 256
    }
    const decoded = decodeDataUrl(rgbaToDataUrl(grid, alpha))
    check('shim png is 16x16', decoded.width === 16 && decoded.height === 16)
    let rgbOk = true
    let alphaOk = true
    for (let i = 0; i < 256; i++) {
      if (decoded.rgba[i * 4] !== i || decoded.rgba[i * 4 + 1] !== 255 - i || decoded.rgba[i * 4 + 2] !== 0x80) {
        rgbOk = false
      }
      if (decoded.rgba[i * 4 + 3] !== Math.round(alpha[i] * 255)) alphaOk = false
    }
    check('shim png keeps every rgb value', rgbOk)
    check('shim png keeps every alpha value', alphaOk)
  }

  console.log('\npresets')

  {
    const ids = TEXTURE_PRESETS.map((p) => p.id)
    check('preset ids are unique', new Set(ids).size === ids.length, ids.join(' '))
    check('grid size is 16', GRID_SIZE === 16)

    for (const preset of TEXTURE_PRESETS) {
      const g = preset.generate('#d85555')
      check(`${preset.id} generates 256 cells`, g.length === 256, `got ${g.length}`)
      check(
        `${preset.id} generates only valid colors`,
        g.every((c) => c === '' || HEX.test(c)),
        g.find((c) => c !== '' && !HEX.test(c))
      )
      check(`${preset.id} is not blank`, painted(g) > 16, `${painted(g)} pixels`)
      check(`${preset.id} is deterministic`, sameGrid(g, preset.generate('#d85555')))

      const other = preset.generate('#4a8fd8')
      const responds = !sameGrid(g, other)
      if (preset.usesAccent) {
        check(`${preset.id} claims usesAccent and changes with it`, responds)

        check(
          `${preset.id} keeps its shape across accents`,
          g.every((c, i) => !!c === !!other[i])
        )
      } else {
        check(`${preset.id} claims no accent and ignores it`, !responds)
      }
    }

    for (const kind of [...TOOL_KINDS, ...ARMOR_KINDS]) {
      check(
        `a preset exists for kit piece "${kind}"`,
        TEXTURE_PRESETS.some((p) => p.id === kind),
        'kitGenerator would skip this piece and leave it unpainted'
      )
    }

    check('a preset exists for the kit base ("gem")', TEXTURE_PRESETS.some((p) => p.id === 'gem'))

    check('mix at t=0 is a', mix('#102030', '#a0b0c0', 0) === '#102030')
    check('mix at t=1 is b', mix('#102030', '#a0b0c0', 1) === '#a0b0c0')
    check('mix stays six digits on dark colors', HEX.test(mix('#000000', '#000001', 0.5)))
  }

  console.log('\npng round trip (this is what a save and a reopen do)')

  {
    const grid = testGrid()
    const back = await dataUrlToGrid(gridToDataUrl(grid))
    check('opaque art survives the round trip exactly', sameGrid(grid, back), JSON.stringify({
      lost: grid.filter((c, i) => c !== back[i]).length
    }))
    check('transparent stays transparent', grid.every((c, i) => !!c === !!back[i]))

    for (const preset of TEXTURE_PRESETS) {
      const g = preset.generate('#8f4fd8')
      const r = await dataUrlToGrid(gridToDataUrl(g))
      check(`${preset.id} survives the round trip`, sameGrid(g, r))
    }

    const half: LitLayer[] = [{ grid: testGrid('#ffffff'), visible: true, opacity: 50 }]
    const composite = compositeLayers(half)
    const url = rgbaToDataUrl(composite.grid, composite.alpha)
    const bytes = decodeDataUrl(url)
    const painted50 = composite.grid.map((c, i) => (c ? i : -1)).filter((i) => i >= 0)
    check(
      'a 50% layer writes half alpha into the saved png',
      painted50.every((i) => Math.abs(bytes.rgba[i * 4 + 3] - 128) <= 1),
      `first painted pixel alpha ${bytes.rgba[painted50[0] * 4 + 3]}`
    )

    const reopened = await dataUrlToGrid(url)
    check(
      'reopening a flattened 50% image keeps the pixels (as opaque)',
      painted50.every((i) => !!reopened[i]),
      'documented: a Grid has no per-pixel alpha'
    )
    const faint = rgbaToDataUrl(
      testGrid('#ffffff'),
      Array(256).fill(0.2)
    )
    const faintBack = await dataUrlToGrid(faint)
    check(
      'reopening a flattened 20% image drops the pixels entirely',
      painted(faintBack) === 0,
      'documented threshold at alpha 128, see FINDINGS A8'
    )

    const stack: LitLayer[] = [
      { grid: testGrid('#3d8228'), visible: true, opacity: 100 },
      { grid: testGrid('#d8a83c'), visible: true, opacity: 40, hue: 20 }
    ]
    const savedLayers = await Promise.all(
      stack.map(async (l) => ({
        grid: await dataUrlToGrid(gridToDataUrl(l.grid)),
        visible: l.visible,
        opacity: l.opacity,
        hue: l.hue
      }))
    )
    check(
      'a layer stack round trips losslessly, pixels and opacity',
      savedLayers.every((l, i) => sameGrid(l.grid, stack[i].grid) && l.opacity === stack[i].opacity)
    )
    check(
      'and recomposites to the same image',
      sameGrid(compositeLayers(savedLayers as LitLayer[]).grid, compositeLayers(stack).grid)
    )
  }

  console.log('\neffects: compositing, lighting, merge')

  {
    const base: Grid = Array(256).fill('#7d7d7d')
    const top = testGrid('#d85555')

    const l: LitLayer = { grid: top, visible: true, opacity: 100 }
    check('adjustedGrid with no adjustment returns the same grid', adjustedGrid(l) === top)
    const shifted = adjustedGrid({ ...l, hue: 120 })
    check('adjustedGrid with a hue shift changes colors', !sameGrid(shifted, top))
    check('and leaves the painted grid untouched', sameGrid(top, testGrid('#d85555')))
    check(
      'and does not paint or erase pixels',
      shifted.every((c, i) => !!c === !!top[i])
    )
    check(
      'hue is a wrap, so 360 is a no-op',
      sameGrid(adjustedGrid({ ...l, hue: 360 }), adjustedGrid({ ...l, hue: 0 }))
    )

    const stacked = compositeLayers([
      { grid: base, visible: true, opacity: 100 },
      { grid: top, visible: true, opacity: 100 }
    ])
    check('the top layer wins where it paints', stacked.grid[4 * 16 + 4] === '#d85555')
    check('the lower layer shows through the hole', stacked.grid[8 * 16 + 8] === '#7d7d7d')
    check('a fully covered stack is fully opaque', stacked.alpha.every((a) => a === 1))

    const hidden = compositeLayers([
      { grid: base, visible: true, opacity: 100 },
      { grid: top, visible: false, opacity: 100 }
    ])
    check('a hidden layer contributes nothing', sameGrid(hidden.grid, base))
    const zero = compositeLayers([
      { grid: base, visible: true, opacity: 100 },
      { grid: top, visible: true, opacity: 0 }
    ])
    check('a zero-opacity layer contributes nothing', sameGrid(zero.grid, base))

    const halfOver = compositeLayers([
      { grid: base, visible: true, opacity: 100 },
      { grid: top, visible: true, opacity: 50 }
    ])
    check(
      'a 50% layer over an opaque one blends and stays opaque',
      halfOver.grid[4 * 16 + 4] === mix('#7d7d7d', '#d85555', 0.5) && halfOver.alpha[4 * 16 + 4] === 1
    )
    const halfAlone = compositeLayers([{ grid: top, visible: true, opacity: 50 }])
    check(
      'a 50% layer over nothing keeps its color and half coverage',
      halfAlone.grid[4 * 16 + 4] === '#d85555' && Math.abs(halfAlone.alpha[4 * 16 + 4] - 0.5) < 1e-9
    )
    check('and leaves the empty pixels at zero coverage', halfAlone.alpha[8 * 16 + 8] === 0)
    check('compositing nothing is empty, not a crash', painted(compositeLayers([]).grid) === 0)

    const fxOn = { light: { enabled: true, angle: -Math.PI * 0.75, strength: 60 } }
    const unlit = compositeLayers([{ grid: top, visible: true, opacity: 100 }])
    const lit = compositeLayers([{ grid: top, visible: true, opacity: 100 }], fxOn)
    check('lighting changes the image', !sameGrid(unlit.grid, lit.grid))
    check(
      'lighting never adds or removes a pixel',
      lit.grid.every((c, i) => !!c === !!unlit.grid[i])
    )
    check(
      'lighting off is exactly the unlit composite',
      sameGrid(compositeLayers([{ grid: top, visible: true, opacity: 100 }], DEFAULT_FX).grid, unlit.grid)
    )
    check(
      'zero strength is a no-op',
      sameGrid(applyDirectionalShading(top, 0.5, 0), top)
    )
    check(
      'shading only recolors, never reshapes',
      applyDirectionalShading(top, 0.5, 100).every((c, i) => !!c === !!top[i])
    )

    const layers: LitLayer[] = [
      { grid: base, visible: true, opacity: 100 },
      { grid: top, visible: true, opacity: 100 }
    ]
    const baked = bakeLighting(layers, fxOn)
    check('bake returns one grid per layer', baked.length === layers.length)
    check(
      'bake keeps every silhouette',
      baked.every((g, i) => g.every((c, j) => !!c === !!layers[i].grid[j]))
    )
    const rebaked = compositeLayers(
      layers.map((l, i) => ({ ...l, grid: baked[i] }))
    )
    check(
      'compositing the baked layers unlit reproduces the lit image',
      sameGrid(rebaked.grid, compositeLayers(layers, fxOn).grid),
      'Apply must keep what is on screen'
    )
    check('baking does not touch the source layers', sameGrid(layers[1].grid, testGrid('#d85555')))

    const merged = mergePair(
      { grid: base, visible: true, opacity: 100 },
      { grid: top, visible: true, opacity: 100 }
    )
    check('merging two solid layers gives a solid one', merged.opacity === 100 && merged.visible)
    check(
      'and looks the same as the two of them did',
      sameGrid(
        merged.grid,
        compositeLayers([
          { grid: base, visible: true, opacity: 100 },
          { grid: top, visible: true, opacity: 100 }
        ]).grid
      )
    )

    const sameShape = mergePair(
      { grid: top, visible: true, opacity: 60 },
      { grid: top, visible: true, opacity: 60 }
    )
    const pairLook = compositeLayers([
      { grid: top, visible: true, opacity: 60 },
      { grid: top, visible: true, opacity: 60 }
    ])
    const mergedLook = compositeLayers([
      { grid: sameShape.grid, visible: true, opacity: sameShape.opacity }
    ])
    check('a merge over one silhouette carries a real opacity', sameShape.opacity > 0 && sameShape.opacity < 100, String(sameShape.opacity))
    check(
      'and re-compositing it reproduces the pair, color and coverage',
      sameGrid(mergedLook.grid, pairLook.grid) &&
        mergedLook.alpha.every((a, i) => Math.abs(a - pairLook.alpha[i]) < 0.01),
      String(sameShape.opacity)
    )

    const uneven = mergePair(
      { grid: base, visible: true, opacity: 60 },
      { grid: top, visible: true, opacity: 60 }
    )
    check('a merge with uneven coverage lands opaque', uneven.opacity === 100)
    check(
      'and still keeps the blended colors',
      sameGrid(
        uneven.grid,
        compositeLayers([
          { grid: base, visible: true, opacity: 60 },
          { grid: top, visible: true, opacity: 60 }
        ]).grid
      )
    )
    const bothHidden = mergePair(
      { grid: base, visible: false, opacity: 100 },
      { grid: top, visible: false, opacity: 100 }
    )
    check('merging two hidden layers keeps the pixels', painted(bothHidden.grid) > 0)
    check('and the result stays hidden', !bothHidden.visible)
    const tintedMerge = mergePair(
      { grid: base, visible: true, opacity: 100 },
      { grid: top, visible: true, opacity: 100, hue: 140, saturation: 20 }
    )
    check(
      'a merge bakes the upper layer color shift in',
      tintedMerge.grid[4 * 16 + 4] !== '#d85555' &&
        tintedMerge.grid[4 * 16 + 4] === adjustedGrid({
          grid: top,
          visible: true,
          opacity: 100,
          hue: 140,
          saturation: 20
        })[4 * 16 + 4]
    )
  }

  console.log('\nstencils')

  {
    const ids = STENCILS.map((s) => s.id)
    check('stencil ids are unique', new Set(ids).size === ids.length)

    const below = Array(256).fill('#7d7d7d') as Grid
    const input = (over: Partial<StencilInput> = {}): StencilInput => ({
      below,
      color: '#d8a83c',
      seed: 12345,
      angle: -Math.PI * 0.75,
      params: {},
      ...over
    })

    for (const s of STENCILS) {
      const params = defaultParams(s)
      check(
        `${s.id}: defaults cover every param`,
        s.params.every((p) => params[p.key] !== undefined)
      )
      check(
        `${s.id}: every param default is inside its own range`,
        s.params.every(
          (p) =>
            p.kind !== 'slider' ||
            (typeof p.default === 'number' &&
              (p.min === undefined || p.default >= p.min) &&
              (p.max === undefined || p.default <= p.max))
        )
      )
      check(
        `${s.id}: choice params default to one of their options`,
        s.params.every(
          (p) => p.kind !== 'choice' || !!p.options?.some((o) => o.value === p.default)
        )
      )

      const base = input({ params })
      const result = s.run(base)
      check(
        `${s.id}: mode "${s.mode}" matches what it returns`,
        s.mode === 'cut' ? !!result.cut : !!result.grid,
        JSON.stringify({ grid: !!result.grid, cut: !!result.cut })
      )
      if (result.grid) {
        check(`${s.id}: returns 256 cells`, result.grid.length === 256, `got ${result.grid.length}`)
        check(
          `${s.id}: returns only valid colors`,
          result.grid.every((c) => c === '' || HEX.test(c)),
          result.grid.find((c) => c !== '' && !HEX.test(c))
        )
      }
      if (result.cut) {
        check(
          `${s.id}: cuts inside the grid`,
          result.cut.every((i) => Number.isInteger(i) && i >= 0 && i < 256),
          JSON.stringify(result.cut.filter((i) => !(i >= 0 && i < 256)).slice(0, 8))
        )
      }

      const preview = previewStencil(s, base)
      check(`${s.id}: preview is 256 cells`, preview.length === 256)
      check(`${s.id}: preview does something`, !sameGrid(preview, below), 'a stencil that changes nothing is a dead control')
      check(
        `${s.id}: is deterministic for one seed`,
        sameGrid(preview, previewStencil(s, input({ params })))
      )

      const otherColor = previewStencil(s, input({ params, color: '#4a8fd8' }))
      if (s.usesColor) {
        check(`${s.id}: claims usesColor and responds to it`, !sameGrid(preview, otherColor))
      } else {
        check(`${s.id}: claims no color and ignores it`, sameGrid(preview, otherColor))
      }
      const otherSeed = previewStencil(s, input({ params, seed: 987654 }))
      if (s.usesSeed) {
        check(`${s.id}: claims usesSeed and rerolls`, !sameGrid(preview, otherSeed))
      } else if (s.usesSeed === false) {
        check(`${s.id}: claims no seed and ignores it`, sameGrid(preview, otherSeed))
      }

      if (s.mode === 'cut') {
        check(
          `${s.id}: a cut only removes`,
          preview.every((c, i) => c === '' || c === below[i])
        )
      } else {
        check(
          `${s.id}: a layer only adds`,
          preview.every((c, i) => (below[i] ? c !== '' : true))
        )
      }

      for (const p of s.params) {
        if (p.kind !== 'slider' || p.min === undefined || p.max === undefined) continue
        for (const v of [p.min, p.max]) {
          let ok = true
          let detail = ''
          try {
            const g = previewStencil(s, input({ params: { ...params, [p.key]: v } }))
            ok = g.length === 256 && g.every((c) => c === '' || HEX.test(c))
            if (!ok) detail = 'bad grid'
          } catch (e) {
            ok = false
            detail = String(e)
          }
          check(`${s.id}: survives ${p.key}=${v}`, ok, detail)
        }
      }

      let emptyOk = true
      let emptyDetail = ''
      try {
        const g = previewStencil(s, input({ params, below: Array(256).fill('') as Grid }))
        emptyOk = g.length === 256
      } catch (e) {
        emptyOk = false
        emptyDetail = String(e)
      }
      check(`${s.id}: survives an empty canvas`, emptyOk, emptyDetail)
    }
  }

  console.log('\nkit generator (one color, nine pieces, against the real store)')

  {
    const store = useProjectStore
    const freshKit = (name = 'ruby'): { itemId: string } => {
      store.getState().newProject('Kit Test', 'kittest')
      const itemId = store.getState().addElement('item', name, {
        ...ITEM_DEFAULTS,
        generateSet: true,
        set: { ...(ITEM_DEFAULTS as { set?: object }).set, tools: true, armor: true }
      })
      return { itemId }
    }

    {
      const { itemId } = freshKit()
      const el = store.getState().project!.elements.find((e) => e.id === itemId)!
      const family = kitFamily(el)!
      check('the fixture kit is the full nine pieces', family.tools.length + family.armor.length === 9)

      const result = await generateKitTextures(itemId)
      check('every piece plus the base was covered', result.pieces === 10, JSON.stringify(result))
      check('with nothing left over', result.created + result.updated + result.reused + result.kept === result.pieces)
      check('and no painted source means the default accent', result.accent === DEFAULT_KIT_ACCENT)

      const live = store.getState().project!

      const wanted = [`item/${family.base}`, ...[...family.tools, ...family.armor].map((n) => `item/${n}`)]
      for (const key of wanted) {
        const id = live.textureAssignments[key]
        const tex = id ? live.textures.find((t) => t.id === id) : undefined
        check(`${key} has a texture assigned`, !!tex)

        check(`${key} carries real pixels`, !!tex && tex.data.startsWith('data:image/png;base64,'))
        const bytes = tex ? decodeDataUrl(tex.data) : null
        check(
          `${key} is a 16x16 png, which is what the atlas expects`,
          !!bytes && bytes.width === 16 && bytes.height === 16,
          bytes ? `${bytes.width}x${bytes.height}` : 'no texture'
        )
        check(`${key} is filed as an item texture`, tex?.kind === 'item')
        check(`${key} is named after its slot`, tex?.name === key.slice('item/'.length))
      }
      check(
        'nothing else was created',
        live.textures.length === wanted.length,
        `${live.textures.length} textures for ${wanted.length} slots`
      )

      const distinct = new Set(live.textures.map((t) => t.data))
      check('every piece is a different picture', distinct.size === live.textures.length)

      const paintable = textureSlotsFor(live).filter((s) => s.paintable)
      check(
        'no paintable slot is left unpainted',
        paintable.every((s) => !!live.textureAssignments[s.key]),
        paintable.filter((s) => !live.textureAssignments[s.key]).map((s) => s.key).join(' ')
      )
    }

    {
      const { itemId } = freshKit()
      await generateKitTextures(itemId)
      const first = store.getState().project!
      const before = first.textures.map((t) => `${t.name}:${t.data.length}`).join('|')
      const again = await generateKitTextures(itemId)
      const after = store.getState().project!
      check('a second run creates nothing', again.created === 0, JSON.stringify(again))
      check('and keeps what is there', again.kept === again.pieces)
      check(
        'and the gallery is unchanged',
        after.textures.map((t) => `${t.name}:${t.data.length}`).join('|') === before
      )
    }

    {
      const { itemId } = freshKit()
      await generateKitTextures(itemId)
      const mine = store.getState().project!.textures.find((t) => t.name === 'ruby_axe')!

      store.getState().updateTexture(mine.id, { name: 'my_special_axe', data: gridToDataUrl(testGrid('#5cb04a')) })
      const mineData = store.getState().project!.textures.find((t) => t.id === mine.id)!.data
      const swordBefore = store.getState().project!.textures.find((t) => t.name === 'ruby_sword')!.data

      const re = await generateKitTextures(itemId, { accent: '#4a8fd8', regenerate: true })
      const live = store.getState().project!
      check('a regenerate rebuilds the generator\'s pieces', re.updated > 0, JSON.stringify(re))
      check(
        'the sword was repainted in the new color',
        live.textures.find((t) => t.name === 'ruby_sword')!.data !== swordBefore
      )
      check(
        'the modder\'s renamed axe was left exactly alone',
        live.textures.find((t) => t.id === mine.id)!.data === mineData
      )
      check('and it kept its name', live.textures.find((t) => t.id === mine.id)!.name === 'my_special_axe')
      check(
        'the base item is protected from a regenerate',
        re.kept >= 1 && live.textures.find((t) => t.name === 'ruby')!.data === (await (async () => {
          const g = TEXTURE_PRESETS.find((p) => p.id === 'gem')!.generate(DEFAULT_KIT_ACCENT)
          return gridToDataUrl(g)
        })()),
        'the base doubles as the color source, so rebuilding it under the modder is wrong'
      )
    }

    {
      const { itemId } = freshKit()
      const existing = store.getState().addTexture('ruby_boots', gridToDataUrl(testGrid('#7fd35f')), 'item')
      const r = await generateKitTextures(itemId)
      const live = store.getState().project!
      check('an existing texture with the piece name is reused', r.reused === 1, JSON.stringify(r))
      check('and it is the one that got assigned', live.textureAssignments['item/ruby_boots'] === existing)
      check(
        'and no second ruby_boots was created',
        live.textures.filter((t) => t.name === 'ruby_boots').length === 1
      )
    }

    {
      const { itemId } = freshKit()
      const promotedId = store.getState().promoteGenerated(itemId, 'ruby_pickaxe')
      check('the piece promoted', !!promotedId)
      const r = await generateKitTextures(itemId)
      const live = store.getState().project!
      check('the kit no longer counts the promoted piece', r.pieces === 9, JSON.stringify(r))
      check(
        'and did not paint it',
        !live.textures.some((t) => t.name === 'ruby_pickaxe'),
        'the kit generator painting a piece it no longer generates is a texture with no owner'
      )

      const slots = textureSlotsFor(live)
      check(
        'the promoted piece still owns a paintable slot',
        slots.some((s) => s.key === 'item/ruby_pickaxe' && s.elementId === promotedId)
      )
      check(
        'and exactly one element owns it',
        slots.filter((s) => s.key === 'item/ruby_pickaxe').length === 1
      )
    }

    {
      const { itemId } = freshKit()
      const ore: Grid = Array(256).fill('#7d7d7d')
      for (let i = 0; i < 40; i++) ore[i * 6 + 3] = '#4fd8d8'
      const id = store.getState().addTexture('ruby', gridToDataUrl(ore), 'item')
      store.getState().assignTexture('item/ruby', id)
      const accent = await suggestKitAccent(itemId)
      check('the accent is the flecks, not the stone', accent === '#4fd8d8', String(accent))

      const r = await generateKitTextures(itemId)
      check('and generation bakes from it', r.accent === '#4fd8d8', JSON.stringify(r))
      const sword = store.getState().project!.textures.find((t) => t.name === 'ruby_sword')!
      check(
        'so the sword is the artwork color, not the fallback',
        sword.data === gridToDataUrl(TEXTURE_PRESETS.find((p) => p.id === 'sword')!.generate('#4fd8d8'))
      )
    }

    {
      const { itemId } = freshKit()
      check('no artwork means no suggestion, not a crash', (await suggestKitAccent(itemId)) === null)
      check('an unknown element suggests nothing', (await suggestKitAccent('nope')) === null)
      const r = await generateKitTextures('nope')
      check('and generating for one does nothing at all', r.pieces === 0 && r.created === 0)
    }

    {
      const { itemId } = freshKit()
      const dark: Grid = Array(256).fill('#0a0a0a')
      const id = store.getState().addTexture('ruby', gridToDataUrl(dark), 'item')
      store.getState().assignTexture('item/ruby', id)
      check('art with no readable color suggests nothing', (await suggestKitAccent(itemId)) === null)
      const r = await generateKitTextures(itemId)
      check('and generation falls back rather than refusing', r.accent === DEFAULT_KIT_ACCENT && r.created === 9)
    }
  }

}

void main().then(() => {
  console.log(`\n${audit.passes} checks passed, ${audit.failures} failed`)
  if (audit.failures) {
    console.log('TEXTURES FAIL')
    process.exit(1)
  }
  console.log('TEXTURES PASS')
})
