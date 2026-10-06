import assert from 'node:assert/strict'
import { backdropCssColor, BACKDROP_PRESETS } from '../src/lib/backdrop.ts'
import { compositeSurface } from '../src/lib/tint.ts'

const PIVOT = 0.5
const LIFT = 0.55

function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

/** The coat before the paint-look slider. Locked here so a slider change cannot drift it. */
function photoLocked(tint: Uint8ClampedArray, photo: Uint8ClampedArray, out: Uint8ClampedArray): void {
  for (let i = 0; i < tint.length; i += 4) {
    const alpha = tint[i + 3] / 255
    const photoA = photo[i + 3] / 255
    if (alpha <= 0.001 || photoA <= 0.001) {
      out[i] = 0
      out[i + 1] = 0
      out[i + 2] = 0
      out[i + 3] = 0
      continue
    }
    const pr = photo[i]
    const pg = photo[i + 1]
    const pb = photo[i + 2]
    const lum = luminance(pr, pg, pb)
    let tr: number
    let tg: number
    let tb: number
    if (lum <= PIVOT) {
      const scale = lum / PIVOT
      tr = tint[i] * scale
      tg = tint[i + 1] * scale
      tb = tint[i + 2] * scale
    } else {
      const t = (lum - PIVOT) / (1 - PIVOT)
      const lift = smoothstep(t) * LIFT
      tr = tint[i] + (255 - tint[i]) * lift
      tg = tint[i + 1] + (255 - tint[i + 1]) * lift
      tb = tint[i + 2] + (255 - tint[i + 2]) * lift
    }
    out[i] = pr + (tr - pr) * alpha
    out[i + 1] = pg + (tg - pg) * alpha
    out[i + 2] = pb + (tb - pb) * alpha
    out[i + 3] = photoA >= 0.999 ? 255 : Math.round(255 * photoA)
  }
}

function coat(photo: number[], paint: number): Uint8ClampedArray {
  const tint = new Uint8ClampedArray([176, 32, 32, 255])
  const picture = new Uint8ClampedArray([photo[0], photo[1], photo[2], 255])
  const out = new Uint8ClampedArray(4)
  compositeSurface(tint, picture, out, paint, 3, 5, 1)
  return out
}

const shadow = new Uint8ClampedArray([20, 18, 16, 255])
const tint = new Uint8ClampedArray([176, 32, 32, 255])
const locked = new Uint8ClampedArray(4)
const atZero = new Uint8ClampedArray(4)
photoLocked(tint, shadow, locked)
compositeSurface(tint, shadow, atZero, 0, 2, 4, 1)
assert.deepEqual(Array.from(atZero), Array.from(locked), 'more photo is the original tint')

const lit = new Uint8ClampedArray([230, 220, 200, 255])
const litLocked = new Uint8ClampedArray(4)
const litZero = new Uint8ClampedArray(4)
photoLocked(tint, lit, litLocked)
compositeSurface(tint, lit, litZero, 0)
assert.deepEqual(Array.from(litZero), Array.from(litLocked))

const painted = coat([20, 18, 16], 1)
const photoSide = coat([20, 18, 16], 0)
assert.ok(painted[0] > photoSide[0] + 20, 'more paint keeps the red in a shadow')
assert.ok(painted[0] - painted[1] > photoSide[0] - photoSide[1] + 15, 'more paint keeps more chroma')

const again = coat([20, 18, 16], 1)
assert.deepEqual(Array.from(painted), Array.from(again), 'grain stays put on the same pixel')
const shifted = new Uint8ClampedArray(4)
compositeSurface(tint, shadow, shifted, 1, 8, 9, 1)
assert.notDeepEqual(Array.from(painted), Array.from(shifted), 'grain follows the photo pixel')

const half = new Uint8ClampedArray([176, 32, 32, 128])
const blended = new Uint8ClampedArray(4)
compositeSurface(half, shadow, blended, 1, 1, 1, 1)
assert.ok(blended[0] > shadow[0], 'partial opacity still shows some paint')
assert.ok(blended[0] < painted[0], 'partial opacity does not become a full coat')

assert.equal(backdropCssColor('checker', '#112233'), null)
assert.equal(backdropCssColor('black', '#112233'), '#000000')
assert.equal(backdropCssColor('grey', '#112233'), '#8a8a8a')
assert.equal(backdropCssColor('white', '#112233'), '#f4f4f4')
assert.equal(backdropCssColor('green', '#112233'), '#00b140')
assert.equal(backdropCssColor('custom', '#336699'), '#336699')
const labels = BACKDROP_PRESETS.map((entry) => entry.label)
assert.deepEqual(labels, ['Checker', 'Black', 'Grey', 'White', 'Green'])
