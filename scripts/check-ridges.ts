import assert from 'node:assert/strict'
import { RidgeLayer, stampRidge, type RidgeEdits } from '../src/lib/edgeEdits.ts'

const layer = new RidgeLayer()
layer.reset(40, 20)
assert.equal(layer.hasEdits, false)
assert.equal(
  layer.commit({ tool: 'add', size: 3, points: [{ x: 10, y: 8 }] }),
  true,
)
assert.equal(layer.hasEdits, true)
assert.equal(layer.maps.add[8 * 40 + 10], 255)
assert.equal(layer.maps.erase[8 * 40 + 10], 0)

assert.equal(
  layer.commit({
    tool: 'erase',
    size: 4,
    points: [
      { x: 8, y: 8 },
      { x: 14, y: 8 },
    ],
  }),
  true,
)
assert.equal(layer.maps.add[8 * 40 + 10], 0, 'a later erase clears an added ridge')
assert.equal(layer.maps.erase[8 * 40 + 10], 255)

assert.equal(layer.undo(), true)
assert.equal(layer.maps.add[8 * 40 + 10], 255)
assert.equal(layer.maps.erase[8 * 40 + 10], 0)
assert.equal(layer.redo(), true)
assert.equal(layer.maps.erase[8 * 40 + 10], 255)

assert.equal(layer.clear(), true)
assert.equal(layer.hasEdits, false)
assert.equal(layer.maps.erase[8 * 40 + 10], 0)
assert.equal(layer.undo(), true)
assert.equal(layer.hasEdits, true)
assert.equal(layer.maps.erase[8 * 40 + 10], 255)

const maps: RidgeEdits = { add: new Uint8Array(16), erase: new Uint8Array(16) }
stampRidge(maps, 4, 4, { tool: 'add', size: 1, points: [{ x: 1, y: 1 }] })
stampRidge(maps, 4, 4, { tool: 'erase', size: 1, points: [{ x: 1, y: 1 }] })
assert.equal(maps.add[1 * 4 + 1], 0)
assert.equal(maps.erase[1 * 4 + 1], 255)
stampRidge(maps, 4, 4, { tool: 'add', size: 1, points: [{ x: 1, y: 1 }] })
assert.equal(maps.add[1 * 4 + 1], 255)
assert.equal(maps.erase[1 * 4 + 1], 0, 'a later add brings the ridge back')
