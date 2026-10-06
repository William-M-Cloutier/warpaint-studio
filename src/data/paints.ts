/**
 * Offline paint catalog.
 *
 * Citadel swatches are approximate screen colours from a public chart
 * (not Games Workshop measurements, not a spectrophotometer).
 * Other ranges reuse that paired Citadel swatch. They are chart neighbours,
 * not factory matches. There are no review scores.
 */

export type PaintRangeId = 'citadel' | 'vallejo' | 'army-painter' | 'two-thin-coats'

export type PaintFinish = 'matte' | 'metallic' | 'wash' | 'contrast' | 'gloss'

export type PaintCoverage = 'opaque' | 'semi-opaque' | 'translucent'

export type CatalogPaint = {
  id: string
  range: PaintRangeId
  line: string
  name: string
  finish: PaintFinish
  /** How the product line is meant to cover. Not a review score. */
  coverage: PaintCoverage
  /** Approximate #rrggbb preview. */
  hex: string
  /** Maker code when a public chart lists one. */
  code: string
  similar: readonly string[]
  note: string
}

const METAL =
  'Metallic. The swatch is a flat stand-in from a public chart, not the sparkle of the metal.'
const PAIRED =
  'Preview is the paired Citadel chart swatch, not a separate reading of this bottle. Public comparison charts list it as a neighbour, not a factory match.'

type Row = [
  id: string,
  range: PaintRangeId,
  line: string,
  name: string,
  finish: PaintFinish,
  coverage: PaintCoverage,
  hex: string,
  code: string,
  note: string,
]

const ROWS: readonly Row[] = [
  // Citadel Base — opaque foundation coats. Hex from a public digital chart.
  ['citadel-abaddon-black', 'citadel', 'Base', 'Abaddon Black', 'matte', 'opaque', '#000000', '', ''],
  ['citadel-averland-sunset', 'citadel', 'Base', 'Averland Sunset', 'matte', 'opaque', '#FBB81C', '', ''],
  ['citadel-balthasar-gold', 'citadel', 'Base', 'Balthasar Gold', 'metallic', 'opaque', '#1D0F07', '', METAL],
  ['citadel-barak-nar-burgundy', 'citadel', 'Base', 'Barak-Nar Burgundy', 'matte', 'opaque', '#451636', '', ''],
  ['citadel-bugmans-glow', 'citadel', 'Base', "Bugman's Glow", 'matte', 'opaque', '#804C43', '', ''],
  ['citadel-caledor-sky', 'citadel', 'Base', 'Caledor Sky', 'matte', 'opaque', '#366699', '', ''],
  ['citadel-caliban-green', 'citadel', 'Base', 'Caliban Green', 'matte', 'opaque', '#003D15', '', ''],
  ['citadel-castellan-green', 'citadel', 'Base', 'Castellan Green', 'matte', 'opaque', '#264715', '', ''],
  ['citadel-catachan-flesh', 'citadel', 'Base', 'Catachan Flesh', 'matte', 'opaque', '#442B25', '', ''],
  ['citadel-celestra-grey', 'citadel', 'Base', 'Celestra Grey', 'matte', 'opaque', '#8BA3A3', '', ''],
  ['citadel-corax-white', 'citadel', 'Base', 'Corax White', 'matte', 'opaque', '#F0F0F0', '', 'Off-white base. Charts usually pair the brighter White Scar with whites from other ranges.'],
  ['citadel-corvus-black', 'citadel', 'Base', 'Corvus Black', 'matte', 'opaque', '#171314', '', ''],
  ['citadel-daemonette-hide', 'citadel', 'Base', 'Daemonette Hide', 'matte', 'opaque', '#655F81', '', ''],
  ['citadel-death-guard-green', 'citadel', 'Base', 'Death Guard Green', 'matte', 'opaque', '#6D774D', '', ''],
  ['citadel-death-korps-drab', 'citadel', 'Base', 'Death Korps Drab', 'matte', 'opaque', '#3D4539', '', ''],
  ['citadel-deathworld-forest', 'citadel', 'Base', 'Deathworld Forest', 'matte', 'opaque', '#556229', '', ''],
  ['citadel-dryad-bark', 'citadel', 'Base', 'Dryad Bark', 'matte', 'opaque', '#2B2A24', '', ''],
  ['citadel-gal-vorbak-red', 'citadel', 'Base', 'Gal Vorbak Red', 'matte', 'opaque', '#4B213C', '', ''],
  ['citadel-grey-knights-steel', 'citadel', 'Base', 'Grey Knights Steel', 'metallic', 'opaque', '#465863', '', METAL],
  ['citadel-grey-seer', 'citadel', 'Base', 'Grey Seer', 'matte', 'opaque', '#A2A5A7', '', ''],
  ['citadel-hobgrot-hide', 'citadel', 'Base', 'Hobgrot Hide', 'matte', 'opaque', '#A1812A', '', ''],
  ['citadel-incubi-darkness', 'citadel', 'Base', 'Incubi Darkness', 'matte', 'opaque', '#082E32', '', ''],
  ['citadel-ionrach-skin', 'citadel', 'Base', 'Ionrach Skin', 'matte', 'opaque', '#97A384', '', ''],
  ['citadel-iron-hands-steel', 'citadel', 'Base', 'Iron Hands Steel', 'metallic', 'opaque', '#44423F', '', METAL],
  ['citadel-iron-warriors', 'citadel', 'Base', 'Iron Warriors', 'metallic', 'opaque', '#292725', '', METAL],
  ['citadel-jokaero-orange', 'citadel', 'Base', 'Jokaero Orange', 'matte', 'opaque', '#ED3814', '', ''],
  ['citadel-kantor-blue', 'citadel', 'Base', 'Kantor Blue', 'matte', 'opaque', '#02134E', '', ''],
  ['citadel-khorne-red', 'citadel', 'Base', 'Khorne Red', 'matte', 'opaque', '#650001', '', ''],
  ['citadel-leadbelcher', 'citadel', 'Base', 'Leadbelcher', 'metallic', 'opaque', '#151E24', '', METAL],
  ['citadel-lupercal-green', 'citadel', 'Base', 'Lupercal Green', 'matte', 'opaque', '#002C2B', '', ''],
  ['citadel-macragge-blue', 'citadel', 'Base', 'Macragge Blue', 'matte', 'opaque', '#0F3D7C', '', ''],
  ['citadel-mechanicus-standard-grey', 'citadel', 'Base', 'Mechanicus Standard Grey', 'matte', 'opaque', '#39484A', '', ''],
  ['citadel-mephiston-red', 'citadel', 'Base', 'Mephiston Red', 'matte', 'opaque', '#960C09', '', ''],
  ['citadel-morghast-bone', 'citadel', 'Base', 'Morghast Bone', 'matte', 'opaque', '#C0A973', '', ''],
  ['citadel-mournfang-brown', 'citadel', 'Base', 'Mournfang Brown', 'matte', 'opaque', '#490F06', '', ''],
  ['citadel-naggaroth-night', 'citadel', 'Base', 'Naggaroth Night', 'matte', 'opaque', '#3B2B50', '', ''],
  ['citadel-night-lords-blue', 'citadel', 'Base', 'Night Lords Blue', 'matte', 'opaque', '#002B5C', '', ''],
  ['citadel-nocturne-green', 'citadel', 'Base', 'Nocturne Green', 'matte', 'opaque', '#162A29', '', ''],
  ['citadel-orruk-flesh', 'citadel', 'Base', 'Orruk Flesh', 'matte', 'opaque', '#8CC276', '', ''],
  ['citadel-phoenician-purple', 'citadel', 'Base', 'Phoenician Purple', 'matte', 'opaque', '#440052', '', ''],
  ['citadel-rakarth-flesh', 'citadel', 'Base', 'Rakarth Flesh', 'matte', 'opaque', '#9C998D', '', ''],
  ['citadel-ratskin-flesh', 'citadel', 'Base', 'Ratskin Flesh', 'matte', 'opaque', '#A86648', '', ''],
  ['citadel-retributor-armour', 'citadel', 'Base', 'Retributor Armour', 'metallic', 'opaque', '#89571D', '', METAL],
  ['citadel-rhinox-hide', 'citadel', 'Base', 'Rhinox Hide', 'matte', 'opaque', '#462F30', '', ''],
  ['citadel-runelord-brass', 'citadel', 'Base', 'Runelord Brass', 'metallic', 'opaque', '#190E07', '', METAL],
  ['citadel-screamer-pink', 'citadel', 'Base', 'Screamer Pink', 'matte', 'opaque', '#7A0E44', '', ''],
  ['citadel-screaming-bell', 'citadel', 'Base', 'Screaming Bell', 'metallic', 'opaque', '#642F1F', '', METAL],
  ['citadel-steel-legion-drab', 'citadel', 'Base', 'Steel Legion Drab', 'matte', 'opaque', '#584E2D', '', ''],
  ['citadel-stegadon-scale-green', 'citadel', 'Base', 'Stegadon Scale Green', 'matte', 'opaque', '#06455D', '', ''],
  ['citadel-the-fang', 'citadel', 'Base', 'The Fang', 'matte', 'opaque', '#405B71', '', ''],
  ['citadel-thondia-brown', 'citadel', 'Base', 'Thondia Brown', 'matte', 'opaque', '#54302A', '', ''],
  ['citadel-thousand-sons-blue', 'citadel', 'Base', 'Thousand Sons Blue', 'matte', 'opaque', '#00506F', '', ''],
  ['citadel-waaagh-flesh', 'citadel', 'Base', "Waaagh! Flesh", 'matte', 'opaque', '#0B3B36', '', ''],
  ['citadel-warplock-bronze', 'citadel', 'Base', 'Warplock Bronze', 'metallic', 'opaque', '#440808', '', METAL],
  ['citadel-wraithbone', 'citadel', 'Base', 'Wraithbone', 'matte', 'opaque', '#DBD1B2', '', ''],
  ['citadel-xv-88', 'citadel', 'Base', 'XV-88', 'matte', 'opaque', '#6C4811', '', ''],
  ['citadel-zandri-dust', 'citadel', 'Base', 'Zandri Dust', 'matte', 'opaque', '#988E56', '', ''],

  // Citadel Layer — thinner coats built over a base.
  ['citadel-administratum-grey', 'citadel', 'Layer', 'Administratum Grey', 'matte', 'semi-opaque', '#989C94', '', ''],
  ['citadel-ahriman-blue', 'citadel', 'Layer', 'Ahriman Blue', 'matte', 'semi-opaque', '#00708A', '', ''],
  ['citadel-altdorf-guard-blue', 'citadel', 'Layer', 'Altdorf Guard Blue', 'matte', 'semi-opaque', '#2D4696', '', ''],
  ['citadel-auric-armour-gold', 'citadel', 'Layer', 'Auric Armour Gold', 'metallic', 'semi-opaque', '#B05A25', '', METAL],
  ['citadel-cadian-fleshtone', 'citadel', 'Layer', 'Cadian Fleshtone', 'matte', 'semi-opaque', '#C47652', '', ''],
  ['citadel-calgar-blue', 'citadel', 'Layer', 'Calgar Blue', 'matte', 'semi-opaque', '#2A497F', '', ''],
  ['citadel-dawnstone', 'citadel', 'Layer', 'Dawnstone', 'matte', 'semi-opaque', '#697068', '', ''],
  ['citadel-evil-sunz-scarlet', 'citadel', 'Layer', 'Evil Sunz Scarlet', 'matte', 'semi-opaque', '#C01411', '', ''],
  ['citadel-fenrisian-grey', 'citadel', 'Layer', 'Fenrisian Grey', 'matte', 'semi-opaque', '#6D94B3', '', ''],
  ['citadel-fire-dragon-bright', 'citadel', 'Layer', 'Fire Dragon Bright', 'matte', 'semi-opaque', '#F4874E', '', ''],
  ['citadel-flash-gitz-yellow', 'citadel', 'Layer', 'Flash Gitz Yellow', 'matte', 'semi-opaque', '#FFF300', '', ''],
  ['citadel-gehenna-gold', 'citadel', 'Layer', "Gehenna's Gold", 'metallic', 'semi-opaque', '#722A0B', '', METAL],
  ['citadel-ironbreaker', 'citadel', 'Layer', 'Ironbreaker', 'metallic', 'semi-opaque', '#414141', '', METAL],
  ['citadel-kabalite-green', 'citadel', 'Layer', 'Kabalite Green', 'matte', 'semi-opaque', '#008962', '', ''],
  ['citadel-kislev-flesh', 'citadel', 'Layer', 'Kislev Flesh', 'matte', 'semi-opaque', '#D1A570', '', ''],
  ['citadel-liber-gold', 'citadel', 'Layer', 'Liberator Gold', 'metallic', 'semi-opaque', '#886625', '', METAL],
  ['citadel-wild-rider-red', 'citadel', 'Layer', 'Wild Rider Red', 'matte', 'semi-opaque', '#E82E1B', '', ''],
  ['citadel-moot-green', 'citadel', 'Layer', 'Moot Green', 'matte', 'semi-opaque', '#3DAF44', '', ''],
  ['citadel-pallid-wych-flesh', 'citadel', 'Layer', 'Pallid Wych Flesh', 'matte', 'semi-opaque', '#CACCBB', '', ''],
  ['citadel-runefang-steel', 'citadel', 'Layer', 'Runefang Steel', 'metallic', 'semi-opaque', '#797F82', '', METAL],
  ['citadel-screaming-skull', 'citadel', 'Layer', 'Screaming Skull', 'matte', 'semi-opaque', '#B9C099', '', ''],
  ['citadel-stormhost-silver', 'citadel', 'Layer', 'Stormhost Silver', 'metallic', 'semi-opaque', '#9DA3A7', '', METAL],
  ['citadel-temple-guard-blue', 'citadel', 'Layer', 'Temple Guard Blue', 'matte', 'semi-opaque', '#239489', '', ''],
  ['citadel-troll-slayer-orange', 'citadel', 'Layer', 'Troll Slayer Orange', 'matte', 'semi-opaque', '#F16C23', '', ''],
  ['citadel-ushabti-bone', 'citadel', 'Layer', 'Ushabti Bone', 'matte', 'semi-opaque', '#ABA173', '', ''],
  ['citadel-warpstone-glow', 'citadel', 'Layer', 'Warpstone Glow', 'matte', 'semi-opaque', '#0F702A', '', ''],
  ['citadel-wazdakka-red', 'citadel', 'Layer', 'Wazdakka Red', 'matte', 'semi-opaque', '#880804', '', ''],
  ['citadel-white-scar', 'citadel', 'Layer', 'White Scar', 'matte', 'semi-opaque', '#FDFDFD', '', ''],
  ['citadel-yriel-yellow', 'citadel', 'Layer', 'Yriel Yellow', 'matte', 'semi-opaque', '#FFD900', '', ''],

  // Citadel Shade — washes.
  ['citadel-agrax-earthshade', 'citadel', 'Shade', 'Agrax Earthshade', 'wash', 'translucent', '#2D190C', '', 'Wash. It tints a coat and settles in recesses.'],
  ['citadel-athonian-camoshade', 'citadel', 'Shade', 'Athonian Camoshade', 'wash', 'translucent', '#1C1C10', '', 'Wash. It tints a coat and settles in recesses.'],
  ['citadel-biel-tan-green', 'citadel', 'Shade', 'Biel-Tan Green', 'wash', 'translucent', '#132E21', '', 'Wash. It tints a coat and settles in recesses.'],
  ['citadel-carroburg-crimson', 'citadel', 'Shade', 'Carroburg Crimson', 'wash', 'translucent', '#310808', '', 'Wash. It tints a coat and settles in recesses.'],
  ['citadel-drakenhof-nightshade', 'citadel', 'Shade', 'Drakenhof Nightshade', 'wash', 'translucent', '#0A131B', '', 'Wash. It tints a coat and settles in recesses.'],
  ['citadel-nuln-oil', 'citadel', 'Shade', 'Nuln Oil', 'wash', 'translucent', '#101010', '', 'Wash. It tints a coat and settles in recesses.'],
  ['citadel-reikland-fleshshade', 'citadel', 'Shade', 'Reikland Fleshshade', 'wash', 'translucent', '#311908', '', 'Wash. It tints a coat and settles in recesses.'],
  ['citadel-seraphim-sepia', 'citadel', 'Shade', 'Seraphim Sepia', 'wash', 'translucent', '#2E1F08', '', 'Wash. It tints a coat and settles in recesses.'],

  // Citadel Contrast — translucent one-coat colours over a light primer.
  ['citadel-blood-angels-red', 'citadel', 'Contrast', 'Blood Angels Red', 'contrast', 'translucent', '#C11519', '', 'Contrast paint. It pools in recesses over a light primer. Not a match for a Base pot of the same hue.'],
  ['citadel-black-templar', 'citadel', 'Contrast', 'Black Templar', 'contrast', 'translucent', '#6A6A69', '', 'Contrast paint. It pools in recesses over a light primer.'],
  ['citadel-guilliman-flesh', 'citadel', 'Contrast', 'Guilliman Flesh', 'contrast', 'translucent', '#D1A194', '', 'Contrast paint. It pools in recesses over a light primer.'],
  ['citadel-skeleton-horde', 'citadel', 'Contrast', 'Skeleton Horde', 'contrast', 'translucent', '#EBE2C2', '', 'Contrast paint. It pools in recesses over a light primer.'],
  ['citadel-snakebite-leather', 'citadel', 'Contrast', 'Snakebite Leather', 'contrast', 'translucent', '#B26B0C', '', 'Contrast paint. It pools in recesses over a light primer.'],
  ['citadel-ultramarines-blue', 'citadel', 'Contrast', 'Ultramarines Blue', 'contrast', 'translucent', '#294F86', '', 'Contrast paint. It pools in recesses over a light primer.'],
  ['citadel-basilicanum-grey', 'citadel', 'Contrast', 'Basilicanum Grey', 'contrast', 'translucent', '#989897', '', 'Contrast paint. It pools in recesses over a light primer.'],
  ['citadel-ork-flesh', 'citadel', 'Contrast', 'Ork Flesh', 'contrast', 'translucent', '#00832B', '', 'Contrast paint. It pools in recesses over a light primer.'],
  ['citadel-iyanden-yellow', 'citadel', 'Contrast', 'Iyanden Yellow', 'contrast', 'translucent', '#FBC827', '', 'Contrast paint. It pools in recesses over a light primer.'],
  ['citadel-gore-grunta-fur', 'citadel', 'Contrast', 'Gore-Grunta Fur', 'contrast', 'translucent', '#8F4001', '', 'Contrast paint. It pools in recesses over a light primer.'],
  ['citadel-wyldwood', 'citadel', 'Contrast', 'Wyldwood', 'contrast', 'translucent', '#6A504B', '', 'Contrast paint. It pools in recesses over a light primer.'],
  ['citadel-talassar-blue', 'citadel', 'Contrast', 'Talassar Blue', 'contrast', 'translucent', '#0073C2', '', 'Contrast paint. It pools in recesses over a light primer.'],

  // A few Technical effect paints. The swatch is only a stand-in.
  ['citadel-blood-for-the-blood-god', 'citadel', 'Technical', 'Blood for the Blood God', 'gloss', 'translucent', '#600005', '', 'Gloss effect paint, not a flat colour coat.'],
  ['citadel-nihilakh-oxide', 'citadel', 'Technical', 'Nihilakh Oxide', 'matte', 'translucent', '#66B39A', '', 'Oxide effect paint. The swatch is a stand-in for the dried deposit.'],
  ['citadel-typhus-corrosion', 'citadel', 'Technical', 'Typhus Corrosion', 'matte', 'opaque', '#373A22', '', 'Texture effect paint. The swatch is a stand-in, not the grit.'],
  ['citadel-stirland-mud', 'citadel', 'Technical', 'Stirland Mud', 'matte', 'opaque', '#482B00', '', 'Texture effect paint for bases. The swatch is a stand-in, not the grit.'],

  // Vallejo neighbours. Codes are the chart’s Game Color (72) or Model Color (70) numbers.
  ['vallejo-gc-black', 'vallejo', 'Game Color', 'Black', 'matte', 'opaque', '#000000', '72.051', PAIRED],
  ['vallejo-mc-black', 'vallejo', 'Model Color', 'Black', 'matte', 'opaque', '#000000', '70.950', PAIRED],
  ['vallejo-gc-dead-white', 'vallejo', 'Game Color', 'Dead White', 'matte', 'opaque', '#FDFDFD', '72.001', PAIRED],
  ['vallejo-mc-white', 'vallejo', 'Model Color', 'White', 'matte', 'opaque', '#FDFDFD', '70.951', PAIRED],
  ['vallejo-gc-heavy-blue', 'vallejo', 'Game Color', 'Heavy Blue', 'matte', 'opaque', '#0F3D7C', '72.143', PAIRED],
  ['vallejo-mc-prussian-blue', 'vallejo', 'Model Color', 'Prussian Blue', 'matte', 'opaque', '#0F3D7C', '70.965', PAIRED],
  ['vallejo-gc-heavy-red', 'vallejo', 'Game Color', 'Heavy Red', 'matte', 'opaque', '#960C09', '72.141', PAIRED],
  ['vallejo-mc-red', 'vallejo', 'Model Color', 'Red', 'matte', 'opaque', '#960C09', '70.926', PAIRED],
  ['vallejo-gc-dark-green', 'vallejo', 'Game Color', 'Dark Green', 'matte', 'opaque', '#003D15', '72.028', PAIRED],
  ['vallejo-mc-deep-green', 'vallejo', 'Model Color', 'Deep Green', 'matte', 'opaque', '#003D15', '70.970', PAIRED],
  ['vallejo-gc-gunmetal', 'vallejo', 'Game Color', 'Gunmetal', 'metallic', 'opaque', '#151E24', '72.054', `${METAL} ${PAIRED}`],
  ['vallejo-mc-gunmetal-grey', 'vallejo', 'Model Color', 'Gunmetal Grey', 'metallic', 'opaque', '#151E24', '70.863', `${METAL} ${PAIRED}`],
  ['vallejo-gc-heavy-goldbrown', 'vallejo', 'Game Color', 'Heavy Goldbrown', 'matte', 'opaque', '#FBB81C', '72.151', PAIRED],
  ['vallejo-mc-goldbrown', 'vallejo', 'Model Color', 'Goldbrown', 'matte', 'opaque', '#FBB81C', '70.877', PAIRED],
  ['vallejo-gc-khaki', 'vallejo', 'Game Color', 'Khaki', 'matte', 'opaque', '#988E56', '72.061', PAIRED],
  ['vallejo-mc-german-camo-beige', 'vallejo', 'Model Color', 'German Cam. Beige', 'matte', 'opaque', '#988E56', '70.821', PAIRED],
  ['vallejo-gc-tan', 'vallejo', 'Game Color', 'Tan', 'matte', 'opaque', '#804C43', '72.066', PAIRED],
  ['vallejo-gc-pale-flesh', 'vallejo', 'Game Color', 'Pale Flesh', 'matte', 'opaque', '#D1A570', '72.003', PAIRED],
  ['vallejo-mc-light-flesh', 'vallejo', 'Model Color', 'Light Flesh', 'matte', 'opaque', '#D1A570', '70.928', PAIRED],
  ['vallejo-gc-bloody-red', 'vallejo', 'Game Color', 'Bloody Red', 'matte', 'opaque', '#C01411', '72.010', PAIRED],
  ['vallejo-mc-vermillion', 'vallejo', 'Model Color', 'Vermillion', 'matte', 'opaque', '#C01411', '70.909', PAIRED],
  ['vallejo-gw-black-wash', 'vallejo', 'Game Wash', 'Black Wash', 'wash', 'translucent', '#101010', '73.201', PAIRED],
  ['vallejo-gw-umber-wash', 'vallejo', 'Game Wash', 'Umber Shade', 'wash', 'translucent', '#2D190C', '73.203', PAIRED],
  ['vallejo-gw-fleshtone-wash', 'vallejo', 'Game Wash', 'Fleshtone Shade', 'wash', 'translucent', '#311908', '73.204', PAIRED],
  ['vallejo-gc-imperial-blue', 'vallejo', 'Game Color', 'Imperial Blue', 'matte', 'opaque', '#02134E', '72.020', PAIRED],
  ['vallejo-gc-heavy-blackgreen', 'vallejo', 'Game Color', 'Heavy Blackgreen', 'matte', 'opaque', '#0B3B36', '72.147', PAIRED],
  ['vallejo-mc-black-green', 'vallejo', 'Model Color', 'Black Green', 'matte', 'opaque', '#0B3B36', '70.980', PAIRED],
  ['vallejo-mc-russian-uniform', 'vallejo', 'Model Color', 'Russian Uniform', 'matte', 'opaque', '#39484A', '70.924', PAIRED],
  ['vallejo-gc-chainmail', 'vallejo', 'Game Color', 'Chainmail', 'metallic', 'opaque', '#414141', '72.053', `${METAL} ${PAIRED}`],
  ['vallejo-mc-natural-steel', 'vallejo', 'Model Color', 'Natural Steel', 'metallic', 'opaque', '#414141', '70.864', `${METAL} ${PAIRED}`],
  ['vallejo-gc-silver', 'vallejo', 'Game Color', 'Silver', 'metallic', 'opaque', '#797F82', '72.052', `${METAL} ${PAIRED}`],
  ['vallejo-mc-silver', 'vallejo', 'Model Color', 'Silver', 'metallic', 'opaque', '#797F82', '70.997', `${METAL} ${PAIRED}`],
  ['vallejo-gc-glorious-gold', 'vallejo', 'Game Color', 'Glorious Gold', 'metallic', 'opaque', '#B05A25', '72.056', `${METAL} ${PAIRED}`],
  ['vallejo-gc-scarlet-blood', 'vallejo', 'Game Color', 'Scarlet Blood', 'matte', 'opaque', '#650001', '72.012', PAIRED],
  ['vallejo-mc-carmine', 'vallejo', 'Model Color', 'Carmine Red', 'matte', 'opaque', '#650001', '70.908', PAIRED],

  // Army Painter Warpaints names and WP codes from the same public comparison chart.
  // Fanatic is a later relaunch; these codes are the Warpaints listings.
  ['army-painter-matt-black', 'army-painter', 'Warpaints', 'Matt Black', 'matte', 'opaque', '#000000', 'WP1101', PAIRED],
  ['army-painter-matt-white', 'army-painter', 'Warpaints', 'Matt White', 'matte', 'opaque', '#FDFDFD', 'WP1102', PAIRED],
  ['army-painter-dark-sky', 'army-painter', 'Warpaints', 'Dark Sky', 'matte', 'opaque', '#0F3D7C', '', PAIRED],
  ['army-painter-vampire-red', 'army-painter', 'Warpaints', 'Vampire Red', 'matte', 'opaque', '#960C09', 'WP1460', PAIRED],
  ['army-painter-angel-green', 'army-painter', 'Warpaints', 'Angel Green', 'matte', 'opaque', '#003D15', 'WP1112', PAIRED],
  ['army-painter-gun-metal', 'army-painter', 'Warpaints', 'Gun Metal', 'metallic', 'opaque', '#151E24', '', `${METAL} ${PAIRED}`],
  ['army-painter-tanned-flesh', 'army-painter', 'Warpaints', 'Tanned Flesh', 'matte', 'opaque', '#804C43', 'WP1127', PAIRED],
  ['army-painter-kobold-skin', 'army-painter', 'Warpaints', 'Kobold Skin', 'matte', 'opaque', '#D1A570', '', PAIRED],
  ['army-painter-pure-red', 'army-painter', 'Warpaints', 'Pure Red', 'matte', 'opaque', '#C01411', 'WP1104', PAIRED],
  ['army-painter-dark-tone', 'army-painter', 'Warpaints Wash', 'Dark Tone', 'wash', 'translucent', '#101010', 'WP1136', PAIRED],
  ['army-painter-strong-tone', 'army-painter', 'Warpaints Wash', 'Strong Tone', 'wash', 'translucent', '#2D190C', 'WP1135', PAIRED],
  ['army-painter-flesh-wash', 'army-painter', 'Warpaints Wash', 'Flesh Wash', 'wash', 'translucent', '#311908', 'WP1143', PAIRED],
  ['army-painter-deep-blue', 'army-painter', 'Warpaints', 'Deep Blue', 'matte', 'opaque', '#02134E', 'WP1116', PAIRED],
  ['army-painter-plate-mail', 'army-painter', 'Warpaints', 'Plate Mail Metal', 'metallic', 'opaque', '#414141', 'WP1130', `${METAL} ${PAIRED}`],
  ['army-painter-shining-silver', 'army-painter', 'Warpaints', 'Shining Silver', 'metallic', 'opaque', '#797F82', 'WP1129', `${METAL} ${PAIRED}`],
  ['army-painter-bright-gold', 'army-painter', 'Warpaints', 'Bright Gold', 'metallic', 'opaque', '#B05A25', 'WP1231', `${METAL} ${PAIRED}`],
  ['army-painter-chaotic-red', 'army-painter', 'Warpaints', 'Chaotic Red', 'matte', 'opaque', '#650001', 'WP1142', `${PAIRED} The comparison chart flags this red as too dark and brown.`],

  // Two Thin Coats names from that chart. No product codes were listed.
  ['ttc-doom-death-black', 'two-thin-coats', 'Two Thin Coats', 'Doom Death Black', 'matte', 'opaque', '#000000', '', PAIRED],
  ['ttc-white-star', 'two-thin-coats', 'Two Thin Coats', 'White Star', 'matte', 'opaque', '#FDFDFD', '', PAIRED],
  ['ttc-marine-blue', 'two-thin-coats', 'Two Thin Coats', 'Marine Blue', 'matte', 'opaque', '#0F3D7C', '', PAIRED],
  ['ttc-sanguine-scarlet', 'two-thin-coats', 'Two Thin Coats', 'Sanguine Scarlet', 'matte', 'opaque', '#960C09', '', PAIRED],
  ['ttc-wyvern-green', 'two-thin-coats', 'Two Thin Coats', 'Wyvern Green', 'matte', 'opaque', '#003D15', '', PAIRED],
  ['ttc-sir-coates-silver', 'two-thin-coats', 'Two Thin Coats', 'Sir Coates Silver', 'metallic', 'opaque', '#151E24', '', `${METAL} ${PAIRED}`],
  ['ttc-dark-sun-yellow', 'two-thin-coats', 'Two Thin Coats', 'Dark Sun Yellow', 'matte', 'opaque', '#FBB81C', '', PAIRED],
  ['ttc-dragon-fang', 'two-thin-coats', 'Two Thin Coats', 'Dragon Fang', 'matte', 'opaque', '#988E56', '', PAIRED],
  ['ttc-barbarian-brawn', 'two-thin-coats', 'Two Thin Coats', 'Barbarian Brawn', 'matte', 'opaque', '#804C43', '', PAIRED],
  ['ttc-elven-skin', 'two-thin-coats', 'Two Thin Coats', 'Elven Skin', 'matte', 'opaque', '#D1A570', '', PAIRED],
  ['ttc-demon-red', 'two-thin-coats', 'Two Thin Coats', 'Demon Red', 'matte', 'opaque', '#C01411', '', PAIRED],
  ['ttc-oblivion-black-wash', 'two-thin-coats', 'Wash', 'Oblivion Black Wash', 'wash', 'translucent', '#101010', '', PAIRED],
  ['ttc-battle-mud-wash', 'two-thin-coats', 'Wash', 'Battle Mud Wash', 'wash', 'translucent', '#2D190C', '', PAIRED],
  ['ttc-flesh-wash', 'two-thin-coats', 'Wash', 'Flesh Wash', 'wash', 'translucent', '#311908', '', PAIRED],
  ['ttc-abyss-blue', 'two-thin-coats', 'Two Thin Coats', 'Abyss Blue', 'matte', 'opaque', '#02134E', '', PAIRED],
  ['ttc-orc-hide', 'two-thin-coats', 'Two Thin Coats', 'Orc Hide', 'matte', 'opaque', '#0B3B36', '', PAIRED],
  ['ttc-dungeon-stone-grey', 'two-thin-coats', 'Two Thin Coats', 'Dungeon Stone Grey', 'matte', 'opaque', '#39484A', '', PAIRED],
  ['ttc-asmodeus-red', 'two-thin-coats', 'Two Thin Coats', 'Asmodeus Red', 'matte', 'opaque', '#650001', '', PAIRED],
]

const GROUPS: readonly (readonly string[])[] = [
  ['citadel-abaddon-black', 'vallejo-gc-black', 'vallejo-mc-black', 'army-painter-matt-black', 'ttc-doom-death-black'],
  ['citadel-white-scar', 'vallejo-gc-dead-white', 'vallejo-mc-white', 'army-painter-matt-white', 'ttc-white-star'],
  ['citadel-macragge-blue', 'vallejo-gc-heavy-blue', 'vallejo-mc-prussian-blue', 'army-painter-dark-sky', 'ttc-marine-blue'],
  ['citadel-mephiston-red', 'vallejo-gc-heavy-red', 'vallejo-mc-red', 'army-painter-vampire-red', 'ttc-sanguine-scarlet'],
  ['citadel-caliban-green', 'vallejo-gc-dark-green', 'vallejo-mc-deep-green', 'army-painter-angel-green', 'ttc-wyvern-green'],
  ['citadel-leadbelcher', 'vallejo-gc-gunmetal', 'vallejo-mc-gunmetal-grey', 'army-painter-gun-metal', 'ttc-sir-coates-silver'],
  ['citadel-averland-sunset', 'vallejo-gc-heavy-goldbrown', 'vallejo-mc-goldbrown', 'ttc-dark-sun-yellow'],
  ['citadel-zandri-dust', 'vallejo-gc-khaki', 'vallejo-mc-german-camo-beige', 'ttc-dragon-fang'],
  ['citadel-bugmans-glow', 'vallejo-gc-tan', 'army-painter-tanned-flesh', 'ttc-barbarian-brawn'],
  ['citadel-kislev-flesh', 'vallejo-gc-pale-flesh', 'vallejo-mc-light-flesh', 'army-painter-kobold-skin', 'ttc-elven-skin'],
  ['citadel-evil-sunz-scarlet', 'vallejo-gc-bloody-red', 'vallejo-mc-vermillion', 'army-painter-pure-red', 'ttc-demon-red'],
  ['citadel-nuln-oil', 'vallejo-gw-black-wash', 'army-painter-dark-tone', 'ttc-oblivion-black-wash'],
  ['citadel-agrax-earthshade', 'vallejo-gw-umber-wash', 'army-painter-strong-tone', 'ttc-battle-mud-wash'],
  ['citadel-reikland-fleshshade', 'vallejo-gw-fleshtone-wash', 'army-painter-flesh-wash', 'ttc-flesh-wash'],
  ['citadel-kantor-blue', 'vallejo-gc-imperial-blue', 'army-painter-deep-blue', 'ttc-abyss-blue'],
  ['citadel-waaagh-flesh', 'vallejo-gc-heavy-blackgreen', 'vallejo-mc-black-green', 'ttc-orc-hide'],
  ['citadel-mechanicus-standard-grey', 'vallejo-mc-russian-uniform', 'ttc-dungeon-stone-grey'],
  ['citadel-ironbreaker', 'vallejo-gc-chainmail', 'vallejo-mc-natural-steel', 'army-painter-plate-mail'],
  ['citadel-runefang-steel', 'vallejo-gc-silver', 'vallejo-mc-silver', 'army-painter-shining-silver'],
  ['citadel-auric-armour-gold', 'vallejo-gc-glorious-gold', 'army-painter-bright-gold'],
  ['citadel-khorne-red', 'vallejo-gc-scarlet-blood', 'vallejo-mc-carmine', 'army-painter-chaotic-red', 'ttc-asmodeus-red'],
]

const similarById = new Map<string, string[]>()
for (const group of GROUPS) {
  for (const id of group) similarById.set(id, group.filter((other) => other !== id))
}

export const PAINTS: readonly CatalogPaint[] = ROWS.map((row) => ({
  id: row[0],
  range: row[1],
  line: row[2],
  name: row[3],
  finish: row[4],
  coverage: row[5],
  hex: row[6].toLowerCase(),
  code: row[7],
  note: row[8],
  similar: similarById.get(row[0]) ?? [],
}))

export const RANGE_LABEL: Record<PaintRangeId, string> = {
  citadel: 'Citadel',
  vallejo: 'Vallejo',
  'army-painter': 'Army Painter',
  'two-thin-coats': 'Two Thin Coats',
}

export const LINE_NOTES: Record<string, string> = {
  'citadel:Base': 'Opaque foundation coats. One or two layers are meant to cover a primed model.',
  'citadel:Layer': 'Thinner than Base. Built up over a foundation rather than used to cover primer in one coat.',
  'citadel:Shade': 'Washes. They tint a coat and settle in recesses.',
  'citadel:Contrast': 'Translucent one-coat colours that pool in recesses over a light primer.',
  'citadel:Technical': 'Effect paints. The swatch stands in for the dried look.',
  'vallejo:Game Color': 'Game Color line. Pairings are public chart neighbours.',
  'vallejo:Model Color': 'Model Color line. Pairings are public chart neighbours.',
  'vallejo:Game Wash': 'Washes from the Game Color wash line.',
  'army-painter:Warpaints': 'Warpaints names and WP codes from a public comparison chart. Fanatic is a later relaunch.',
  'army-painter:Warpaints Wash': 'Tone and wash listings from that chart.',
  'two-thin-coats:Two Thin Coats': 'Names from a public comparison chart. Check the bottle.',
  'two-thin-coats:Wash': 'Wash names from a public comparison chart.',
}
