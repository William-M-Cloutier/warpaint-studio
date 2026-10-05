import assert from 'node:assert/strict'
import { SectionLayer } from '../src/lib/sectionLayer.ts'
import {
  blitCoverage,
  combineClipAlpha,
  fillPolygon,
  floodMask,
  proposeSectionMasks,
} from '../src/lib/sections.ts'

function makeBuffer(width: number, height: number, fill: [number, number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = fill[0]
    data[i * 4 + 1] = fill[1]
    data[i * 4 + 2] = fill[2]
    data[i * 4 + 3] = fill[3]
  }
  return data
}

function fillRect(
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  color: [number, number, number, number],
): void {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      const i = (y * width + x) * 4
      data[i] = color[0]
      data[i + 1] = color[1]
      data[i + 2] = color[2]
      data[i + 3] = color[3]
    }
  }
}

function fillGradient(
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  lum0: number,
  lum1: number,
): void {
  for (let y = 0; y < h; y += 1) {
    const t = h <= 1 ? 0 : y / (h - 1)
    const lum = Math.round(lum0 + (lum1 - lum0) * t)
    for (let x = 0; x < w; x += 1) {
      const i = ((y0 + y) * width + (x0 + x)) * 4
      data[i] = lum
      data[i + 1] = lum
      data[i + 2] = lum
      data[i + 3] = 255
    }
  }
}

function fillDisk(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  lumAt: (dx: number, dy: number, dist: number) => number,
): void {
  const r2 = radius * radius
  for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(height - 1, Math.ceil(cy + radius)); y += 1) {
    for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(width - 1, Math.ceil(cx + radius)); x += 1) {
      const dx = x - cx
      const dy = y - cy
      const d2 = dx * dx + dy * dy
      if (d2 > r2) continue
      const lum = Math.max(0, Math.min(255, Math.round(lumAt(dx, dy, Math.sqrt(d2)))))
      const i = (y * width + x) * 4
      data[i] = lum
      data[i + 1] = lum
      data[i + 2] = lum
      data[i + 3] = 255
    }
  }
}

function maskAt(mask: Uint8Array, width: number, x: number, y: number): number {
  return mask[y * width + x]
}

function coverage(mask: Uint8Array, width: number, x0: number, y0: number, w: number, h: number): number {
  let on = 0
  let total = 0
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      total += 1
      if (mask[y * width + x] > 0) on += 1
    }
  }
  return total === 0 ? 0 : on / total
}

const width = 80
const height = 60
const photo = makeBuffer(width, height, [244, 244, 242, 255])
fillRect(photo, width, 8, 8, 24, 36, [150, 40, 36, 255])
fillRect(photo, width, 32, 8, 3, 36, [12, 12, 12, 255])
fillRect(photo, width, 35, 8, 24, 36, [40, 78, 150, 255])

const left = floodMask(photo, width, height, 16, 24, 48)
assert.ok(left)
assert.equal(maskAt(left.mask, width, 16, 24), 255)
assert.equal(maskAt(left.mask, width, 44, 24), 0, 'wand stops at the dark seam')
assert.ok(coverage(left.mask, width, 8, 8, 24, 36) > 0.7, 'the plate is mostly selected')
assert.equal(maskAt(left.mask, width, 2, 2), 0, 'wand does not take the backdrop')

const cutout = makeBuffer(48, 36, [20, 20, 20, 0])
fillRect(cutout, 48, 8, 8, 28, 20, [90, 90, 96, 255])
const hole = floodMask(cutout, 48, 36, 2, 2, 48)
assert.equal(hole, null, 'transparent seed is not a section')
const figure = floodMask(cutout, 48, 36, 18, 16, 48)
assert.ok(figure)
assert.equal(maskAt(figure.mask, 48, 2, 2), 0, 'wand stays off the cleared backdrop')
assert.ok(figure.count <= 28 * 20, 'wand stays inside the opaque figure')

const loop = fillPolygon(40, 30, [
  { x: 5, y: 5 },
  { x: 30, y: 6 },
  { x: 28, y: 22 },
  { x: 6, y: 20 },
])
assert.equal(maskAt(loop.mask, 40, 16, 12), 255)
assert.equal(maskAt(loop.mask, 40, 1, 1), 0)
assert.ok(loop.count > 200 && loop.count < 600, `lasso count ${loop.count}`)

const mask = new Uint8Array(16)
mask[0] = 200
const coverageStamp = new Uint8Array(16)
coverageStamp[0] = 100
coverageStamp[1] = 255
const added = blitCoverage(mask, 4, 4, coverageStamp, 0, 0, 4, 4, 'add')
assert.equal(added, true)
assert.equal(mask[0], 200)
assert.equal(mask[1], 255)
const removed = blitCoverage(mask, 4, 4, coverageStamp, 0, 0, 4, 4, 'subtract')
assert.equal(removed, true)
assert.equal(mask[1], 0)

const stamp = new Uint8ClampedArray(8)
stamp[3] = 255
stamp[7] = 180
const section = new Uint8Array([255, 0])
const cutoutAlpha = new Uint8Array([0, 255])
combineClipAlpha(stamp, 2, 0, 0, 2, 1, section, cutoutAlpha)
assert.equal(stamp[3], 0, 'cutout alpha clears the stroke')
assert.equal(stamp[7], 0, 'outside the section the stroke is cleared')

const shadeW = 320
const shadeH = 160
const shaded = makeBuffer(shadeW, shadeH, [0, 0, 0, 0])
fillGradient(shaded, shadeW, 16, 20, 70, 110, 42, 210)
fillRect(shaded, shadeW, 86, 20, 4, 110, [8, 8, 8, 255])
fillGradient(shaded, shadeW, 90, 20, 70, 110, 210, 42)
fillRect(shaded, shadeW, 200, 20, 100, 120, [70, 70, 74, 255])

const across = floodMask(shaded, shadeW, shadeH, 40, 30, 48)
assert.ok(across)
assert.equal(maskAt(across.mask, shadeW, 40, 30), 255, 'seed on the dark end stays selected')
assert.equal(maskAt(across.mask, shadeW, 40, 120), 255, 'the lit end of the same plate stays selected')
assert.equal(maskAt(across.mask, shadeW, 120, 70), 0, 'a crease stops the fill before the next plate')
assert.equal(maskAt(across.mask, shadeW, 2, 2), 0, 'clear backdrop stays out')

const diskW = 280
const diskH = 140
const disks = makeBuffer(diskW, diskH, [0, 0, 0, 0])
fillDisk(disks, diskW, diskH, 70, 70, 52, (_dx, _dy, dist) => 70 + dist * 2.2)
fillDisk(disks, diskW, diskH, 190, 70, 52, (_dx, _dy, dist) => 200 - dist * 1.6)
const round = floodMask(disks, diskW, diskH, 70, 70, 48)
assert.ok(round)
assert.ok(maskAt(round.mask, diskW, 70, 30) > 0, 'rounded highlight stays in the plate')
assert.ok(maskAt(round.mask, diskW, 70, 110) > 0, 'rounded shadow stays in the plate')
assert.equal(maskAt(round.mask, diskW, 190, 70), 0, 'the wand does not jump to the next rounded plate')

const bridged = makeBuffer(260, 120, [0, 0, 0, 0])
fillDisk(bridged, 260, 120, 60, 60, 40, () => 120)
fillDisk(bridged, 260, 120, 190, 60, 40, () => 150)
fillRect(bridged, 260, 95, 57, 70, 4, [130, 130, 130, 255])
const oneSide = floodMask(bridged, 260, 120, 60, 60, 64)
assert.ok(oneSide)
assert.equal(maskAt(oneSide.mask, 260, 60, 60), 255)
assert.equal(maskAt(oneSide.mask, 260, 190, 60), 0, 'a thin bridge does not pull in the next part')

const onePlateW = 180
const onePlateH = 100
const onePlate = makeBuffer(onePlateW, onePlateH, [0, 0, 0, 0])
fillGradient(onePlate, onePlateW, 24, 10, 130, 80, 40, 200)
const shadeProposal = proposeSectionMasks(onePlate, onePlateW, onePlateH)
const top = 20 * onePlateW + 80
const bottom = 80 * onePlateW + 80
assert.equal(
  shadeProposal.some((entry) => entry[top] > 0 && entry[bottom] === 0),
  false,
  'suggest does not split a smooth shade ramp',
)

const splitShade = proposeSectionMasks(shaded, shadeW, shadeH)
const leftLit = splitShade.find((entry) => maskAt(entry, shadeW, 40, 30) > 0)
const rightLit = splitShade.find((entry) => maskAt(entry, shadeW, 120, 70) > 0)
assert.ok(leftLit, 'the first plate is proposed')
assert.ok(rightLit, 'the second plate is proposed')
assert.equal(maskAt(leftLit, shadeW, 40, 120), 255, 'one proposed plate includes its highlight and its shadow')
assert.equal(maskAt(leftLit, shadeW, 120, 70), 0, 'proposed plates stay on their own side of the crease')

const layer = new SectionLayer()
layer.reset(width, height)
const created = layer.wand(photo, 16, 24, 48, 'new')
assert.equal(created.ok, true)
assert.equal(layer.list().length, 1)
assert.equal(layer.list()[0]?.name, 'Section 1')
assert.ok(layer.list()[0]?.color.startsWith('#'))
const clip = layer.clipForPaint(null)
assert.ok(clip.clip)
const frozen = clip.clip.mask
const beforeEdit = frozen.slice()
const grown = layer.lasso(
  [
    { x: 8, y: 8 },
    { x: 60, y: 8 },
    { x: 60, y: 44 },
    { x: 8, y: 44 },
  ],
  'add',
)
assert.equal(grown.ok, true)
assert.deepEqual(frozen, beforeEdit, 'an older stroke keeps the mask it captured')
const live = layer.clipForPaint(null).clip
assert.ok(live)
assert.notEqual(live.mask, frozen)
assert.equal(maskAt(live.mask, width, 44, 24), 255)
layer.undo()
assert.equal(maskAt(layer.clipForPaint(null).clip!.mask, width, 44, 24), 0)
layer.redo()
assert.equal(maskAt(layer.clipForPaint(null).clip!.mask, width, 44, 24), 255)

const id = layer.list()[0]?.id
assert.ok(id)
layer.setLocked(id, true)
assert.equal(layer.clipForPaint(null).blocked, 'That section is locked.')
layer.setLocked(id, false)
layer.select(null)
assert.equal(layer.clipForPaint(null).clip, null)
layer.select(id)
assert.equal(layer.remove(id), true)
assert.equal(layer.list().length, 0)
layer.undo()
assert.equal(layer.list().length, 1)
assert.equal(layer.activeId, id)

console.log('section checks passed')
