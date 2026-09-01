export type NbtValue =
  | number
  | bigint
  | string
  | Int8Array
  | Int32Array
  | BigInt64Array
  | NbtValue[]
  | NbtCompound

export interface NbtCompound {
  [key: string]: NbtValue
}

const TAG_END = 0
const TAG_BYTE = 1
const TAG_SHORT = 2
const TAG_INT = 3
const TAG_LONG = 4
const TAG_FLOAT = 5
const TAG_DOUBLE = 6
const TAG_BYTE_ARRAY = 7
const TAG_STRING = 8
const TAG_LIST = 9
const TAG_COMPOUND = 10
const TAG_INT_ARRAY = 11
const TAG_LONG_ARRAY = 12

class Reader {
  private at = 0
  private view: DataView
  constructor(private bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  private need(n: number): number {
    if (this.at + n > this.bytes.length) {
      throw new Error(`The file ends in the middle of a tag, ${n} bytes short.`)
    }
    const start = this.at
    this.at += n
    return start
  }

  byte(): number {
    return this.view.getInt8(this.need(1))
  }
  ubyte(): number {
    return this.view.getUint8(this.need(1))
  }
  short(): number {
    return this.view.getInt16(this.need(2), false)
  }
  ushort(): number {
    return this.view.getUint16(this.need(2), false)
  }
  int(): number {
    return this.view.getInt32(this.need(4), false)
  }
  long(): bigint {
    return this.view.getBigInt64(this.need(8), false)
  }
  float(): number {
    return this.view.getFloat32(this.need(4), false)
  }
  double(): number {
    return this.view.getFloat64(this.need(8), false)
  }

  string(): string {
    const length = this.ushort()
    const start = this.need(length)

    return new TextDecoder().decode(this.bytes.subarray(start, start + length))
  }

  bytes8(length: number): Int8Array {
    const start = this.need(length)
    return new Int8Array(this.bytes.buffer.slice(this.bytes.byteOffset + start, this.bytes.byteOffset + start + length))
  }

  value(type: number): NbtValue {
    switch (type) {
      case TAG_BYTE:
        return this.byte()
      case TAG_SHORT:
        return this.short()
      case TAG_INT:
        return this.int()
      case TAG_LONG:
        return this.long()
      case TAG_FLOAT:
        return this.float()
      case TAG_DOUBLE:
        return this.double()
      case TAG_BYTE_ARRAY:
        return this.bytes8(this.int())
      case TAG_STRING:
        return this.string()
      case TAG_LIST: {
        const itemType = this.ubyte()
        const length = this.int()
        const out: NbtValue[] = []

        if (itemType === TAG_END) return out
        for (let i = 0; i < length; i++) out.push(this.value(itemType))
        return out
      }
      case TAG_COMPOUND: {
        const out: NbtCompound = {}
        for (;;) {
          const child = this.ubyte()
          if (child === TAG_END) return out
          const name = this.string()
          out[name] = this.value(child)
        }
      }
      case TAG_INT_ARRAY: {
        const length = this.int()
        const out = new Int32Array(length)
        for (let i = 0; i < length; i++) out[i] = this.int()
        return out
      }
      case TAG_LONG_ARRAY: {
        const length = this.int()
        const out = new BigInt64Array(length)
        for (let i = 0; i < length; i++) out[i] = this.long()
        return out
      }
      default:
        throw new Error(`Tag type ${type} is not part of NBT, so this is not an NBT file.`)
    }
  }
}

export function readNbt(bytes: Uint8Array): { name: string; value: NbtCompound } {
  const reader = new Reader(bytes)
  const type = reader.ubyte()
  if (type !== TAG_COMPOUND) {
    throw new Error('An NBT file starts with a compound tag, and this one does not.')
  }
  const name = reader.string()
  return { name, value: reader.value(TAG_COMPOUND) as NbtCompound }
}

export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
}

export function nbtNumber(value: NbtValue | undefined): number | null {
  return typeof value === 'number' ? value : null
}

export function nbtCompound(value: NbtValue | undefined): NbtCompound | null {
  return value && typeof value === 'object' && !Array.isArray(value) && !ArrayBuffer.isView(value)
    ? (value as NbtCompound)
    : null
}

export function nbtBytes(value: NbtValue | undefined): Int8Array | null {
  return value instanceof Int8Array ? value : null
}
