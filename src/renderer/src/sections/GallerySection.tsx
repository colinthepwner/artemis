import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Trash2, Copy, Images, Paintbrush } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useProjectStore } from '@/store/projectStore'
import { textureSlotsFor, type TextureSlot } from '@shared/generator/textures'
import type { ProjectTexture } from '@shared/project'
import { cn } from '@/lib/cn'

type Shelf = 'block' | 'item'

export function GallerySection(): JSX.Element {
  const project = useProjectStore((s) => s.project)
  const textures = useProjectStore((s) => s.project?.textures)
  const removeTexture = useProjectStore((s) => s.removeTexture)
  const addTexture = useProjectStore((s) => s.addTexture)
  const openTextureEditor = useAppStore((s) => s.openTextureEditor)
  const [shelf, setShelf] = useState<Shelf>('block')

  const usage = useMemo(() => {
    const counts = new Map<string, number>()
    if (!project) return counts
    const validSlotKeys = new Set(textureSlotsFor(project).map((s) => s.key))
    for (const [slotKey, texId] of Object.entries(project.textureAssignments)) {
      if (validSlotKeys.has(slotKey)) counts.set(texId, (counts.get(texId) ?? 0) + 1)
    }
    return counts
  }, [project])

  const missing = useMemo<TextureSlot[]>(() => {
    if (!project) return []
    return textureSlotsFor(project).filter(
      (s) =>
        s.paintable &&
        !project.textureAssignments[s.key] &&
        (s.key.startsWith('item/') ? 'item' : 'block') === shelf
    )
  }, [project, shelf])

  const shelfTextures = (textures ?? []).filter((t) => (t.kind ?? 'block') === shelf)
  const blockCount = (textures ?? []).filter((t) => (t.kind ?? 'block') === 'block').length
  const itemCount = (textures ?? []).filter((t) => t.kind === 'item').length

  const duplicate = (t: ProjectTexture): void => {

    const taken = new Set((textures ?? []).map((x) => x.name.toLowerCase()))
    let name = `${t.name}_copy`
    for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${t.name}_copy_${i}`
    const id = addTexture(name, t.data, t.kind ?? 'block')
    openTextureEditor({ textureId: id })
  }

  const paintSlot = (slot: TextureSlot): void => {
    openTextureEditor({
      textureId: null,
      kind: shelf,
      assignSlotAfter: slot.key,
      suggestedName: slot.key.split('/').pop()
    })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-white/[0.04] px-5">
        <h2 className="text-sm font-semibold tracking-tight">Gallery</h2>

        <div className="ml-2 flex gap-1 rounded-md bg-ink-900/60 p-0.5 shadow-panel">
          {(
            [
              { id: 'block', label: 'Block Textures', count: blockCount },
              { id: 'item', label: 'Item Textures', count: itemCount }
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setShelf(t.id)}
              className={cn(
                'flex items-center gap-1.5 rounded px-2.5 py-1 text-2xs font-semibold uppercase tracking-wide transition-colors',
                shelf === t.id ? 'bg-ink-750 text-gold-400 shadow-panel' : 'text-mist-500 hover:text-mist-300'
              )}
            >
              {t.label}
              <span className={cn('font-mono font-normal', shelf === t.id ? 'text-gold-400/60' : 'text-mist-600')}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex-1" />
        <button
          onClick={() => openTextureEditor({ textureId: null, kind: shelf })}
          className="flex items-center gap-1.5 rounded-md bg-gold-500 px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-950 transition-all hover:bg-gold-400 active:scale-[0.97]"
        >
          <Plus size={13} strokeWidth={2.5} /> New {shelf === 'block' ? 'Block' : 'Item'} Texture
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {shelfTextures.length === 0 && missing.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink-800 shadow-panel">
              <Images size={20} className="text-mist-600" strokeWidth={1.5} />
            </div>
            <p className="max-w-sm text-[13px] leading-relaxed text-mist-500">
              {shelf === 'block'
                ? 'Block textures cover the faces of your blocks, ores and trees.'
                : 'Item textures are the icons for materials, tools and armor.'}{' '}
              Paint them here, or as you build elements.
            </p>
            <button
              onClick={() => openTextureEditor({ textureId: null, kind: shelf })}
              className="flex items-center gap-1.5 rounded-md bg-ink-750 px-4 py-2 text-[13px] text-mist-200 transition-colors hover:bg-ink-700"
            >
              <Plus size={14} /> Paint your first texture
            </button>
          </div>
        ) : (
          <>
            {shelfTextures.length > 0 && (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
                {shelfTextures.map((t) => (
                  <TextureCard
                    key={t.id}
                    texture={t}
                    usedCount={usage.get(t.id) ?? 0}
                    onOpen={() => openTextureEditor({ textureId: t.id })}
                    onDuplicate={() => duplicate(t)}
                    onDelete={() => removeTexture(t.id)}
                  />
                ))}
              </div>
            )}

            {missing.length > 0 && (
              <>
                <div className="mb-2 mt-6 flex items-center gap-2">
                  <Paintbrush size={12} className="text-ember-400" />
                  <h3 className="text-2xs font-semibold uppercase tracking-wider text-mist-400">
                    Needs painting
                  </h3>
                  <span className="font-mono text-2xs text-mist-600">{missing.length}</span>
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
                  {missing.map((slot) => (
                    <MissingCard key={slot.key} slot={slot} onPaint={() => paintSlot(slot)} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function TextureCard(props: {
  texture: ProjectTexture
  usedCount: number
  onOpen: () => void
  onDuplicate: () => void
  onDelete: () => void
}): JSX.Element {
  const { texture: t } = props
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="card group relative flex flex-col items-center gap-2 p-3 transition-all hover:bg-ink-750 hover:shadow-raised"
      onClick={props.onOpen}
    >
      <span
        className="overflow-hidden rounded-md shadow-panel"
        style={{
          backgroundImage: 'repeating-conic-gradient(#31363e 0% 25%, #262b32 0% 50%)',
          backgroundSize: '16px 16px'
        }}
      >
        <img
          src={t.data}
          alt={t.name}
          className="h-16 w-16"
          style={{ imageRendering: 'pixelated' }}
          draggable={false}
        />
      </span>
      <span className="w-full truncate text-center font-mono text-2xs text-mist-300">{t.name}</span>
      <span className="text-2xs text-mist-600">
        {props.usedCount ? `used ×${props.usedCount}` : 'unused'}
      </span>

      <div className="absolute right-1.5 top-1.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          title="Duplicate"
          onClick={(e) => {
            e.stopPropagation()
            props.onDuplicate()
          }}
          className="rounded p-1 text-mist-500 transition-colors hover:bg-ink-700 hover:text-mist-200"
        >
          <Copy size={12} />
        </button>
        <button
          title="Delete"
          onClick={(e) => {
            e.stopPropagation()
            props.onDelete()
          }}
          className="rounded p-1 text-mist-600 transition-colors hover:bg-ember-500/15 hover:text-ember-400"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </motion.div>
  )
}

function MissingCard({ slot, onPaint }: { slot: TextureSlot; onPaint: () => void }): JSX.Element {
  return (
    <button
      onClick={onPaint}
      title={slot.key}
      className="group flex flex-col items-center gap-2 rounded-lg border border-dashed border-white/10 p-3 transition-all hover:border-gold-500/40 hover:bg-ink-800"
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-md bg-ink-900/50">
        <Paintbrush size={16} className="text-mist-600 transition-colors group-hover:text-gold-400" />
      </span>
      <span className="w-full truncate text-center font-mono text-2xs text-mist-500">
        {slot.key.split('/').pop()}
      </span>
      <span className="text-2xs text-mist-600 transition-colors group-hover:text-gold-400">
        Paint it
      </span>
    </button>
  )
}
