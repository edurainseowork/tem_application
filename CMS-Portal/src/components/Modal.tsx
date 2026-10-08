import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type ModalProps = {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}

// Centered popup in the CMS glass style. Closes on Escape or a click on the backdrop.
// Rendered into <body>: the glass cards' backdrop-filter would otherwise trap position:fixed inside them.
function Modal({ title, subtitle, onClose, children, footer, width = 640 }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflowY: 'auto', zIndex: 1000, padding: '4vh 16px' }}
    >
      <div role="dialog" aria-modal="true" aria-label={title} className="glass-card" style={{ width: '100%', maxWidth: `${width}px`, background: '#161a22', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 20px 50px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ color: 'white' }}>{title}</h3>
            {subtitle && <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="btn" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', padding: '4px 10px', flexShrink: 0 }}>✕</button>
        </div>
        {children}
        {footer && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export default Modal
