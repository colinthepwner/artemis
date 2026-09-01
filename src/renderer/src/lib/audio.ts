import { playableFormat, type GameAudioFormat } from '@shared/audio'

export interface GameAudio {
  format: GameAudioFormat

  data: Uint8Array

  converted: boolean
}

export async function toGameAudio(raw: ArrayBuffer, ext: string): Promise<GameAudio> {
  const already = playableFormat(ext)
  if (already) return { format: already, data: new Uint8Array(raw), converted: false }
  const lower = ext.replace(/^\./, '').toLowerCase()

  const ctx = new AudioContext()
  try {

    const decoded = await ctx.decodeAudioData(raw.slice(0))
    return { format: 'wav', data: encodeWav(decoded), converted: true }
  } catch {
    throw new Error(
      `That .${lower} could not be decoded. The game plays ogg and wav; anything else has to be ` +
        'converted, and this file is in something the app cannot read.'
    )
  } finally {
    void ctx.close()
  }
}

function encodeWav(buffer: AudioBuffer): Uint8Array {
  const channels = buffer.numberOfChannels
  const frames = buffer.length
  const bytesPerSample = 2
  const blockAlign = channels * bytesPerSample
  const dataBytes = frames * blockAlign
  const out = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(out)

  const ascii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }

  ascii(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, buffer.sampleRate, true)
  view.setUint32(28, buffer.sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 8 * bytesPerSample, true)
  ascii(36, 'data')
  view.setUint32(40, dataBytes, true)

  const tracks: Float32Array[] = []
  for (let c = 0; c < channels; c++) tracks.push(buffer.getChannelData(c))

  let offset = 44
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {

      const sample = Math.max(-1, Math.min(1, tracks[c][i]))
      view.setInt16(offset, Math.round(sample * (sample < 0 ? 0x8000 : 0x7fff)), true)
      offset += 2
    }
  }
  return new Uint8Array(out)
}

export async function gzipToBase64(data: Uint8Array): Promise<string> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'))
  const packed = new Uint8Array(await new Response(stream).arrayBuffer())

  let binary = ''
  for (let i = 0; i < packed.length; i += 0x8000) {
    binary += String.fromCharCode(...packed.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}
