import assert from 'node:assert/strict'
import { highlightColor } from '../src/lib/color.ts'
import { constrainLine, extendStroke } from '../src/lib/constrain.ts'

const flat = constrainLine({ x: 10, y: 20 }, { x: 40, y: 22 })
assert.ok(Math.abs(flat.y - 20) < 0.01, 'a nearly level drag locks horizontal')
assert.ok(Math.abs(flat.x - 40) < 1, 'the horizontal lock keeps the drag length')

const upright = constrainLine({ x: 0, y: 0 }, { x: 2, y: 30 })
assert.ok(Math.abs(upright.x) < 0.01, 'a nearly vertical drag locks vertical')
assert.ok(Math.abs(upright.y - 30) < 1)

const diagonal = constrainLine({ x: 0, y: 0 }, { x: 10, y: 12 })
assert.ok(Math.abs(diagonal.x - diagonal.y) < 0.6, 'a near-45 drag locks to the diagonal')

const still = constrainLine({ x: 4, y: 5 }, { x: 4, y: 5 })
assert.deepEqual(still, { x: 4, y: 5 })

const points = [{ x: 0, y: 0 }, { x: 4, y: 3 }, { x: 9, y: 8 }]
const locked = extendStroke(points, null, { x: 20, y: 9 }, true)
assert.equal(locked.changed, true)
assert.equal(locked.line?.index, 2, 'Shift anchors on the last freehand point')
assert.equal(points.length, 4, 'Shift replaces the tail with one end')
assert.ok(Math.abs(points[3].y - 8) < 0.01, 'the constrained end stays level with the anchor')

const held = extendStroke(points, locked.line, { x: 30, y: 9 }, true)
assert.equal(points.length, 4, 'holding Shift does not grow a polyline')
assert.ok(Math.abs(points[3].x - 30) < 1)

const free = extendStroke(points, held.line, { x: 32, y: 12 }, false)
assert.equal(free.line, null, 'releasing Shift returns to freehand')
assert.equal(points.length, 5)
assert.equal(points[4].x, 32)
assert.equal(points[4].y, 12)

const tiny = extendStroke(points, null, { x: 32.2, y: 12.1 }, false)
assert.equal(tiny.changed, false, 'a sub-pixel move does not add a point')

assert.equal(highlightColor('#000000'), '#6b6b6b', 'highlight lifts black toward white')
assert.equal(highlightColor('#ffffff'), '#ffffff', 'white has nowhere lighter to go')
assert.equal(highlightColor('#b08d57'), '#d1bd9e')
assert.notEqual(highlightColor('#b08d57'), '#b08d57', 'highlight is a lighter pigment than the brush colour')
assert.equal(highlightColor('nope'), 'nope')
