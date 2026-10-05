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
- **Brush**, **eraser**, and **eyedropper** paint a layer above the photo. The photo pixels are not edited.
- **Pan** (or hold Space, or use the middle mouse button) and scroll to zoom. **Fit to view** recenters the photo.
- Brush **size** and **opacity** sit in the left tool strip. Size is in screen pixels, so it stays steady while you zoom.
- **Undo** and **redo** apply to paint strokes. **Clear paint** wipes the layer and can itself be undone. They do not undo uploads, theme, or saved schemes.
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
| Space (hold) | Pan |
| Scroll | Zoom toward the pointer |
| [ and ] | Brush size (Shift for larger steps) |
| Ctrl/Cmd+Z | Undo |
| Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y | Redo |
| 0 | Fit to view |

## Project layout

- `src/App.tsx` — shell, upload, theme, and scheme actions
- `src/components/` — top bar, tool strip, canvas, color panel
- `src/lib/paintSurface.ts` — pan/zoom and the paint canvas
- `src/lib/paint.ts` — stroke drawing and undo projection
- `src/roadmap.ts` — features that are listed and **not** built yet

Theme colors are CSS variables on `:root` (dark) and `:root[data-theme="light"]`.

## Later

These are tracked in `src/roadmap.ts` and called out with `TODO(...)` comments next to the code they would extend. They are **not** implemented:

- Manual image scale and auto-fit for photos with one side too small
- Background remover (cut the mini out of the table)
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
