import { compositeHex } from './color'
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
import type { HistoryState, LoadedPhoto, Tool } from '../types'

export type ViewState = {
  x: number
  y: number
  z: number
}

export type SurfaceConfig = {
  tool: Tool
  color: string
  brushSize: number
  opacity: number
  space: boolean
}

type SurfaceEvents = {
  view: (view: ViewState) => void
  history: (history: HistoryState) => void
  pick: (hex: string, commit: boolean) => void
  stroke: (hex: string) => void
  error: (message: string) => void
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

type Session = DrawSession | PanSession | PickSession

const MIN_ZOOM = 0.02
const MAX_ZOOM = 32

function context2d(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D | null {
  return canvas.getContext('2d', options)
}

/**
 * Photo in the back, paint on a second canvas, live brush on a third.
 * Undo stores strokes and replays them. Full-image snapshots would be far too heavy.
 *
 * TODO(section-layers): this is one paint layer. Edge and section layers are later.
 * TODO(image-scale): fit letterboxes the photo. It does not rescale a side that is too small.
 * TODO(background-remover): the photo is still the untouched base; there is no cutout.
 * TODO(view-backgrounds): no replacement backdrop until a cutout exists.
 * TODO(multi-angle): one photo fills the stage. A 2×2 layout is later.
 * TODO(lighting): no lighting presets on the preview.
 */
export class PaintSurface {
  private readonly backup = document.createElement('canvas')
  private readonly sample = document.createElement('canvas')
  private paintCtx: CanvasRenderingContext2D | null = null
  private previewCtx: CanvasRenderingContext2D | null = null
  private sampleCtx: CanvasRenderingContext2D | null = null
  private image: LoadedPhoto | null = null
  private hist: Hist | null = null
  private session: Session | null = null
  private ring: HTMLElement | null = null
  private pan = { x: 0, y: 0 }
  private zoom = 1
  private raf = 0
  private viewRaf = 0
  private fitAttempts = 0
  private tool: Tool = 'brush'
  private color = '#b08d57'
  private brushSize = 28
  private opacity = 1
  private space = false

  constructor(
    private readonly paint: HTMLCanvasElement,
    private readonly preview: HTMLCanvasElement,
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
  }

  configure(config: SurfaceConfig): void {
    this.tool = config.tool
    this.color = config.color
    this.brushSize = config.brushSize
    this.opacity = config.opacity
    this.space = config.space
    if (
      this.ring &&
      (config.space || (config.tool !== 'brush' && config.tool !== 'eraser'))
    ) {
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
    this.clearPreview()
    if (!image) {
      this.emitHistory()
      return
    }
    this.allocate(image.width, image.height)
    this.sampleCtx?.drawImage(image.element, 0, 0)
    this.hist = {
      width: image.width,
      height: image.height,
      actions: [],
      future: [],
      base: null,
      baseHasPixels: false,
    }
    this.emitHistory()
    this.fitAttempts = 0
    this.fit()
  }

  fit(): void {
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
    const pad = 48
    const scale = Math.min((width - pad) / image.width, (height - pad) / image.height)
    const next = Math.min(MAX_ZOOM, Math.max(scale, 0.01))
    this.zoom = next
    this.pan = {
      x: (width - image.width * next) / 2,
      y: (height - image.height * next) / 2,
    }
    this.emitView()
  }

  undo(): void {
    const hist = this.hist
    if (!hist?.actions.length) return
    const action = hist.actions.pop()
    if (!action) return
    hist.future.push(action)
    this.replay()
  }

  redo(): void {
    const hist = this.hist
    if (!hist?.future.length) return
    const action = hist.future.pop()
    if (!action) return
    hist.actions.push(action)
    this.replay()
  }

  clearPaint(): void {
    if (!this.hist || !historyHasPaint(this.hist.actions, this.hist.baseHasPixels)) return
    this.session = null
    this.push({ kind: 'clear' })
    this.paintCtx?.clearRect(0, 0, this.paint.width, this.paint.height)
    this.clearPreview()
    this.emitHistory()
  }

  private allocate(width: number, height: number): void {
    this.paint.width = width
    this.paint.height = height
    this.preview.width = width
    this.preview.height = height
    this.backup.width = width
    this.backup.height = height
    this.sample.width = width
    this.sample.height = height
    this.paintCtx = context2d(this.paint)
    this.previewCtx = context2d(this.preview)
    this.sampleCtx = context2d(this.sample, { willReadFrequently: true })
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

    if (this.tool === 'eyedropper') {
      const hex = this.sampleColor(point)
      this.session = { mode: 'pick', pointerId: event.pointerId, hex }
      if (hex) this.emit.pick(hex, false)
      this.capture(event)
      return
    }

    if (this.tool !== 'brush' && this.tool !== 'eraser') return
    const stroke: Stroke = {
      tool: this.tool,
      color: this.color,
      size: Math.max(this.brushSize / this.zoom, 0.5),
      opacity: this.opacity,
      points: [point],
    }
    if (this.tool === 'eraser') this.snapshotBackup()
    else this.clearPreview()
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

    const samples = event.getCoalescedEvents?.() ?? [event]
    let added = false
    for (const sample of samples) {
      const point = this.toImage(sample.clientX, sample.clientY)
      if (!point) continue
      const points = session.stroke.points
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
    if (session.stroke.tool === 'eraser') this.commitEraser(session.stroke)
    else if (this.paintCtx) paintStroke(this.paintCtx, session.stroke)
    this.clearPreview()
    this.session = null
    this.viewport.classList.remove('is-panning')
    this.push({ kind: 'stroke', stroke: session.stroke })
    if (session.stroke.tool === 'brush') this.emit.stroke(session.stroke.color)
    this.emitHistory()
  }

  /** Rebuild the eraser from the pre-stroke snapshot so undo replay matches the committed pixels. */
  private commitEraser(stroke: Stroke): void {
    const ctx = this.paintCtx
    if (!ctx) return
    ctx.clearRect(0, 0, this.paint.width, this.paint.height)
    ctx.drawImage(this.backup, 0, 0)
    paintStroke(ctx, stroke)
  }

  private scheduleDraw(): void {
    if (this.raf) return
    this.raf = requestAnimationFrame(() => {
      this.raf = 0
      const session = this.session
      if (!session || session.mode !== 'draw') return
      this.renderDraw(session)
    })
  }

  /**
   * Brush strokes preview on a transparent canvas so each move does not copy the photo.
   * The eraser has to reveal pixels underneath, so it restores only the dirty rectangle
   * from a snapshot taken when the stroke began.
   */
  private renderDraw(session: DrawSession): void {
    const next = strokeBounds(session.stroke)
    if (!next) return
    const width = this.paint.width
    const height = this.paint.height
    const bounds = clampBounds(next, width, height)
    const region = session.prevBounds
      ? clampBounds(unionBounds(session.prevBounds, bounds), width, height)
      : bounds
    if (region.w < 1 || region.h < 1) return

    if (session.stroke.tool === 'eraser') {
      const ctx = this.paintCtx
      if (!ctx) return
      ctx.save()
      ctx.beginPath()
      ctx.rect(region.x, region.y, region.w, region.h)
      ctx.clip()
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(this.backup, 0, 0)
      ctx.restore()
      paintStroke(ctx, session.stroke)
    } else {
      const ctx = this.previewCtx
      if (!ctx) return
      ctx.clearRect(region.x, region.y, region.w, region.h)
      paintStroke(ctx, session.stroke)
    }
    session.prevBounds = bounds
  }

  private snapshotBackup(): void {
    const ctx = context2d(this.backup)
    if (!ctx) return
    ctx.clearRect(0, 0, this.backup.width, this.backup.height)
    ctx.drawImage(this.paint, 0, 0)
  }

  private clearPreview(): void {
    this.previewCtx?.clearRect(0, 0, this.preview.width, this.preview.height)
  }

  private replay(): void {
    const ctx = this.paintCtx
    const hist = this.hist
    if (!ctx || !hist) return
    ctx.clearRect(0, 0, this.paint.width, this.paint.height)
    const projected = projectActions(hist.actions)
    if (projected.includeBase && hist.base) ctx.drawImage(hist.base, 0, 0)
    for (const stroke of projected.strokes) paintStroke(ctx, stroke)
    this.clearPreview()
    this.emitHistory()
  }

  private push(action: HistoryAction): void {
    const hist = this.hist
    if (!hist) return
    hist.actions.push(action)
    hist.future = []
    while (hist.actions.length > MAX_HISTORY) this.bakeOldest(hist)
  }

  private bakeOldest(hist: Hist): void {
    const action = hist.actions.shift()
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
    if (!this.paintCtx || !this.sampleCtx) return null
    const x = Math.min(this.paint.width - 1, Math.max(0, Math.floor(point.x)))
    const y = Math.min(this.paint.height - 1, Math.max(0, Math.floor(point.y)))
    try {
      const paint = this.paintCtx.getImageData(x, y, 1, 1).data
      const base = this.sampleCtx.getImageData(x, y, 1, 1).data
      return compositeHex(paint, base)
    } catch {
      this.emit.error('Could not sample that pixel.')
      return null
    }
  }

  private toImage(clientX: number, clientY: number): Point | null {
    const rect = this.paint.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return null
    if (clientX < rect.left || clientY < rect.top || clientX > rect.right || clientY > rect.bottom) {
      return null
    }
    const x = ((clientX - rect.left) / rect.width) * this.paint.width
    const y = ((clientY - rect.top) / rect.height) * this.paint.height
    return {
      x: clamp(x, 0, Math.max(0, this.paint.width - 0.01)),
      y: clamp(y, 0, Math.max(0, this.paint.height - 0.01)),
    }
  }

  private placeRing(clientX: number, clientY: number): void {
    const ring = this.ring
    if (!ring) return
    const show =
      !!this.image &&
      (this.tool === 'brush' || this.tool === 'eraser') &&
      !this.space &&
      this.session?.mode !== 'pan'
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
    this.emit.view({ x: this.pan.x, y: this.pan.y, z: this.zoom })
  }

  private emitHistory(): void {
    const hist = this.hist
    if (!hist) {
      this.emit.history({ canUndo: false, canRedo: false, hasPaint: false })
      return
    }
    this.emit.history({
      canUndo: hist.actions.length > 0,
      canRedo: hist.future.length > 0,
      hasPaint: historyHasPaint(hist.actions, hist.baseHasPixels),
    })
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
