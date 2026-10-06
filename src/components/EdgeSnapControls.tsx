type EdgeSnapControlsProps = {
  edgeSnap: boolean
  snapStrength: number
  onEdgeSnap: (enabled: boolean) => void
  onSnapStrength: (strength: number) => void
}

export function EdgeSnapControls({
  edgeSnap,
  snapStrength,
  onEdgeSnap,
  onSnapStrength,
}: EdgeSnapControlsProps) {
  return (
    <section className="edge-snap" aria-label="Stay inside lines">
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
        Hugs sculpt ridges, and the active section when you are adding or subtracting. A firm stroke can still cross. S toggles it.
      </p>
    </section>
  )
}
