import assert from 'node:assert/strict'
import { highlightColor } from '../src/lib/color.ts'
import { constrainLine, extendStroke } from '../src/lib/constrain.ts'

const flat = constrainLine({ x: 10, y: 20 }, { x: 40, y: 22 })
assert.ok(Math.abs(flat.y - 20) < 1e-6, 'a nearly level drag locks horizontal')
assert.ok(Math.abs(flat.x - 40) < 1e-6, 'the end shares the pointer x instead of the hypotenuse')

const skim = constrainLine({ x: 0, y: 0 }, { x: 100, y: 40 })
assert.ok(Math.abs(skim.x - 100) < 1e-6, 'a horizontal lock projects onto the pointer')
assert.ok(Math.abs(skim.y) < 1e-6)
assert.ok(Math.hypot(100, 40) - skim.x > 5, 'the circle-length end would run past the cursor')

const upright = constrainLine({ x: 0, y: 0 }, { x: 2, y: 30 })
assert.ok(Math.abs(upright.x) < 1e-6, 'a nearly vertical drag locks vertical')
assert.ok(Math.abs(upright.y - 30) < 1e-6)

const back = constrainLine({ x: 5, y: 8 }, { x: -20, y: 11 })
assert.ok(Math.abs(back.y - 8) < 1e-6)
assert.ok(Math.abs(back.x - -20) < 1e-6, 'the line can run back along the axis under the pointer')

const diagonal = constrainLine({ x: 0, y: 0 }, { x: 100, y: 80 })
assert.ok(Math.abs(diagonal.x - 90) < 0.02, 'a 45° lock is the foot of the perpendicular')
assert.ok(Math.abs(diagonal.y - 90) < 0.02)

const still = constrainLine({ x: 4, y: 5 }, { x: 4, y: 5 })
assert.deepEqual(still, { x: 4, y: 5 })

const points = [{ x: 0, y: 0 }, { x: 4, y: 3 }, { x: 9, y: 8 }]
const locked = extendStroke(points, null, { x: 20, y: 2 }, true)
assert.equal(locked.changed, true)
assert.equal(locked.line?.index, 0, 'Shift anchors on the pointer-down origin')
assert.equal(points.length, 2, 'Shift replaces the gesture with one segment')
assert.equal(points[0].x, 0)
assert.equal(points[0].y, 0)
assert.ok(Math.abs(points[1].x - 20) < 1e-6)
assert.ok(Math.abs(points[1].y) < 1e-6)

const held = extendStroke(points, locked.line, { x: 30, y: 4 }, true)
assert.equal(points.length, 2, 'holding Shift does not grow a polyline')
assert.ok(Math.abs(points[1].x - 30) < 1e-6)
assert.ok(Math.abs(points[1].y) < 1e-6)

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
