import { kitFamily } from '@shared/generator/family'
import { useProjectStore } from '@/store/projectStore'
import { TEXTURE_PRESETS, dataUrlToGrid, gridToDataUrl, type Grid } from './presets'

export const DEFAULT_KIT_ACCENT = '#d85555'

export interface KitGenOptions {

  accent?: string

  regenerate?: boolean
}

export interface KitGenResult {
  created: number

  updated: number

  reused: number

  kept: number
  accent: string

  pieces: number
}

const EMPTY_RESULT: KitGenResult = {
  created: 0,
  updated: 0,
  reused: 0,
  kept: 0,
  accent: DEFAULT_KIT_ACCENT,
  pieces: 0
}

function extractAccent(grid: Grid): string | null {
  const score = new Map<string, number>()
  for (const c of grid) {
    if (!c) continue
    const n = parseInt(c.slice(1), 16)
    const r = (n >> 16) & 255
    const g = (n >> 8) & 255
    const b = n & 255
    const max = Math.max(r, g, b)
    const sat = max === 0 ? 0 : (max - Math.min(r, g, b)) / max
    const val = max / 255
    if (val < 0.12) continue
    score.set(c, (score.get(c) ?? 0) + 0.15 + sat * sat * val * 3)
  }
  let best: string | null = null
  let bestScore = 0
  for (const [c, s] of score) {
    if (s > bestScore) {
      best = c
      bestScore = s
    }
  }
  return best
}

export async function suggestKitAccent(elementId: string): Promise<string | null> {
  const { project } = useProjectStore.getState()
  const element = project?.elements.find((e) => e.id === elementId)
  const family = element ? kitFamily(element) : null
  if (!project || !element || !family) return null

  const sourceId = project.textureAssignments[`item/${family.base}`]
  const source = sourceId ? project.textures.find((t) => t.id === sourceId) : undefined
  if (!source) return null

  try {
    return extractAccent(await dataUrlToGrid(source.data))
  } catch {
    return null
  }
}

export async function generateKitTextures(
  elementId: string,
  options: KitGenOptions = {}
): Promise<KitGenResult> {
  const { project, addTexture, updateTexture, assignTexture } = useProjectStore.getState()
  const element = project?.elements.find((e) => e.id === elementId)
  const family = element ? kitFamily(element) : null
  if (!project || !element || !family) return EMPTY_RESULT

  const accent = options.accent ?? (await suggestKitAccent(elementId)) ?? DEFAULT_KIT_ACCENT

  const jobs: { name: string; preset: string; protect: boolean }[] = []
  for (const tool of family.tools) {
    jobs.push({ name: tool, preset: tool.slice(family.base.length + 1), protect: false })
  }
  for (const piece of family.armor) {
    jobs.push({ name: piece, preset: piece.slice(family.base.length + 1), protect: false })
  }

  const result: KitGenResult = { ...EMPTY_RESULT, accent, pieces: jobs.length }

  for (const job of jobs) {
    const preset = TEXTURE_PRESETS.find((p) => p.id === job.preset)
    if (!preset) continue
    const slotKey = `item/${job.name}`

    const live = useProjectStore.getState().project
    if (!live) break

    const assignedId = live.textureAssignments[slotKey]
    const assigned = assignedId ? live.textures.find((t) => t.id === assignedId) : undefined

    if (assigned) {
      const isOurs = assigned.name.toLowerCase() === job.name.toLowerCase()
      if (options.regenerate && isOurs && !job.protect) {
        updateTexture(assigned.id, { data: gridToDataUrl(preset.generate(accent)) })
        result.updated++
      } else {
        result.kept++
      }
      continue
    }

    const existing = live.textures.find((t) => t.name.toLowerCase() === job.name.toLowerCase())
    if (existing) {
      assignTexture(slotKey, existing.id)
      result.reused++
      continue
    }

    const id = addTexture(job.name, gridToDataUrl(preset.generate(accent)), 'item')
    assignTexture(slotKey, id)
    result.created++
  }

  return result
}
