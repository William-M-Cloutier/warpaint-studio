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
- The left paint tools are two rows of three: **Brush**, **Eraser**, **Eyedropper**, then **Pan**, **Highlight**, and **Fill**.
- **Brush** lays down a tint, not a flat cover. The coat is shaded by the photo, so edges, highlights, and recesses stay visible. The same red is brighter on a lit surface and darker in a shadow. **Opacity** is how strong that tint is. The photo pixels are not edited.
- **Look** sits under Opacity. The left end, **More photo**, is the original tint. Slide toward **More paint** for stronger colour, softer photo lighting, and a little texture. It only changes the preview. Strokes, the eyedropper, and undo still use the pigment. The choice is remembered in this browser.
- **Highlight** is the fifth tool on the left strip. It paints with a lighter mix of the current colour, for raised edges. The photo still shades that lighter pigment. It is a stroke, separate from **Fill**.
- **Auto highlight**, under those tools, paints the raised edges in one step. **Lighter** uses the Highlight mix. **Current** uses the colour as it is, still shaded by the photo. With a section active, it stays inside that section. Otherwise it covers the miniature. **Stay inside lines** makes the band hug the ridge, and **Hug** sets how tight. It is one undo step. It uses the same ridges as **Show edges**, including ridges you add or erase.
- **Fill** is the sixth control on that strip. One click coats the active section with the current colour. The photo still supplies light and shadow, and paint outside that mask is left alone. The previous tool stays selected. **F** does the same.
- **Eraser** removes the tint and restores the original photo in that spot.
- **Eyedropper** on a painted spot picks the pigment you brushed (the swatch), not the lighter or darker shade created by the photo's lighting. On an unpainted spot it picks the photo color. Painting with that swatch again lays the same coat back down; the picture still supplies the light and shadow.
- **Photo scale** resizes the uploaded picture. The slider and percent sit in the left tool strip, labeled **Photo scale**. **Auto** (or Shift+0) fits that picture in the canvas without stretching either side, then frames the view. It also runs when a photo is uploaded.
- **View zoom** is separate. **Pan** (H, Space, or the middle mouse button), scroll, the **View %** chip, and **Fit view** (or 0, including the top bar) move the canvas around the picture. They do not change photo scale. **Size** is photo pixels on the miniature. A size of 20 is 20 pixels of the picture at any view zoom. Scrolling in or out magnifies that dab on screen and leaves the Size slider alone.
- **Remove backdrop** cuts the table or desk out in the browser, including white gaps enclosed by the miniature. Nothing is uploaded. It then fills small holes in the figure and trims the white rim. **Cutout strength** widens how close a pixel must be to that backdrop color. **Repair cutout** runs the hole fill and rim trim again. **Restore photo** (R) paints the original picture back, and **Erase backdrop** (X) forces transparency. Both use Size and Opacity, and both undo. **Reset cutout** restores the original photo. Until you pick a viewing background, the viewport checkerboard shows through the transparent pixels. Paint still tints by the photo's light and shadow, and only where the miniature remains.
- **Sections** keep a brush, highlight, or eraser inside one region (a shoulder pad, a shield, a plate). They live on the **Sections** tab at the top of the right side (W, L, and M open that tab). Pick **Wand** (W) and click a plate, draw a **Lasso** (L), or paint the mask with **Mask** (M). **New** makes a section. **Add** and **Subtract** change the active one. Those three stay hidden while **Add ridge** or **Erase ridge** is the tool. The wand is edge-aware: OpenCV Canny finds the sculpt ridges, the wand grows across a smooth shade and stops at those ridges, and it never selects the white backdrop, whether that field is already cut out or still opaque. **Show edges** draws automatic ridges and ridges you add in yellow. **Add ridge** paints the wall itself — the stroke pixels are the ridge, and they are not traced again as a second outline. **Erase ridge** knocks a false one out. Both use Size, and both undo. **Clear ridge edits** drops them and can itself be undone. The wand, **Suggest regions**, and **Stay inside lines** all use this edited map: automatic Canny ridges, plus the pixels you painted, minus what you erased. **Edge tolerance** stays on the Sections tab with those ridge tools, from 0 to 150. It lets a fainter automatic ridge be crossed. Hand-added ridges stay, and erased ones stay gone, at any tolerance. The layer list keeps a tall scroll when the mask tools are open. **Size** for the mask and ridge brushes sits with those tools and still changes the dab when Stay inside lines is off. The list shows a color square, then the layer name, then a label: armour plates, trim, undersuit/joints, details, or your own text. The eye hides the mask overlay. The lock blocks paint and mask edits. Delete can be undone. **Suggest regions** splits the miniature with the same ridges into part-sized areas (a weapon, a shield, the head, the base, major plates). With **Whole photo** selected, the brush paints everywhere, as before. The chip on the canvas names the active section, and its mask is drawn over the photo. A section also stays off any backdrop the cutout has already cleared. Sections and ridge edits belong to the current photo and are cleared with it.
- **Stay inside lines** (S) is a paint assist, separate from the wand. While the brush, highlight, eraser, lasso, or mask tool is selected, **Stay inside lines** and **Hug** sit with that tool: on the left for the brush, highlight, and eraser, and on the Sections tab for the lasso and mask. The stroke or path is nudged so it hugs sculpt ridges. Brush, highlight, and eraser also hug the active section. Lasso and mask hug that section while you add or subtract, and only the sculpt ridges while the mask tool is set to New. It does not hard-clip the dab. A firm stroke that moves well past a ridge still crosses. **Hug** sets how strongly that nudge pulls. The same edge tolerance as the wand decides which automatic ridges count. Hold **Shift** while drawing to keep one straight line from the pointer-down point to the cursor. The end follows the pointer in any direction. Releasing Shift continues freehand from that end. That covers the brush, highlight, eraser, restore, erase backdrop, lasso, mask, and ridge tools. Stay inside lines steps aside while Shift is held, including the first point.
- **Viewing background**, under the cutout controls, places the miniature on Checker, Black, Grey, White, Green, a custom colour, or a picture you load. It shows through the cutout and is not painted into the miniature. A loaded picture lasts for this session. The colour choice is remembered.
- **Undo** and **redo** apply to paint strokes, to auto highlight, to section fills, to the restore and erase-backdrop brushes, to section mask edits (wand, lasso, mask brush, suggest, and delete), and to ridge edits. **Clear paint** wipes the paint layer and can itself be undone. They do not undo uploads, photo scale, Remove backdrop, the Look slider, the viewing background, rename, labels, theme, or saved schemes.
- The right side has three tabs: **Color**, **Sections**, and **Catalog**. **Color** holds the current color, suggestions, recent swatches, a working palette, and named schemes. **Save scheme** stores the palette in this browser (`localStorage`). If the palette is empty, the save uses the current color and recent swatches.
- **Suggestions**, on Color and Catalog, list the nearest catalog **Base**, **Highlight**, and **Shade** for the current colour. **Section paint** uses the pigment already on the active section when there is some. Clicking a suggestion sets the current colour. Names come from the catalog. A role is left blank when nothing in the catalog is close.
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
| F | Fill the active section (does not change the tool) |
| Shift (hold while drawing) | Straight line from the stroke start to the cursor |
| R | Restore photo |
| X | Erase backdrop |
| W | Magic wand (new, add, or subtract a section) |
| L | Lasso |
| M | Mask brush |
| S | Stay inside lines |
| Space (hold) | Pan |
| Scroll | View zoom toward the pointer (not photo scale) |
| [ and ] | Size for the active stroke tool, including Highlight (Shift for larger steps) |
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
- `src/lib/constrain.ts` — Shift straight-line strokes
- `src/lib/color.ts` — hex colours and the lighter highlight mix
- `src/lib/autoHighlight.ts` — ridge coverage for Auto highlight
- `src/lib/suggest.ts` — catalog base, highlight, and shade matches
- `src/lib/backdrop.ts` — viewing-background presets
- `src/lib/tint.ts` — luminance shading of the paint coat, and the photo-to-paint look
- `src/roadmap.ts` — features that are listed and **not** built yet
- `fixtures/stormcast-acceptance.jpg` — grey unpainted Stormcast (axe, shield, halo helm on white), 1600×1200. Acceptance photo for wand, auto highlight, suggestions, look, and viewing background. Upload it; the app does not load it on its own.

Theme colors are CSS variables on `:root` (dark) and `:root[data-theme="light"]`.

## Later

These are tracked in `src/roadmap.ts` and called out with `TODO(...)` comments next to the code they would extend. They are **not** implemented:

- Lighting presets
- Paint mix by ratio
- 2×2 multi-angle photo layout
- In-app tutorial (near the end)
- Optional STL viewing

The working palette is still colours you pick or save. The catalog is a separate list of named paints.
