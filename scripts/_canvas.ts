import { deflateSync, inflateSync } from 'node:zlib'

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf: Buffer): number {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

interface Decoded {
  width: number
  height: number
  rgba: Uint8Array
}

export function decodePng(buf: Buffer): Decoded {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG')
  let pos = 8
  let width = 0
  let height = 0
  let colourType = 6
  const idat: Buffer[] = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      if (data[8] !== 8) throw new Error(`unsupported bit depth ${data[8]}`)
      colourType = data[9]
      if (colourType !== 6 && colourType !== 2) {
        throw new Error(`unsupported colour type ${colourType}`)
      }
    } else if (type === 'IDAT') idat.push(Buffer.from(data))
    else if (type === 'IEND') break
    pos += 12 + len
  }
  const channels = colourType === 6 ? 4 : 3
  const bpp = channels
  const stride = width * channels
  const raw = inflateSync(Buffer.concat(idat))
  const out = new Uint8Array(width * height * 4)
  const line = Buffer.alloc(stride)
  const prev = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    raw.copy(line, 0, y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0
      const b = prev[i]
      const c = i >= bpp ? prev[i - bpp] : 0
      switch (filter) {
        case 0:
          break
        case 1:
          line[i] = (line[i] + a) & 255
          break
        case 2:
          line[i] = (line[i] + b) & 255
          break
        case 3:
          line[i] = (line[i] + ((a + b) >> 1)) & 255
          break
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a)
          const pb = Math.abs(p - b)
          const pc = Math.abs(p - c)
          line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255
          break
        }
        default:
          throw new Error(`bad filter ${filter}`)
      }
    }
    for (let x = 0; x < width; x++) {
      out[(y * width + x) * 4] = line[x * channels]
      out[(y * width + x) * 4 + 1] = line[x * channels + 1]
      out[(y * width + x) * 4 + 2] = line[x * channels + 2]
      out[(y * width + x) * 4 + 3] = channels === 4 ? line[x * channels + 3] : 255
    }
    line.copy(prev)
  }
  return { width, height, rgba: out }
}

interface ShimImageData {
  width: number
  height: number
  data: Uint8ClampedArray
}

class ShimImage {
  width = 0
  height = 0
  rgba: Uint8Array = new Uint8Array(0)
  onload: (() => void) | null = null
  onerror: ((e?: unknown) => void) | null = null
  private _src = ''

  get src(): string {
    return this._src
  }

  set src(value: string) {
    this._src = value
    const comma = value.indexOf(',')
    let decoded: Decoded | null = null
    let error: unknown = null
    try {
      if (!value.startsWith('data:image/png;base64,')) throw new Error('unsupported src')
      decoded = decodePng(Buffer.from(value.slice(comma + 1), 'base64'))
    } catch (e) {
      error = e
    }
    queueMicrotask(() => {
      if (decoded) {
        this.width = decoded.width
        this.height = decoded.height
        this.rgba = decoded.rgba
        this.onload?.()
      } else this.onerror?.(error)
    })
  }
}

class ShimContext {
  constructor(private canvas: ShimCanvas) {}

  createImageData(width: number, height: number): ShimImageData {
    return { width, height, data: new Uint8ClampedArray(width * height * 4) }
  }

  putImageData(img: ShimImageData, dx: number, dy: number): void {
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const tx = x + dx
        const ty = y + dy
        if (tx < 0 || ty < 0 || tx >= this.canvas.width || ty >= this.canvas.height) continue
        const s = (y * img.width + x) * 4
        const d = (ty * this.canvas.width + tx) * 4
        this.canvas.rgba.set(img.data.subarray(s, s + 4), d)
      }
    }
  }

  getImageData(sx: number, sy: number, width: number, height: number): ShimImageData {
    const out = this.createImageData(width, height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const s = ((y + sy) * this.canvas.width + (x + sx)) * 4
        out.data.set(this.canvas.rgba.subarray(s, s + 4), (y * width + x) * 4)
      }
    }
    return out
  }

  private m: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0]
  private stack: Array<[number, number, number, number, number, number]> = []

  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.m = [a, b, c, d, e, f]
  }
  resetTransform(): void {
    this.m = [1, 0, 0, 1, 0, 0]
  }
  translate(tx: number, ty: number): void {
    const [a, b, c, d, e, f] = this.m
    this.m = [a, b, c, d, e + a * tx + c * ty, f + b * tx + d * ty]
  }
  rotate(angle: number): void {
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const [a, b, c, d, e, f] = this.m
    this.m = [a * cos + c * sin, b * cos + d * sin, c * cos - a * sin, d * cos - b * sin, e, f]
  }
  scale(sx: number, sy: number): void {
    const [a, b, c, d, e, f] = this.m
    this.m = [a * sx, b * sx, c * sy, d * sy, e, f]
  }
  save(): void {
    this.stack.push([...this.m] as [number, number, number, number, number, number])
  }
  restore(): void {
    const prev = this.stack.pop()
    if (prev) this.m = prev
  }

  private map(x: number, y: number): [number, number] {
    const [a, b, c, d, e, f] = this.m
    return [Math.round(a * x + c * y + e), Math.round(b * x + d * y + f)]
  }

  drawImage(
    img: ShimImage,
    p1: number,
    p2: number,
    p3?: number,
    p4?: number,
    p5?: number,
    p6?: number,
    p7?: number,
    p8?: number
  ): void {
    let sx = 0
    let sy = 0
    let sw = img.width
    let sh = img.height
    let dx = p1
    let dy = p2
    let dw = img.width
    let dh = img.height
    if (p5 !== undefined) {
      sx = p1
      sy = p2
      sw = p3 ?? img.width
      sh = p4 ?? img.height
      dx = p5
      dy = p6 ?? 0
      dw = p7 ?? sw
      dh = p8 ?? sh
    } else if (p3 !== undefined) {
      dw = p3
      dh = p4 ?? p3
    }
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const ix = sx + Math.min(sw - 1, Math.floor((x * sw) / dw))
        const iy = sy + Math.min(sh - 1, Math.floor((y * sh) / dh))
        if (ix < 0 || iy < 0 || ix >= img.width || iy >= img.height) continue
        const [tx, ty] = this.map(dx + x, dy + y)
        if (tx < 0 || ty < 0 || tx >= this.canvas.width || ty >= this.canvas.height) continue
        const s = (iy * img.width + ix) * 4
        this.canvas.rgba.set(img.rgba.subarray(s, s + 4), (ty * this.canvas.width + tx) * 4)
      }
    }
  }

  clearRect(x: number, y: number, w: number, h: number): void {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const d = (yy * this.canvas.width + xx) * 4
        this.canvas.rgba.fill(0, d, d + 4)
      }
    }
  }
}

class ShimCanvas {
  private _width = 0
  private _height = 0
  rgba = new Uint8Array(0)
  private ctx: ShimContext | null = null

  get width(): number {
    return this._width
  }

  set width(v: number) {
    this._width = v
    this.rgba = new Uint8Array(this._width * this._height * 4)
  }
  get height(): number {
    return this._height
  }
  set height(v: number) {
    this._height = v
    this.rgba = new Uint8Array(this._width * this._height * 4)
  }

  getContext(kind: string): ShimContext | null {
    if (kind !== '2d') return null
    this.ctx ??= new ShimContext(this)
    return this.ctx
  }

  toDataURL(type = 'image/png'): string {
    if (type !== 'image/png') throw new Error(`toDataURL ${type} not supported`)
    return `data:image/png;base64,${encodePng(this._width, this._height, this.rgba).toString('base64')}`
  }
}

export function installCanvasShim(): void {
  const g = globalThis as Record<string, unknown>
  if (g.__artemisCanvasShim) return
  g.__artemisCanvasShim = true

  const doc = (g.document ?? {}) as Record<string, unknown>
  doc.createElement = (tag: string): unknown => {
    if (tag !== 'canvas') throw new Error(`no shim for <${tag}>`)
    return new ShimCanvas()
  }
  g.document = doc
  g.Image = ShimImage
}

export function decodeDataUrl(dataUrl: string): Decoded {
  return decodePng(Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'))
}

export function pngDataUrl(
  width: number,
  height: number,
  a = '#b03a3a',
  b = '#6e1f1f'
): string {
  const rgba = new Uint8Array(width * height * 4)
  const hex = (c: string): [number, number, number] => {
    const n = parseInt(c.slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const [ar, ag, ab] = hex(a)
  const [br, bg, bb] = hex(b)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const light = ((x >> 2) + (y >> 2)) % 2 === 0
      rgba[i] = light ? ar : br
      rgba[i + 1] = light ? ag : bg
      rgba[i + 2] = light ? ab : bb
      rgba[i + 3] = 255
    }
  }
  return `data:image/png;base64,${encodePng(width, height, rgba).toString('base64')}`
}

export function png16DataUrl(a = '#b03a3a', b = '#6e1f1f'): string {
  return pngDataUrl(16, 16, a, b)
}
