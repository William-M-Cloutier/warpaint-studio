import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { PaintSurface, type ViewState } from '../lib/paintSurface'
import type { HistoryState, LoadedPhoto, Tool } from '../types'

export type StageHandle = {
  undo: () => void
  redo: () => void
  clearPaint: () => void
  fit: () => void
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
  onError: (message: string) => void
  onBrowse: () => void
}

export const CanvasStage = forwardRef<StageHandle, CanvasStageProps>(function CanvasStage(
  { image, tool, color, brushSize, opacity, spaceHeld, onPickColor, onStroke, onHistory, onError, onBrowse },
  ref,
) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const paintRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<PaintSurface | null>(null)
  const [view, setView] = useState<ViewState>({ x: 0, y: 0, z: 1 })

  const onPickRef = useRef(onPickColor)
  const onStrokeRef = useRef(onStroke)
  const onHistoryRef = useRef(onHistory)
  const onErrorRef = useRef(onError)
  onPickRef.current = onPickColor
  onStrokeRef.current = onStroke
  onHistoryRef.current = onHistory
  onErrorRef.current = onError

  const configRef = useRef({ tool, color, brushSize, opacity, space: spaceHeld })
  configRef.current = { tool, color, brushSize, opacity, space: spaceHeld }

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const paint = paintRef.current
    const preview = previewRef.current
    if (!viewport || !paint || !preview) return
    const surface = new PaintSurface(paint, preview, viewport, {
      view: setView,
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
                width: image.width,
                height: image.height,
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`,
              }
            : undefined
        }
      >
        {image && (
          <img src={image.url} alt="" draggable={false} width={image.width} height={image.height} />
        )}
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

      <div ref={ringRef} className={tool === 'eraser' ? 'cursor-ring is-eraser' : 'cursor-ring'} />

      {image && (
        <button type="button" className="zoom-chip" onClick={() => surfaceRef.current?.fit()}>
          {zoomLabel} · Fit
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
