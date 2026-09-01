import { create } from 'zustand'
import {
  createEmptyProject,
  titleCase,
  toRegistryName,
  type ArtemisElement,
  type ArtemisProject,
  type ElementGroup,
  type ElementKind,
  type ProjectMeta,
  type ProjectTexture,
  type TextureLayer
} from '@shared/project'
import { GROUP_COLORS } from '@/lib/kindIcons'
import { gzipToBase64, toGameAudio } from '@/lib/audio'
import { textureSlotsFor, textureSlotsForElement } from '@shared/generator/textures'
import { KIND_DEFAULTS, type ItemProps } from '@shared/generator/props'
import { kitFamily } from '@shared/generator/family'
import { migrateProject } from '@shared/migrate'

function rememberRecent(project: ArtemisProject, path: string): void {
  window.artemis.project.addRecent({
    path,
    name: project.meta.name,
    modId: project.meta.modId,
    version: project.meta.version,
    targetBta: project.meta.targetBta,
    openedAt: new Date().toISOString()
  })
}

export function normalize(parsed: ArtemisProject): ArtemisProject {
  if (parsed.formatVersion !== 1) {
    throw new Error(`Unsupported project format v${parsed.formatVersion}`)
  }
  parsed.textures ??= []
  parsed.sounds ??= []
  parsed.groups ??= []
  parsed.textureAssignments ??= {}
  parsed.codeOverrides ??= {}
  parsed.meta.obfuscate ??= true

  migrateProject(parsed)

  const itemAssigned = new Set(
    Object.entries(parsed.textureAssignments)
      .filter(([slotKey]) => slotKey.startsWith('item/'))
      .map(([, texId]) => texId)
  )
  for (const tex of parsed.textures) {
    tex.kind ??= itemAssigned.has(tex.id) ? 'item' : 'block'
  }
  return parsed
}

interface ProjectState {
  project: ArtemisProject | null

  filePath: string | null
  dirty: boolean

  newProject: (name: string, modId: string, targetBta?: string) => void
  openProject: () => Promise<void>
  openProjectByPath: (path: string) => Promise<void>
  saveProject: () => Promise<void>
  closeProject: () => void
  updateMeta: (patch: Partial<ProjectMeta>) => void

  addElement: (kind: ElementKind, name: string, properties: Record<string, unknown>) => string

  createElement: (
    kind: ElementKind,
    opts?: { props?: Record<string, unknown>; name?: string }
  ) => string

  duplicateElement: (id: string) => string | null

  promoteGenerated: (ownerId: string, registryName: string) => string | null
  updateElement: (id: string, patch: { name?: string; properties?: Record<string, unknown> }) => void
  removeElement: (id: string) => void
  elementsOf: (kind: ElementKind) => ArtemisElement[]

  createGroup: (name?: string) => string
  updateGroup: (
    id: string,
    patch: Partial<Pick<ElementGroup, 'name' | 'shelf' | 'color' | 'props'>>
  ) => void

  removeGroup: (id: string) => void

  setElementGroup: (elementId: string, groupId: string | null, index?: number) => void

  canJoinGroup: (elementId: string, groupId: string) => boolean

  moveInGroup: (groupId: string, from: number, to: number) => void

  moveGroup: (from: number, to: number) => void

  setCodeOverride: (path: string, content: string | null) => void

  addTexture: (
    name: string,
    data: string,
    kind: 'block' | 'item',
    layers?: TextureLayer[],

    emissive?: string
  ) => string
  updateTexture: (
    id: string,
    patch: { name?: string; data?: string; layers?: TextureLayer[]; emissive?: string }
  ) => void
  removeTexture: (id: string) => void

  importSound: () => Promise<string | null>
  updateSound: (id: string, patch: { name?: string; event?: string }) => void
  removeSound: (id: string) => void

  assignTexture: (slotKey: string, textureId: string | null) => void
  textureById: (id: string | undefined) => ProjectTexture | undefined
}

function withMatchedTextures(project: ArtemisProject): ArtemisProject {
  const byName = new Map<string, ProjectTexture>()
  for (const t of project.textures) byName.set(t.name.toLowerCase(), t)
  if (byName.size === 0) return project

  let assignments = project.textureAssignments
  let changed = false
  for (const slot of textureSlotsFor(project)) {
    if (!slot.paintable || assignments[slot.key]) continue
    const slash = slot.key.indexOf('/')
    const family = slot.key.slice(0, slash)
    const wanted = slot.key.slice(slash + 1)
    const texture = byName.get(wanted.toLowerCase())
    if (!texture) continue
    if ((texture.kind ?? 'block') !== family) continue
    if (!changed) {
      assignments = { ...assignments }
      changed = true
    }
    assignments[slot.key] = texture.id
  }
  return changed ? { ...project, textureAssignments: assignments } : project
}

function reorder<T>(list: T[], from: number, to: number): T[] {
  if (from === to) return list
  if (from < 0 || from >= list.length) return list
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved)
  return next
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: null,
  filePath: null,
  dirty: false,

  newProject: (name, modId, targetBta) =>
    set({ project: createEmptyProject(name, modId, targetBta), filePath: null, dirty: true }),

  openProject: async () => {
    const res = await window.artemis.project.open()
    if (!res) return
    const parsed = normalize(JSON.parse(res.json) as ArtemisProject)
    set({ project: parsed, filePath: res.path, dirty: false })
    rememberRecent(parsed, res.path)
  },

  openProjectByPath: async (path) => {
    const res = await window.artemis.project.openPath(path)
    if (!res) {

      window.artemis.project.removeRecent(path)
      throw new Error('That project file could not be opened. It may have been moved or deleted.')
    }
    const parsed = normalize(JSON.parse(res.json) as ArtemisProject)
    set({ project: parsed, filePath: res.path, dirty: false })
    rememberRecent(parsed, res.path)
  },

  saveProject: async () => {
    const { project, filePath } = get()
    if (!project) return
    const json = JSON.stringify(project, null, 2)
    const saved = await window.artemis.project.save(json, filePath)
    if (saved) {
      set({ filePath: saved, dirty: false })
      rememberRecent(project, saved)
    }
  },

  closeProject: () => set({ project: null, filePath: null, dirty: false }),

  updateMeta: (patch) =>
    set((s) =>
      s.project ? { project: { ...s.project, meta: { ...s.project.meta, ...patch } }, dirty: true } : s
    ),

  addElement: (kind, name, properties) => {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    set((s) =>
      s.project
        ? {
            project: withMatchedTextures({
              ...s.project,
              elements: [...s.project.elements, { id, kind, name, properties, createdAt: now, updatedAt: now }]
            }),
            dirty: true
          }
        : s
    )
    return id
  },

  updateElement: (id, patch) =>
    set((s) => {
      if (!s.project) return s
      const oldEl = s.project.elements.find((el) => el.id === id)
      if (!oldEl) return s
      const newEl: ArtemisElement = {
        ...oldEl,
        name: patch.name ?? oldEl.name,
        properties: patch.properties ?? oldEl.properties,
        updatedAt: new Date().toISOString()
      }

      let assignments = s.project.textureAssignments
      const oldSlots = textureSlotsForElement(oldEl)
      const newSlots = textureSlotsForElement(newEl)
      if (oldSlots.some((slot, i) => slot.key !== newSlots[i]?.key)) {
        assignments = { ...assignments }
        const moved: Record<string, string> = {}
        oldSlots.forEach((slot, i) => {
          const tex = assignments[slot.key]
          if (tex && newSlots[i]) moved[newSlots[i].key] = tex
          delete assignments[slot.key]
        })
        Object.assign(assignments, moved)
      }

      return {

        project: withMatchedTextures({
          ...s.project,
          elements: s.project.elements.map((el) => (el.id === id ? newEl : el)),
          textureAssignments: assignments
        }),
        dirty: true
      }
    }),

  removeElement: (id) =>
    set((s) => {
      if (!s.project) return s
      const el = s.project.elements.find((e) => e.id === id)
      const slotKeys = el ? textureSlotsForElement(el).map((slot) => slot.key) : []
      const slotSet = new Set(slotKeys)

      const orphans = new Set<string>()
      for (const key of slotKeys) {
        if (!key.startsWith('item/')) continue
        const texId = s.project.textureAssignments[key]
        const tex = texId ? s.project.textures.find((t) => t.id === texId) : undefined
        if (tex && tex.name === key.slice('item/'.length)) orphans.add(tex.id)
      }
      for (const [key, texId] of Object.entries(s.project.textureAssignments)) {
        if (!slotSet.has(key)) orphans.delete(texId)
      }

      const freed = el?.name
      const elements = s.project.elements
        .filter((e) => e.id !== id)
        .map((e) =>
          freed && e.detached?.includes(freed)
            ? { ...e, detached: e.detached.filter((n) => n !== freed) }
            : e
        )

      return {
        project: {
          ...s.project,
          elements,

          groups: (s.project.groups ?? []).map((g) =>
            g.members.includes(id) ? { ...g, members: g.members.filter((m) => m !== id) } : g
          ),
          textures: s.project.textures.filter((t) => !orphans.has(t.id)),

          textureAssignments: Object.fromEntries(
            Object.entries(s.project.textureAssignments).filter(
              ([key, texId]) => !slotSet.has(key) && !orphans.has(texId)
            )
          )
        },
        dirty: true
      }
    }),

  createElement: (kind, opts) => {

    const taken = new Set(get().project?.elements.map((e) => e.name) ?? [])
    const base = opts?.name ?? `new_${kind}`
    let name = base
    for (let i = 2; taken.has(name); i++) name = `${base}_${i}`
    return get().addElement(kind, name, {
      ...structuredClone(KIND_DEFAULTS[kind]),
      ...(opts?.props ?? {})
    })
  },

  promoteGenerated: (ownerId, registryName) => {
    const project = get().project
    if (!project) return null
    const owner = project.elements.find((e) => e.id === ownerId)
    if (!owner) return null

    const existing = project.elements.find((e) => e.name === registryName)
    if (existing) return existing.id

    const family = kitFamily(owner)
    const kitPiece = family
      ? [...family.tools, ...family.armor].includes(registryName)
      : false
    const portal = owner.kind === 'dimension' && registryName === `${owner.name}_portal`
    if (!kitPiece && !portal) return null

    let newId: string | null = null
    if (kitPiece) {

      const suffix = registryName.slice(owner.name.length + 1)
      const ownerProps = owner.properties as Partial<ItemProps>
      newId = get().addElement('item', registryName, {
        ...structuredClone(KIND_DEFAULTS['item']),
        displayName: titleCase(registryName),

        set: structuredClone(ownerProps.set ?? (KIND_DEFAULTS['item'] as { set: unknown }).set),
        generateSet: false,
        piece: suffix
      })
    } else {
      newId = get().addElement('block', registryName, {
        ...structuredClone(KIND_DEFAULTS['block']),
        displayName: titleCase(registryName)
      })
    }

    set((st) =>
      st.project
        ? {
            project: {
              ...st.project,
              elements: st.project.elements.map((e) =>
                e.id === ownerId
                  ? { ...e, detached: [...(e.detached ?? []), registryName], updatedAt: new Date().toISOString() }
                  : e
              )
            },
            dirty: true
          }
        : st
    )
    return newId
  },

  duplicateElement: (id) => {
    const src = get().project?.elements.find((e) => e.id === id)
    if (!src) return null

    const taken = new Set((get().project?.elements ?? []).map((e) => e.name))

    const stem = src.name.replace(/_copy(_\d+)?$/, '')
    let name = `${stem}_copy`
    for (let i = 2; taken.has(name); i++) name = `${stem}_copy_${i}`

    const properties = structuredClone(src.properties)

    if (Array.isArray(properties['variants'])) {
      properties['variants'] = (properties['variants'] as { id?: string }[]).map((v) => ({
        ...v,
        id: crypto.randomUUID()
      }))
    }
    const display = properties['displayName']
    if (typeof display === 'string' && display) {
      properties['displayName'] = `${display.replace(/ copy( \d+)?$/i, '')} copy`
    }
    const copyId = get().addElement(src.kind, name, properties)

    const home = (get().project?.groups ?? []).find((g) => g.members.includes(id))
    if (home) get().setElementGroup(copyId, home.id, home.members.indexOf(id) + 1)
    return copyId
  },

  createGroup: (name) => {
    const id = crypto.randomUUID()
    set((st) => {
      if (!st.project) return st
      const groups = st.project.groups ?? []
      const taken = new Set(groups.map((g) => g.name.toLowerCase()))
      const base = name?.trim() || 'New Group'
      let free = base
      for (let i = 2; taken.has(free.toLowerCase()); i++) free = `${base} ${i}`
      return {
        project: {
          ...st.project,
          groups: [
            ...groups,
            {
              id,
              name: free,

              shelf: 'misc',
              members: [],

              color: GROUP_COLORS[groups.length % GROUP_COLORS.length]
            }
          ]
        },
        dirty: true
      }
    })
    return id
  },

  updateGroup: (id, patch) =>
    set((st) =>
      st.project
        ? {
            project: {
              ...st.project,
              groups: (st.project.groups ?? []).map((g) => (g.id === id ? { ...g, ...patch } : g))
            },
            dirty: true
          }
        : st
    ),

  removeGroup: (id) =>
    set((st) =>
      st.project
        ? {
            project: { ...st.project, groups: (st.project.groups ?? []).filter((g) => g.id !== id) },
            dirty: true
          }
        : st
    ),

  canJoinGroup: (elementId, groupId) => {
    const project = get().project
    const el = project?.elements.find((e) => e.id === elementId)
    const group = project?.groups?.find((g) => g.id === groupId)
    if (!el || !group) return false

    if (group.members.includes(elementId)) return true
    return !group.kind || group.kind === el.kind
  },

  setElementGroup: (elementId, groupId, index) =>
    set((st) => {
      if (!st.project) return st
      const el = st.project.elements.find((e) => e.id === elementId)
      if (!el) return st
      const wanted = groupId ? st.project.groups?.find((g) => g.id === groupId) : undefined

      if (wanted && !wanted.members.includes(elementId) && wanted.kind && wanted.kind !== el.kind) {
        return st
      }

      const groups = (st.project.groups ?? []).map((g) => ({
        ...g,

        members: g.members.filter((m) => m !== elementId)
      }))
      const target = groupId ? groups.find((g) => g.id === groupId) : undefined
      if (target) {
        const at = index === undefined ? target.members.length : Math.max(0, Math.min(index, target.members.length))
        target.members = [...target.members.slice(0, at), elementId, ...target.members.slice(at)]
        target.kind = el.kind
      }

      for (const g of groups) {
        if (g.members.length === 0 && (g.kind || g.props)) {
          delete g.kind
          delete g.props
        }
      }
      return { project: { ...st.project, groups }, dirty: true }
    }),

  moveInGroup: (groupId, from, to) =>
    set((st) => {
      if (!st.project) return st
      return {
        project: {
          ...st.project,
          groups: (st.project.groups ?? []).map((g) => {
            if (g.id !== groupId) return g
            return { ...g, members: reorder(g.members, from, to) }
          })
        },
        dirty: true
      }
    }),

  moveGroup: (from, to) =>
    set((st) =>
      st.project ? { project: { ...st.project, groups: reorder(st.project.groups ?? [], from, to) }, dirty: true } : st
    ),

  elementsOf: (kind) => get().project?.elements.filter((el) => el.kind === kind) ?? [],

  setCodeOverride: (path, content) =>
    set((s) => {
      if (!s.project) return s
      const overrides = { ...s.project.codeOverrides }
      if (content === null) delete overrides[path]
      else overrides[path] = content
      return { project: { ...s.project, codeOverrides: overrides }, dirty: true }
    }),

  addTexture: (name, data, kind, layers, emissive) => {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    set((s) =>
      s.project
        ? {
            project: {
              ...s.project,
              textures: [
                ...s.project.textures,
                { id, name, data, kind, layers, emissive, createdAt: now, updatedAt: now }
              ]
            },
            dirty: true
          }
        : s
    )
    return id
  },

  updateTexture: (id, patch) =>
    set((s) =>
      s.project
        ? {
            project: {
              ...s.project,
              textures: s.project.textures.map((t) =>
                t.id === id
                  ? {
                      ...t,
                      name: patch.name ?? t.name,
                      data: patch.data ?? t.data,
                      layers: patch.layers ?? t.layers,
                      updatedAt: new Date().toISOString()
                    }
                  : t
              )
            },
            dirty: true
          }
        : s
    ),

  importSound: async () => {
    const picked = await window.artemis.sound.importAudio()
    if (!picked) return null
    const raw = Uint8Array.from(atob(picked.data), (c) => c.charCodeAt(0))

    const converted = await toGameAudio(raw.buffer as ArrayBuffer, picked.ext)
    const audio = await gzipToBase64(converted.data)
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const name = toRegistryName(picked.name) || 'sound'
    set((st) =>
      st.project
        ? {
            project: {
              ...st.project,
              sounds: [
                ...(st.project.sounds ?? []),
                {
                  id,
                  name,
                  event: name.replace(/_/g, '.'),
                  format: converted.format,
                  audio,

                  bytes: converted.data.length,
                  createdAt: now,
                  updatedAt: now
                }
              ]
            },
            dirty: true
          }
        : st
    )
    return id
  },

  updateSound: (id, patch) =>
    set((st) =>
      st.project
        ? {
            project: {
              ...st.project,
              sounds: (st.project.sounds ?? []).map((s2) =>
                s2.id === id ? { ...s2, ...patch, updatedAt: new Date().toISOString() } : s2
              )
            },
            dirty: true
          }
        : st
    ),

  removeSound: (id) =>
    set((st) =>
      st.project
        ? {
            project: { ...st.project, sounds: (st.project.sounds ?? []).filter((s2) => s2.id !== id) },
            dirty: true
          }
        : st
    ),

  removeTexture: (id) =>
    set((s) => {
      if (!s.project) return s

      const assignments = Object.fromEntries(
        Object.entries(s.project.textureAssignments).filter(([, texId]) => texId !== id)
      )
      return {
        project: {
          ...s.project,
          textures: s.project.textures.filter((t) => t.id !== id),
          textureAssignments: assignments
        },
        dirty: true
      }
    }),

  assignTexture: (slotKey, textureId) =>
    set((s) => {
      if (!s.project) return s
      const assignments = { ...s.project.textureAssignments }
      if (textureId) assignments[slotKey] = textureId
      else delete assignments[slotKey]
      return { project: { ...s.project, textureAssignments: assignments }, dirty: true }
    }),

  textureById: (id) => (id ? get().project?.textures.find((t) => t.id === id) : undefined)
}))
