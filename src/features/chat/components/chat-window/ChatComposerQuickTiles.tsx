import landscapePng from '../../../../assets/png/Landscape.png'
import { preventIosBlurOnlyTapWhenChatInputFocused } from '../../../../utils/chatComposerFocusTap'
import { ChatMobileQuickTile } from './ChatMobileQuickTile'

type ChatComposerQuickTilesProps = {
  isMobileComposer: boolean
  imageGenCommandSelected: boolean
  excelCommandSelected: boolean
  wordCommandSelected: boolean
  pdfCommandSelected: boolean
  onSelectImage: () => void
  onSelectExcel: () => void
  onSelectWord: () => void
  onSelectPdf: () => void
  onClearImageGen: () => void
  onClearExcel: () => void
  onClearWord: () => void
  onClearPdf: () => void
}

export function ChatComposerQuickTiles({
  isMobileComposer,
  imageGenCommandSelected,
  excelCommandSelected,
  wordCommandSelected,
  pdfCommandSelected,
  onSelectImage,
  onSelectExcel,
  onSelectWord,
  onSelectPdf,
  onClearImageGen,
  onClearExcel,
  onClearWord,
  onClearPdf,
}: ChatComposerQuickTilesProps) {
  return (
    <div
      className={`chat-quick-tiles${isMobileComposer ? ' chat-quick-tiles--mobile-rail' : ''}`}
      role="group"
      aria-label="Schnellaktionen"
    >
      {isMobileComposer ? (
        <div className="chat-quick-tiles-scroll">
          <div className="chat-quick-tiles-scroll-track">
            <ChatMobileQuickTile
              active={imageGenCommandSelected}
              tileClassName={`chat-quick-tile chat-quick-tile--bilder${imageGenCommandSelected ? ' is-active' : ''}`}
              onActivate={onSelectImage}
              onDeactivate={onClearImageGen}
              deactivateAriaLabel="Bildgenerierung entfernen"
            >
              <span className="chat-quick-tile-icon-wrap" aria-hidden>
                <img className="chat-quick-tile-icon--landscape" src={landscapePng} alt="" />
              </span>
              <span className="chat-quick-tile-text">
                <span className="chat-quick-tile-title">Bilder</span>
                <span className="chat-quick-tile-sub">Bild generieren</span>
              </span>
            </ChatMobileQuickTile>
            <ChatMobileQuickTile
              active={excelCommandSelected}
              tileClassName={`chat-quick-tile chat-quick-tile--excel${excelCommandSelected ? ' is-active' : ''}`}
              onActivate={onSelectExcel}
              onDeactivate={onClearExcel}
              deactivateAriaLabel="Excel-Befehl entfernen"
            >
              <span className="chat-quick-tile-icon-wrap" aria-hidden>
                <span className="chat-quick-tile-letter-mark">X</span>
              </span>
              <span className="chat-quick-tile-text">
                <span className="chat-quick-tile-title">Excel</span>
                <span className="chat-quick-tile-sub">Tabelle planen &amp; exportieren</span>
              </span>
            </ChatMobileQuickTile>
            <ChatMobileQuickTile
              active={wordCommandSelected}
              tileClassName={`chat-quick-tile chat-quick-tile--word${wordCommandSelected ? ' is-active' : ''}`}
              onActivate={onSelectWord}
              onDeactivate={onClearWord}
              deactivateAriaLabel="Word-Befehl entfernen"
            >
              <span className="chat-quick-tile-icon-wrap" aria-hidden>
                <span className="chat-quick-tile-letter-mark">W</span>
              </span>
              <span className="chat-quick-tile-text">
                <span className="chat-quick-tile-title">Word</span>
                <span className="chat-quick-tile-sub">Word generieren</span>
              </span>
            </ChatMobileQuickTile>
            <ChatMobileQuickTile
              active={pdfCommandSelected}
              tileClassName={`chat-quick-tile chat-quick-tile--pdf${pdfCommandSelected ? ' is-active' : ''}`}
              onActivate={onSelectPdf}
              onDeactivate={onClearPdf}
              deactivateAriaLabel="PDF-Befehl entfernen"
            >
              <span className="chat-quick-tile-icon-wrap" aria-hidden>
                <span className="chat-quick-tile-letter-mark">P</span>
              </span>
              <span className="chat-quick-tile-text">
                <span className="chat-quick-tile-title">PDF</span>
                <span className="chat-quick-tile-sub">PDF generieren</span>
              </span>
            </ChatMobileQuickTile>
          </div>
        </div>
      ) : (
        <>
          <div className="chat-quick-tiles-row chat-quick-tiles-row--top">
            <button
              type="button"
              className={`chat-quick-tile chat-quick-tile--excel${excelCommandSelected ? ' is-active' : ''}`}
              onPointerDown={preventIosBlurOnlyTapWhenChatInputFocused}
              onClick={onSelectExcel}
            >
              <span className="chat-quick-tile-icon-wrap" aria-hidden>
                <span className="chat-quick-tile-letter-mark">X</span>
              </span>
              <span className="chat-quick-tile-text">
                <span className="chat-quick-tile-title">Excel</span>
                <span className="chat-quick-tile-sub">Tabelle planen &amp; exportieren</span>
              </span>
            </button>
            <button
              type="button"
              className={`chat-quick-tile chat-quick-tile--word${wordCommandSelected ? ' is-active' : ''}`}
              onPointerDown={preventIosBlurOnlyTapWhenChatInputFocused}
              onClick={onSelectWord}
            >
              <span className="chat-quick-tile-icon-wrap" aria-hidden>
                <span className="chat-quick-tile-letter-mark">W</span>
              </span>
              <span className="chat-quick-tile-text">
                <span className="chat-quick-tile-title">Word</span>
                <span className="chat-quick-tile-sub">Word generieren</span>
              </span>
            </button>
          </div>
          <div className="chat-quick-tiles-row chat-quick-tiles-row--bottom">
            <button
              type="button"
              className={`chat-quick-tile chat-quick-tile--pdf${pdfCommandSelected ? ' is-active' : ''}`}
              onPointerDown={preventIosBlurOnlyTapWhenChatInputFocused}
              onClick={onSelectPdf}
            >
              <span className="chat-quick-tile-icon-wrap" aria-hidden>
                <span className="chat-quick-tile-letter-mark">P</span>
              </span>
              <span className="chat-quick-tile-text">
                <span className="chat-quick-tile-title">PDF</span>
                <span className="chat-quick-tile-sub">PDF generieren</span>
              </span>
            </button>
            <button
              type="button"
              className={`chat-quick-tile chat-quick-tile--bilder${imageGenCommandSelected ? ' is-active' : ''}`}
              onPointerDown={preventIosBlurOnlyTapWhenChatInputFocused}
              onClick={onSelectImage}
            >
              <span className="chat-quick-tile-icon-wrap" aria-hidden>
                <img className="chat-quick-tile-icon--landscape" src={landscapePng} alt="" />
              </span>
              <span className="chat-quick-tile-text">
                <span className="chat-quick-tile-title">Bilder</span>
                <span className="chat-quick-tile-sub">Bild generieren</span>
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
