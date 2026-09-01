export type GameAudioFormat = 'ogg' | 'wav'

export const AUDIO_EXTENSIONS = [
  'ogg',
  'oga',
  'wav',
  'wave',
  'mp3',
  'm4a',
  'aac',
  'flac',
  'opus',
  'webm',
  'weba'
]

export function playableFormat(ext: string): GameAudioFormat | null {
  const lower = ext.replace(/^\./, '').toLowerCase()
  if (lower === 'ogg' || lower === 'oga') return 'ogg'
  if (lower === 'wav' || lower === 'wave') return 'wav'
  return null
}
