import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Trash2, Wand2 } from 'lucide-react'
import { useProjectStore } from '@/store/projectStore'
import { ICON_SIZE, pickIcon } from '@shared/iconPick'
import { IconCropper } from './IconCropper'

function readPixels(src: string): Promise<Uint8ClampedArray | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onerror = () => resolve(null)
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) return resolve(null)
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve(null)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, 0, 0)
      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height).data)
    }
    img.src = src
  })
}

function useAutoIcon(): { data: string; name: string } | null {
  const textures = useProjectStore((s) => s.project?.textures) ?? NONE
  const [chosen, setChosen] = useState<{ data: string; name: string } | null>(null)

  const key = textures.map((t) => `${t.id}:${t.data.length}`).join('|')
  const seen = useRef('')

  useEffect(() => {
    if (seen.current === key) return
    seen.current = key
    let live = true
    void (async () => {
      const candidates: { id: string; rgba: Uint8ClampedArray }[] = []
      for (const t of textures) {
        const rgba = await readPixels(t.data)
        if (rgba) candidates.push({ id: t.id, rgba })
      }
      if (!live) return
      const best = pickIcon(candidates)
      const texture = best ? textures.find((t) => t.id === best.id) : undefined
      setChosen(texture ? { data: texture.data, name: texture.name } : null)
    })()
    return () => {
      live = false
    }
  }, [key, textures])

  return chosen
}

const NONE: never[] = []

export function ModIconField(): JSX.Element {
  const project = useProjectStore((s) => s.project)
  const updateMeta = useProjectStore((s) => s.updateMeta)
  const auto = useAutoIcon()
  const fileRef = useRef<HTMLInputElement>(null)

  const [framing, setFraming] = useState<string | null>(null)

  const uploaded = project?.meta.icon?.trim() || ''
  const shown = uploaded || auto?.data || ''

  const onFile = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]

    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setFraming(String(reader.result))
    reader.readAsDataURL(file)
  }

  return (
    <div>
      <label className="label-base">Mod Icon</label>
      <div className="flex items-center gap-3.5">
        {

}
        <div
          data-tour="settings-icon"
          className="h-16 w-16 shrink-0 overflow-hidden rounded-lg shadow-panel"
          style={{

            backgroundImage: [
              shown ? `url(${shown})` : null,
              'repeating-conic-gradient(#31363e 0% 25%, #262b32 0% 50%)'
            ]
              .filter(Boolean)
              .join(', '),
            backgroundSize: shown ? 'cover, 12px 12px' : '12px 12px',

            imageRendering: uploaded ? 'auto' : 'pixelated'
          }}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 rounded-md bg-ink-750 px-2.5 py-1.5 text-2xs text-mist-200 transition-colors hover:bg-ink-700"
            >
              <ImagePlus size={12} /> {uploaded ? 'Replace' : 'Upload an image'}
            </button>
            {uploaded && (
              <button
                onClick={() => updateMeta({ icon: '' })}
                className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-2xs text-mist-500 transition-colors hover:bg-ink-800 hover:text-mist-300"
              >
                <Trash2 size={12} /> Remove
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={onFile}
              className="hidden"
            />
          </div>

          <p className="mt-1.5 text-2xs leading-relaxed text-mist-500">
            {uploaded ? (
              `Cropped to ${ICON_SIZE} by ${ICON_SIZE}. It goes in the jar as the mod's icon.`
            ) : auto ? (
              <span className="flex items-center gap-1.5">
                <Wand2 size={11} className="shrink-0 text-gold-400" />
                Using your <span className="text-mist-300">{auto.name}</span> texture until you
                upload one.
              </span>
            ) : (
              'Paint a texture or upload an image, and the mod gets an icon.'
            )}
          </p>
        </div>
      </div>

      {framing && (
        <IconCropper
          src={framing}
          onCancel={() => setFraming(null)}
          onDone={(dataUrl) => {
            updateMeta({ icon: dataUrl })
            setFraming(null)
          }}
        />
      )}
    </div>
  )
}
