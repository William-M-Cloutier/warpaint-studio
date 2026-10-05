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

function maskAt(mask: Uint8Array, width: number, x: number, y: number): number {
  return mask[y * width + x]
}

const width = 70
const height = 50
const photo = makeBuffer(width, height, [244, 244, 242, 255])
fillRect(photo, width, 8, 8, 22, 30, [168, 36, 32, 255])
fillRect(photo, width, 31, 8, 2, 30, [12, 12, 12, 255])
fillRect(photo, width, 34, 8, 22, 30, [168, 36, 32, 255])

const left = floodMask(photo, width, height, 16, 20, 18)
assert.ok(left)
assert.equal(maskAt(left.mask, width, 16, 20), 255)
assert.equal(maskAt(left.mask, width, 40, 20), 0, 'wand stops at the dark line')
assert.equal(maskAt(left.mask, width, 2, 2), 0, 'wand does not take the backdrop')
assert.ok(left.count > 100 && left.count <= 22 * 30, `left count ${left.count}`)

const loose = floodMask(photo, width, height, 16, 20, 0)
assert.ok(loose)
assert.equal(maskAt(loose.mask, width, 18, 22), 255)
assert.equal(maskAt(loose.mask, width, 40, 20), 0)

const empty = floodMask(photo, width, height, 2, 2, 4)
assert.ok(empty)
assert.equal(maskAt(empty.mask, width, 16, 20), 0, 'clicking the backdrop does not select the plate')

const cutout = makeBuffer(40, 30, [20, 20, 20, 0])
fillRect(cutout, 40, 6, 6, 18, 16, [40, 90, 160, 255])
const hole = floodMask(cutout, 40, 30, 2, 2, 30)
assert.equal(hole, null, 'transparent seed is not a section')
const figure = floodMask(cutout, 40, 30, 12, 12, 12)
assert.ok(figure)
assert.equal(maskAt(figure.mask, 40, 2, 2), 0, 'wand stays off the cleared backdrop')

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
const coverage = new Uint8Array(16)
coverage[0] = 100
coverage[1] = 255
const added = blitCoverage(mask, 4, 4, coverage, 0, 0, 4, 4, 'add')
assert.equal(added, true)
assert.equal(mask[0], 200)
assert.equal(mask[1], 255)
const removed = blitCoverage(mask, 4, 4, coverage, 0, 0, 4, 4, 'subtract')
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

const kept = new Uint8ClampedArray([10, 20, 30, 200])
combineClipAlpha(kept, 1, 0, 0, 1, 1, new Uint8Array([255]), null)
assert.equal(kept[3], 200)

const sceneW = 96
const sceneH = 72
const scene = makeBuffer(sceneW, sceneH, [236, 236, 234, 255])
fillRect(scene, sceneW, 14, 16, 28, 40, [170, 48, 36, 255])
fillRect(scene, sceneW, 54, 16, 28, 40, [36, 72, 150, 255])
const proposed = proposeSectionMasks(scene, sceneW, sceneH)
assert.equal(proposed.length, 2, `expected two regions, got ${proposed.length}`)
const redOn = proposed.some((entry) => maskAt(entry, sceneW, 24, 32) > 0)
const blueOn = proposed.some((entry) => maskAt(entry, sceneW, 66, 32) > 0)
assert.equal(redOn, true)
assert.equal(blueOn, true)
assert.equal(
  proposed.every((entry) => maskAt(entry, sceneW, 2, 2) === 0),
  true,
  'backdrop is not a section',
)
assert.equal(
  proposed.filter((entry) => maskAt(entry, sceneW, 24, 32) > 0).length,
  1,
)
assert.equal(
  proposed.filter((entry) => maskAt(entry, sceneW, 66, 32) > 0).length,
  1,
)

const wideW = 420
const wideH = 80
const wide = makeBuffer(wideW, wideH, [240, 240, 238, 255])
fillRect(wide, wideW, 20, 12, 180, 56, [150, 40, 36, 255])
fillRect(wide, wideW, 200, 12, 3, 56, [8, 8, 8, 255])
fillRect(wide, wideW, 203, 12, 180, 56, [40, 78, 150, 255])
const wideRegions = proposeSectionMasks(wide, wideW, wideH)
assert.ok(wideRegions.length >= 2, `thin line should split regions, got ${wideRegions.length}`)
assert.equal(
  wideRegions.some((entry) => maskAt(entry, wideW, 40, 40) > 0),
  true,
)
assert.equal(
  wideRegions.some((entry) => maskAt(entry, wideW, 280, 40) > 0),
  true,
)

const layer = new SectionLayer()
layer.reset(width, height)
const created = layer.wand(photo, 16, 20, 18, 'new')
assert.equal(created.ok, true)
assert.equal(layer.list().length, 1)
assert.equal(layer.list()[0]?.name, 'Section 1')
const clip = layer.clipForPaint(null)
assert.ok(clip.clip)
const frozen = clip.clip.mask
const beforeEdit = frozen.slice()
const grown = layer.lasso(
  [
    { x: 8, y: 8 },
    { x: 50, y: 8 },
    { x: 50, y: 38 },
    { x: 8, y: 38 },
  ],
  'add',
)
assert.equal(grown.ok, true)
assert.deepEqual(frozen, beforeEdit, 'an older stroke keeps the mask it captured')
const live = layer.clipForPaint(null).clip
assert.ok(live)
assert.notEqual(live.mask, frozen)
assert.equal(maskAt(live.mask, width, 40, 20), 255)
layer.undo()
assert.equal(maskAt(layer.clipForPaint(null).clip!.mask, width, 40, 20), 0)
layer.redo()
assert.equal(maskAt(layer.clipForPaint(null).clip!.mask, width, 40, 20), 255)

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

const custom = layer.list()[0]
assert.ok(custom)
layer.setLabel(custom.id, 'trim', '')
assert.equal(layer.list()[0]?.category, 'trim')
layer.setLabel(custom.id, 'custom', 'Shoulder pad')
assert.equal(layer.list()[0]?.customLabel, 'Shoulder pad')

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

const shadeW = 180
const shadeH = 90
const shaded = makeBuffer(shadeW, shadeH, [244, 244, 242, 255])
fillGradient(shaded, shadeW, 10, 8, 60, 74, 48, 210)
fillRect(shaded, shadeW, 78, 8, 8, 74, [8, 8, 8, 255])
fillGradient(shaded, shadeW, 94, 8, 60, 74, 48, 210)

const across = floodMask(shaded, shadeW, shadeH, 24, 12, 32)
assert.ok(across)
assert.equal(maskAt(across.mask, shadeW, 24, 12), 255, 'seed on the dark end stays selected')
assert.equal(maskAt(across.mask, shadeW, 40, 74), 255, 'the lit end of the same plate stays selected')
assert.equal(maskAt(across.mask, shadeW, 120, 74), 0, 'a crease stops the fill before the next plate')
assert.equal(maskAt(across.mask, shadeW, 2, 2), 0, 'shade-aware wand stays off the backdrop')

const rawShade = floodMask(shaded, shadeW, shadeH, 24, 12, 32, { ignoreLighting: false })
assert.ok(rawShade)
assert.equal(maskAt(rawShade.mask, shadeW, 40, 74), 0, 'raw color match still stops on a shade ramp')

const onePlateW = 140
const onePlateH = 80
const onePlate = makeBuffer(onePlateW, onePlateH, [236, 236, 234, 255])
fillGradient(onePlate, onePlateW, 24, 10, 90, 60, 40, 200)
const shadeProposal = proposeSectionMasks(onePlate, onePlateW, onePlateH)
const top = 16 * onePlateW + 50
const bottom = 64 * onePlateW + 50
assert.equal(
  shadeProposal.some((entry) => entry[top] > 0 && entry[bottom] === 0),
  false,
  'suggest does not split a smooth shade ramp',
)
assert.equal(
  shadeProposal.some((entry) => entry[bottom] > 0 && entry[top] === 0),
  false,
  'suggest does not split a smooth shade ramp',
)

const splitShade = proposeSectionMasks(shaded, shadeW, shadeH)
const leftLit = splitShade.find((entry) => maskAt(entry, shadeW, 24, 12) > 0)
const rightLit = splitShade.find((entry) => maskAt(entry, shadeW, 120, 12) > 0)
assert.ok(leftLit, 'the dark plate is proposed')
assert.ok(rightLit, 'the second plate is proposed')
assert.equal(maskAt(leftLit, shadeW, 40, 74), 255, 'one proposed plate includes its highlight and its shadow')
assert.equal(maskAt(rightLit, shadeW, 130, 74), 255, 'the other plate includes its highlight and its shadow')
assert.equal(maskAt(leftLit, shadeW, 120, 40), 0, 'proposed plates stay on their own side of the crease')

console.log('section checks passed')
