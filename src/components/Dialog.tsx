import { useEffect, useRef, type ReactNode, type RefObject } from 'react'

type DialogProps = {
  title: string
  onClose: () => void
  children: ReactNode
  footer: ReactNode
  focusRef?: RefObject<HTMLElement | null>
}

export function Dialog({ title, onClose, children, footer, focusRef }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = requestAnimationFrame(() => {
      if (focusRef?.current) focusRef.current.focus()
      else dialogRef.current?.querySelector<HTMLElement>('button, input')?.focus()
    })
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [focusRef, onClose])

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="dialog-title">{title}</h2>
        {children}
        <div className="modal-footer">{footer}</div>
      </div>
    </div>
  )
}
