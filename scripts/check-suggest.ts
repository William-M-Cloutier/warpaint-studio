import assert from 'node:assert/strict'
import { paintById } from '../src/lib/catalog.ts'
import { suggestPaints } from '../src/lib/suggest.ts'

function known(id: string | undefined): void {
  assert.ok(id, 'expected a catalog paint')
  assert.ok(paintById(id), id)
}

const red = suggestPaints('#960c09')
assert.equal(red.base?.id, 'citadel-mephiston-red')
known(red.highlight?.id)
assert.notEqual(red.highlight?.id, red.base?.id)
assert.ok(
  red.highlight?.id === 'citadel-evil-sunz-scarlet' || red.highlight?.id === 'citadel-wild-rider-red',
  red.highlight?.id,
)
assert.equal(red.shade?.id, 'citadel-carroburg-crimson')

const blue = suggestPaints('#0f3d7c')
assert.equal(blue.base?.id, 'citadel-macragge-blue')
known(blue.highlight?.id)
assert.equal(blue.shade?.id, 'citadel-drakenhof-nightshade')

const white = suggestPaints('#ffffff')
assert.equal(white.base?.id, 'citadel-white-scar')
assert.equal(white.highlight, null, 'white has no lighter catalog paint')
assert.equal(white.shade?.finish, 'wash')

const black = suggestPaints('#000000')
assert.equal(black.base?.id, 'citadel-abaddon-black')
known(black.highlight?.id)
assert.ok((black.highlight?.hex ?? '#ffffff') < '#444444')
assert.equal(black.shade?.finish, 'wash')

const metal = suggestPaints('#151e24')
assert.equal(metal.base?.id, 'citadel-leadbelcher')
assert.equal(metal.shade?.id, 'citadel-nuln-oil')

const paired = suggestPaints('#960c09', 'vallejo')
assert.equal(paired.base?.id, 'vallejo-gc-heavy-red')
assert.equal(paired.base?.range, 'vallejo')

const gold = suggestPaints('#b08d57')
known(gold.base?.id)
assert.equal(gold.base?.finish === 'wash', false)
assert.ok(gold.highlight === null || paintById(gold.highlight.id))
assert.ok(gold.shade === null || gold.shade.finish === 'wash')
