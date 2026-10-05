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
- **Undo** and **redo** apply to paint strokes and to the restore and erase-backdrop brushes. **Clear paint** wipes the paint layer and can itself be undone. They do not undo uploads, photo scale, Remove backdrop, theme, or saved schemes.
- The right panel holds the current color, recent swatches, a working palette, and named schemes. **Save scheme** stores the palette in this browser (`localStorage`). If the palette is empty, the save uses the current color and recent swatches.
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
- `src/lib/paintSurface.ts` — photo scale, cutout, view pan/zoom, and the paint canvas
- `src/lib/photoScale.ts` — photo scale limits and fit math
- `src/lib/cutout.ts` — offline backdrop removal
- `src/lib/paint.ts` — stroke drawing and undo projection
- `src/lib/tint.ts` — luminance shading of the paint coat
- `src/roadmap.ts` — features that are listed and **not** built yet

Theme colors are CSS variables on `:root` (dark) and `:root[data-theme="light"]`.

## Later

These are tracked in `src/roadmap.ts` and called out with `TODO(...)` comments next to the code they would extend. They are **not** implemented:

- Custom viewing backgrounds after a cutout
- Edge and section layers with editable regions
- Suggested paints and highlights from a base color
- Part categories: armour plates, trim, undersuit/joints, details, and custom labels per model
- A major paint catalog (Citadel and others) with quality and comparison notes
- Lighting presets
- Paint mix by ratio
- 2×2 multi-angle photo layout
- In-app tutorial (near the end)
- Optional STL viewing

V1 swatches are ordinary colors you pick or save. They are not a paint-range catalog.
