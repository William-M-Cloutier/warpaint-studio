import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { PaintSurface, type CutoutResult, type ViewState } from '../lib/paintSurface'
import type {
  HighlightPigment,
  HistoryState,
  LoadedPhoto,
  MaskMode,
  PhotoState,
  SectionCategory,
  SectionInfo,
  Tool,
} from '../types'

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
  selectSection: (id: string | null) => void
  renameSection: (id: string, name: string) => void
  labelSection: (id: string, category: SectionCategory, customLabel: string) => void
  setSectionVisible: (id: string, visible: boolean) => void
  setSectionLocked: (id: string, locked: boolean) => void
  deleteSection: (id: string) => void
  proposeSections: () => number
  clearRidges: () => void
  fillSection: () => void
  autoHighlight: (pigment: HighlightPigment) => 'ok' | 'empty' | 'blocked' | 'none'
  sampleActivePigment: () => string | null
}

type CanvasStageProps = {
  image: LoadedPhoto | null
  tool: Tool
  color: string
  brushSize: number
  opacity: number
  spaceHeld: boolean
  tolerance: number
  showEdges: boolean
  edgeSnap: boolean
  snapStrength: number
  maskMode: MaskMode
  paintLook: number
  undercoat: number
  viewBackdrop: string | null
  backdropImage: string | null
  sectionChip: { name: string; color: string } | null
  onPickColor: (hex: string, commit: boolean) => void
  onStroke: (hex: string) => void
  onHistory: (history: HistoryState) => void
  onPhoto: (photo: PhotoState) => void
  onSections: (sections: SectionInfo[], activeId: string | null) => void
  onError: (message: string) => void
  onBrowse: () => void
  onRidges: (active: boolean) => void
}

export const CanvasStage = forwardRef<StageHandle, CanvasStageProps>(function CanvasStage(
  {
    image,
    tool,
    color,
    brushSize,
    opacity,
    spaceHeld,
    tolerance,
    showEdges,
    edgeSnap,
    snapStrength,
    maskMode,
    paintLook,
    undercoat,
    viewBackdrop,
    backdropImage,
    sectionChip,
    onPickColor,
    onStroke,
    onHistory,
    onPhoto,
    onSections,
    onError,
    onBrowse,
    onRidges,
  },
  ref,
) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const photoRef = useRef<HTMLCanvasElement>(null)
  const paintRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<PaintSurface | null>(null)
  const [view, setView] = useState<ViewState>({ x: 0, y: 0, z: 1, contentScale: 1 })

  const onPickRef = useRef(onPickColor)
  const onStrokeRef = useRef(onStroke)
  const onHistoryRef = useRef(onHistory)
  const onPhotoRef = useRef(onPhoto)
  const onSectionsRef = useRef(onSections)
  const onErrorRef = useRef(onError)
  const onRidgesRef = useRef(onRidges)
  onPickRef.current = onPickColor
  onStrokeRef.current = onStroke
  onHistoryRef.current = onHistory
  onPhotoRef.current = onPhoto
  onSectionsRef.current = onSections
  onErrorRef.current = onError
  onRidgesRef.current = onRidges

  const configRef = useRef({
    tool,
    color,
    brushSize,
    opacity,
    space: spaceHeld,
    tolerance,
    showEdges,
    edgeSnap,
    snapStrength,
    maskMode,
    paintLook,
    undercoat,
  })
  configRef.current = {
    tool,
    color,
    brushSize,
    opacity,
    space: spaceHeld,
    tolerance,
    showEdges,
    edgeSnap,
    snapStrength,
    maskMode,
    paintLook,
    undercoat,
  }

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const photo = photoRef.current
    const paint = paintRef.current
    const preview = previewRef.current
    const overlay = overlayRef.current
    if (!viewport || !photo || !paint || !preview || !overlay) return
    const surface = new PaintSurface(photo, paint, preview, overlay, viewport, {
      view: setView,
      photo: (state) => onPhotoRef.current(state),
      history: (history) => onHistoryRef.current(history),
      pick: (hex, commit) => onPickRef.current(hex, commit),
      stroke: (hex) => onStrokeRef.current(hex),
      sections: (sections, activeId) => onSectionsRef.current(sections, activeId),
      ridges: (active) => onRidgesRef.current(active),
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
    selectSection: (id: string | null) => surfaceRef.current?.selectSection(id),
    renameSection: (id: string, name: string) => surfaceRef.current?.renameSection(id, name),
    labelSection: (id: string, category: SectionCategory, customLabel: string) =>
      surfaceRef.current?.labelSection(id, category, customLabel),
    setSectionVisible: (id: string, visible: boolean) => surfaceRef.current?.setSectionVisible(id, visible),
    setSectionLocked: (id: string, locked: boolean) => surfaceRef.current?.setSectionLocked(id, locked),
    deleteSection: (id: string) => surfaceRef.current?.deleteSection(id),
    proposeSections: () => surfaceRef.current?.proposeSections() ?? 0,
    clearRidges: () => surfaceRef.current?.clearRidges(),
    fillSection: () => surfaceRef.current?.fillSection(),
    autoHighlight: (pigment: HighlightPigment) => surfaceRef.current?.autoHighlight(pigment) ?? 'none',
    sampleActivePigment: () => surfaceRef.current?.sampleActivePigment() ?? null,
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
      style={
        {
          '--brush': `${brushSize * view.contentScale * view.z}px`,
          ...(viewBackdrop || backdropImage
            ? {
                backgroundColor: viewBackdrop ?? '#111111',
                backgroundImage: backdropImage ? `url("${backdropImage}")` : 'none',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
              }
            : null),
        } as CSSProperties
      }
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
        <canvas ref={overlayRef} className="section-layer" aria-hidden="true" />
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
        className={
          tool === 'eraser' ||
          tool === 'eraseBackdrop' ||
          tool === 'edgeErase' ||
          (tool === 'maskBrush' && maskMode === 'subtract')
            ? 'cursor-ring is-eraser'
            : 'cursor-ring'
        }
      />

      {image && (
        <div className={sectionChip ? 'section-chip is-clipped' : 'section-chip'} role="status">
          <span
            className={sectionChip ? 'section-badge' : 'section-badge is-whole'}
            style={sectionChip ? { background: sectionChip.color } : undefined}
          />
          <span className="section-chip-label">{sectionChip ? `Inside ${sectionChip.name}` : 'Whole photo'}</span>
        </div>
      )}

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
