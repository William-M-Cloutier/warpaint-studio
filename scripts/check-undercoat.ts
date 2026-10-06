import assert from 'node:assert/strict'
import { UNDERCOAT_DEFAULT, shadeStampWithUndercoat, undercoatChannel } from '../src/lib/undercoat.ts'
import { defaultPrefs } from '../src/lib/storage.ts'

assert.equal(undercoatChannel(150, 0, 255, 0), 150, 'strength 0 is a clean coat')
assert.equal(undercoatChannel(150, 0, 0, 1), 150, 'an empty pixel does not shadow')
assert.equal(undercoatChannel(150, 0, 255, 1), 0, 'opaque black at full strength goes to black')
assert.equal(undercoatChannel(150, 255, 255, 1), 150, 'white undercoat leaves the colour')
assert.equal(undercoatChannel(150, 0, 255, UNDERCOAT_DEFAULT), 60, 'default strength keeps a darker red over black')
assert.equal(undercoatChannel(12, 0, 255, UNDERCOAT_DEFAULT), 5)
assert.ok(undercoatChannel(150, 0, 128, UNDERCOAT_DEFAULT) > 60, 'a thin black coat shadows less')
assert.ok(undercoatChannel(180, 0, 255, 0.6) < undercoatChannel(180, 40, 255, 0.6), 'a darker undercoat shadows more')

const stamp = new Uint8ClampedArray([150, 12, 9, 255, 150, 12, 9, 255])
const dest = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 0])
const copy = stamp.slice()
shadeStampWithUndercoat(stamp, dest, 0)
assert.deepEqual(Array.from(stamp), Array.from(copy), 'strength 0 does not rewrite the stamp')
shadeStampWithUndercoat(stamp, dest, UNDERCOAT_DEFAULT)
assert.equal(stamp[0], 60, 'painted pixel is shadowed by black')
assert.equal(stamp[4], 150, 'unpainted pixel stays the new colour')
assert.equal(stamp[3], 255)
assert.equal(stamp[7], 255)

assert.equal(defaultPrefs().undercoat, false)
assert.equal(defaultPrefs().undercoatStrength, UNDERCOAT_DEFAULT)
