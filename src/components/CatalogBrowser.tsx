import { useMemo, useState } from 'react'
import { displayHex } from '../lib/color'
import {
  RANGE_LABEL,
  channels,
  filterPaints,
  lineNote,
  paintById,
  similarPaints,
  type CatalogPaint,
  type PaintRangeId,
} from '../lib/catalog'
import { PaintSuggestions } from './PaintSuggestions'

type CatalogBrowserProps = {
  pickedId: string | null
  onPick: (paint: CatalogPaint) => void
  suggestionHex: string
  suggestionSource: 'current' | 'section'
  sectionPaintAvailable: boolean
  preferRange: PaintRangeId | null
  onSuggestionSource: (source: 'current' | 'section') => void
}

const RANGES: { id: PaintRangeId | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'citadel', label: 'Citadel' },
  { id: 'vallejo', label: 'Vallejo' },
  { id: 'army-painter', label: 'Army Painter' },
  { id: 'two-thin-coats', label: 'Two Thin Coats' },
]

export function CatalogBrowser({
  pickedId,
  onPick,
  suggestionHex,
  suggestionSource,
  sectionPaintAvailable,
  preferRange,
  onSuggestionSource,
}: CatalogBrowserProps) {
  const [query, setQuery] = useState('')
  const [range, setRange] = useState<PaintRangeId | 'all'>('all')
  const paints = useMemo(() => filterPaints(query, range), [query, range])
  const picked = pickedId ? paintById(pickedId) : null

  return (
    <section className="panel-section catalog" aria-label="Paint catalog">
      <PaintSuggestions
        baseHex={suggestionHex}
        source={suggestionSource}
        sectionAvailable={sectionPaintAvailable}
        preferRange={preferRange}
        onSource={onSuggestionSource}
        onPick={onPick}
      />
      <h2>Paint catalog</h2>
      <p className="hint">
        Approximate screen colours for preview. Coverage and finish describe the product, not a review score.
        Similar paints are public chart neighbours.
      </p>
      <input
        className="hex-input catalog-search"
        type="search"
        value={query}
        placeholder="Search name, line, or code"
        aria-label="Search paints"
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="catalog-filters" role="radiogroup" aria-label="Paint range">
        {RANGES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="btn catalog-chip"
            role="radio"
            aria-checked={range === entry.id}
            onClick={() => setRange(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {paints.length === 0 ? (
        <p className="hint">No paints match that.</p>
      ) : (
        <ul className="catalog-list">
          {paints.map((paint) => {
            const [red, green, blue] = channels(paint.hex)
            return (
              <li key={paint.id}>
                <button
                  type="button"
                  className="catalog-row"
                  aria-current={paint.id === pickedId}
                  aria-label={`Use ${paint.name}, ${RANGE_LABEL[paint.range]} ${paint.line}`}
                  onClick={() => onPick(paint)}
                >
                  <span className="swatch" style={{ background: paint.hex }} aria-hidden="true" />
                  <span className="catalog-copy">
                    <span className="catalog-name">{paint.name}</span>
                    <span className="catalog-meta">
                      {RANGE_LABEL[paint.range]} · {paint.line}
                      {paint.code ? ` · ${paint.code}` : ''} · RGB {red} {green} {blue}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {picked && <PaintDetail paint={picked} onPick={onPick} />}
    </section>
  )
}

function PaintDetail({ paint, onPick }: { paint: CatalogPaint; onPick: (paint: CatalogPaint) => void }) {
  const [red, green, blue] = channels(paint.hex)
  const cousins = similarPaints(paint)
  const about = lineNote(paint)
  return (
    <div className="catalog-detail">
      <p className="catalog-detail-name">
        {paint.name}
        <span>
          {RANGE_LABEL[paint.range]} · {paint.line}
          {paint.code ? ` · ${paint.code}` : ''}
        </span>
      </p>
      <p className="catalog-meta">
        {paint.finish} · {paint.coverage} · {displayHex(paint.hex)} · RGB {red} {green} {blue}
      </p>
      {about && <p className="hint">{about}</p>}
      {paint.note && <p className="hint">{paint.note}</p>}
      {cousins.length > 0 && (
        <div className="catalog-similar">
          <span className="catalog-meta">Similar</span>
          {cousins.map((other) => (
            <button key={other.id} type="button" className="btn catalog-chip" onClick={() => onPick(other)}>
              <i style={{ background: other.hex }} aria-hidden="true" />
              {other.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
