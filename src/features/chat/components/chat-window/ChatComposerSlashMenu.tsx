type ChatComposerSlashMenuProps = {
  highlightIndex: number
  onHighlightIndex: (index: number) => void
  onSelectExcel: () => void
  onSelectWord: () => void
  onSelectPdf: () => void
  onSelectImage: () => void
}

export function ChatComposerSlashMenu({
  highlightIndex,
  onHighlightIndex,
  onSelectExcel,
  onSelectWord,
  onSelectPdf,
  onSelectImage,
}: ChatComposerSlashMenuProps) {
  return (
    <div className="chat-slash-menu thread-menu" role="menu" aria-label="Slash Befehle">
      <button
        type="button"
        className={`thread-menu-item${highlightIndex === 0 ? ' is-selected' : ''}`}
        role="menuitem"
        onMouseDown={(event) => {
          event.preventDefault()
        }}
        onMouseEnter={() => onHighlightIndex(0)}
        onClick={onSelectExcel}
      >
        Excel
      </button>
      <button
        type="button"
        className={`thread-menu-item${highlightIndex === 1 ? ' is-selected' : ''}`}
        role="menuitem"
        onMouseDown={(event) => {
          event.preventDefault()
        }}
        onMouseEnter={() => onHighlightIndex(1)}
        onClick={onSelectWord}
      >
        Word
      </button>
      <button
        type="button"
        className={`thread-menu-item${highlightIndex === 2 ? ' is-selected' : ''}`}
        role="menuitem"
        onMouseDown={(event) => {
          event.preventDefault()
        }}
        onMouseEnter={() => onHighlightIndex(2)}
        onClick={onSelectPdf}
      >
        PDF
      </button>
      <button
        type="button"
        className={`thread-menu-item thread-menu-item--slash-image${highlightIndex === 3 ? ' is-selected' : ''}`}
        role="menuitem"
        onMouseDown={(event) => {
          event.preventDefault()
        }}
        onMouseEnter={() => onHighlightIndex(3)}
        onClick={onSelectImage}
      >
        Bilder
      </button>
    </div>
  )
}
