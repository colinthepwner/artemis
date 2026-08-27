import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, X, ZoomIn } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { ICON_SIZE } from '@shared/iconPick'
import {
  MAX_ZOOM,
  centeredView,
  clampView,
  coverScale,
  scaleView,
  zoomAt,
  type CropView
} from '@shared/imageCrop'

const VIEWPORT = 280

export function IconCropper(props: {

  src: string
  onCancel: () => void
  onDone: (dataUrl: string) => void
}): JSX.Element {
  const reduceAnimations = useAppStore((s) => s.reduceAnimations)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [view, setView] = useState<CropView>({ scale: 1, ox: 0, oy: 0 })
  const [failed, setFailed] = useState(false)

  const drag = useRef<{ x: number; y: number; from: CropView } | null>(null)

  useEffect(() => {
    let live = true
    const img = new Image()
    img.onload = () => {
      if (!live) return
      imageRef.current = img
      setSize({ w: img.naturalWidth, h: img.naturalHeight })
      setView(centeredView(img.naturalWidth, img.naturalHeight, VIEWPORT))
    }
    img.onerror = () => live && setFailed(true)
    img.src = props.src
    return () => {
      live = false
    }
  }, [props.src])

  useEffect(() => {
    const canvas = canvasRef.current
    const img = imageRef.current
    if (!canvas || !img || !size) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = VIEWPORT * dpr
    canvas.height = VIEWPORT * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, VIEWPORT, VIEWPORT)

    ctx.imageSmoothingEnabled = view.scale < 1
    ctx.drawImage(img, view.ox, view.oy, size.w * view.scale, size.h * view.scale)
  }, [view, size])

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>): void => {
      if (!size) return
      const box = e.currentTarget.getBoundingClientRect()
      const at = { x: e.clientX - box.left, y: e.clientY - box.top }

      setView((v) => zoomAt(v, e.deltaY < 0 ? 1.15 : 1 / 1.15, at, size.w, size.h, VIEWPORT))
    },
    [size]
  )

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!size) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, from: view }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (!d || !size) return
    setView(
      clampView(
        { scale: d.from.scale, ox: d.from.ox + (e.clientX - d.x), oy: d.from.oy + (e.clientY - d.y) },
        size.w,
        size.h,
        VIEWPORT
      )
    )
  }
  const endDrag = (e: React.PointerEvent<HTMLDivElement>): void => {
    drag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const save = (): void => {
    const img = imageRef.current
    if (!img || !size) return
    const out = document.createElement('canvas')
    out.width = ICON_SIZE
    out.height = ICON_SIZE
    const ctx = out.getContext('2d')
    if (!ctx) return
    const v = scaleView(view, VIEWPORT, ICON_SIZE)
    ctx.imageSmoothingEnabled = v.scale < 1
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, v.ox, v.oy, size.w * v.scale, size.h * v.scale)
    props.onDone(out.toDataURL('image/png'))
  }

  const min = size ? coverScale(size.w, size.h, VIEWPORT) : 1
  const zoom = size ? view.scale / min : 1

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') props.onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])

  return (
    <div className="fixed inset-0 z-[92] flex items-center justify-center">
      <div className="acrylic absolute inset-0" onClick={props.onCancel} />
      <motion.div
        initial={reduceAnimations ? false : { opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reduceAnimations ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="relative rounded-xl bg-ink-850 p-5 shadow-raised"
      >
        <h3 className="text-[13px] font-semibold tracking-tight text-mist-50">Frame your icon</h3>
        <p className="mt-1 text-2xs text-mist-500">Drag to move, scroll or use the slider to zoom.</p>

        <div
          className="relative mt-3.5 cursor-grab overflow-hidden rounded-lg bg-ink-900 active:cursor-grabbing"
          style={{ width: VIEWPORT, height: VIEWPORT }}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <canvas
            ref={canvasRef}
            className="block"
            style={{ width: VIEWPORT, height: VIEWPORT, touchAction: 'none' }}
          />
          {failed && (
            <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-2xs text-ember-400">
              That file could not be read as an image.
            </p>
          )}
          {
}
          <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-white/15" />
        </div>

        <div className="mt-3.5 flex items-center gap-2.5">
          <ZoomIn size={13} className="shrink-0 text-mist-500" />
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={!size}
            onChange={(e) => {
              if (!size) return
              const at = { x: VIEWPORT / 2, y: VIEWPORT / 2 }
              const target = min * Number(e.target.value)
              setView((v) => zoomAt(v, target / v.scale, at, size.w, size.h, VIEWPORT))
            }}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-ink-700 accent-gold-500"
          />
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={props.onCancel}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-2xs text-mist-400 transition-colors hover:bg-ink-800 hover:text-mist-200"
          >
            <X size={12} /> Cancel
          </button>
          <button
            onClick={save}
            disabled={!size}
            className="ml-auto flex items-center gap-1.5 rounded-md bg-gold-500 px-3.5 py-1.5 text-[13px] font-medium text-ink-950 transition-all hover:bg-gold-400 active:scale-[0.98] disabled:opacity-40"
          >
            <Check size={13} strokeWidth={2.4} /> Use this
          </button>
        </div>
      </motion.div>
    </div>
  )
}
