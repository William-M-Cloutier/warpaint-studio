import { clampCutoutStrength, projectCutout, removeBackdrop, repairCutout } from './cutout'
import { clampPhotoScale, fitPhotoScale } from './photoScale'
import { MAX_SECTION_HISTORY, SectionLayer } from './sectionLayer'
import { compositeSurface, sampleTintHex } from './tint'
import {
  MAX_HISTORY,
  clampBounds,
  historyHasPaint,
  paintStroke,
  projectActions,
  strokeBounds,
  unionBounds,
  type Bounds,
  type HistoryAction,
  type Point,
  type Stroke,
} from './paint'
import type { HistoryState, LoadedPhoto, MaskMode, PhotoState, SectionInfo, Tool } from '../types'

export type ViewState = {
  x: number
  y: number
  /** View zoom. This does not resize the photo; contentScale does. */
  z: number
  contentScale: number
}

export type CutoutResult = {
  removedRatio: number
}

export type SurfaceConfig = {
  tool: Tool
  color: string
  brushSize: number
  opacity: number
  space: boolean
  tolerance: number
  maskMode: MaskMode
}

type SurfaceEvents = {
  view: (view: ViewState) => void
  photo: (photo: PhotoState) => void
  history: (history: HistoryState) => void
  pick: (hex: string, commit: boolean) => void
  stroke: (hex: string) => void
  error: (message: string) => void
  sections: (sections: SectionInfo[], activeId: string | null) => void
}

type Hist = {
  width: number
  height: number
  actions: HistoryAction[]
  future: HistoryAction[]
  base: HTMLCanvasElement | null
  baseHasPixels: boolean
}

type DrawSession = {
  mode: 'draw'
  pointerId: number
  stroke: Stroke
  prevBounds: Bounds | null
}

type PanSession = {
  mode: 'pan'
  pointerId: number
  lastX: number
  lastY: number
}

type PickSession = {
  mode: 'pick'
  pointerId: number
  hex: string | null
}

type MaskTool = 'restore' | 'eraseBackdrop'

type MaskStroke = {
  tool: MaskTool
  size: number
  opacity: number
  points: Point[]
}

type MaskSession = {
  mode: 'mask'
  pointerId: number
  stroke: MaskStroke
  prevBounds: Bounds | null
}

type LassoSession = {
  mode: 'lasso'
  pointerId: number
  points: Point[]
  maskMode: MaskMode
}

type WandSession = {
  mode: 'wand'
  pointerId: number
}

type SectionBrushSession = {
  mode: 'section-brush'
  pointerId: number
  points: Point[]
  size: number
  opacity: number
  prevBounds: Bounds | null
}

type Session = DrawSession | PanSession | PickSession | MaskSession | LassoSession | WandSession | SectionBrushSession

type TimelineKind = 'paint' | 'mask' | 'section'

function isMaskTool(tool: Tool): tool is MaskTool {
  return tool === 'restore' || tool === 'eraseBackdrop'
}

function isSectionTool(tool: Tool): tool is 'wand' | 'lasso' | 'maskBrush' {
  return tool === 'wand' || tool === 'lasso' || tool === 'maskBrush'
}

function showsBrushRing(tool: Tool, space: boolean): boolean {
  return !space && (tool === 'brush' || tool === 'eraser' || tool === 'maskBrush' || isMaskTool(tool))
}

const MIN_ZOOM = 0.02
const MAX_ZOOM = 32
const CUTOUT_FULL_RES_PIXELS = 4_000_000
const CUTOUT_COARSE_MAX_SIDE = 2200

function context2d(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D | null {
  return canvas.getContext('2d', options)
}

/**
 * Photo in the back. A hidden canvas stores pigment and coverage (the tint).
 * The visible canvas is that tint shaded by the photo's luminance, so edges
 * and light stay in the picture. Undo stores strokes and replays them.
 * Full-image snapshots would be far too heavy.
 *
 * Photo scale (`contentScale`) resizes the picture on the stage. Pan and zoom move
 * the view and do not resample the photo. Backdrop removal keeps the original on
 * `source` and writes transparency into the sample the tint is shaded with.
 *
 * TODO(edge-snap): section masks clip paint, but a stroke does not pull itself onto photo edges.
 * TODO(view-backgrounds): no replacement backdrop. The viewport checkerboard shows through a cutout.
 * TODO(multi-angle): one photo fills the stage. A 2×2 layout is later.
 * TODO(lighting): no lighting presets on the preview.
 */
export class PaintSurface {
  private readonly source = document.createElement('canvas')
  private readonly work = document.createElement('canvas')
  private readonly backup = document.createElement('canvas')
  private readonly sample = document.createElement('canvas')
  private photoCtx: CanvasRenderingContext2D | null = null
  private tintCtx: CanvasRenderingContext2D | null = null
  private displayCtx: CanvasRenderingContext2D | null = null
  private sampleCtx: CanvasRenderingContext2D | null = null
  private presentFailed = false
  private image: LoadedPhoto | null = null
  private hist: Hist | null = null
  private session: Session | null = null
  private ring: HTMLElement | null = null
  private pan = { x: 0, y: 0 }
  private zoom = 1
  private contentScale = 1
  private cutoutActive = false
  private readonly maskBase = document.createElement('canvas')
  private readonly maskBackup = document.createElement('canvas')
  private maskStrokes: MaskStroke[] = []
  private maskFuture: MaskStroke[] = []
  private timeline: TimelineKind[] = []
  private timelineFuture: TimelineKind[] = []
  private disposed = false
  private raf = 0
  private viewRaf = 0
  private fitAttempts = 0
  private tool: Tool = 'brush'
  private color = '#b08d57'
  private brushSize = 28
  private opacity = 1
  private space = false
  private tolerance = 48
  private maskMode: MaskMode = 'new'
  private readonly sections = new SectionLayer()
  private overlayCtx: CanvasRenderingContext2D | null = null
  /** Alpha of the cutout sample. Replaced, never mutated, so old strokes keep their clip. */
  private cutoutAlpha: Uint8Array | null = null

  constructor(
    /** Visible photo, including cutout transparency. The tint is shaded against this. */
    private readonly photo: HTMLCanvasElement,
    /** Pigment and coverage. Hidden in the page; the photo shades it on display. */
    private readonly tint: HTMLCanvasElement,
    /** Visible coat. Transparent where the tint has not been painted. */
    private readonly display: HTMLCanvasElement,
    /** Section mask wash. Sits above the coat so the active region stays visible. */
    private readonly overlay: HTMLCanvasElement,
    private readonly viewport: HTMLElement,
    private readonly emit: SurfaceEvents,
  ) {
    this.viewport.addEventListener('pointerdown', this.onPointerDown)
    this.viewport.addEventListener('pointermove', this.onPointerMove)
    this.viewport.addEventListener('pointerup', this.onPointerUp)
    this.viewport.addEventListener('pointercancel', this.onPointerUp)
    this.viewport.addEventListener('pointerleave', this.onPointerLeave)
    this.viewport.addEventListener('wheel', this.onWheel, { passive: false })
    this.viewport.addEventListener('contextmenu', this.onContextMenu)
  }

  dispose(): void {
    this.disposed = true
    this.viewport.removeEventListener('pointerdown', this.onPointerDown)
    this.viewport.removeEventListener('pointermove', this.onPointerMove)
    this.viewport.removeEventListener('pointerup', this.onPointerUp)
    this.viewport.removeEventListener('pointercancel', this.onPointerUp)
    this.viewport.removeEventListener('pointerleave', this.onPointerLeave)
    this.viewport.removeEventListener('wheel', this.onWheel)
    this.viewport.removeEventListener('contextmenu', this.onContextMenu)
    if (this.raf) cancelAnimationFrame(this.raf)
    if (this.viewRaf) cancelAnimationFrame(this.viewRaf)
    this.session = null
    this.image = null
    this.hist = null
  }

  configure(config: SurfaceConfig): void {
    this.tool = config.tool
    this.color = config.color
    this.brushSize = config.brushSize
    this.opacity = config.opacity
    this.space = config.space
    this.tolerance = config.tolerance
    this.maskMode = config.maskMode
    if (this.ring && !showsBrushRing(config.tool, config.space)) {
      this.ring.style.visibility = 'hidden'
    }
  }

  setSpace(held: boolean): void {
    this.space = held
  }

  setRing(ring: HTMLElement | null): void {
    this.ring = ring
  }

  setImage(image: LoadedPhoto | null): void {
    this.session = null
    this.viewport.classList.remove('is-panning')
    this.image = image
    this.hist = null
    this.cutoutActive = false
    this.cutoutAlpha = null
    this.maskStrokes = []
    this.maskFuture = []
    this.timeline = []
    this.timelineFuture = []
    this.sections.reset(image ? image.width : 0, image ? image.height : 0)
    this.clearDisplay()
    this.clearOverlay()
    if (!image) {
      this.contentScale = 1
      this.photoCtx?.clearRect(0, 0, this.photo.width, this.photo.height)
      this.emitSections()
      this.emitHistory()
      this.emitPhoto()
      this.emitView()
      return
    }
    this.allocate(image.width, image.height)
    const sourceCtx = context2d(this.source)
    if (!sourceCtx || !this.sampleCtx || !this.photoCtx) {
      this.emit.error('Could not prepare that photo.')
      this.emitSections()
      this.emitHistory()
      this.emitPhoto()
      return
    }
    sourceCtx.setTransform(1, 0, 0, 1, 0, 0)
    sourceCtx.clearRect(0, 0, image.width, image.height)
    sourceCtx.drawImage(image.element, 0, 0, image.width, image.height)
    this.copySourceToSample()
    this.presentPhoto()
    this.hist = {
      width: image.width,
      height: image.height,
      actions: [],
      future: [],
      base: null,
      baseHasPixels: false,
    }
    this.rememberMaskBase()
    this.emitSections()
    this.emitHistory()
    this.fitAttempts = 0
    this.autoScale()
  }

  /** Fit the picture by changing photo scale, then frame the view around it. */
  autoScale(): void {
    if (this.disposed) return
    const image = this.image
    if (!image) return
    const width = this.viewport.clientWidth
    const height = this.viewport.clientHeight
    if (width < 10 || height < 10) {
      if (this.fitAttempts < 8) {
        this.fitAttempts += 1
        requestAnimationFrame(() => this.autoScale())
      }
      return
    }
    this.fitAttempts = 0
    const fitted = fitPhotoScale(width, height, image.width, image.height)
    this.contentScale = fitted
    const displayW = image.width * fitted
    const displayH = image.height * fitted
    let zoom = this.frameZoom(displayW, displayH)
    if (!Number.isFinite(zoom)) zoom = 1
    if (Math.abs(zoom - 1) < 0.015) zoom = 1
    this.zoom = zoom
    this.center(displayW, displayH)
    this.emitView()
    this.emitPhoto()
  }

  /** Frame the current picture. Does not change photo scale. */
  fit(): void {
    if (this.disposed) return
    const image = this.image
    if (!image) return
    const width = this.viewport.clientWidth
    const height = this.viewport.clientHeight
    if (width < 10 || height < 10) {
      if (this.fitAttempts < 8) {
        this.fitAttempts += 1
        requestAnimationFrame(() => this.fit())
      }
      return
    }
    this.fitAttempts = 0
    const displayW = image.width * this.contentScale
    const displayH = image.height * this.contentScale
    const zoom = this.frameZoom(displayW, displayH)
    if (!Number.isFinite(zoom)) return
    this.zoom = zoom
    this.center(displayW, displayH)
    this.emitView()
  }

  /** Resize the picture. View zoom stays, anchored at the center of the canvas. */
  setContentScale(next: number): void {
    const image = this.image
    if (!image || this.disposed) return
    const scale = clampPhotoScale(next)
    const prev = this.contentScale
    if (Math.abs(scale - prev) < 1e-6) return
    const cx = this.viewport.clientWidth / 2
    const cy = this.viewport.clientHeight / 2
    const localX = (cx - this.pan.x) / this.zoom
    const localY = (cy - this.pan.y) / this.zoom
    const ratio = scale / prev
    this.contentScale = scale
    this.pan = {
      x: cx - localX * ratio * this.zoom,
      y: cy - localY * ratio * this.zoom,
    }
    this.emitView()
    this.emitPhoto()
  }

  /**
   * Cut the backdrop from a copy of the photo. Another strength rebuilds from
   * the original, and reset restores it. Paint strokes stay in the tint layer.
   */
  applyCutout(strength: number): CutoutResult | null {
    if (!this.image || !this.sampleCtx || this.disposed) return null
    const level = clampCutoutStrength(strength)
    const sourceW = this.source.width
    const sourceH = this.source.height
    if (sourceW < 1 || sourceH < 1) return null
    const sourceCtx = context2d(this.source)
    if (!sourceCtx) {
      this.emit.error('Could not build a cutout.')
      return null
    }
    let stats: CutoutResult
    try {
      const pixels = sourceCtx.getImageData(0, 0, sourceW, sourceH)
      if (sourceW * sourceH <= CUTOUT_FULL_RES_PIXELS) {
        stats = removeBackdrop({ data: pixels.data, width: sourceW, height: sourceH }, level)
      } else {
        const down = Math.min(1, CUTOUT_COARSE_MAX_SIDE / Math.max(sourceW, sourceH))
        const workW = Math.max(1, Math.round(sourceW * down))
        const workH = Math.max(1, Math.round(sourceH * down))
        this.work.width = workW
        this.work.height = workH
        const workCtx = context2d(this.work, { willReadFrequently: true })
        if (!workCtx) {
          this.emit.error('Could not build a cutout.')
          return null
        }
        workCtx.setTransform(1, 0, 0, 1, 0, 0)
        workCtx.imageSmoothingEnabled = false
        workCtx.clearRect(0, 0, workW, workH)
        workCtx.drawImage(this.source, 0, 0, workW, workH)
        const coarse = workCtx.getImageData(0, 0, workW, workH)
        removeBackdrop({ data: coarse.data, width: workW, height: workH }, level)
        stats = projectCutout(
          { data: pixels.data, width: sourceW, height: sourceH },
          { data: coarse.data, width: workW, height: workH },
          level,
        )
      }
      repairCutout({ data: pixels.data, width: sourceW, height: sourceH })
      this.sampleCtx.putImageData(pixels, 0, 0)
    } catch {
      this.emit.error('Could not read the photo for a cutout.')
      return null
    }
    this.session = null
    this.viewport.classList.remove('is-panning')
    this.cutoutActive = true
    this.rememberMaskBase()
    this.syncCutoutAlpha()
    this.presentPhoto()
    this.present(null)
    this.emitPhoto()
    this.emitHistory()
    return stats
  }

  /** Fill small figure holes and trim the near-white rim of the current cutout. */
  repairMask(): void {
    if (!this.image || !this.sampleCtx || this.disposed) return
    const sourceCtx = context2d(this.source)
    if (!sourceCtx) {
      this.emit.error('Could not repair the cutout.')
      return
    }
    const width = this.sample.width
    const height = this.sample.height
    try {
      const pixels = this.sampleCtx.getImageData(0, 0, width, height)
      const source = sourceCtx.getImageData(0, 0, width, height)
      repairCutout(
        { data: pixels.data, width, height },
        { data: source.data, width, height },
      )
      this.sampleCtx.putImageData(pixels, 0, 0)
    } catch {
      this.emit.error('Could not repair the cutout.')
      return
    }
    this.session = null
    this.viewport.classList.remove('is-panning')
    this.cutoutActive = true
    this.rememberMaskBase()
    this.syncCutoutAlpha()
    this.presentPhoto()
    this.present(null)
    this.emitPhoto()
    this.emitHistory()
  }

  /** Restore the photo from before backdrop removal. Paint strokes stay. */
  resetCutout(): void {
    if (!this.cutoutActive || this.disposed) return
    this.session = null
    this.viewport.classList.remove('is-panning')
    this.cutoutActive = false
    this.copySourceToSample()
    this.rememberMaskBase()
    this.syncCutoutAlpha()
    this.presentPhoto()
    this.present(null)
    this.emitPhoto()
    this.emitHistory()
  }

  undo(): void {
    const kind = this.timeline.pop()
    if (!kind) return
    this.timelineFuture.push(kind)
    if (kind === 'paint') this.stepPaint(-1)
    else if (kind === 'mask') this.stepMask(-1)
    else this.stepSection(-1)
  }

  redo(): void {
    const kind = this.timelineFuture.pop()
    if (!kind) return
    this.timeline.push(kind)
    if (kind === 'paint') this.stepPaint(1)
    else if (kind === 'mask') this.stepMask(1)
    else this.stepSection(1)
  }

  private stepPaint(direction: -1 | 1): void {
    const hist = this.hist
    if (!hist) return
    if (direction < 0) {
      const action = hist.actions.pop()
      if (!action) return
      hist.future.push(action)
    } else {
      const action = hist.future.pop()
      if (!action) return
      hist.actions.push(action)
    }
    this.replay()
  }

  private stepMask(direction: -1 | 1): void {
    if (direction < 0) {
      const stroke = this.maskStrokes.pop()
      if (!stroke) return
      this.maskFuture.push(stroke)
    } else {
      const stroke = this.maskFuture.pop()
      if (!stroke) return
      this.maskStrokes.push(stroke)
    }
    this.replayMask()
  }

  private stepSection(direction: -1 | 1): void {
    if (direction < 0) this.sections.undo()
    else this.sections.redo()
    this.sections.invalidateOverlay()
    this.refreshOverlay(null, null)
    this.emitSections()
    this.emitHistory()
  }

  selectSection(id: string | null): void {
    if (!this.sections.select(id)) return
    this.sections.invalidateOverlay()
    this.refreshOverlay(null, null)
    this.emitSections()
  }

  renameSection(id: string, name: string): void {
    if (!this.sections.rename(id, name)) return
    this.emitSections()
  }

  labelSection(id: string, category: SectionInfo['category'], customLabel: string): void {
    if (!this.sections.setLabel(id, category, customLabel)) return
    this.emitSections()
  }

  setSectionVisible(id: string, visible: boolean): void {
    if (!this.sections.setVisible(id, visible)) return
    this.sections.invalidateOverlay()
    this.refreshOverlay(null, null)
    this.emitSections()
  }

  setSectionLocked(id: string, locked: boolean): void {
    if (!this.sections.setLocked(id, locked)) return
    this.emitSections()
  }

  deleteSection(id: string): void {
    if (!this.sections.remove(id)) return
    this.noteSectionEdit()
  }

  proposeSections(): number {
    if (!this.image || !this.sampleCtx || this.disposed) return 0
    const pixels = this.readSample()
    if (!pixels) return 0
    const count = this.sections.propose(pixels.data)
    if (count > 0) this.noteSectionEdit()
    else {
      this.refreshOverlay(null, null)
      this.emitSections()
    }
    return count
  }

  clearPaint(): void {
    if (!this.hist || !historyHasPaint(this.hist.actions, this.hist.baseHasPixels)) return
    this.session = null
    this.push({ kind: 'clear' })
    this.tintCtx?.clearRect(0, 0, this.tint.width, this.tint.height)
    this.clearDisplay()
    this.emitHistory()
  }

  private allocate(width: number, height: number): void {
    this.presentFailed = false
    this.photo.width = width
    this.photo.height = height
    this.tint.width = width
    this.tint.height = height
    this.display.width = width
    this.display.height = height
    this.backup.width = width
    this.backup.height = height
    this.sample.width = width
    this.sample.height = height
    this.source.width = width
    this.source.height = height
    this.overlay.width = width
    this.overlay.height = height
    this.photoCtx = context2d(this.photo)
    this.tintCtx = context2d(this.tint, { willReadFrequently: true })
    this.displayCtx = context2d(this.display)
    this.sampleCtx = context2d(this.sample, { willReadFrequently: true })
    this.overlayCtx = context2d(this.overlay)
  }

  private copySourceToSample(): void {
    const ctx = this.sampleCtx
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, this.sample.width, this.sample.height)
    ctx.drawImage(this.source, 0, 0)
  }

  private presentPhoto(bounds?: Bounds | null): void {
    const ctx = this.photoCtx
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.imageSmoothingEnabled = false
    if (!bounds) {
      ctx.clearRect(0, 0, this.photo.width, this.photo.height)
      ctx.drawImage(this.sample, 0, 0)
      return
    }
    const region = clampBounds(bounds, this.photo.width, this.photo.height)
    if (region.w < 1 || region.h < 1) return
    ctx.clearRect(region.x, region.y, region.w, region.h)
    ctx.drawImage(
      this.sample,
      region.x,
      region.y,
      region.w,
      region.h,
      region.x,
      region.y,
      region.w,
      region.h,
    )
  }

  private frameZoom(displayWidth: number, displayHeight: number): number {
    const width = this.viewport.clientWidth
    const height = this.viewport.clientHeight
    if (width < 10 || height < 10 || displayWidth < 1 || displayHeight < 1) return Number.NaN
    const innerW = Math.max(32, width - 48)
    const innerH = Math.max(32, height - 48)
    return clamp(Math.min(innerW / displayWidth, innerH / displayHeight), MIN_ZOOM, MAX_ZOOM)
  }

  private center(displayWidth: number, displayHeight: number): void {
    this.pan = {
      x: (this.viewport.clientWidth - displayWidth * this.zoom) / 2,
      y: (this.viewport.clientHeight - displayHeight * this.zoom) / 2,
    }
  }

  private onContextMenu = (event: Event): void => {
    event.preventDefault()
  }

  private onWheel = (event: WheelEvent): void => {
    if (!this.image) return
    event.preventDefault()
    const rect = this.viewport.getBoundingClientRect()
    const mouseX = event.clientX - rect.left
    const mouseY = event.clientY - rect.top
    let delta = event.deltaY
    if (event.deltaMode === 1) delta *= 16
    if (event.deltaMode === 2) delta *= this.viewport.clientHeight
    const next = clamp(this.zoom * Math.exp(-delta * 0.0015), MIN_ZOOM, MAX_ZOOM)
    const imageX = (mouseX - this.pan.x) / this.zoom
    const imageY = (mouseY - this.pan.y) / this.zoom
    this.zoom = next
    this.pan = { x: mouseX - imageX * next, y: mouseY - imageY * next }
    this.queueView()
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.image || !this.hist) return
    if (event.target instanceof Element && event.target.closest('button, a, input, label, textarea')) return
    event.preventDefault()

    const wantsPan = event.button === 1 || this.space || this.tool === 'pan'
    if (wantsPan) {
      if (event.button !== 0 && event.button !== 1) return
      this.session = {
        mode: 'pan',
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
      }
      this.viewport.classList.add('is-panning')
      this.capture(event)
      return
    }

    if (event.button !== 0) return
    const point = this.toImage(event.clientX, event.clientY)
    if (!point) return

    if (isSectionTool(this.tool)) {
      this.startSection(event, point)
      return
    }

    if (this.tool === 'eyedropper') {
      const hex = this.sampleColor(point)
      this.session = { mode: 'pick', pointerId: event.pointerId, hex }
      if (hex) this.emit.pick(hex, false)
      this.capture(event)
      return
    }

    if (isMaskTool(this.tool)) {
      const stroke: MaskStroke = {
        tool: this.tool,
        size: Math.max(this.brushSize * this.imagePixelsPerScreenPixel(), 0.5),
        opacity: this.opacity,
        points: [point],
      }
      this.snapshotMask()
      this.session = { mode: 'mask', pointerId: event.pointerId, stroke, prevBounds: null }
      this.scheduleDraw()
      this.capture(event)
      return
    }

    if (this.tool !== 'brush' && this.tool !== 'eraser') return
    const clipTarget = this.sections.clipForPaint(this.cutoutActive ? this.cutoutAlpha : null)
    if (clipTarget.blocked) {
      this.emit.error(clipTarget.blocked)
      return
    }
    const stroke: Stroke = {
      tool: this.tool,
      color: this.color,
      size: Math.max(this.brushSize * this.imagePixelsPerScreenPixel(), 0.5),
      opacity: this.opacity,
      points: [point],
      clip: clipTarget.clip ?? undefined,
    }
    this.snapshotBackup()
    this.session = { mode: 'draw', pointerId: event.pointerId, stroke, prevBounds: null }
    this.scheduleDraw()
    this.capture(event)
  }

  private onPointerMove = (event: PointerEvent): void => {
    this.placeRing(event.clientX, event.clientY)
    const session = this.session
    if (!session || session.pointerId !== event.pointerId) return

    if (session.mode === 'pan') {
      this.pan = {
        x: this.pan.x + (event.clientX - session.lastX),
        y: this.pan.y + (event.clientY - session.lastY),
      }
      session.lastX = event.clientX
      session.lastY = event.clientY
      this.queueView()
      return
    }

    if (session.mode === 'pick') {
      const point = this.toImage(event.clientX, event.clientY)
      if (!point) return
      const hex = this.sampleColor(point)
      session.hex = hex
      if (hex) this.emit.pick(hex, false)
      return
    }

    if (session.mode === 'wand') return
    if (session.mode !== 'draw' && session.mode !== 'mask' && session.mode !== 'lasso' && session.mode !== 'section-brush') {
      return
    }

    const samples = event.getCoalescedEvents?.() ?? [event]
    let added = false
    for (const sample of samples) {
      const point = this.toImage(sample.clientX, sample.clientY)
      if (!point) continue
      const points = session.mode === 'lasso' || session.mode === 'section-brush' ? session.points : session.stroke.points
      const last = points[points.length - 1]
      const dx = point.x - last.x
      const dy = point.y - last.y
      if (dx * dx + dy * dy < 0.36) continue
      points.push(point)
      added = true
    }
    if (added) this.scheduleDraw()
  }

  private onPointerUp = (event: PointerEvent): void => {
    const session = this.session
    if (!session || session.pointerId !== event.pointerId) return
    if (session.mode === 'draw') {
      this.finishDraw(session)
      return
    }
    if (session.mode === 'mask') {
      this.finishMask(session)
      return
    }
    if (session.mode === 'lasso') {
      this.finishLasso(session)
      return
    }
    if (session.mode === 'section-brush') {
      this.finishSectionBrush()
      return
    }
    if (session.mode === 'wand') {
      this.session = null
      this.viewport.classList.remove('is-panning')
      return
    }
    if (session.mode === 'pick' && session.hex) this.emit.pick(session.hex, true)
    this.session = null
    this.viewport.classList.remove('is-panning')
  }

  private onPointerLeave = (): void => {
    if (this.session) return
    if (this.ring) this.ring.style.visibility = 'hidden'
  }

  private finishDraw(session: DrawSession): void {
    if (this.raf) {
      cancelAnimationFrame(this.raf)
      this.raf = 0
    }
    this.commitStroke(session.stroke)
    this.present(strokeBounds(session.stroke))
    this.session = null
    this.viewport.classList.remove('is-panning')
    this.push({ kind: 'stroke', stroke: session.stroke })
    if (session.stroke.tool === 'brush') this.emit.stroke(session.stroke.color)
    this.emitHistory()
  }

  /** Rebuild from the pre-stroke snapshot so the committed tint matches what undo will replay. */
  private commitStroke(stroke: Stroke): void {
    const ctx = this.tintCtx
    if (!ctx) return
    ctx.clearRect(0, 0, this.tint.width, this.tint.height)
    ctx.drawImage(this.backup, 0, 0)
    paintStroke(ctx, stroke)
  }

  private scheduleDraw(): void {
    if (this.raf) return
    this.raf = requestAnimationFrame(() => {
      this.raf = 0
      const session = this.session
      if (!session) return
      if (session.mode === 'draw') this.renderDraw(session)
      else if (session.mode === 'mask') this.renderMask(session)
      else if (session.mode === 'section-brush') this.renderSectionBrush(session)
      else if (session.mode === 'lasso') this.refreshOverlay(null, session.points)
    })
  }

  /**
   * Restore the dirty rectangle from the stroke's starting snapshot, redraw the
   * whole stroke into the tint, then shade that rectangle onto the display.
   * Brush and eraser share this path so a partial-opacity stroke does not flash
   * when the pointer goes up.
   */
  private renderDraw(session: DrawSession): void {
    const next = strokeBounds(session.stroke)
    if (!next) return
    const width = this.tint.width
    const height = this.tint.height
    const bounds = clampBounds(next, width, height)
    const region = session.prevBounds
      ? clampBounds(unionBounds(session.prevBounds, bounds), width, height)
      : bounds
    if (region.w < 1 || region.h < 1) return

    const ctx = this.tintCtx
    if (!ctx) return
    ctx.save()
    ctx.beginPath()
    ctx.rect(region.x, region.y, region.w, region.h)
    ctx.clip()
    ctx.globalCompositeOperation = 'source-over'
    ctx.imageSmoothingEnabled = false
    // Replace the rect. Source-over of the backup would stack partial paint on itself.
    ctx.clearRect(region.x, region.y, region.w, region.h)
    ctx.drawImage(this.backup, 0, 0)
    ctx.restore()
    paintStroke(ctx, session.stroke)
    this.present(region)
    session.prevBounds = bounds
  }

  private snapshotBackup(): void {
    const ctx = context2d(this.backup)
    if (!ctx) return
    ctx.clearRect(0, 0, this.backup.width, this.backup.height)
    ctx.drawImage(this.tint, 0, 0)
  }

  private snapshotMask(): void {
    this.maskBackup.width = this.sample.width
    this.maskBackup.height = this.sample.height
    const ctx = context2d(this.maskBackup)
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.maskBackup.width, this.maskBackup.height)
    ctx.drawImage(this.sample, 0, 0)
  }

  /** The sample as of the last cutout, repair, or reset. Brush strokes replay on top. */
  private rememberMaskBase(): void {
    this.maskBase.width = this.sample.width
    this.maskBase.height = this.sample.height
    const ctx = context2d(this.maskBase)
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.maskBase.width, this.maskBase.height)
    ctx.drawImage(this.sample, 0, 0)
    this.maskStrokes = []
    this.maskFuture = []
    this.timeline = this.timeline.filter((kind) => kind !== 'mask')
    this.timelineFuture = this.timelineFuture.filter((kind) => kind !== 'mask')
  }

  private finishMask(session: MaskSession): void {
    if (this.raf) {
      cancelAnimationFrame(this.raf)
      this.raf = 0
    }
    const bounds = strokeBounds({
      tool: 'brush',
      color: '#ffffff',
      size: session.stroke.size,
      opacity: session.stroke.opacity,
      points: session.stroke.points,
    })
    this.restoreSample(bounds)
    if (bounds) this.stampMask(session.stroke, bounds)
    this.presentPhoto(bounds)
    this.present(bounds)
    this.session = null
    this.viewport.classList.remove('is-panning')
    this.maskStrokes.push(session.stroke)
    this.maskFuture = []
    this.timeline.push('mask')
    this.timelineFuture = []
    this.sections.abandonRedo()
    this.syncCutoutAlpha()
    if (!this.cutoutActive) {
      this.cutoutActive = true
      this.emitPhoto()
    }
    this.emitHistory()
  }

  private renderMask(session: MaskSession): void {
    const next = strokeBounds({
      tool: 'brush',
      color: '#ffffff',
      size: session.stroke.size,
      opacity: session.stroke.opacity,
      points: session.stroke.points,
    })
    if (!next) return
    const bounds = clampBounds(next, this.sample.width, this.sample.height)
    const region = session.prevBounds
      ? clampBounds(unionBounds(session.prevBounds, bounds), this.sample.width, this.sample.height)
      : bounds
    this.restoreSample(region)
    this.stampMask(session.stroke, region)
    this.presentPhoto(region)
    this.present(region)
    session.prevBounds = bounds
  }

  private restoreSample(bounds: Bounds | null): void {
    const ctx = this.sampleCtx
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.imageSmoothingEnabled = false
    if (!bounds) {
      ctx.clearRect(0, 0, this.sample.width, this.sample.height)
      ctx.drawImage(this.maskBackup, 0, 0)
      return
    }
    const region = clampBounds(bounds, this.sample.width, this.sample.height)
    if (region.w < 1 || region.h < 1) return
    ctx.save()
    ctx.beginPath()
    ctx.rect(region.x, region.y, region.w, region.h)
    ctx.clip()
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(region.x, region.y, region.w, region.h)
    ctx.drawImage(this.maskBackup, 0, 0)
    ctx.restore()
  }

  private stampMask(stroke: MaskStroke, bounds: Bounds): void {
    const sample = this.sampleCtx
    const sourceCtx = context2d(this.source)
    const box = clampBounds(bounds, this.sample.width, this.sample.height)
    if (!sample || !sourceCtx || box.w < 1 || box.h < 1) return
    this.work.width = box.w
    this.work.height = box.h
    const workCtx = context2d(this.work, { willReadFrequently: true })
    if (!workCtx) return
    workCtx.setTransform(1, 0, 0, 1, 0, 0)
    workCtx.clearRect(0, 0, box.w, box.h)
    workCtx.save()
    workCtx.translate(-box.x, -box.y)
    paintStroke(workCtx, {
      tool: 'brush',
      color: '#ffffff',
      size: stroke.size,
      opacity: stroke.opacity,
      points: stroke.points,
    })
    workCtx.restore()
    const cover = workCtx.getImageData(0, 0, box.w, box.h).data
    const photo = sample.getImageData(box.x, box.y, box.w, box.h)
    const origin = sourceCtx.getImageData(box.x, box.y, box.w, box.h).data
    const data = photo.data
    for (let i = 0; i < data.length; i += 4) {
      const weight = cover[i + 3] / 255
      if (weight <= 0) continue
      if (stroke.tool === 'eraseBackdrop') {
        data[i + 3] = Math.round(data[i + 3] * (1 - weight))
      } else {
        data[i] = origin[i]
        data[i + 1] = origin[i + 1]
        data[i + 2] = origin[i + 2]
        data[i + 3] = Math.round(data[i + 3] + (origin[i + 3] - data[i + 3]) * weight)
      }
    }
    sample.putImageData(photo, box.x, box.y)
  }

  private replayMask(): void {
    const ctx = this.sampleCtx
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, this.sample.width, this.sample.height)
    ctx.drawImage(this.maskBase, 0, 0)
    for (const stroke of this.maskStrokes) {
      const bounds = strokeBounds({
        tool: 'brush',
        color: '#ffffff',
        size: stroke.size,
        opacity: stroke.opacity,
        points: stroke.points,
      })
      if (bounds) this.stampMask(stroke, bounds)
    }
    this.presentPhoto(null)
    this.present(null)
    this.syncCutoutAlpha()
    this.emitHistory()
  }

  private startSection(event: PointerEvent, point: Point): void {
    if (this.tool === 'wand') {
      const pixels = this.readSample()
      this.session = { mode: 'wand', pointerId: event.pointerId }
      this.capture(event)
      if (!pixels) return
      const result = this.sections.wand(pixels.data, point.x, point.y, this.tolerance, this.maskMode)
      if (!result.ok) {
        this.emit.error(result.reason)
        this.refreshOverlay(null, null)
        return
      }
      this.noteSectionEdit()
      return
    }

    if (this.tool === 'lasso') {
      this.session = { mode: 'lasso', pointerId: event.pointerId, points: [point], maskMode: this.maskMode }
      this.refreshOverlay(null, [point])
      this.capture(event)
      return
    }

    const started = this.sections.beginPreview(this.maskMode)
    if (!started.ok) {
      this.emit.error(started.reason)
      return
    }
    const size = Math.max(this.brushSize * this.imagePixelsPerScreenPixel(), 0.5)
    this.session = {
      mode: 'section-brush',
      pointerId: event.pointerId,
      points: [point],
      size,
      opacity: this.opacity,
      prevBounds: null,
    }
    this.scheduleDraw()
    this.capture(event)
  }

  private finishLasso(session: LassoSession): void {
    if (this.raf) {
      cancelAnimationFrame(this.raf)
      this.raf = 0
    }
    const result = this.sections.lasso(session.points, session.maskMode)
    this.session = null
    this.viewport.classList.remove('is-panning')
    if (!result.ok) {
      this.emit.error(result.reason)
      this.refreshOverlay(null, null)
      return
    }
    this.noteSectionEdit()
  }

  private finishSectionBrush(): void {
    if (this.raf) {
      cancelAnimationFrame(this.raf)
      this.raf = 0
    }
    const changed = this.sections.commitPreview()
    this.session = null
    this.viewport.classList.remove('is-panning')
    if (changed) this.noteSectionEdit()
    else this.refreshOverlay(null, null)
  }

  private renderSectionBrush(session: SectionBrushSession): void {
    const stroke: Stroke = {
      tool: 'brush',
      color: '#ffffff',
      size: session.size,
      opacity: session.opacity,
      points: session.points,
    }
    const next = strokeBounds(stroke)
    if (!next) return
    const bounds = clampBounds(next, this.sample.width, this.sample.height)
    const region = session.prevBounds
      ? clampBounds(unionBounds(session.prevBounds, bounds), this.sample.width, this.sample.height)
      : bounds
    this.sections.restorePreview(region)
    const coverage = this.coverageAlpha(stroke, bounds)
    if (coverage) {
      this.sections.stampPreview(coverage.alpha, coverage.x, coverage.y, coverage.w, coverage.h)
    }
    this.refreshOverlay(region, null)
    session.prevBounds = bounds
  }

  private coverageAlpha(stroke: Stroke, bounds: Bounds): { alpha: Uint8Array; x: number; y: number; w: number; h: number } | null {
    const box = clampBounds(bounds, this.sample.width, this.sample.height)
    if (box.w < 1 || box.h < 1) return null
    this.work.width = box.w
    this.work.height = box.h
    const workCtx = context2d(this.work, { willReadFrequently: true })
    if (!workCtx) return null
    workCtx.setTransform(1, 0, 0, 1, 0, 0)
    workCtx.clearRect(0, 0, box.w, box.h)
    workCtx.save()
    workCtx.translate(-box.x, -box.y)
    paintStroke(workCtx, stroke)
    workCtx.restore()
    const pixels = workCtx.getImageData(0, 0, box.w, box.h).data
    const alpha = new Uint8Array(box.w * box.h)
    for (let i = 0; i < alpha.length; i += 1) alpha[i] = pixels[i * 4 + 3]
    return { alpha, x: box.x, y: box.y, w: box.w, h: box.h }
  }

  private noteSectionEdit(): void {
    this.timeline.push('section')
    this.timelineFuture = []
    while (this.sections.pastCount > MAX_SECTION_HISTORY) {
      this.sections.dropOldest()
      const index = this.timeline.indexOf('section')
      if (index >= 0) this.timeline.splice(index, 1)
    }
    this.sections.invalidateOverlay()
    this.refreshOverlay(null, null)
    this.emitSections()
    this.emitHistory()
  }

  private readSample(): ImageData | null {
    if (!this.sampleCtx || this.sample.width < 1 || this.sample.height < 1) return null
    try {
      return this.sampleCtx.getImageData(0, 0, this.sample.width, this.sample.height)
    } catch {
      this.emit.error('Could not read the photo.')
      return null
    }
  }

  private syncCutoutAlpha(): void {
    if (!this.cutoutActive || !this.sampleCtx || this.sample.width < 1) {
      this.cutoutAlpha = null
      return
    }
    try {
      const pixels = this.sampleCtx.getImageData(0, 0, this.sample.width, this.sample.height).data
      const alpha = new Uint8Array(this.sample.width * this.sample.height)
      for (let i = 0; i < alpha.length; i += 1) alpha[i] = pixels[i * 4 + 3]
      this.cutoutAlpha = alpha
    } catch {
      this.cutoutAlpha = null
    }
  }

  private clearOverlay(): void {
    this.overlayCtx?.clearRect(0, 0, this.overlay.width, this.overlay.height)
  }

  private refreshOverlay(area: Bounds | null, lasso: Point[] | null): void {
    const ctx = this.overlayCtx
    if (!ctx || this.overlay.width < 1) return
    this.sections.renderOverlay(ctx, area)
    if (!lasso || lasso.length === 0) return
    ctx.save()
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.lineWidth = Math.max(2, Math.round(Math.max(this.overlay.width, this.overlay.height) / 420))
    ctx.strokeStyle = '#fff8ea'
    ctx.beginPath()
    ctx.moveTo(lasso[0].x, lasso[0].y)
    for (let i = 1; i < lasso.length; i += 1) ctx.lineTo(lasso[i].x, lasso[i].y)
    ctx.stroke()
    if (lasso.length > 2) {
      ctx.setLineDash([8, 6])
      ctx.lineTo(lasso[0].x, lasso[0].y)
      ctx.stroke()
    }
    ctx.restore()
  }

  private emitSections(): void {
    this.emit.sections(this.sections.list(), this.sections.activeId)
  }

  private clearDisplay(): void {
    this.displayCtx?.clearRect(0, 0, this.display.width, this.display.height)
  }

  /** Shade the tint by the photo and write it to the visible canvas. Null bounds refreshes the whole picture. */
  private present(bounds: Bounds | null): void {
    const tintCtx = this.tintCtx
    const photoCtx = this.sampleCtx
    const display = this.displayCtx
    if (!tintCtx || !photoCtx || !display || this.presentFailed) return
    const width = this.tint.width
    const height = this.tint.height
    const region = bounds
      ? clampBounds(bounds, width, height)
      : { x: 0, y: 0, w: width, h: height }
    if (region.w < 1 || region.h < 1) return
    try {
      const tint = tintCtx.getImageData(region.x, region.y, region.w, region.h)
      const photo = photoCtx.getImageData(region.x, region.y, region.w, region.h)
      compositeSurface(tint.data, photo.data, tint.data)
      display.putImageData(tint, region.x, region.y)
    } catch {
      this.presentFailed = true
      this.emit.error('Could not update the painted preview.')
    }
  }

  private replay(): void {
    const ctx = this.tintCtx
    const hist = this.hist
    if (!ctx || !hist) return
    ctx.clearRect(0, 0, this.tint.width, this.tint.height)
    const projected = projectActions(hist.actions)
    if (projected.includeBase && hist.base) ctx.drawImage(hist.base, 0, 0)
    for (const stroke of projected.strokes) paintStroke(ctx, stroke)
    this.present(null)
    this.emitHistory()
  }

  private push(action: HistoryAction): void {
    const hist = this.hist
    if (!hist) return
    hist.actions.push(action)
    hist.future = []
    this.timeline.push('paint')
    this.timelineFuture = []
    this.sections.abandonRedo()
    while (hist.actions.length > MAX_HISTORY) this.bakeOldest(hist)
  }

  private bakeOldest(hist: Hist): void {
    const action = hist.actions.shift()
    const paintIndex = this.timeline.indexOf('paint')
    if (paintIndex >= 0) this.timeline.splice(paintIndex, 1)
    if (!action) return
    if (!hist.base) {
      hist.base = document.createElement('canvas')
      hist.base.width = hist.width
      hist.base.height = hist.height
    }
    const ctx = context2d(hist.base)
    if (!ctx) return
    if (action.kind === 'clear') {
      ctx.clearRect(0, 0, hist.width, hist.height)
      hist.baseHasPixels = false
      return
    }
    paintStroke(ctx, action.stroke)
    hist.baseHasPixels = true
  }

  private sampleColor(point: Point): string | null {
    if (!this.tintCtx || !this.sampleCtx) return null
    const x = Math.min(this.tint.width - 1, Math.max(0, Math.floor(point.x)))
    const y = Math.min(this.tint.height - 1, Math.max(0, Math.floor(point.y)))
    try {
      const tint = this.tintCtx.getImageData(x, y, 1, 1).data
      const photo = this.sampleCtx.getImageData(x, y, 1, 1).data
      return sampleTintHex(tint, photo)
    } catch {
      this.emit.error('Could not sample that pixel.')
      return null
    }
  }

  private imagePixelsPerScreenPixel(): number {
    const rect = this.display.getBoundingClientRect()
    if (rect.width < 1 || this.display.width < 1) {
      return 1 / Math.max(0.0001, this.zoom * this.contentScale)
    }
    return this.display.width / rect.width
  }

  private toImage(clientX: number, clientY: number): Point | null {
    const rect = this.display.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return null
    if (clientX < rect.left || clientY < rect.top || clientX > rect.right || clientY > rect.bottom) {
      return null
    }
    const x = ((clientX - rect.left) / rect.width) * this.display.width
    const y = ((clientY - rect.top) / rect.height) * this.display.height
    return {
      x: clamp(x, 0, Math.max(0, this.display.width - 0.01)),
      y: clamp(y, 0, Math.max(0, this.display.height - 0.01)),
    }
  }

  private placeRing(clientX: number, clientY: number): void {
    const ring = this.ring
    if (!ring) return
    const show = !!this.image && showsBrushRing(this.tool, this.space) && this.session?.mode !== 'pan'
    if (!show) {
      ring.style.visibility = 'hidden'
      return
    }
    const rect = this.viewport.getBoundingClientRect()
    ring.style.left = `${clientX - rect.left}px`
    ring.style.top = `${clientY - rect.top}px`
    ring.style.visibility = 'visible'
  }

  private capture(event: PointerEvent): void {
    try {
      this.viewport.setPointerCapture(event.pointerId)
    } catch {
      // Pointer capture can fail for an already-released pointer. The stroke still ends on pointerup.
    }
  }

  private queueView(): void {
    if (this.viewRaf) return
    this.viewRaf = requestAnimationFrame(() => {
      this.viewRaf = 0
      this.emitView()
    })
  }

  private emitView(): void {
    this.emit.view({
      x: this.pan.x,
      y: this.pan.y,
      z: this.zoom,
      contentScale: this.contentScale,
    })
  }

  private emitPhoto(): void {
    this.emit.photo({ contentScale: this.contentScale, cutoutActive: this.cutoutActive })
  }

  private emitHistory(): void {
    const hist = this.hist
    if (!hist) {
      this.emit.history({ canUndo: false, canRedo: false, hasPaint: false })
      return
    }
    this.emit.history({
      canUndo: this.timeline.length > 0,
      canRedo: this.timelineFuture.length > 0,
      hasPaint: historyHasPaint(hist.actions, hist.baseHasPixels),
    })
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
