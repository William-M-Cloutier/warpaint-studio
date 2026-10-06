import assert from 'node:assert/strict'
import { buildHighlightCoverage, highlightRadius } from '../src/lib/autoHighlight.ts'
import { miniatureRidges } from '../src/lib/edgeSelect.ts'

assert.ok(highlightRadius(false, 1) > highlightRadius(true, 1), 'hug tightens the band')
assert.ok(highlightRadius(true, 0.25) > highlightRadius(true, 1), 'a higher hug is tighter')

const width = 40
const height = 24
const count = width * height
const rgba = new Uint8ClampedArray(count * 4)
rgba.fill(255)
for (let i = 0; i < count; i += 1) {
  const value = 90
  rgba[i * 4] = value
  rgba[i * 4 + 1] = value
  rgba[i * 4 + 2] = value
}
const walls = new Uint8Array(count)
const off = new Uint8Array(count)
for (let y = 0; y < height; y += 1) walls[y * width + 20] = 255

const loose = buildHighlightCoverage({
  rgba,
  width,
  height,
  walls,
  off,
  section: null,
  cutout: null,
  hug: false,
  hugStrength: 1,
})
const tight = buildHighlightCoverage({
  rgba,
  width,
  height,
  walls,
  off,
  section: null,
  cutout: null,
  hug: true,
  hugStrength: 1,
})

const at = (field: Uint8Array, x: number) => field[8 * width + x]
assert.ok(at(loose.coverage, 20) > 180, 'the ridge itself is painted')
assert.ok(at(loose.coverage, 18) > 0, 'a loose band reaches a couple of pixels out')
assert.equal(at(loose.coverage, 12), 0, 'the band does not flood the plate')
assert.equal(at(tight.coverage, 18), 0, 'hug drops the pixels the loose band still covers')
assert.ok(at(tight.coverage, 20) > 180, 'hug still paints the ridge')

const section = new Uint8Array(count)
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < 10; x += 1) section[y * width + x] = 255
}
for (let y = 0; y < height; y += 1) walls[y * width + 5] = 255
const clipped = buildHighlightCoverage({
  rgba,
  width,
  height,
  walls,
  off,
  section,
  cutout: null,
  hug: false,
  hugStrength: 0.5,
})
assert.ok(at(clipped.coverage, 5) > 0, 'the section ridge is painted')
assert.equal(at(clipped.coverage, 20), 0, 'a ridge outside the section is left alone')

const cutout = new Uint8Array(count)
cutout.fill(255)
for (let y = 0; y < height; y += 1) cutout[y * width + 5] = 0
const cleared = buildHighlightCoverage({
  rgba,
  width,
  height,
  walls,
  off,
  section: null,
  cutout,
  hug: false,
  hugStrength: 0.5,
})
assert.equal(at(cleared.coverage, 5), 0, 'a cleared cutout pixel is not highlighted')

const photoW = 72
const photoH = 56
const photo = new Uint8ClampedArray(photoW * photoH * 4)
for (let y = 0; y < photoH; y += 1) {
  for (let x = 0; x < photoW; x += 1) {
    const ridge = x === 36 || x === 37
    const value = ridge ? 214 : 72
    const offset = (y * photoW + x) * 4
    photo[offset] = value
    photo[offset + 1] = value
    photo[offset + 2] = value
    photo[offset + 3] = 255
  }
}
const ridges = miniatureRidges(photo, photoW, photoH, 48, null)
let onStripe = 0
for (let y = 4; y < photoH - 4; y += 1) {
  if (ridges.walls[y * photoW + 36] !== 0 || ridges.walls[y * photoW + 37] !== 0) onStripe += 1
}
assert.ok(onStripe > 8, 'the bright stripe is a ridge the highlight can follow')
