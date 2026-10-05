import { SECTION_PRESETS, presetLabel } from '../lib/sections'
import type { MaskMode, SectionCategory, SectionInfo, Tool } from '../types'
import { IconEye, IconEyeOff, IconLock, IconTrash, IconUnlock } from './Icons'

type SectionPanelProps = {
  hasImage: boolean
  tool: Tool
  sections: SectionInfo[]
  activeId: string | null
  maskMode: MaskMode
  tolerance: number
  proposeBusy: boolean
  onTool: (tool: Tool) => void
  onMaskMode: (mode: MaskMode) => void
  onTolerance: (value: number) => void
  onSelect: (id: string | null) => void
  onRename: (id: string, name: string) => void
  onCategory: (id: string, category: SectionCategory, customLabel: string) => void
  onVisible: (id: string, visible: boolean) => void
  onLocked: (id: string, locked: boolean) => void
  onDelete: (id: string) => void
  onPropose: () => void
}

const SECTION_TOOLS: { id: Tool; label: string; shortcut: string }[] = [
  { id: 'wand', label: 'Wand', shortcut: 'W' },
  { id: 'lasso', label: 'Lasso', shortcut: 'L' },
  { id: 'maskBrush', label: 'Mask', shortcut: 'M' },
]

const MASK_MODES: { id: MaskMode; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'add', label: 'Add' },
  { id: 'subtract', label: 'Subtract' },
]

export function SectionPanel({
  hasImage,
  tool,
  sections,
  activeId,
  maskMode,
  tolerance,
  proposeBusy,
  onTool,
  onMaskMode,
  onTolerance,
  onSelect,
  onRename,
  onCategory,
  onVisible,
  onLocked,
  onDelete,
  onPropose,
}: SectionPanelProps) {
  const active = sections.find((section) => section.id === activeId) ?? null
  const activeName = active ? active.name.trim() || 'Untitled section' : null
  let status = 'The brush paints the whole photo.'
  if (!hasImage) status = 'Load a photo, then trace a region.'
  else if (active?.locked) status = `${activeName} is locked. Unlock it to paint or edit the mask.`
  else if (active) status = `Brush and eraser stay inside ${activeName}.`

  return (
    <aside className="sections-panel" aria-label="Sections">
      <div className="section-head">
        <h2>Sections</h2>
      </div>
      <p className="section-status">{status}</p>
      <div className="segmented" role="group" aria-label="Section tools">
        {SECTION_TOOLS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="btn"
            aria-pressed={tool === entry.id}
            title={`${entry.label} (${entry.shortcut})`}
            disabled={!hasImage}
            onClick={() => onTool(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className="segmented" role="radiogroup" aria-label="How the mask tool writes">
        {MASK_MODES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="btn"
            role="radio"
            aria-checked={maskMode === entry.id}
            disabled={!hasImage}
            onClick={() => onMaskMode(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {tool === 'wand' && (
        <label className="tool-slider section-tolerance">
          <span>Edge tolerance</span>
          <input
            type="range"
            min={0}
            max={120}
            step={1}
            value={tolerance}
            aria-label="Wand tolerance"
            disabled={!hasImage}
            onChange={(event) => onTolerance(Number(event.target.value))}
          />
          <span className="slider-value">{tolerance}</span>
        </label>
      )}
      <p className="tool-note">
        Edge-aware wand. It grows across a plate and stops at a sculpt edge, so a shade ramp stays one region.
        New starts a section. Add and Subtract edit the active one. Suggest uses the same edges.
      </p>
      <button
        type="button"
        className="btn btn-block"
        onClick={onPropose}
        disabled={!hasImage || proposeBusy}
        aria-busy={proposeBusy}
      >
        {proposeBusy ? 'Working…' : 'Suggest regions'}
      </button>
      <div className="section-scroll">
      <button
        type="button"
        className={activeId === null ? 'section-card is-active' : 'section-card'}
        aria-pressed={activeId === null}
        disabled={!hasImage}
        onClick={() => onSelect(null)}
      >
        <span className="section-badge is-whole" aria-hidden="true" />
        <span className="section-card-copy">
          <span className="section-card-name">Whole photo</span>
          <span className="section-card-meta">Brush covers the photo</span>
        </span>
      </button>
      {sections.length === 0 ? (
        <p className="hint">No sections yet.</p>
      ) : (
        <ul className="section-list">
          {sections.map((section) => {
            const label = presetLabel(section.category, section.customLabel)
            const selected = section.id === activeId
            return (
              <li
                key={section.id}
                className={selected ? 'section-card is-active' : 'section-card'}
                onClick={() => onSelect(section.id)}
              >
                <div className="section-fields">
                  <div className="layer-name-line">
                    <span
                      className="layer-swatch"
                      style={{ background: section.color }}
                      aria-hidden="true"
                    />
                    <input
                      className="section-name"
                      value={section.name}
                      maxLength={40}
                      aria-label={`Name for ${section.name || 'section'}`}
                      spellCheck={false}
                      onFocus={() => onSelect(section.id)}
                      onChange={(event) => onRename(section.id, event.target.value)}
                    />
                  </div>
                  <div className="section-label-row">
                    <select
                      aria-label={`Category for ${section.name || 'section'}`}
                      value={section.category}
                      onFocus={() => onSelect(section.id)}
                      onChange={(event) =>
                        onCategory(section.id, event.target.value as SectionCategory, section.customLabel)
                      }
                    >
                      {SECTION_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                    {section.category === 'custom' && (
                      <input
                        className="section-custom"
                        value={section.customLabel}
                        maxLength={40}
                        placeholder="Custom label"
                        aria-label={`Custom label for ${section.name || 'section'}`}
                        spellCheck={false}
                        onFocus={() => onSelect(section.id)}
                        onChange={(event) => onCategory(section.id, 'custom', event.target.value)}
                      />
                    )}
                  </div>
                  {label && section.category !== 'custom' && <span className="section-card-meta">{label}</span>}
                </div>
                <div className="section-actions">
                  <button
                    type="button"
                    className="icon-button"
                    aria-pressed={section.visible}
                    aria-label={section.visible ? `Hide ${section.name} mask` : `Show ${section.name} mask`}
                    title={section.visible ? 'Hide mask highlight' : 'Show mask highlight'}
                    onClick={() => onVisible(section.id, !section.visible)}
                  >
                    {section.visible ? <IconEye /> : <IconEyeOff />}
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-pressed={section.locked}
                    aria-label={section.locked ? `Unlock ${section.name}` : `Lock ${section.name}`}
                    title={section.locked ? 'Unlock section' : 'Lock section'}
                    onClick={() => onLocked(section.id, !section.locked)}
                  >
                    {section.locked ? <IconLock /> : <IconUnlock />}
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Delete ${section.name || 'section'}`}
                    title="Delete section"
                    onClick={() => onDelete(section.id)}
                  >
                    <IconTrash />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      </div>
    </aside>
  )
}
