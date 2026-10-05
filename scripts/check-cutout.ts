import assert from 'node:assert/strict'
import { projectCutout, removeBackdrop, repairCutout, type RgbaBuffer } from '../src/lib/cutout.ts'
import { fitPhotoScale, photoScaleToSlider, sliderToPhotoScale } from '../src/lib/photoScale.ts'
import { compositeSurface, sampleTintHex } from '../src/lib/tint.ts'

function makeBuffer(width: number, height: number, fill: [number, number, number]): RgbaBuffer {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = fill[0]
    data[i * 4 + 1] = fill[1]
    data[i * 4 + 2] = fill[2]
    data[i * 4 + 3] = 255
  }
  return { data, width, height }
}

function fillRect(
  buffer: RgbaBuffer,
  x0: number,
  y0: number,
  w: number,
  h: number,
  color: [number, number, number],
): void {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      if (x < 0 || y < 0 || x >= buffer.width || y >= buffer.height) continue
      const i = (y * buffer.width + x) * 4
      buffer.data[i] = color[0]
      buffer.data[i + 1] = color[1]
      buffer.data[i + 2] = color[2]
      buffer.data[i + 3] = 255
    }
  }
}

function alphaAt(buffer: RgbaBuffer, x: number, y: number): number {
  return buffer.data[(y * buffer.width + x) * 4 + 3]
}

function rgbAt(buffer: RgbaBuffer, x: number, y: number): [number, number, number] {
  const i = (y * buffer.width + x) * 4
  return [buffer.data[i], buffer.data[i + 1], buffer.data[i + 2]]
}

const white: [number, number, number] = [244, 244, 242]
const red: [number, number, number] = [168, 36, 32]

const plain = makeBuffer(80, 64, white)
fillRect(plain, 22, 14, 36, 36, red)
const plainStats = removeBackdrop(plain, 36)
assert.equal(alphaAt(plain, 0, 0), 0, 'corner backdrop should clear')
assert.equal(alphaAt(plain, 40, 32), 255, 'subject center should stay')
assert.ok(plainStats.removedRatio > 0.4 && plainStats.removedRatio < 0.85, `ratio ${plainStats.removedRatio}`)
assert.deepEqual(rgbAt(plain, 40, 32), red, 'subject RGB stays put')

const gradient = makeBuffer(90, 70, [230, 230, 228])
for (let y = 0; y < gradient.height; y += 1) {
  for (let x = 0; x < gradient.width; x += 1) {
    const shade = 230 - Math.round((x / gradient.width) * 40)
    const i = (y * gradient.width + x) * 4
    gradient.data[i] = shade
    gradient.data[i + 1] = shade
    gradient.data[i + 2] = shade - 2
  }
}
fillRect(gradient, 30, 18, 28, 34, [24, 46, 92])
removeBackdrop(gradient, 40)
assert.equal(alphaAt(gradient, 2, 2), 0, 'gradient corner clears')
assert.equal(alphaAt(gradient, gradient.width - 2, 2), 0, 'far gradient edge clears')
assert.equal(alphaAt(gradient, 44, 34), 255, 'figure on a gradient stays')

const touching = makeBuffer(70, 70, white)
fillRect(touching, 0, 24, 18, 22, red)
removeBackdrop(touching, 36)
assert.equal(alphaAt(touching, 0, 0), 0, 'untouched corner clears')
assert.equal(alphaAt(touching, 4, 34), 255, 'subject touching the edge stays')

const closeGray = makeBuffer(60, 60, [200, 200, 198])
fillRect(closeGray, 16, 16, 28, 28, [168, 168, 166])
const low = makeBuffer(60, 60, [200, 200, 198])
fillRect(low, 16, 16, 28, 28, [168, 168, 166])
removeBackdrop(low, 8)
removeBackdrop(closeGray, 100)
assert.equal(alphaAt(low, 0, 0), 0, 'low strength still clears the backdrop')
assert.equal(alphaAt(low, 30, 30), 255, 'low strength keeps a similar subject')
assert.equal(alphaAt(closeGray, 0, 0), 0, 'high strength still clears the backdrop')
assert.equal(alphaAt(closeGray, 30, 30), 255, 'high strength keeps mid-grey plastic')

const holed = makeBuffer(70, 70, white)
fillRect(holed, 15, 15, 40, 40, red)
fillRect(holed, 30, 30, 10, 10, white)
removeBackdrop(holed, 36)
assert.equal(alphaAt(holed, 0, 0), 0, 'outside backdrop clears')
assert.equal(alphaAt(holed, 20, 20), 255, 'subject around an enclosed hole stays')
assert.equal(alphaAt(holed, 35, 35), 0, 'enclosed white pocket clears')

const cornerSubject = makeBuffer(64, 64, white)
fillRect(cornerSubject, 0, 0, 22, 22, red)
removeBackdrop(cornerSubject, 40)
assert.equal(alphaAt(cornerSubject, 4, 4), 255, 'outlier corner subject is not treated as backdrop')
assert.equal(alphaAt(cornerSubject, 60, 60), 0, 'other corners still clear')

const noisy = makeBuffer(80, 80, [186, 176, 150])
for (let i = 0; i < noisy.width * noisy.height; i += 1) {
  const jitter = ((i * 17) % 11) - 5
  noisy.data[i * 4] = 186 + jitter
  noisy.data[i * 4 + 1] = 176 + jitter
  noisy.data[i * 4 + 2] = 150 + jitter
}
fillRect(noisy, 28, 18, 24, 44, [42, 48, 40])
removeBackdrop(noisy, 42)
assert.equal(alphaAt(noisy, 1, 1), 0, 'textured table corner clears')
assert.equal(alphaAt(noisy, 40, 40), 255, 'mini on a textured table stays')

const bg: [number, number, number] = [250, 250, 250]
const plastic: [number, number, number] = [150, 150, 148]
const hammer: [number, number, number] = [214, 214, 212]
const shoulder: [number, number, number] = [218, 218, 216]
const spike: [number, number, number] = [228, 228, 226]
const shadowGap: [number, number, number] = [236, 236, 234]

function greyMini(): RgbaBuffer {
  const buf = makeBuffer(96, 110, bg)
  fillRect(buf, 34, 28, 28, 36, plastic)
  fillRect(buf, 40, 16, 16, 16, plastic)
  fillRect(buf, 36, 64, 10, 28, plastic)
  fillRect(buf, 52, 64, 10, 28, plastic)
  fillRect(buf, 34, 88, 30, 8, plastic)
  fillRect(buf, 46, 8, 2, 10, spike)
  fillRect(buf, 52, 6, 2, 14, [240, 240, 238])
  fillRect(buf, 41, 4, 3, 16, [240, 240, 238])
  fillRect(buf, 16, 34, 22, 10, hammer)
  fillRect(buf, 48, 32, 10, 8, shoulder)
  fillRect(buf, 38, 40, 8, 8, shadowGap)
  for (let y = 90; y < 94; y += 1) {
    for (let x = 36; x < 62; x += 2) {
      const i = (y * buf.width + x) * 4
      buf.data[i] = 188
      buf.data[i + 1] = 188
      buf.data[i + 2] = 186
    }
  }
  return buf
}

function assertGreyKept(buffer: RgbaBuffer, label: string): void {
  assert.equal(alphaAt(buffer, 1, 1), 0, `${label}: white corner clears`)
  assert.equal(alphaAt(buffer, 44, 36), 255, `${label}: grey body stays`)
  assert.equal(alphaAt(buffer, 20, 38), 255, `${label}: hammer highlight stays`)
  assert.equal(alphaAt(buffer, 52, 35), 255, `${label}: shoulder highlight stays`)
  assert.equal(alphaAt(buffer, 46, 10), 255, `${label}: halo spike stays`)
  assert.equal(alphaAt(buffer, 52, 7), 255, `${label}: bright halo tip stays`)
  assert.equal(alphaAt(buffer, 42, 6), 255, `${label}: bright halo center stays`)
  assert.equal(alphaAt(buffer, 38, 92), 255, `${label}: speckled base stays`)
  assert.equal(alphaAt(buffer, 48, 75), 0, `${label}: white between the legs clears`)
  assert.equal(alphaAt(buffer, 33, 50), 0, `${label}: white beside the body clears`)
}

const greyLow = greyMini()
removeBackdrop(greyLow, 47)
assertGreyKept(greyLow, 'strength 47')
assert.equal(alphaAt(greyLow, 41, 43), 255, 'strength 47 leaves a shadowed pocket')

const greyHigh = greyMini()
removeBackdrop(greyHigh, 100)
assertGreyKept(greyHigh, 'strength 100')
assert.equal(alphaAt(greyHigh, 41, 43), 0, 'strength 100 clears a shadowed white pocket')
assert.deepEqual(rgbAt(greyHigh, 20, 38), hammer, 'hammer RGB stays put')

const coarse = makeBuffer(4, 4, bg)
for (let i = 3; i < coarse.data.length; i += 4) coarse.data[i] = 0
const projected = makeBuffer(8, 8, bg)
fillRect(projected, 2, 2, 4, 4, plastic)
projectCutout(projected, coarse, 100)
assert.equal(alphaAt(projected, 0, 0), 0, 'coarse mask clears backdrop at full resolution')
assert.equal(alphaAt(projected, 3, 3), 255, 'full-resolution grey is restored when a coarse cell was dropped')

const spikeCoarse = makeBuffer(6, 8, bg)
for (let i = 3; i < spikeCoarse.data.length; i += 4) spikeCoarse.data[i] = 0
const spikeFull = makeBuffer(12, 16, bg)
fillRect(spikeFull, 4, 8, 5, 6, plastic)
fillRect(spikeFull, 5, 1, 3, 10, [240, 240, 238])
projectCutout(spikeFull, spikeCoarse, 100)
assert.equal(alphaAt(spikeFull, 0, 0), 0, 'coarse projection still clears white')
assert.equal(alphaAt(spikeFull, 6, 2), 255, 'coarse projection keeps the middle of a bright spike')
assert.equal(alphaAt(spikeFull, 6, 10), 255, 'coarse projection keeps the plastic under the spike')

const wide = fitPhotoScale(800, 600, 2000, 500)
const tall = fitPhotoScale(800, 600, 500, 2000)
assert.ok(wide < 0.4 && wide > 0.2, `wide fit ${wide}`)
assert.ok(tall < 0.4 && tall > 0.2, `tall fit ${tall}`)
assert.ok(wide !== tall, 'a wide photo and a tall photo do not share one scale')
const roundTrip = sliderToPhotoScale(photoScaleToSlider(0.35))
assert.ok(Math.abs(roundTrip - 0.35) < 0.02, `round trip ${roundTrip}`)

const painted = new Uint8ClampedArray([180, 40, 40, 255])
const lit = new Uint8ClampedArray([220, 220, 220, 255])
compositeSurface(painted, lit, painted)
assert.equal(painted[3], 255, 'opaque photo keeps a solid tint coat')
assert.ok(painted[0] > 40, 'luminance still lightens the pigment')

const hidden = new Uint8ClampedArray([180, 40, 40, 255])
const gone = new Uint8ClampedArray([220, 220, 220, 0])
compositeSurface(hidden, gone, hidden)
assert.equal(hidden[3], 0, 'transparent photo hides the tint')

const bare = new Uint8ClampedArray([0, 0, 0, 0])
compositeSurface(bare, lit, bare)
assert.equal(bare[3], 0, 'unpainted pixels stay transparent')

assert.equal(sampleTintHex(new Uint8ClampedArray([9, 9, 9, 0]), gone), null)
assert.equal(sampleTintHex(new Uint8ClampedArray([12, 34, 56, 200]), lit), '#0c2238')

function clearOutside(buffer: RgbaBuffer, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = 0; y < buffer.height; y += 1) {
    for (let x = 0; x < buffer.width; x += 1) {
      if (x >= x0 && x < x1 && y >= y0 && y < y1) continue
      buffer.data[(y * buffer.width + x) * 4 + 3] = 0
    }
  }
}

const repaired = makeBuffer(48, 48, [250, 250, 250])
fillRect(repaired, 8, 8, 32, 32, [158, 158, 156])
clearOutside(repaired, 8, 8, 40, 40)
fillRect(repaired, 20, 20, 4, 4, [158, 158, 156])
for (let y = 20; y < 24; y += 1) {
  for (let x = 20; x < 24; x += 1) repaired.data[(y * repaired.width + x) * 4 + 3] = 0
}
fillRect(repaired, 30, 18, 6, 6, [250, 250, 250])
for (let y = 18; y < 24; y += 1) {
  for (let x = 30; x < 36; x += 1) repaired.data[(y * repaired.width + x) * 4 + 3] = 0
}
repaired.data[(15 * repaired.width + 7) * 4] = 250
repaired.data[(15 * repaired.width + 7) * 4 + 1] = 250
repaired.data[(15 * repaired.width + 7) * 4 + 2] = 250
repaired.data[(15 * repaired.width + 7) * 4 + 3] = 255
repairCutout(repaired)
assert.equal(alphaAt(repaired, 0, 0), 0, 'repair leaves the exterior backdrop clear')
assert.equal(alphaAt(repaired, 21, 21), 255, 'repair fills a small grey hole')
assert.equal(alphaAt(repaired, 32, 20), 0, 'repair leaves an enclosed white pocket clear')
assert.equal(alphaAt(repaired, 7, 15), 0, 'repair trims a near-white fringe pixel')
assert.equal(alphaAt(repaired, 24, 24), 255, 'repair keeps the grey interior solid')
const rim = alphaAt(repaired, 8, 20)
assert.ok(rim > 16 && rim < 255, `repair feathers the matte edge (${rim})`)

const wideHole = makeBuffer(200, 200, [250, 250, 250])
fillRect(wideHole, 10, 10, 180, 180, [150, 150, 148])
clearOutside(wideHole, 10, 10, 190, 190)
for (let y = 80; y < 110; y += 1) {
  for (let x = 80; x < 110; x += 1) wideHole.data[(y * wideHole.width + x) * 4 + 3] = 0
}
repairCutout(wideHole)
assert.equal(alphaAt(wideHole, 90, 90), 0, 'repair does not fill a large transparent region')
assert.equal(alphaAt(wideHole, 0, 0), 0, 'repair does not restore the outside of a large picture')

console.log('cutout and photo scale checks passed')
