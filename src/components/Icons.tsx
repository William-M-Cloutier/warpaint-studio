import type { ReactNode } from 'react'

function Glyph({ children, flip = false }: { children: ReactNode; flip?: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
    >
      {children}
    </svg>
  )
}

export function IconBrush() {
  return (
    <Glyph>
      <path d="M15 5.5 18.5 9" />
      <path d="M14.2 6.2 5.8 15.4a2.1 2.1 0 0 0 3 3L17.2 9.2" />
      <path d="M5.2 19.2c.6-.8 1.5-1.2 2.6-1" />
    </Glyph>
  )
}

export function IconEraser() {
  return (
    <Glyph>
      <path d="M4.5 14.5 11 7l6.5 6.5-4.2 4.2H8.2z" />
      <path d="M9.2 9.6 14.8 15" />
    </Glyph>
  )
}

export function IconEyedropper() {
  return (
    <Glyph>
      <path d="m14 4 6 6" />
      <path d="m13.2 6.2-7 7 3.2 3.2 7-7z" />
      <path d="M6.2 16.2 4 20.5l4.2-2.1" />
    </Glyph>
  )
}

export function IconHighlight() {
  return (
    <Glyph>
      <path d="M5 16.5c2.2-4 4.2-6 7-6s4.8 2 7 6" />
      <path d="M12 6.5v3" />
      <path d="M8.2 8.2 9.6 10" />
      <path d="M15.8 8.2 14.4 10" />
    </Glyph>
  )
}

export function IconFill() {
  return (
    <Glyph>
      <path d="M8 14.5c0 2.2 1.6 3.5 4 3.5s4-1.3 4-3.5c0-2.4-4-6.2-4-6.2s-4 3.8-4 6.2z" />
      <path d="M9.5 5.5 14 9" />
    </Glyph>
  )
}

export function IconHand() {
  return (
    <Glyph>
      <path d="M8 11V7.2a1.4 1.4 0 0 1 2.8 0V11" />
      <path d="M10.8 10.2V6.2a1.4 1.4 0 0 1 2.8 0V11" />
      <path d="M13.6 11V8a1.4 1.4 0 0 1 2.8 0v5.2c0 3.4-1.8 6.3-5.2 6.3h-.8C7.4 19.5 5.5 17.6 5.5 15v-2.2a1.4 1.4 0 0 1 2.5-.8" />
    </Glyph>
  )
}

export function IconUndo() {
  return (
    <Glyph>
      <path d="M4 9h7a5 5 0 1 1 0 10H9" />
      <path d="M7 6 4 9l3 3" />
    </Glyph>
  )
}

export function IconRedo() {
  return (
    <Glyph flip>
      <path d="M4 9h7a5 5 0 1 1 0 10H9" />
      <path d="M7 6 4 9l3 3" />
    </Glyph>
  )
}

export function IconSun() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="3.25" />
      <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M5.8 5.8l1.6 1.6M16.6 16.6l1.6 1.6M18.2 5.8l-1.6 1.6M7.4 16.6l-1.6 1.6" />
    </Glyph>
  )
}

export function IconMoon() {
  return (
    <Glyph>
      <path d="M15.5 3.8A7.8 7.8 0 1 0 20.2 14 6.2 6.2 0 0 1 15.5 3.8z" />
    </Glyph>
  )
}

export function IconTrash() {
  return (
    <Glyph>
      <path d="M4.5 7h15" />
      <path d="M9 7V5h6v2" />
      <path d="M7.5 7l.8 12h7.4l.8-12" />
    </Glyph>
  )
}

export function IconPlus() {
  return (
    <Glyph>
      <path d="M12 5v14M5 12h14" />
    </Glyph>
  )
}

export function IconEye() {
  return (
    <Glyph>
      <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.2" />
    </Glyph>
  )
}

export function IconEyeOff() {
  return (
    <Glyph>
      <path d="M4 5.5 19.5 19" />
      <path d="M9.2 6.8A10 10 0 0 1 12 6.5c6 0 9.5 5.5 9.5 5.5a16 16 0 0 1-3.2 3.6" />
      <path d="M6.2 8.2A16 16 0 0 0 2.5 12S6 17.5 12 17.5a9 9 0 0 0 3.2-.6" />
    </Glyph>
  )
}

export function IconLock() {
  return (
    <Glyph>
      <rect x="6" y="10.5" width="12" height="8.5" rx="1.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </Glyph>
  )
}

export function IconUnlock() {
  return (
    <Glyph>
      <rect x="6" y="10.5" width="12" height="8.5" rx="1.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 6.6-1.6" />
    </Glyph>
  )
}
