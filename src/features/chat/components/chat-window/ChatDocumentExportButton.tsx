import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PopoverContextMenu } from '../../../../components/ui/menu/PopoverContextMenu'

type MenuAnchor = {
  x: number
  bottomOffset: number // window.innerHeight - button.top + gap
}

type ChatDocumentExportButtonProps = {
  canExportWord: boolean
  canExportPdf: boolean
  wordBusy?: boolean
  pdfBusy?: boolean
  onExportWord: () => void
  onExportPdf: () => void
}

export function ChatDocumentExportButton({
  canExportWord,
  canExportPdf,
  wordBusy = false,
  pdfBusy = false,
  onExportWord,
  onExportPdf,
}: ChatDocumentExportButtonProps) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const handleClose = useCallback(() => {
    setOpen(false)
  }, [])

  const handleToggle = useCallback(() => {
    if (open) {
      setOpen(false)
      return
    }
    const rect = btnRef.current?.getBoundingClientRect()
    if (!rect) return
    setAnchor({ x: rect.left, bottomOffset: window.innerHeight - rect.top + 6 })
    setOpen(true)
  }, [open])

  const anyBusy = wordBusy || pdfBusy

  // position.y is unused — overridden by the style prop (top:auto / bottom:...)
  const popoverPosition = anchor ? { x: anchor.x, y: 0 } : null
  const popoverStyle = anchor
    ? { top: 'auto' as const, bottom: anchor.bottomOffset }
    : undefined

  const menu = (
    <PopoverContextMenu
      ref={menuRef}
      open={open}
      position={popoverPosition}
      onClose={handleClose}
      ariaLabel="Export-Optionen"
      className="thread-menu-popover--up"
      style={popoverStyle}
    >
      {canExportWord ? (
        <button
          type="button"
          role="menuitem"
          className="thread-menu-item"
          disabled={wordBusy}
          onClick={() => {
            handleClose()
            onExportWord()
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            style={{ marginRight: '0.4rem', flexShrink: 0 }}
          >
            <path
              d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points="14 2 14 8 20 8"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <line
              x1="9"
              y1="13"
              x2="15"
              y2="13"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
            <line
              x1="9"
              y1="17"
              x2="13"
              y2="17"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
          {wordBusy ? 'Word wird erstellt…' : 'Word (.docx)'}
        </button>
      ) : null}
      {canExportPdf ? (
        <button
          type="button"
          role="menuitem"
          className="thread-menu-item"
          disabled={pdfBusy}
          onClick={() => {
            handleClose()
            onExportPdf()
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            style={{ marginRight: '0.4rem', flexShrink: 0 }}
          >
            <path
              d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points="14 2 14 8 20 8"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M9 15h1.5a1.5 1.5 0 0 0 0-3H9v6"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {pdfBusy ? 'PDF wird erstellt…' : 'PDF'}
        </button>
      ) : null}
    </PopoverContextMenu>
  )

  return (
    <div className="chat-export-menu-anchor">
      <button
        ref={btnRef}
        type="button"
        className={`chat-export-menu-btn${open ? ' is-open' : ''}${anyBusy ? ' is-busy' : ''}`}
        onMouseDown={(e) => { if (open) e.stopPropagation() }}
        onClick={handleToggle}
        disabled={anyBusy}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg
          className="chat-export-menu-btn__icon"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M12 3v13M7 11l5 5 5-5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4 19h16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <span>{anyBusy ? 'Wird erstellt…' : 'Exportieren'}</span>
        <svg
          className={`chat-export-menu-btn__chevron${open ? ' is-open' : ''}`}
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {createPortal(menu, document.body)}
    </div>
  )
}
