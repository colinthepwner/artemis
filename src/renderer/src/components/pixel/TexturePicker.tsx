import { useState } from 'react'
import { motion } from 'framer-motion'
import { ImageOff, Plus, X, Pencil } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useProjectStore } from '@/store/projectStore'
import type { TextureSlot } from '@shared/generator/textures'
import { cn } from '@/lib/cn'

export function TexturePicker({ slot }: { slot: TextureSlot }): JSX.Element {
  const [open, setOpen] = useState(false)
  const assignedId = useProjectStore((s) => s.project?.textureAssignments[slot.key])
  const textures = useProjectStore((s) => s.project?.textures)
  const assignTexture = useProjectStore((s) => s.assignTexture)
  const openTextureEditor = useAppStore((s) => s.openTextureEditor)

  const assigned = assignedId ? textures?.find((t) => t.id === assignedId) : undefined

  if (!slot.paintable) {
    return (
      <div className="flex w-[72px] flex-col items-center gap-1.5">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-md bg-ink-900/60 shadow-panel"
          title="64x32 skin. Paint it in an external editor and drop the PNG in after export."
        >
          <ImageOff size={16} className="text-mist-600" />
        </div>
        <span className="w-full truncate text-center text-2xs text-mist-600">{slot.label}</span>
      </div>
    )
  }

  const slotKind: 'block' | 'item' = slot.key.startsWith('item/') ? 'item' : 'block'

  return (
    <>
      <div className="flex w-[72px] flex-col items-center gap-1.5">
        <button
          onClick={() => setOpen(true)}
          title={assigned ? `${slot.label}: ${assigned.name}` : `${slot.label} (click to assign)`}
          className={cn(
            'group relative h-12 w-12 overflow-hidden rounded-md shadow-panel transition-all hover:z-10 hover:shadow-glow-gold',
            !assigned && 'bg-ink-900/60'
          )}
          style={
            assigned
              ? undefined
              : {
                  backgroundImage: 'repeating-conic-gradient(#31363e 0% 25%, #262b32 0% 50%)',
                  backgroundSize: '12px 12px'
                }
          }
        >
          {assigned ? (
            <img
              src={assigned.data}
              alt={assigned.name}
              className="h-full w-full"
              style={{ imageRendering: 'pixelated' }}
              draggable={false}
            />
          ) : (
            <Plus size={14} className="absolute inset-0 m-auto text-mist-600 group-hover:text-gold-400" />
          )}
        </button>
        <span className="w-full truncate text-center text-2xs text-mist-500">{slot.label}</span>
      </div>

      {open && (
        <PickerModal
          slotLabel={slot.label}
          kind={slotKind}
          onClose={() => setOpen(false)}
          onPick={(id) => {
            assignTexture(slot.key, id)
            setOpen(false)
          }}
          onCreate={() => {
            setOpen(false)
            openTextureEditor({
              textureId: null,
              assignSlotAfter: slot.key,
              kind: slotKind,
              suggestedName: slot.key.split('/').pop()
            })
          }}
          onEdit={
            assigned
              ? () => {
                  setOpen(false)
                  openTextureEditor({ textureId: assigned.id })
                }
              : undefined
          }
        />
      )}
    </>
  )
}

function PickerModal(props: {
  slotLabel: string
  kind: 'block' | 'item'
  onClose: () => void
  onPick: (id: string | null) => void
  onCreate: () => void
  onEdit?: () => void
}): JSX.Element {
  const allTextures = useProjectStore((s) => s.project?.textures)

  const textures = (allTextures ?? []).filter((t) => (t.kind ?? 'block') === props.kind)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <motion.div
        className="acrylic absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.12 }}
        onClick={props.onClose}
      />
      <motion.div
        className="relative flex max-h-[70vh] w-[420px] flex-col rounded-xl bg-ink-850 shadow-raised"
        initial={{ opacity: 0, scale: 0.97, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-center gap-2 border-b border-white/[0.04] px-4 py-2.5">
          <span className="text-2xs font-semibold uppercase tracking-wider text-gold-400/80">
            Pick {props.kind} texture
          </span>
          <span className="text-2xs text-mist-500">for {props.slotLabel}</span>
          <div className="flex-1" />
          {props.onEdit && (
            <button
              onClick={props.onEdit}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-2xs text-mist-400 transition-colors hover:bg-ink-750 hover:text-mist-200"
            >
              <Pencil size={11} /> Edit current
            </button>
          )}
          <button
            onClick={props.onClose}
            className="rounded-md p-1 text-mist-500 transition-colors hover:bg-ink-750 hover:text-mist-200"
          >
            <X size={14} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {textures.length === 0 ? (
            <p className="py-6 text-center text-2xs leading-relaxed text-mist-600">
              No {props.kind} textures in the Gallery yet. Paint the first one below.
            </p>
          ) : (
            <div className="grid grid-cols-5 gap-2.5">
              {textures.map((t) => (
                <button
                  key={t.id}
                  onClick={() => props.onPick(t.id)}
                  title={t.name}
                  className="group relative flex flex-col items-center gap-1 hover:z-10"
                >
                  <span className="overflow-hidden rounded-md shadow-panel transition-all group-hover:scale-105 group-hover:shadow-glow-gold">
                    <img
                      src={t.data}
                      alt={t.name}
                      className="h-14 w-14"
                      style={{ imageRendering: 'pixelated' }}
                      draggable={false}
                    />
                  </span>
                  <span className="w-16 truncate text-center text-2xs text-mist-500 group-hover:text-mist-300">
                    {t.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/[0.04] px-4 py-3">
          <button
            onClick={() => props.onPick(null)}
            className="rounded-md px-3 py-1.5 text-2xs text-mist-500 transition-colors hover:bg-ink-750 hover:text-mist-300"
          >
            Clear slot
          </button>
          <button
            onClick={props.onCreate}
            className="flex items-center gap-1.5 rounded-md bg-gold-500 px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-950 transition-all hover:bg-gold-400"
          >
            <Plus size={12} /> New texture
          </button>
        </div>
      </motion.div>
    </div>
  )
}
