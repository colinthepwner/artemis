import { Jimp } from 'jimp'
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(root, 'resources', 'logo-source.png')

const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return (buf) => {
    let c = 0xffffffff
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
})()
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(CRC(body), 0)
  return Buffer.concat([len, body, crc])
}
function encodePng(rgba, w, h) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc(h * (w * 4 + 1))
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}
function encodeIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const dir = Buffer.alloc(16 * images.length)
  let offset = 6 + dir.length
  images.forEach((img, i) => {
    const e = i * 16
    dir[e] = img.size >= 256 ? 0 : img.size
    dir[e + 1] = img.size >= 256 ? 0 : img.size
    dir.writeUInt16LE(1, e + 4)
    dir.writeUInt16LE(32, e + 6)
    dir.writeUInt32LE(img.png.length, e + 8)
    dir.writeUInt32LE(offset, e + 12)
    offset += img.png.length
  })
  return Buffer.concat([header, dir, ...images.map((i) => i.png)])
}

const idx = (img, x, y) => (y * img.width + x) * 4

function keyOutBackground(img, threshold = 236) {
  const { data, width, height } = img
  const seen = new Uint8Array(width * height)
  const stack = []
  const isBg = (x, y) => {
    const i = idx(img, x, y)
    return data[i] >= threshold && data[i + 1] >= threshold && data[i + 2] >= threshold
  }
  const pushBorder = (x, y) => {
    const p = y * width + x
    if (!seen[p] && isBg(x, y)) {
      seen[p] = 1
      stack.push(p)
    }
  }
  for (let x = 0; x < width; x++) {
    pushBorder(x, 0)
    pushBorder(x, height - 1)
  }
  for (let y = 0; y < height; y++) {
    pushBorder(0, y)
    pushBorder(width - 1, y)
  }
  while (stack.length) {
    const p = stack.pop()
    const x = p % width
    const y = (p - x) / width
    data[p * 4 + 3] = 0
    const nb = [
      [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]
    ]
    for (const [nx, ny] of nb) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const np = ny * width + nx
      if (!seen[np] && isBg(nx, ny)) {
        seen[np] = 1
        stack.push(np)
      }
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(img, x, y)
      if (data[i + 3] === 0) continue
      const light = data[i] > 232 && data[i + 1] > 232 && data[i + 2] > 232
      if (!light) continue
      let touchesClear = false
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        if (data[idx(img, nx, ny) + 3] === 0) touchesClear = true
      }
      if (touchesClear) data[i + 3] = 90
    }
  }
}

function opaqueBounds(img) {
  const { data, width, height } = img
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[idx(img, x, y) + 3] > 16) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

if (!existsSync(SRC)) {
  console.error(`Missing ${SRC} — drop the logo there and re-run.`)
  process.exit(1)
}

const jimp = await Jimp.read(SRC)
const img = { data: Buffer.from(jimp.bitmap.data), width: jimp.bitmap.width, height: jimp.bitmap.height }
keyOutBackground(img)

const b = opaqueBounds(img)
const cropped = Buffer.alloc(b.w * b.h * 4)
for (let y = 0; y < b.h; y++) {
  img.data.copy(cropped, y * b.w * 4, idx(img, b.x, b.y + y), idx(img, b.x, b.y + y) + b.w * 4)
}
const bust = { data: cropped, width: b.w, height: b.h }

mkdirSync(join(root, 'src/renderer/src/assets'), { recursive: true })
const bustJimp = new Jimp({ width: bust.width, height: bust.height, data: Buffer.from(bust.data) })
const scale = 512 / Math.max(bust.width, bust.height)
if (scale < 1) bustJimp.resize({ w: Math.round(bust.width * scale), h: Math.round(bust.height * scale) })
writeFileSync(
  join(root, 'src/renderer/src/assets/logo.png'),
  encodePng(Buffer.from(bustJimp.bitmap.data), bustJimp.bitmap.width, bustJimp.bitmap.height)
)

function renderIcon(size) {
  const out = Buffer.alloc(size * size * 4)
  const radius = size * 0.18
  const lo = 0,
    hi = size - 1

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.min(Math.max(x, radius), size - radius)
      const cy = Math.min(Math.max(y, radius), size - radius)
      let inside
      if (x >= radius && x <= size - radius) inside = y >= lo && y <= hi
      else if (y >= radius && y <= size - radius) inside = x >= lo && x <= hi
      else inside = (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius
      if (inside) {
        const i = (y * size + x) * 4
        out[i] = 11
        out[i + 1] = 14
        out[i + 2] = 18
        out[i + 3] = 255
      }
    }
  }

  const target = Math.round(size * 0.86)
  const bs = target / Math.max(bust.width, bust.height)
  const bw = Math.max(1, Math.round(bust.width * bs))
  const bh = Math.max(1, Math.round(bust.height * bs))
  const scaled = new Jimp({ width: bust.width, height: bust.height, data: Buffer.from(bust.data) })
  scaled.resize({ w: bw, h: bh })
  const ox = Math.round((size - bw) / 2)
  const oy = Math.round((size - bh) / 2)
  const sd = scaled.bitmap.data
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const si = (y * bw + x) * 4
      const a = sd[si + 3] / 255
      if (a <= 0) continue
      const dx = ox + x
      const dy = oy + y
      if (dx < 0 || dy < 0 || dx >= size || dy >= size) continue
      const di = (dy * size + dx) * 4
      out[di] = sd[si] * a + out[di] * (1 - a)
      out[di + 1] = sd[si + 1] * a + out[di + 1] * (1 - a)
      out[di + 2] = sd[si + 2] * a + out[di + 2] * (1 - a)
      out[di + 3] = Math.max(out[di + 3], sd[si + 3])
    }
  }
  return out
}

const sizes = [16, 24, 32, 48, 64, 128, 256]
const images = sizes.map((size) => ({ size, png: encodePng(renderIcon(size), size, size) }))
mkdirSync(join(root, 'resources'), { recursive: true })
writeFileSync(join(root, 'resources', 'icon.ico'), encodeIco(images))
writeFileSync(join(root, 'resources', 'icon.png'), images[images.length - 1].png)

console.log(`Logo processed: bust cropped to ${bust.width}x${bust.height}`)
console.log('Wrote src/renderer/src/assets/logo.png, resources/icon.png, resources/icon.ico')
