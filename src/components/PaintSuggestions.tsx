import { useMemo } from 'react'
import { RANGE_LABEL, type CatalogPaint, type PaintRangeId } from '../lib/catalog'
import { suggestPaints } from '../lib/suggest'

type PaintSuggestionsProps = {
  baseHex: string
  source: 'current' | 'section'
  sectionAvailable: boolean
  preferRange: PaintRangeId | null
  onSource: (source: 'current' | 'section') => void
  onPick: (paint: CatalogPaint) => void
}

const MISSING: Record<'base' | 'highlight' | 'shade', string> = {
  base: 'No close catalog paint.',
  highlight: 'No lighter catalog paint is close.',
  shade: 'No close wash in the catalog.',
}

export function PaintSuggestions({
  baseHex,
  source,
  sectionAvailable,
  preferRange,
  onSource,
  onPick,
}: PaintSuggestionsProps) {
  const ideas = useMemo(() => suggestPaints(baseHex, preferRange), [baseHex, preferRange])
  const usingSection = source === 'section' && sectionAvailable
  const rows = [
    ['base', 'Base', ideas.base],
    ['highlight', 'Highlight', ideas.highlight],
    ['shade', 'Shade', ideas.shade],
  ] as const

  return (
    <section className="panel-section suggestions" aria-label="Suggested paints">
      <h2>Suggestions</h2>
      <p className="hint">Nearest catalog paints for this colour. Click one to use it as the current colour.</p>
      <div className="catalog-filters" role="radiogroup" aria-label="Suggestion source">
        <button
          type="button"
          className="btn catalog-chip"
          role="radio"
          aria-checked={!usingSection}
          onClick={() => onSource('current')}
        >
          Current colour
        </button>
        <button
          type="button"
          className="btn catalog-chip"
          role="radio"
          aria-checked={usingSection}
          disabled={!sectionAvailable}
          title={sectionAvailable ? 'Use the paint already on the active section' : 'Paint a section first'}
          onClick={() => onSource('section')}
        >
          Section paint
        </button>
      </div>
      <p className="hint suggestion-from">
        <i className="suggestion-base" style={{ background: baseHex }} aria-hidden="true" />
        {usingSection ? 'Matching the paint in the active section.' : 'Matching the current colour.'}
      </p>
      <ul className="suggestion-list">
        {rows.map(([role, label, paint]) =>
          paint ? (
            <li key={role}>
              <button
                type="button"
                className="catalog-row suggestion-row"
                aria-label={`Use ${paint.name} as the ${label.toLowerCase()}`}
                onClick={() => onPick(paint)}
              >
                <span className="swatch" style={{ background: paint.hex }} aria-hidden="true" />
                <span className="catalog-copy">
                  <span className="catalog-name">
                    {label} · {paint.name}
                  </span>
                  <span className="catalog-meta">
                    {RANGE_LABEL[paint.range]} · {paint.line}
                  </span>
                </span>
              </button>
            </li>
          ) : (
            <li key={role} className="hint suggestion-missing">
              {label}: {MISSING[role]}
            </li>
          ),
        )}
      </ul>
    </section>
  )
}
