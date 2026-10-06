import assert from 'node:assert/strict'
import { edgeGuide, selectRegion, selectionEdges } from '../src/lib/edgeSelect.ts'
import { biasStrokePoint, buildBarrierGrid, gridFromBarriers } from '../src/lib/edgeSnap.ts'
import type { RidgeEdits } from '../src/lib/edgeEdits.ts'

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

const open = new Uint8Array(30 * 12)
const openGrid = gridFromBarriers(open, 30, 12, 1)
const openPoint = biasStrokePoint(openGrid, { x: 4, y: 4 }, { x: 8, y: 5 }, 1, 8)
assert.equal(openPoint.x, 8)
assert.equal(openPoint.y, 5)

const wall = new Uint8Array(40 * 16)
for (let y = 0; y < 16; y += 1) wall[y * 40 + 20] = 1
const grid = gridFromBarriers(wall, 40, 16, 1)
const inside = biasStrokePoint(grid, { x: 12, y: 8 }, { x: 16, y: 8 }, 1, 8)
assert.ok(inside.x < 16, 'a point near a ridge is nudged away from it')
assert.ok(inside.x > 8, 'the nudge stays local')
const untouched = biasStrokePoint(grid, { x: 4, y: 8 }, { x: 4, y: 8 }, 1, 8)
assert.equal(untouched.x, 4, 'open paint away from a ridge is left alone')
const identity = biasStrokePoint(grid, { x: 16, y: 8 }, { x: 16, y: 8 }, 0, 8)
assert.equal(identity.x, 16, 'strength zero does not move the pointer')
const crossed = biasStrokePoint(grid, { x: 16, y: 8 }, { x: 34, y: 8 }, 1, 8)
assert.ok(Math.abs(crossed.x - 34) < 0.01, 'a point well past the ridge is not dragged back')

const onRidge = biasStrokePoint(grid, { x: 16, y: 8 }, { x: 20, y: 8 }, 0.8, 8)
assert.ok(onRidge.x < 20, 'sitting on a ridge keeps the side the stroke came from')

const mask = new Uint8Array(40 * 16)
for (let i = 0; i < mask.length; i += 1) if (i % 40 < 18) mask[i] = 255
const subject = new Uint8Array(40 * 16)
subject.fill(1)
const none = new Uint8Array(40 * 16)
const barriers = buildBarrierGrid(none, subject, 40, 16, 1, 40, 16, mask)
const sectionGrid = gridFromBarriers(barriers, 40, 16, 1)
const hugged = biasStrokePoint(sectionGrid, { x: 12, y: 8 }, { x: 16, y: 8 }, 1, 8)
assert.ok(hugged.x < 16, 'the active section boundary nudges the stroke back inside')
const outside = biasStrokePoint(sectionGrid, { x: 30, y: 8 }, { x: 34, y: 8 }, 1, 8)
assert.ok(Math.abs(outside.x - 34) < 0.01, 'far outside a section, the assist does not yank the pointer')

const width = 180
const height = 160
const split = makeBuffer(width, height, [250, 250, 250, 255])
fillRect(split, width, 20, 20, 50, 50, [60, 60, 60, 255])
fillRect(split, width, 70, 20, 50, 50, [180, 180, 180, 255])
fillRect(split, width, 20, 70, 50, 50, [100, 100, 100, 255])
fillRect(split, width, 70, 70, 50, 50, [140, 140, 140, 255])
const leftOnly = selectRegion(split, width, height, 40, 40, 48)
assert.ok(leftOnly)
assert.equal(leftOnly.mask[40 * width + 40], 255)
assert.equal(leftOnly.mask[40 * width + 90], 0, 'the wand stops on the sculpt seam')

const edges = selectionEdges(split, width, height, 48)
const erase = new Uint8Array(width * height)
const add = new Uint8Array(width * height)
for (let y = 28; y <= 62; y += 1) {
  for (let x = 62; x <= 78; x += 1) {
    if (edges[y * width + x] !== 0) erase[y * width + x] = 255
  }
}
const rubbed: RidgeEdits = { add, erase }
const crossedSeam = selectRegion(split, width, height, 40, 40, 48, rubbed)
assert.ok(crossedSeam)
assert.equal(crossedSeam.mask[40 * width + 90], 255, 'erasing the false seam lets the wand cross')
assert.equal(crossedSeam.mask[90 * width + 40], 0, 'a seam that was not erased still stops the wand')
const guideRubbed = edgeGuide(split, width, height, 48, rubbed)
let seamWall = 0
for (let y = 36; y <= 54; y += 1) {
  for (let x = 68; x <= 72; x += 1) if (guideRubbed.wall[y * guideRubbed.width + x] !== 0) seamWall += 1
}
assert.equal(seamWall, 0, 'erased ridges leave the snap field too')

const smoothW = 180
const smoothH = 100
const smooth = makeBuffer(smoothW, smoothH, [0, 0, 0, 0])
fillGradient(smooth, smoothW, 24, 16, 130, 70, 50, 190)
const whole = selectRegion(smooth, smoothW, smoothH, 50, 50, 48)
assert.ok(whole)
assert.equal(whole.mask[50 * smoothW + 130], 255, 'a smooth plate is one region before a hand ridge')
const forcedAdd = new Uint8Array(smoothW * smoothH)
const forcedErase = new Uint8Array(smoothW * smoothH)
for (let y = 16; y < 86; y += 1) {
  forcedAdd[y * smoothW + 90] = 255
  forcedAdd[y * smoothW + 91] = 255
}
const forced: RidgeEdits = { add: forcedAdd, erase: forcedErase }
const halted = selectRegion(smooth, smoothW, smoothH, 50, 50, 48, forced)
assert.ok(halted)
assert.equal(halted.mask[50 * smoothW + 50], 255)
assert.equal(halted.mask[50 * smoothW + 130], 0, 'a painted ridge stops the wand')
const guided = edgeGuide(smooth, smoothW, smoothH, 48, forced)
assert.equal(guided.wall[50 * guided.width + 90], 1, 'the painted ridge is a wall for edge snap')
assert.equal(guided.wall[50 * guided.width + 89], 0, 'the wall is the stroke, not a ring beside it')
assert.equal(guided.wall[50 * guided.width + 92], 0, 'the wall is the stroke, not a ring beside it')
const shown = selectionEdges(smooth, smoothW, smoothH, 48, forced)
assert.equal(shown[50 * smoothW + 89], 0, 'show edges does not outline the painted stroke')
assert.equal(shown[50 * smoothW + 90], 0, 'show edges does not re-edge the painted stroke')
assert.equal(shown[50 * smoothW + 91], 0, 'show edges does not re-edge the painted stroke')
assert.equal(shown[50 * smoothW + 92], 0, 'show edges does not outline the painted stroke')
const snapBarriers = buildBarrierGrid(
  guided.wall,
  guided.subject,
  guided.width,
  guided.height,
  guided.scale,
  guided.fullWidth,
  guided.fullHeight,
  null,
)
const snap = gridFromBarriers(snapBarriers, guided.width, guided.height, guided.scale)
const huggedRidge = biasStrokePoint(snap, { x: 70, y: 50 }, { x: 86, y: 50 }, 0.9, 10)
assert.ok(huggedRidge.x < 86, 'edge snap hugs the painted ridge instead of crossing it')
