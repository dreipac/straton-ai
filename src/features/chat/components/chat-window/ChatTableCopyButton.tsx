import { useEffect, useState } from 'react'
import { copyRichTextToClipboard } from '../../../../utils/copyTextToClipboard'
import { buildTableClipboardHtml, buildTableClipboardPlainText } from '../../utils/tableClipboard'

const COPY_FEEDBACK_MS = 1200

type ChatTableCopyButtonProps = {
  rows: string[][]
}

/**
 * Dezenter Link unter einer Tabelle: Icon + „Tabelle kopieren". Kopiert nur diese eine Tabelle
 * (nicht die ganze Nachricht) als HTML + Klartext — landet in Word/Outlook dadurch als echte
 * Tabelle statt als Zeilen mit `|`-Zeichen (siehe `copyRichTextToClipboard`).
 */
export function ChatTableCopyButton({ rows }: ChatTableCopyButtonProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) {
      return
    }
    const timer = window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS)
    return () => window.clearTimeout(timer)
  }, [copied])

  async function handleClick() {
    const html = buildTableClipboardHtml(rows)
    const plainText = buildTableClipboardPlainText(rows)
    const ok = await copyRichTextToClipboard(html, plainText)
    if (ok) {
      setCopied(true)
    }
  }

  return (
    <button
      type="button"
      className={`chat-table-copy-btn${copied ? ' is-copied' : ''}`}
      onClick={() => void handleClick()}
    >
      {copied ? (
        <svg
          className="chat-table-copy-btn-icon"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg
          className="chat-table-copy-btn-icon"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.75" />
          <path
            d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      )}
      <span>{copied ? 'Kopiert' : 'Tabelle kopieren'}</span>
    </button>
  )
}
