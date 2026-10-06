import { BACKDROP_PRESETS } from '../lib/backdrop'
import { photoScaleToSlider, sliderToPhotoScale } from '../lib/photoScale'
import { EdgeSnapControls } from './EdgeSnapControls'
import {
  IconBrush,
  IconEraser,
  IconEyedropper,
  IconFill,
  IconHand,
  IconHighlight,
  IconRedo,
  IconUndo,
} from './Icons'
import type { BackdropChoice, HighlightPigment, Tool } from '../types'

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
  showEdgeSnap: boolean
  onFill: () => void
  highlightPigment: HighlightPigment
  highlightSwatch: string
  highlightBusy: boolean
  onHighlightPigment: (pigment: HighlightPigment) => void
  onAutoHighlight: () => void
  paintLook: number
  onPaintLook: (paintLook: number) => void
  backdrop: BackdropChoice
  backdropColor: string
  backdropImageName: string | null
  onBackdrop: (choice: BackdropChoice) => void
  onBackdropColor: (hex: string) => void
  onBackdropFile: (file: File) => void
  onClearBackdropImage: () => void
}

const TOOLS: { id: Tool; label: string; shortcut: string; icon: typeof IconBrush }[] = [
  { id: 'brush', label: 'Brush', shortcut: 'B', icon: IconBrush },
  { id: 'eraser', label: 'Eraser', shortcut: 'E', icon: IconEraser },
  { id: 'eyedropper', label: 'Eyedropper', shortcut: 'I', icon: IconEyedropper },
  { id: 'pan', label: 'Pan', shortcut: 'H', icon: IconHand },
  { id: 'highlight', label: 'Highlight', shortcut: '', icon: IconHighlight },
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
  showEdgeSnap,
  onFill,
  highlightPigment,
  highlightSwatch,
  highlightBusy,
  onHighlightPigment,
  onAutoHighlight,
  paintLook,
  onPaintLook,
  backdrop,
  backdropColor,
  backdropImageName,
  onBackdrop,
  onBackdropColor,
  onBackdropFile,
  onClearBackdropImage,
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
              title={entry.shortcut ? `${entry.label} (${entry.shortcut})` : entry.label}
              onClick={() => onTool(entry.id)}
            >
              <Icon />
            </button>
          )
        })}
        <button
          type="button"
          className="tool-btn"
          aria-label="Fill"
          title="Fill the active section with the current color (F)"
          disabled={!hasImage}
          onClick={onFill}
        >
          <IconFill />
        </button>
      </div>
      <section className="assist-block" aria-label="Auto highlight">
        <button
          type="button"
          className="btn btn-block"
          onClick={onAutoHighlight}
          disabled={!hasImage || highlightBusy}
          title="Paint raised edges with the highlight colour. Undo removes it."
        >
          {highlightBusy ? 'Working…' : 'Auto highlight'}
        </button>
        <div className="tool-actions" role="radiogroup" aria-label="Highlight colour">
          <button
            type="button"
            className="btn"
            role="radio"
            aria-checked={highlightPigment === 'lighter'}
            aria-pressed={highlightPigment === 'lighter'}
            onClick={() => onHighlightPigment('lighter')}
          >
            Lighter
          </button>
          <button
            type="button"
            className="btn"
            role="radio"
            aria-checked={highlightPigment === 'current'}
            aria-pressed={highlightPigment === 'current'}
            onClick={() => onHighlightPigment('current')}
          >
            Current
          </button>
        </div>
        <p className="tool-note highlight-note">
          <i className="suggestion-base" style={{ background: highlightSwatch }} aria-hidden="true" />
          {highlightPigment === 'lighter'
            ? 'Lighter mix of the current colour, same as the Highlight brush.'
            : 'The current colour, shaded by the photo like the Highlight brush.'}{' '}
          Active section, or the whole miniature. Stay inside lines tightens the band.
        </p>
      </section>
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
      <label className="tool-slider">
        <span>Look</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(paintLook * 100)}
          aria-label="Paint look, from more photo to more paint"
          aria-valuetext={paintLook <= 0.02 ? 'More photo' : paintLook >= 0.98 ? 'More paint' : `${Math.round(paintLook * 100)} percent paint`}
          onChange={(event) => onPaintLook(Number(event.target.value) / 100)}
        />
        <span className="slider-value">{Math.round(paintLook * 100)}</span>
      </label>
      <p className="look-ends" aria-hidden="true">
        <span>More photo</span>
        <span>More paint</span>
      </p>
      <p className="tool-note">
        More photo keeps the picture’s light. More paint strengthens the colour, softens that light, and adds a little texture. The coat underneath does not change.
      </p>
      {showEdgeSnap && (
        <EdgeSnapControls
          edgeSnap={edgeSnap}
          snapStrength={snapStrength}
          onEdgeSnap={onEdgeSnap}
          onSnapStrength={onSnapStrength}
        />
      )}
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
        <h2>Viewing background</h2>
        <p className="tool-note">
          {cutoutActive
            ? 'Shows through the cutout. It is not painted onto the miniature.'
            : 'Choose it now. It shows through once the backdrop is removed.'}
        </p>
        <div className="backdrop-presets" role="radiogroup" aria-label="Viewing background">
          {BACKDROP_PRESETS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="btn catalog-chip backdrop-chip"
              role="radio"
              aria-checked={backdrop === entry.id && !backdropImageName}
              disabled={!hasImage}
              onClick={() => onBackdrop(entry.id)}
            >
              {entry.color && <i style={{ background: entry.color }} aria-hidden="true" />}
              {entry.label}
            </button>
          ))}
        </div>
        <label className="tool-slider">
          <span>Custom colour</span>
          <input
            className="backdrop-color"
            type="color"
            value={backdropColor}
            aria-label="Custom viewing colour"
            disabled={!hasImage}
            onChange={(event) => onBackdropColor(event.target.value)}
          />
        </label>
        <div className="tool-actions">
          <label className={hasImage ? 'btn backdrop-file' : 'btn backdrop-file is-disabled'}>
            Image
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
              aria-label="Load a viewing background image"
              disabled={!hasImage}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) onBackdropFile(file)
              }}
            />
          </label>
          <button type="button" className="btn" onClick={onClearBackdropImage} disabled={!backdropImageName}>
            Clear
          </button>
        </div>
        {backdropImageName && <p className="tool-note">Image: {backdropImageName}. It lasts for this session.</p>}
      </section>
    </aside>
  )
}
