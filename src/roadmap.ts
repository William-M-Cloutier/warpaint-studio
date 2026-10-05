/**
 * Work that is intentionally out of V1. Do not treat these as implemented.
 * The README "Later" section mirrors this list.
 */
export type RoadmapItem = {
  id: string
  title: string
  note: string
}

export const ROADMAP: readonly RoadmapItem[] = [
  {
    id: 'image-scale',
    title: 'Manual image scale and auto-fit',
    note: 'Photos with one side too small need a manual scale control and an auto-fit that does not crush the longer side.',
  },
  {
    id: 'background-remover',
    title: 'Background remover',
    note: 'Cut the miniature out of the table or desk in the photo.',
  },
  {
    id: 'view-backgrounds',
    title: 'Custom viewing backgrounds',
    note: 'After a cutout exists, place the miniature on a chosen viewing background.',
  },
  {
    id: 'section-layers',
    title: 'Edge and section layers',
    note: 'Editable regions so armour, trim, and other areas can be painted separately.',
  },
  {
    id: 'paint-suggestions',
    title: 'Suggested paints and highlights',
    note: 'Offer highlight and shade suggestions from a chosen base color.',
  },
  {
    id: 'part-categories',
    title: 'Part categories',
    note: 'Armour plates, trim, undersuit/joints, details, plus custom labels stored per model.',
  },
  {
    id: 'paint-catalog',
    title: 'Paint catalog',
    note: 'Major ranges such as Citadel, with quality and comparison notes. V1 swatches are not that catalog.',
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
