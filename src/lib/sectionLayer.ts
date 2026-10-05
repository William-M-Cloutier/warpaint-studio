import type { Bounds, StrokeClip } from './paint'
import {
  SECTION_COLORS,
  blitCoverage,
  fillPolygon,
  floodMask,
  proposeSectionMasks,
  type MaskPoint,
} from './sections'
import type { MaskMode, SectionCategory, SectionInfo } from '../types'

/**
 * Editable regions for one photo.
 *
 * Mask arrays are copy-on-write. A paint stroke keeps the array it captured,
 * and the next mask edit slices a new array before writing. Undo swaps those
 * arrays back, so a later mask edit does not rewrite an older stroke.
 */

type SectionRec = SectionInfo & {
  mask: Uint8Array
}

type Edit =
  | {
      kind: 'insert' | 'remove'
      index: number
      items: SectionRec[]
      activeBefore: string | null
      activeAfter: string | null
    }
  | {
      kind: 'patch'
      id: string
      before: Uint8Array
      after: Uint8Array
      activeBefore: string | null
      activeAfter: string | null
    }

type Preview = {
  mode: MaskMode
  before: Uint8Array | null
  live: Uint8Array
  sectionId: string | null
  changed: boolean
}

export type SectionResult = { ok: true; name: string } | { ok: false; reason: string }

const MAX_SECTION_HISTORY = 30
const MIN_WAND_PIXELS = 8

export class SectionLayer {
  width = 0
  height = 0
  activeId: string | null = null
  private sections: SectionRec[] = []
  private past: Edit[] = []
  private future: Edit[] = []
  private preview: Preview | null = null
  private serial = 1
  private colorCursor = 0
  private plate: ImageData | null = null
  private plateValid = false

  get pastCount(): number {
    return this.past.length
  }

  reset(width: number, height: number): void {
    this.width = width
    this.height = height
    this.sections = []
    this.past = []
    this.future = []
    this.preview = null
    this.activeId = null
    this.serial = 1
    this.colorCursor = 0
    this.plate = null
    this.plateValid = false
  }

  list(): SectionInfo[] {
    return this.sections.map((section) => ({
      id: section.id,
      name: section.name,
      color: section.color,
      category: section.category,
      customLabel: section.customLabel,
      visible: section.visible,
      locked: section.locked,
    }))
  }

  select(id: string | null): boolean {
    if (id === this.activeId) return false
    if (id !== null && !this.sections.some((section) => section.id === id)) return false
    this.activeId = id
    this.plateValid = false
    return true
  }

  rename(id: string, name: string): boolean {
    const section = this.find(id)
    if (!section) return false
    const next = name.slice(0, 40)
    if (next === section.name) return false
    section.name = next
    return true
  }

  setLabel(id: string, category: SectionCategory, customLabel: string): boolean {
    const section = this.find(id)
    if (!section) return false
    const custom = customLabel.slice(0, 40)
    if (section.category === category && section.customLabel === custom) return false
    section.category = category
    section.customLabel = custom
    return true
  }

  setVisible(id: string, visible: boolean): boolean {
    const section = this.find(id)
    if (!section || section.visible === visible) return false
    section.visible = visible
    this.plateValid = false
    return true
  }

  setLocked(id: string, locked: boolean): boolean {
    const section = this.find(id)
    if (!section || section.locked === locked) return false
    section.locked = locked
    return true
  }

  remove(id: string): boolean {
    this.cancelPreview()
    const index = this.sections.findIndex((section) => section.id === id)
    if (index < 0) return false
    const [item] = this.sections.splice(index, 1)
    const activeBefore = this.activeId
    if (this.activeId === id) {
      this.activeId = this.sections[index]?.id ?? this.sections[index - 1]?.id ?? null
    }
    this.push({
      kind: 'remove',
      index,
      items: [item],
      activeBefore,
      activeAfter: this.activeId,
    })
    this.plateValid = false
    return true
  }

  wand(
    rgba: Uint8ClampedArray,
    x: number,
    y: number,
    tolerance: number,
    mode: MaskMode,
    edgeAware = true,
  ): SectionResult {
    this.cancelPreview()
    const flooded = floodMask(rgba, this.width, this.height, x, y, tolerance, { edgeAware })
    if (!flooded) return { ok: false, reason: 'That spot is empty. Click the miniature.' }
    if (flooded.count < MIN_WAND_PIXELS) {
      return { ok: false, reason: 'Nothing selected. Raise tolerance or click a broader area.' }
    }
    return this.applyFull(flooded.mask, mode)
  }

  lasso(points: readonly MaskPoint[], mode: MaskMode, rgba?: Uint8ClampedArray): SectionResult {
    this.cancelPreview()
    if (points.length < 3) return { ok: false, reason: 'Draw a loop around the region.' }
    const filled = fillPolygon(this.width, this.height, points)
    if (rgba && rgba.length >= filled.mask.length * 4) {
      let count = 0
      for (let i = 0; i < filled.mask.length; i += 1) {
        if (filled.mask[i] === 0) continue
        if (rgba[i * 4 + 3] < 16) filled.mask[i] = 0
        else count += 1
      }
      filled.count = count
    }
    if (filled.count < MIN_WAND_PIXELS) return { ok: false, reason: 'That loop is too small to make a section.' }
    return this.applyFull(filled.mask, mode)
  }

  propose(rgba: Uint8ClampedArray, edgeAware = true): number {
    this.cancelPreview()
    const masks = proposeSectionMasks(rgba, this.width, this.height, { edgeAware })
    if (masks.length < 2) return 0
    const activeBefore = this.activeId
    const index = this.sections.length
    const items = masks.map((mask) => this.make(mask))
    this.sections.push(...items)
    this.activeId = items[0]?.id ?? this.activeId
    this.push({
      kind: 'insert',
      index,
      items,
      activeBefore,
      activeAfter: this.activeId,
    })
    this.plateValid = false
    return items.length
  }

  beginPreview(mode: MaskMode): SectionResult {
    this.cancelPreview()
    if (this.width < 1 || this.height < 1) return { ok: false, reason: 'Load a photo first.' }
    if (mode === 'new') {
      this.preview = {
        mode,
        before: null,
        live: new Uint8Array(this.width * this.height),
        sectionId: null,
        changed: false,
      }
      return { ok: true, name: '' }
    }
    const section = this.active()
    if (!section) return { ok: false, reason: 'Select a section, or set the mask tool to New.' }
    if (section.locked) return { ok: false, reason: 'That section is locked.' }
    const before = section.mask
    const live = before.slice()
    section.mask = live
    this.preview = { mode, before, live, sectionId: section.id, changed: false }
    return { ok: true, name: section.name }
  }

  restorePreview(bounds: Bounds): void {
    const preview = this.preview
    if (!preview) return
    const region = clampRegion(bounds, this.width, this.height)
    if (region.w < 1 || region.h < 1) return
    if (preview.before) copyRect(preview.live, preview.before, this.width, region)
    else zeroRect(preview.live, this.width, region)
  }

  stampPreview(
    coverage: Uint8Array,
    originX: number,
    originY: number,
    rectW: number,
    rectH: number,
  ): void {
    const preview = this.preview
    if (!preview) return
    const changed = blitCoverage(
      preview.live,
      this.width,
      this.height,
      coverage,
      originX,
      originY,
      rectW,
      rectH,
      preview.mode === 'subtract' ? 'subtract' : 'add',
    )
    if (changed) preview.changed = true
  }

  /** @returns true when the gesture changed a mask and was recorded. */
  commitPreview(): boolean {
    const preview = this.preview
    this.preview = null
    if (!preview) return false
    if (!preview.changed) {
      this.restorePreviewOwner(preview)
      return false
    }
    if (preview.sectionId === null) {
      let count = 0
      for (let i = 0; i < preview.live.length; i += 1) {
        if (preview.live[i] > 0) count += 1
      }
      if (count < 1) return false
      this.insertOne(preview.live)
      this.plateValid = false
      return true
    }
    const section = this.find(preview.sectionId)
    if (!section || !preview.before) {
      this.restorePreviewOwner(preview)
      return false
    }
    section.mask = preview.live
    this.push({
      kind: 'patch',
      id: section.id,
      before: preview.before,
      after: preview.live,
      activeBefore: this.activeId,
      activeAfter: this.activeId,
    })
    this.plateValid = false
    return true
  }

  cancelPreview(): void {
    const preview = this.preview
    if (!preview) return
    this.preview = null
    this.restorePreviewOwner(preview)
    this.plateValid = false
  }

  /**
   * Clip target for a paint stroke. The returned mask array must not be
   * mutated; later edits replace it instead of writing into it.
   */
  clipForPaint(cutout: Uint8Array | null): { clip: StrokeClip | null; blocked: string | null } {
    if (!this.activeId) return { clip: null, blocked: null }
    const section = this.find(this.activeId)
    if (!section) return { clip: null, blocked: null }
    if (section.locked) return { clip: null, blocked: 'That section is locked.' }
    return {
      clip: {
        mask: section.mask,
        cutout,
        width: this.width,
        height: this.height,
      },
      blocked: null,
    }
  }

  undo(): void {
    this.cancelPreview()
    const edit = this.past.pop()
    if (!edit) return
    this.apply(edit, 'inverse')
    this.future.push(edit)
    this.plateValid = false
  }

  redo(): void {
    this.cancelPreview()
    const edit = this.future.pop()
    if (!edit) return
    this.apply(edit, 'forward')
    this.past.push(edit)
    this.plateValid = false
  }

  abandonRedo(): void {
    this.future = []
  }

  dropOldest(): void {
    this.past.shift()
  }

  invalidateOverlay(): void {
    this.plateValid = false
  }

  renderOverlay(ctx: CanvasRenderingContext2D, area: Bounds | null): void {
    if (this.width < 1 || this.height < 1) return
    if (!this.plate || this.plate.width !== this.width || this.plate.height !== this.height) {
      this.plate = ctx.createImageData(this.width, this.height)
      this.plateValid = false
    }
    if (this.plateValid && !area) {
      ctx.putImageData(this.plate, 0, 0)
      return
    }
    const full = { x: 0, y: 0, w: this.width, h: this.height }
    const region = !this.plateValid || !area ? full : clampRegion(area, this.width, this.height)
    if (region.w < 1 || region.h < 1) return
    this.fillPlate(this.plate, region)
    this.plateValid = true
    ctx.putImageData(this.plate, 0, 0, region.x, region.y, region.w, region.h)
  }

  private fillPlate(plate: ImageData, region: Bounds): void {
    const data = plate.data
    const width = this.width
    const visible = this.sections.filter((section) => section.visible)
    const ghost = this.preview && this.preview.sectionId === null ? this.preview.live : null
    const active = this.active()
    const colors = visible.map((section) => hexRgb(section.color))
    const ghostColor: [number, number, number] = [224, 161, 90]
    const activeIndex = active ? visible.findIndex((section) => section.id === active.id) : -1
    for (let y = region.y; y < region.y + region.h; y += 1) {
      for (let x = region.x; x < region.x + region.w; x += 1) {
        const pixel = y * width + x
        const offset = pixel * 4
        let red = 0
        let green = 0
        let blue = 0
        let alpha = 0
        if (ghost && ghost[pixel] > 12) {
          red = ghostColor[0]
          green = ghostColor[1]
          blue = ghostColor[2]
          alpha = edgeAlpha(ghost, width, this.height, x, y) ? 210 : 88
        } else if (visible.length > 0) {
          let chosen = -1
          for (let index = 0; index < visible.length; index += 1) {
            if (visible[index].mask[pixel] > 12) chosen = index
          }
          if (activeIndex >= 0 && active && active.mask[pixel] > 12) chosen = activeIndex
          if (chosen >= 0) {
            const section = visible[chosen]
            red = colors[chosen][0]
            green = colors[chosen][1]
            blue = colors[chosen][2]
            const onEdge = edgeAlpha(section.mask, width, this.height, x, y)
            alpha = section.id === this.activeId ? (onEdge ? 210 : 72) : onEdge ? 150 : 36
          }
        }
        data[offset] = red
        data[offset + 1] = green
        data[offset + 2] = blue
        data[offset + 3] = alpha
      }
    }
  }

  private applyFull(selection: Uint8Array, mode: MaskMode): SectionResult {
    if (mode === 'new') {
      const section = this.insertOne(selection)
      this.plateValid = false
      return { ok: true, name: section.name }
    }
    const section = this.active()
    if (!section) return { ok: false, reason: 'Select a section, or set the mask tool to New.' }
    if (section.locked) return { ok: false, reason: 'That section is locked.' }
    const before = section.mask
    const live = before.slice()
    const changed = blitCoverage(
      live,
      this.width,
      this.height,
      selection,
      0,
      0,
      this.width,
      this.height,
      mode === 'subtract' ? 'subtract' : 'add',
    )
    if (!changed) {
      return {
        ok: false,
        reason: mode === 'subtract' ? 'Nothing in that section to remove.' : 'That area is already in the section.',
      }
    }
    section.mask = live
    this.push({
      kind: 'patch',
      id: section.id,
      before,
      after: live,
      activeBefore: this.activeId,
      activeAfter: this.activeId,
    })
    this.plateValid = false
    return { ok: true, name: section.name }
  }

  private insertOne(mask: Uint8Array): SectionRec {
    const section = this.make(mask)
    const activeBefore = this.activeId
    const index = this.sections.length
    this.sections.push(section)
    this.activeId = section.id
    this.push({
      kind: 'insert',
      index,
      items: [section],
      activeBefore,
      activeAfter: this.activeId,
    })
    return section
  }

  private make(mask: Uint8Array): SectionRec {
    const number = this.serial
    this.serial += 1
    const color = SECTION_COLORS[this.colorCursor % SECTION_COLORS.length]
    this.colorCursor += 1
    return {
      id: `section-${number}`,
      name: `Section ${number}`,
      color,
      category: 'custom',
      customLabel: '',
      visible: true,
      locked: false,
      mask,
    }
  }

  private push(edit: Edit): void {
    this.past.push(edit)
    this.future = []
  }

  private restorePreviewOwner(preview: Preview): void {
    if (!preview.sectionId || !preview.before) return
    const section = this.find(preview.sectionId)
    if (section && section.mask === preview.live) section.mask = preview.before
  }

  private apply(edit: Edit, direction: 'forward' | 'inverse'): void {
    if (edit.kind === 'patch') {
      const section = this.find(edit.id)
      if (!section) return
      const forward = direction === 'forward'
      section.mask = forward ? edit.after : edit.before
      this.activeId = forward ? edit.activeAfter : edit.activeBefore
      return
    }
    const inserting = (edit.kind === 'insert') === (direction === 'forward')
    if (inserting) this.sections.splice(edit.index, 0, ...edit.items)
    else this.sections.splice(edit.index, edit.items.length)
    this.activeId = direction === 'forward' ? edit.activeAfter : edit.activeBefore
  }

  private active(): SectionRec | null {
    if (!this.activeId) return null
    return this.find(this.activeId)
  }

  private find(id: string): SectionRec | null {
    return this.sections.find((section) => section.id === id) ?? null
  }
}

function clampRegion(bounds: Bounds, width: number, height: number): Bounds {
  const x = Math.max(0, Math.floor(bounds.x))
  const y = Math.max(0, Math.floor(bounds.y))
  const right = Math.min(width, Math.ceil(bounds.x + bounds.w))
  const bottom = Math.min(height, Math.ceil(bounds.y + bounds.h))
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) }
}

function copyRect(dst: Uint8Array, src: Uint8Array, imageW: number, region: Bounds): void {
  for (let y = 0; y < region.h; y += 1) {
    const start = (region.y + y) * imageW + region.x
    dst.set(src.subarray(start, start + region.w), start)
  }
}

function zeroRect(dst: Uint8Array, imageW: number, region: Bounds): void {
  for (let y = 0; y < region.h; y += 1) {
    dst.fill(0, (region.y + y) * imageW + region.x, (region.y + y) * imageW + region.x + region.w)
  }
}

function edgeAlpha(mask: Uint8Array, width: number, height: number, x: number, y: number): boolean {
  const pixel = y * width + x
  if (x === 0 || y === 0 || x === width - 1 || y === height - 1) return true
  return mask[pixel - 1] <= 12 || mask[pixel + 1] <= 12 || mask[pixel - width] <= 12 || mask[pixel + width] <= 12
}

function hexRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

export { MAX_SECTION_HISTORY }
