import assert from 'node:assert/strict'
import { removeBackdrop, type RgbaBuffer } from '../src/lib/cutout.ts'
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
assert.equal(alphaAt(low, 30, 30), 255, 'low strength keeps a similar subject')
assert.equal(alphaAt(closeGray, 30, 30), 0, 'high strength can remove a similar subject')

const holed = makeBuffer(70, 70, white)
fillRect(holed, 15, 15, 40, 40, red)
fillRect(holed, 30, 30, 10, 10, white)
removeBackdrop(holed, 36)
assert.equal(alphaAt(holed, 0, 0), 0, 'outside backdrop clears')
assert.equal(alphaAt(holed, 35, 35), 255, 'enclosed backdrop hole stays, it is not edge-connected')

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

console.log('cutout and photo scale checks passed')
