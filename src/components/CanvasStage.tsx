import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { PaintSurface, type CutoutResult, type ViewState } from '../lib/paintSurface'
import type { HistoryState, LoadedPhoto, PhotoState, Tool } from '../types'

export type StageHandle = {
  undo: () => void
  redo: () => void
  clearPaint: () => void
  fit: () => void
  autoScale: () => void
  setContentScale: (scale: number) => void
  applyCutout: (strength: number) => CutoutResult | null
  repairCutout: () => void
  resetCutout: () => void
  setSpace: (held: boolean) => void
}

type CanvasStageProps = {
  image: LoadedPhoto | null
  tool: Tool
  color: string
  brushSize: number
  opacity: number
  spaceHeld: boolean
  onPickColor: (hex: string, commit: boolean) => void
  onStroke: (hex: string) => void
  onHistory: (history: HistoryState) => void
  onPhoto: (photo: PhotoState) => void
  onError: (message: string) => void
  onBrowse: () => void
}

export const CanvasStage = forwardRef<StageHandle, CanvasStageProps>(function CanvasStage(
  { image, tool, color, brushSize, opacity, spaceHeld, onPickColor, onStroke, onHistory, onPhoto, onError, onBrowse },
  ref,
) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const photoRef = useRef<HTMLCanvasElement>(null)
  const paintRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<PaintSurface | null>(null)
  const [view, setView] = useState<ViewState>({ x: 0, y: 0, z: 1, contentScale: 1 })

  const onPickRef = useRef(onPickColor)
  const onStrokeRef = useRef(onStroke)
  const onHistoryRef = useRef(onHistory)
  const onPhotoRef = useRef(onPhoto)
  const onErrorRef = useRef(onError)
  onPickRef.current = onPickColor
  onStrokeRef.current = onStroke
  onHistoryRef.current = onHistory
  onPhotoRef.current = onPhoto
  onErrorRef.current = onError

  const configRef = useRef({ tool, color, brushSize, opacity, space: spaceHeld })
  configRef.current = { tool, color, brushSize, opacity, space: spaceHeld }

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const photo = photoRef.current
    const paint = paintRef.current
    const preview = previewRef.current
    if (!viewport || !photo || !paint || !preview) return
    const surface = new PaintSurface(photo, paint, preview, viewport, {
      view: setView,
      photo: (state) => onPhotoRef.current(state),
      history: (history) => onHistoryRef.current(history),
      pick: (hex, commit) => onPickRef.current(hex, commit),
      stroke: (hex) => onStrokeRef.current(hex),
      error: (message) => onErrorRef.current(message),
    })
    surfaceRef.current = surface
    surface.configure(configRef.current)
    surface.setRing(ringRef.current)
    surface.setImage(image)
    return () => {
      surface.dispose()
      if (surfaceRef.current === surface) surfaceRef.current = null
    }
  }, [image])

  useLayoutEffect(() => {
    surfaceRef.current?.configure(configRef.current)
    surfaceRef.current?.setRing(ringRef.current)
  })

  useImperativeHandle(ref, () => ({
    undo: () => surfaceRef.current?.undo(),
    redo: () => surfaceRef.current?.redo(),
    clearPaint: () => surfaceRef.current?.clearPaint(),
    fit: () => surfaceRef.current?.fit(),
    autoScale: () => surfaceRef.current?.autoScale(),
    setContentScale: (scale: number) => surfaceRef.current?.setContentScale(scale),
    applyCutout: (strength: number) => surfaceRef.current?.applyCutout(strength) ?? null,
    repairCutout: () => surfaceRef.current?.repairMask(),
    resetCutout: () => surfaceRef.current?.resetCutout(),
    setSpace: (held: boolean) => surfaceRef.current?.setSpace(held),
  }))

  const zoomLabel = `${Math.round(view.z * 100)}%`

  return (
    <div
      ref={viewportRef}
      className="viewport"
      data-tool={tool}
      data-space={spaceHeld ? 'true' : 'false'}
      role="application"
      aria-label="Miniature photo. Paint tints the picture and keeps its light and shadow."
      style={{ '--brush': `${brushSize}px` } as CSSProperties}
    >
      <div
        className="stage"
        hidden={!image}
        style={
          image
            ? {
                width: image.width * view.contentScale,
                height: image.height * view.contentScale,
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`,
              }
            : undefined
        }
      >
        <canvas ref={photoRef} className="photo-layer" aria-hidden="true" />
        <canvas ref={paintRef} className="tint-store" aria-hidden="true" />
        <canvas ref={previewRef} className="display-layer" aria-hidden="true" />
      </div>

      {!image && (
        <div className="empty">
          <MiniSilhouette />
          <h2>Drop a miniature photo</h2>
          <p>Tint the photo like paint on a miniature. Edges, highlights, and shadows stay visible.</p>
          <button type="button" className="btn btn-primary" onClick={onBrowse}>
            Upload photo
          </button>
        </div>
      )}

      <div
        ref={ringRef}
        className={tool === 'eraser' || tool === 'eraseBackdrop' ? 'cursor-ring is-eraser' : 'cursor-ring'}
      />

      {image && (
        <button
          type="button"
          className="zoom-chip"
          title="View zoom. Click to frame the photo. This does not change photo scale."
          onClick={() => surfaceRef.current?.fit()}
        >
          View {zoomLabel} · Fit view
        </button>
      )}
    </div>
  )
})

function MiniSilhouette() {
  return (
    <svg className="empty-mark" viewBox="0 0 80 96" aria-hidden="true">
      <ellipse cx="40" cy="86" rx="22" ry="6" />
      <path d="M40 76c-8 0-12-6-12-14l-8-5 7-9 5 3V30l8-8 8 8v21l5-3 7 9-8 5c0 8-4 14-12 14z" />
      <circle cx="40" cy="18" r="7" />
    </svg>
  )
}
