import assert from 'node:assert/strict'
import { highlightColor } from '../src/lib/color.ts'
import { extendStroke } from '../src/lib/constrain.ts'

const points = [{ x: 0, y: 0 }, { x: 4, y: 3 }, { x: 9, y: 8 }]
const locked = extendStroke(points, null, { x: 20, y: 7 }, true)
assert.equal(locked.changed, true)
assert.equal(locked.line?.index, 0, 'Shift anchors on the pointer-down origin')
assert.equal(points.length, 2, 'Shift replaces the gesture with one segment')
assert.deepEqual(points[0], { x: 0, y: 0 })
assert.deepEqual(points[1], { x: 20, y: 7 }, 'the end sits on the pointer, at any angle')

const held = extendStroke(points, locked.line, { x: 12, y: 18 }, true)
assert.equal(points.length, 2, 'holding Shift does not grow a polyline')
assert.deepEqual(points[1], { x: 12, y: 18 }, 'moving the pointer rotates the segment without an angle snap')

const free = extendStroke(points, held.line, { x: 32, y: 12 }, false)
assert.equal(free.line, null, 'releasing Shift returns to freehand')
assert.equal(points.length, 4, 'the straight tip is kept so the segment stays straight')
assert.equal(points[1].x, points[2].x)
assert.equal(points[1].y, points[2].y)
assert.equal(points[3].x, 32)
assert.equal(points[3].y, 12)

const tiny = extendStroke(points, null, { x: 32.2, y: 12.1 }, false)
assert.equal(tiny.changed, false, 'a sub-pixel move does not add a point')

assert.equal(highlightColor('#000000'), '#6b6b6b', 'highlight lifts black toward white')
assert.equal(highlightColor('#ffffff'), '#ffffff', 'white has nowhere lighter to go')
assert.equal(highlightColor('#b08d57'), '#d1bd9e')
assert.notEqual(highlightColor('#b08d57'), '#b08d57', 'highlight is a lighter pigment than the brush colour')
assert.equal(highlightColor('nope'), 'nope')
