import { useEffect, useState } from 'react'
import { displayHex, normalizeHex } from '../lib/color'
import { RANGE_LABEL, type CatalogPaint, type PaintRangeId } from '../lib/catalog'
import { ROADMAP } from '../roadmap'
import type { ColorScheme, SchemeColor } from '../types'
import { IconPlus, IconTrash } from './Icons'
import { PaintSuggestions } from './PaintSuggestions'

type ColorPanelProps = {
  color: string
  recent: string[]
  palette: SchemeColor[]
  schemes: ColorScheme[]
  onColor: (hex: string) => void
  onRemember: (hex: string) => void
  onAdd: () => void
  onLabel: (id: string, label: string) => void
  onRemove: (id: string) => void
  onSave: () => void
  onLoad: (scheme: ColorScheme) => void
  onAskDelete: (scheme: ColorScheme) => void
  pickedPaint: CatalogPaint | null
  suggestionHex: string
  suggestionSource: 'current' | 'section'
  sectionPaintAvailable: boolean
  preferRange: PaintRangeId | null
  onSuggestionSource: (source: 'current' | 'section') => void
  onPickPaint: (paint: CatalogPaint) => void
  undercoat: boolean
  undercoatStrength: number
  onUndercoat: (enabled: boolean) => void
  onUndercoatStrength: (strength: number) => void
}

function formatSaved(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(timestamp)
}

export function ColorPanel({
  color,
  recent,
  palette,
  schemes,
  onColor,
  onRemember,
  onAdd,
  onLabel,
  onRemove,
  onSave,
  onLoad,
  onAskDelete,
  pickedPaint,
  suggestionHex,
  suggestionSource,
  sectionPaintAvailable,
  preferRange,
  onSuggestionSource,
  onPickPaint,
  undercoat,
  undercoatStrength,
  onUndercoat,
  onUndercoatStrength,
}: ColorPanelProps) {
  const [hexDraft, setHexDraft] = useState(displayHex(color))

  useEffect(() => {
    setHexDraft(displayHex(color))
  }, [color])

  const commitHex = () => {
    const next = normalizeHex(hexDraft)
    if (!next) {
      setHexDraft(displayHex(color))
      return
    }
    onColor(next)
    onRemember(next)
  }

  const alreadyInPalette = palette.some((entry) => entry.hex === color)

  return (
    <aside className="panel" aria-label="Colors">
      <section className="panel-section">
        <h2>Color</h2>
        <label className="current-color">
          <input
            type="color"
            value={color}
            aria-label="Current color"
            onChange={(event) => {
              const next = normalizeHex(event.target.value)
              if (next) onColor(next)
            }}
            onBlur={() => onRemember(color)}
          />
          <span className="current-swatch" style={{ background: color }} />
        </label>
        {pickedPaint && pickedPaint.hex === color && (
          <p className="hint catalog-picked">
            {pickedPaint.name} · {RANGE_LABEL[pickedPaint.range]} {pickedPaint.line}
          </p>
        )}
        <form
          className="hex-row"
          onSubmit={(event) => {
            event.preventDefault()
            commitHex()
          }}
        >
          <input
            className="hex-input"
            value={hexDraft}
            spellCheck={false}
            aria-label="Hex color"
            onChange={(event) => setHexDraft(event.target.value)}
            onBlur={commitHex}
          />
        </form>
      </section>

      <section className="panel-section" aria-label="Undercoat">
        <h2>Undercoat</h2>
        <label className="edge-toggle">
          <input
            type="checkbox"
            checked={undercoat}
            aria-label="Undercoat"
            onChange={(event) => onUndercoat(event.target.checked)}
          />
          <span>Undercoat</span>
        </label>
        <label className="tool-slider">
          <span>Strength</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(undercoatStrength * 100)}
            aria-label="Undercoat strength"
            disabled={!undercoat}
            onChange={(event) => onUndercoatStrength(Number(event.target.value) / 100)}
          />
          <span className="slider-value">{Math.round(undercoatStrength * 100)}</span>
        </label>
        <p className="hint">
          On: the next brush, fill, or highlight is shadowed by the paint already on those pixels. Off: a clean coat.
        </p>
      </section>

      <PaintSuggestions
        baseHex={suggestionHex}
        source={suggestionSource}
        sectionAvailable={sectionPaintAvailable}
        preferRange={preferRange}
        onSource={onSuggestionSource}
        onPick={onPickPaint}
      />

      <section className="panel-section">
        <h2>Recent</h2>
        <div className="swatches">
          {recent.map((hex) => (
            <button
              key={hex}
              type="button"
              className="swatch"
              style={{ background: hex }}
              aria-label={`Use ${displayHex(hex)}`}
              aria-current={hex === color}
              onClick={() => {
                onColor(hex)
                onRemember(hex)
              }}
            />
          ))}
        </div>
      </section>

      <section className="panel-section">
        <div className="section-head">
          <h2>Palette</h2>
          <button type="button" className="text-button" onClick={onSave}>
            Save scheme
          </button>
        </div>
        <p className="hint">
          Add colors, optionally label them, then save a named scheme in this browser.
        </p>
        {/* Palette labels stay free text. Armour, trim, undersuit, details, and custom labels live on sections. */}
        {/* TODO(paint-mix): mix two paints by ratio. */}
        <button type="button" className="btn add-color" onClick={onAdd} disabled={alreadyInPalette}>
          <IconPlus />
          {alreadyInPalette ? 'Already in palette' : 'Add current color'}
        </button>
        {palette.length === 0 ? (
          <p className="hint">The palette is empty. Saving will use the current color and recent swatches.</p>
        ) : (
          <ul className="palette-list">
            {palette.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className="swatch"
                  style={{ background: entry.hex }}
                  aria-label={`Use ${displayHex(entry.hex)}`}
                  aria-current={entry.hex === color}
                  onClick={() => {
                    onColor(entry.hex)
                    onRemember(entry.hex)
                  }}
                />
                <input
                  value={entry.label}
                  placeholder="Label"
                  aria-label={`Label for ${displayHex(entry.hex)}`}
                  maxLength={40}
                  onChange={(event) => onLabel(entry.id, event.target.value)}
                />
                <code>{displayHex(entry.hex)}</code>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove ${displayHex(entry.hex)}`}
                  onClick={() => onRemove(entry.id)}
                >
                  <IconTrash />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel-section">
        <h2>Saved schemes</h2>
        {schemes.length === 0 ? (
          <p className="hint">No saved schemes yet.</p>
        ) : (
          <ul className="scheme-list">
            {schemes.map((scheme) => (
              <li key={scheme.id}>
                <button type="button" className="scheme-load" onClick={() => onLoad(scheme)}>
                  <span className="scheme-dots" aria-hidden="true">
                    {scheme.colors.slice(0, 6).map((entry) => (
                      <i key={entry.id} style={{ background: entry.hex }} />
                    ))}
                  </span>
                  <span className="scheme-copy">
                    <span className="scheme-name">{scheme.name}</span>
                    <span className="scheme-meta">
                      {scheme.colors.length} {scheme.colors.length === 1 ? 'color' : 'colors'} ·{' '}
                      {formatSaved(scheme.updatedAt)}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Delete ${scheme.name}`}
                  onClick={() => onAskDelete(scheme)}
                >
                  <IconTrash />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="later">
        <summary>Not in this version</summary>
        <ul>
          {ROADMAP.map((item) => (
            <li key={item.id}>
              <strong>{item.title}.</strong> {item.note}
            </li>
          ))}
        </ul>
      </details>
    </aside>
  )
}
