import { photoScaleToSlider, sliderToPhotoScale } from '../lib/photoScale'
import {
  IconBrush,
  IconEraser,
  IconEyedropper,
  IconHand,
  IconRedo,
  IconUndo,
} from './Icons'
import type { Tool } from '../types'

type ToolStripProps = {
  tool: Tool
  brushSize: number
  opacity: number
  canUndo: boolean
  canRedo: boolean
  hasImage: boolean
  contentScale: number
  cutoutStrength: number
  cutoutActive: boolean
  cutoutBusy: boolean
  onTool: (tool: Tool) => void
  onBrushSize: (size: number) => void
  onOpacity: (opacity: number) => void
  onUndo: () => void
  onRedo: () => void
  onPhotoScale: (scale: number) => void
  onAutoScale: () => void
  onFitView: () => void
  onCutoutStrength: (strength: number) => void
  onRemoveBackdrop: () => void
  onRepairCutout: () => void
  onResetCutout: () => void
  edgeSnap: boolean
  snapStrength: number
  onEdgeSnap: (enabled: boolean) => void
  onSnapStrength: (strength: number) => void
}

const TOOLS: { id: Tool; label: string; shortcut: string; icon: typeof IconBrush }[] = [
  { id: 'brush', label: 'Brush', shortcut: 'B', icon: IconBrush },
  { id: 'eraser', label: 'Eraser', shortcut: 'E', icon: IconEraser },
  { id: 'eyedropper', label: 'Eyedropper', shortcut: 'I', icon: IconEyedropper },
  { id: 'pan', label: 'Pan', shortcut: 'H', icon: IconHand },
]

export function ToolStrip({
  tool,
  brushSize,
  opacity,
  canUndo,
  canRedo,
  hasImage,
  contentScale,
  cutoutStrength,
  cutoutActive,
  cutoutBusy,
  onTool,
  onBrushSize,
  onOpacity,
  onUndo,
  onRedo,
  onPhotoScale,
  onAutoScale,
  onFitView,
  onCutoutStrength,
  onRemoveBackdrop,
  onRepairCutout,
  onResetCutout,
  edgeSnap,
  snapStrength,
  onEdgeSnap,
  onSnapStrength,
}: ToolStripProps) {
  return (
    <aside className="toolstrip" aria-label="Tools">
      <div className="tool-group" role="toolbar" aria-label="Paint tools">
        {TOOLS.map((entry) => {
          const Icon = entry.icon
          return (
            <button
              key={entry.id}
              type="button"
              className="tool-btn"
              aria-pressed={tool === entry.id}
              aria-label={entry.label}
              aria-keyshortcuts={entry.shortcut}
              title={`${entry.label} (${entry.shortcut})`}
              onClick={() => onTool(entry.id)}
            >
              <Icon />
            </button>
          )
        })}
      </div>
      <label className="tool-slider">
        <span>Size</span>
        <input
          type="range"
          min={1}
          max={160}
          step={1}
          value={brushSize}
          aria-label="Brush size"
          onChange={(event) => onBrushSize(Number(event.target.value))}
        />
        <span className="slider-value">{Math.round(brushSize)} px</span>
      </label>
      <label className="tool-slider">
        <span>Opacity</span>
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.01}
          value={opacity}
          aria-label="Brush opacity"
          onChange={(event) => onOpacity(Number(event.target.value))}
        />
        <span className="slider-value">{Math.round(opacity * 100)}%</span>
      </label>
      <section className="photo-block" aria-label="Stay inside lines">
        <h2>Assist</h2>
        <label className="edge-toggle">
          <input
            type="checkbox"
            checked={edgeSnap}
            onChange={(event) => onEdgeSnap(event.target.checked)}
          />
          <span>Stay inside lines</span>
        </label>
        <label className="tool-slider">
          <span>Hug</span>
          <input
            type="range"
            min={25}
            max={100}
            step={1}
            value={Math.round(snapStrength * 100)}
            aria-label="Edge hug strength"
            disabled={!edgeSnap}
            onChange={(event) => onSnapStrength(Number(event.target.value) / 100)}
          />
          <span className="slider-value">{Math.round(snapStrength * 100)}%</span>
        </label>
        <p className="tool-note">
          Softly hugs sculpt ridges and the active section. A firm stroke can still cross. S toggles it. The wand still selects plates.
        </p>
      </section>
      <div className="history-row">
        <button
          type="button"
          className="tool-btn"
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          onClick={onUndo}
          disabled={!canUndo}
        >
          <IconUndo />
        </button>
        <button
          type="button"
          className="tool-btn"
          aria-label="Redo"
          title="Redo (Ctrl+Shift+Z)"
          onClick={onRedo}
          disabled={!canRedo}
        >
          <IconRedo />
        </button>
      </div>
      <section className="photo-block" aria-label="Photo scale and backdrop">
        <h2>Photo</h2>
        <label className="tool-slider">
          <span>Photo scale</span>
          <input
            type="range"
            min={0}
            max={1000}
            step={1}
            value={photoScaleToSlider(contentScale)}
            aria-label="Photo scale"
            aria-valuetext={`${Math.round(contentScale * 100)} percent`}
            disabled={!hasImage}
            onChange={(event) => onPhotoScale(sliderToPhotoScale(Number(event.target.value)))}
          />
          <span className="slider-value">{Math.round(contentScale * 100)}%</span>
        </label>
        <p className="tool-note">Resizes the picture. View zoom is the View % chip.</p>
        <div className="tool-actions">
          <button
            type="button"
            className="btn"
            title="Fit the picture in the canvas (Shift+0). Sets photo scale, then frames the view."
            onClick={onAutoScale}
            disabled={!hasImage}
          >
            Auto
          </button>
          <button
            type="button"
            className="btn"
            title="Frame the picture (0). Does not change photo scale."
            onClick={onFitView}
            disabled={!hasImage}
          >
            Fit view
          </button>
        </div>
        <label className="tool-slider">
          <span>Cutout strength</span>
          <input
            type="range"
            min={1}
            max={100}
            step={1}
            value={cutoutStrength}
            aria-label="Cutout strength"
            disabled={!hasImage || cutoutBusy}
            onChange={(event) => onCutoutStrength(Number(event.target.value))}
          />
          <span className="slider-value">{Math.round(cutoutStrength)}</span>
        </label>
        <p className="tool-note">
          {cutoutActive
            ? 'Drag to tune. Reset restores the photo. Paint stays on the miniature.'
            : 'Clears the backdrop and white gaps, then fills small holes in the miniature.'}
        </p>
        <button
          type="button"
          className="btn btn-block"
          onClick={onRemoveBackdrop}
          disabled={!hasImage || cutoutBusy}
          aria-busy={cutoutBusy}
        >
          {cutoutBusy ? 'Working…' : 'Remove backdrop'}
        </button>
        <button
          type="button"
          className="btn btn-block"
          onClick={onRepairCutout}
          disabled={!hasImage || cutoutBusy}
        >
          Repair cutout
        </button>
        <button
          type="button"
          className="btn btn-block"
          aria-pressed={tool === 'restore'}
          title="Paint the original photo back (R). Uses Size and Opacity."
          onClick={() => onTool('restore')}
          disabled={!hasImage}
        >
          Restore photo
        </button>
        <button
          type="button"
          className="btn btn-block"
          aria-pressed={tool === 'eraseBackdrop'}
          title="Erase leftover backdrop (X). Uses Size and Opacity."
          onClick={() => onTool('eraseBackdrop')}
          disabled={!hasImage}
        >
          Erase backdrop
        </button>
        <p className="tool-note">Restore photo fixes over-cut armour. Erase backdrop clears leftover white. Both undo.</p>
        <button type="button" className="btn btn-block" onClick={onResetCutout} disabled={!cutoutActive || cutoutBusy}>
          Reset cutout
        </button>
      </section>
    </aside>
  )
}
