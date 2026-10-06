import { VIEW_SLOTS, viewSlotById, type ViewRecord, type ViewSlotId } from '../lib/views'

type ViewSlotsProps = {
  active: ViewSlotId
  views: Record<ViewSlotId, ViewRecord>
  onSelect: (id: ViewSlotId) => void
  onUpload: (id: ViewSlotId) => void
}

export function ViewSlots({ active, views, onSelect, onUpload }: ViewSlotsProps) {
  const activeLabel = viewSlotById(active).label
  return (
    <div className="view-slots">
      <div className="view-slots-head">
        <h2>Views</h2>
        <p>Painting {activeLabel}</p>
      </div>
      <div className="view-slot-grid" role="group" aria-label="Photo views">
        {VIEW_SLOTS.map((slot) => {
          const view = views[slot.id]
          const selected = slot.id === active
          return (
            <div
              key={slot.id}
              className={selected ? 'view-slot is-active' : 'view-slot'}
              data-view-slot={slot.id}
              data-painted={view.history.hasPaint ? 'true' : 'false'}
            >
              <button
                type="button"
                className="view-slot-hit"
                aria-pressed={selected}
                onClick={() => onSelect(slot.id)}
              >
                <span className="view-slot-thumb">
                  {view.image ? (
                    <img src={view.image.url} alt="" />
                  ) : (
                    <span className="view-slot-placeholder">Empty</span>
                  )}
                </span>
                <span className="view-slot-copy">
                  <span className="view-slot-label">{slot.label}</span>
                  <span className="view-slot-meta">{view.image ? view.image.name : 'No photo yet'}</span>
                  {view.history.hasPaint && <span className="view-slot-badge">Painted</span>}
                </span>
              </button>
              <button
                type="button"
                className="btn view-slot-upload"
                aria-label={view.image ? `Replace ${slot.label}` : `Upload ${slot.label}`}
                onClick={() => onUpload(slot.id)}
              >
                {view.image ? 'Replace' : 'Upload'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
