# Warpaint Studio

Paint-scheme preview for miniature photos. Upload a picture of a painted or unpainted mini and try colors on a layer above it. This is not a 3D sculpting app.

## Run

```bash
npm install
npm run dev
```

Vite prints a local URL (default [http://localhost:5173](http://localhost:5173)).

```bash
npm run build
npm run preview
```

Node 20 or newer.

## What you can do

- Drop a photo on the window, or use **Upload** (one image at a time).
- **Brush** lays down a tint, not a flat cover. The coat is shaded by the photo, so edges, highlights, and recesses stay visible. The same red is brighter on a lit surface and darker in a shadow. **Opacity** is how strong that tint is. The photo pixels are not edited.
- **Eraser** removes the tint and restores the original photo in that spot.
- **Eyedropper** on a painted spot picks the pigment you brushed (the swatch), not the lighter or darker shade created by the photo's lighting. On an unpainted spot it picks the photo color. Painting with that swatch again lays the same coat back down; the picture still supplies the light and shadow.
- **Photo scale** resizes the uploaded picture. The slider and percent sit in the left tool strip, labeled **Photo scale**. **Auto** (or Shift+0) fits that picture in the canvas without stretching either side, then frames the view. It also runs when a photo is uploaded.
- **View zoom** is separate. **Pan** (H, Space, or the middle mouse button), scroll, the **View %** chip, and **Fit view** (or 0, including the top bar) move the canvas around the picture. They do not change photo scale. Brush size stays in screen pixels.
- **Remove backdrop** cuts the table or desk out in the browser, including white gaps enclosed by the miniature. Nothing is uploaded. It then fills small holes in the figure and trims the white rim. **Cutout strength** widens how close a pixel must be to that backdrop color. **Repair cutout** runs the hole fill and rim trim again. **Restore photo** (R) paints the original picture back, and **Erase backdrop** (X) forces transparency. Both use Size and Opacity, and both undo. **Reset cutout** restores the original photo. The viewport checkerboard shows through the transparent pixels. Paint still tints by the photo's light and shadow, and only where the miniature remains.
- **Sections** keep a brush or eraser inside one region (a shoulder pad, a shield, a plate). They live on the **Sections** tab at the top of the right side (W, L, and M open that tab). Pick **Wand** (W) and click a plate, draw a **Lasso** (L), or paint the mask with **Mask** (M). **New** makes a section. **Add** and **Subtract** change the active one. The wand is edge-aware: OpenCV Canny finds the sculpt ridges, the wand grows across a smooth shade and stops at those ridges, and it never selects the white backdrop, whether that field is already cut out or still opaque. **Show edges** draws those automatic ridges in yellow. **Add ridge** paints a missing ridge. That stroke is the wall — it is drawn in blue, and it is not traced again in yellow. **Erase ridge** knocks a false one out. Both use Size, and both undo. **Clear ridge edits** drops them and can itself be undone. The wand, **Suggest regions**, and **Stay inside lines** all use this edited map: automatic Canny ridges, plus the pixels you painted, minus what you erased. **Edge tolerance** stays on the Sections tab with those ridge tools, from 0 to 150. It lets a fainter automatic ridge be crossed. Hand-added ridges stay, and erased ones stay gone, at any tolerance. **Fill section** coats the active section with the current color. The photo still supplies light and shadow, and paint outside that mask is left alone. The layer list keeps a tall scroll when the mask tools are open. **Size** for the mask and ridge brushes sits with those tools and still changes the dab when Stay inside lines is off. The list shows a color square, then the layer name, then a label: armour plates, trim, undersuit/joints, details, or your own text. The eye hides the highlight. The lock blocks paint and mask edits. Delete can be undone. **Suggest regions** splits the miniature with the same ridges into part-sized areas (a weapon, a shield, the head, the base, major plates). With **Whole photo** selected, the brush paints everywhere, as before. The chip on the canvas names the active section, and its mask is drawn over the photo. A section also stays off any backdrop the cutout has already cleared. Sections and ridge edits belong to the current photo and are cleared with it.
- **Stay inside lines** (S) is a paint assist, separate from the wand. While the brush, eraser, lasso, or mask tool is selected, **Stay inside lines** and **Hug** sit with that tool: on the left for the brush and eraser, and on the Sections tab for the lasso and mask. The stroke or path is nudged so it hugs sculpt ridges. Brush and eraser also hug the active section. Lasso and mask hug that section while you add or subtract, and only the sculpt ridges while the mask tool is set to New. It does not hard-clip the dab. A firm stroke that moves well past a ridge still crosses. **Hug** sets how strongly that nudge pulls. The same edge tolerance as the wand decides which automatic ridges count.
- **Undo** and **redo** apply to paint strokes, to section color fills, to the restore and erase-backdrop brushes, to section mask edits (wand, lasso, mask brush, suggest, and delete), and to ridge edits. **Clear paint** wipes the paint layer and can itself be undone. They do not undo uploads, photo scale, Remove backdrop, rename, labels, theme, or saved schemes.
- The right side has three tabs: **Color**, **Sections**, and **Catalog**. **Color** holds the current color, recent swatches, a working palette, and named schemes. **Save scheme** stores the palette in this browser (`localStorage`). If the palette is empty, the save uses the current color and recent swatches.
- **Catalog** lists Citadel Base, Layer, Shade, Contrast, and Technical staples, plus Vallejo, Army Painter Warpaints, and Two Thin Coats neighbours. Swatches are approximate screen colours from public charts, not measured chips. Finish and coverage describe the product line. Similar paints are chart neighbours, not review scores or factory matches. Pick one to set the brush colour. Adding that colour to the palette keeps the paint name.
- The app opens in a **dark** theme. The sun/moon control in the top bar switches to light. The choice is remembered.

Photos stay in memory for the session. A new photo replaces the current one. If the current photo has paint, the app asks before replacing it.

## Shortcuts

| Key | Action |
| --- | --- |
| B or 1 | Brush |
| E or 2 | Eraser |
| I or 3 | Eyedropper |
| H or 4 | Pan |
| R | Restore photo |
| X | Erase backdrop |
| W | Magic wand (new, add, or subtract a section) |
| L | Lasso |
| M | Mask brush |
| S | Stay inside lines |
| Space (hold) | Pan |
| Scroll | View zoom toward the pointer (not photo scale) |
| [ and ] | Brush size (Shift for larger steps) |
| Ctrl/Cmd+Z | Undo |
| Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y | Redo |
| 0 | Fit view (does not change photo scale) |
| Shift+0 | Auto photo scale |

## Project layout

- `src/App.tsx` — shell, upload, theme, and scheme actions
- `src/components/` — top bar, tool strip, canvas, color panel
- `src/lib/paintSurface.ts` — photo scale, cutout, sections, view pan/zoom, and the paint canvas
- `src/lib/photoScale.ts` — photo scale limits and fit math
- `src/lib/cutout.ts` — offline backdrop removal
- `src/lib/sections.ts` — wand, lasso, and region proposal
- `src/lib/edgeSelect.ts` — OpenCV Canny ridges, wand growth, and hand-edited walls
- `src/lib/edgeEdits.ts` — add and erase ridge strokes
- `src/lib/edgeSnap.ts` — soft stay-inside-lines nudge
- `src/lib/sectionLayer.ts` — section list, masks, and mask undo
- `src/data/paints.ts` — offline paint catalog
- `src/lib/catalog.ts` — catalog search and similar-paint lookup
- `src/lib/paint.ts` — stroke drawing, section clipping, and undo projection
- `src/lib/tint.ts` — luminance shading of the paint coat
- `src/roadmap.ts` — features that are listed and **not** built yet

Theme colors are CSS variables on `:root` (dark) and `:root[data-theme="light"]`.

## Later

These are tracked in `src/roadmap.ts` and called out with `TODO(...)` comments next to the code they would extend. They are **not** implemented:

- Custom viewing backgrounds after a cutout
- Suggested paints and highlights from a base color
- Lighting presets
- Paint mix by ratio
- 2×2 multi-angle photo layout
- In-app tutorial (near the end)
- Optional STL viewing

The working palette is still colours you pick or save. The catalog is a separate list of named paints.
