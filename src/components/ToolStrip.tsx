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
  onTool: (tool: Tool) => void
  onBrushSize: (size: number) => void
  onOpacity: (opacity: number) => void
  onUndo: () => void
  onRedo: () => void
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
  onTool,
  onBrushSize,
  onOpacity,
  onUndo,
  onRedo,
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
      <div className="history-row">
        <button
          type="button"
          className="tool-btn"
          aria-label="Undo paint stroke"
          title="Undo (Ctrl+Z)"
          onClick={onUndo}
          disabled={!canUndo}
        >
          <IconUndo />
        </button>
        <button
          type="button"
          className="tool-btn"
          aria-label="Redo paint stroke"
          title="Redo (Ctrl+Shift+Z)"
          onClick={onRedo}
          disabled={!canRedo}
        >
          <IconRedo />
        </button>
      </div>
    </aside>
  )
}
