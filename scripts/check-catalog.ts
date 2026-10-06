import assert from 'node:assert/strict'
import { PAINTS, RANGE_LABEL } from '../src/data/paints.ts'
import { channels, filterPaints, paintById, similarPaints } from '../src/lib/catalog.ts'

const finishes = new Set(['matte', 'metallic', 'wash', 'contrast', 'gloss'])
const coverage = new Set(['opaque', 'semi-opaque', 'translucent'])
const ids = new Set<string>()

assert.ok(PAINTS.length >= 80, 'the catalog covers a working set of paints')

for (const paint of PAINTS) {
  assert.equal(ids.has(paint.id), false, `duplicate id ${paint.id}`)
  ids.add(paint.id)
  assert.match(paint.hex, /^#[0-9a-f]{6}$/, paint.id)
  assert.ok(finishes.has(paint.finish), paint.id)
  assert.ok(coverage.has(paint.coverage), paint.id)
  assert.ok(RANGE_LABEL[paint.range], paint.id)
  assert.equal(Object.hasOwn(paint, 'score'), false)
  assert.equal(Object.hasOwn(paint, 'rating'), false)
  for (const other of paint.similar) {
    assert.notEqual(other, paint.id)
    assert.ok(ids.has(other) || PAINTS.some((entry) => entry.id === other), other)
  }
}

for (const paint of PAINTS) {
  for (const otherId of paint.similar) {
    const other = paintById(otherId)
    assert.ok(other, otherId)
    assert.ok(other.similar.includes(paint.id), `${paint.id} similar link is not returned by ${otherId}`)
  }
}

const macragge = paintById('citadel-macragge-blue')
assert.ok(macragge)
assert.equal(macragge.hex, '#0f3d7c')
assert.equal(macragge.finish, 'matte')
assert.equal(macragge.coverage, 'opaque')
const cousins = similarPaints(macragge)
assert.ok(cousins.some((paint) => paint.range === 'vallejo'))
assert.ok(cousins.some((paint) => paint.range === 'army-painter'))
assert.ok(cousins.some((paint) => paint.range === 'two-thin-coats'))

const [red, green, blue] = channels(macragge.hex)
assert.deepEqual([red, green, blue], [15, 61, 124])

const found = filterPaints('macragge', 'citadel')
assert.ok(found.some((paint) => paint.id === 'citadel-macragge-blue'))
assert.equal(
  filterPaints('macragge', 'vallejo').some((paint) => paint.id === 'citadel-macragge-blue'),
  false,
)
assert.ok(filterPaints('70.965', 'all').some((paint) => paint.id === 'vallejo-mc-prussian-blue'))
assert.equal(filterPaints('not a paint', 'all').length, 0)

const ranges = new Set(PAINTS.map((paint) => paint.range))
assert.ok(ranges.has('citadel'))
assert.ok(ranges.has('vallejo'))
assert.ok(ranges.has('army-painter'))
assert.ok(ranges.has('two-thin-coats'))
