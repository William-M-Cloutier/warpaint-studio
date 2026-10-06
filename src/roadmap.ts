/**
 * Work that is still later. Photo scale, backdrop removal, and section masks
 * are implemented and are not listed here. The README "Later" section mirrors this list.
 */
export type RoadmapItem = {
  id: string
  title: string
  note: string
}

export const ROADMAP: readonly RoadmapItem[] = [
  {
    id: 'view-backgrounds',
    title: 'Custom viewing backgrounds',
    note: 'After a cutout exists, place the miniature on a chosen viewing background.',
  },
  {
    id: 'paint-suggestions',
    title: 'Suggested paints and highlights',
    note: 'Offer highlight and shade suggestions from a chosen base color.',
  },
  {
    id: 'lighting',
    title: 'Lighting presets',
    note: 'Preview the same scheme under a few lighting setups.',
  },
  {
    id: 'paint-mix',
    title: 'Paint mix by ratio',
    note: 'Mix two paints by a stated ratio and use the result as a color.',
  },
  {
    id: 'multi-angle',
    title: '2×2 multi-angle layout',
    note: 'Load several photos of one miniature and paint them as a set.',
  },
  {
    id: 'tutorial',
    title: 'In-app tutorial',
    note: 'Add this near the end, after the painting workflow has settled.',
  },
  {
    id: 'stl',
    title: 'Optional STL later',
    note: 'A 3D file view is a possible later add-on. This app paints on photos, it does not sculpt.',
  },
]
