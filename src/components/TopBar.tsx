import { IconMoon, IconSun } from './Icons'
import type { LoadedPhoto, ThemeName } from '../types'

type TopBarProps = {
  theme: ThemeName
  image: LoadedPhoto | null
  viewLabel: string
  canClear: boolean
  cutoutActive: boolean
  onUpload: () => void
  onSave: () => void
  onClear: () => void
  onFit: () => void
  onToggleTheme: () => void
}

export function TopBar({
  theme,
  image,
  viewLabel,
  canClear,
  cutoutActive,
  onUpload,
  onSave,
  onClear,
  onFit,
  onToggleTheme,
}: TopBarProps) {
  const light = theme === 'light'
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <h1>
          Warpaint <span>Studio</span>
        </h1>
      </div>
      <div className="topbar-actions">
        <button type="button" className="btn btn-primary" title={`Upload into ${viewLabel}`} onClick={onUpload}>
          Upload
        </button>
        <button type="button" className="btn" onClick={onSave}>
          Save scheme
        </button>
        <button type="button" className="btn" onClick={onClear} disabled={!canClear}>
          Clear paint
        </button>
        <button
          type="button"
          className="btn"
          onClick={onFit}
          disabled={!image}
          title="Frame the photo in the window. Does not change photo scale."
        >
          Fit view
        </button>
      </div>
      <p className="file-meta" title={image?.name}>
        {image
          ? `${viewLabel} · ${image.name} · ${image.width}×${image.height}${cutoutActive ? ' · cutout' : ''}`
          : `${viewLabel} · no photo`}
      </p>
      <button
        type="button"
        className="icon-button theme-toggle"
        aria-label={light ? 'Switch to dark theme' : 'Switch to light theme'}
        aria-pressed={light}
        title={light ? 'Switch to dark theme' : 'Switch to light theme'}
        onClick={onToggleTheme}
      >
        {light ? <IconSun /> : <IconMoon />}
      </button>
    </header>
  )
}
