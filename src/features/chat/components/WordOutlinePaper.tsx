import type { WordOutlineV1 } from '../types'
import { assignOutlineNumberLabels } from '../utils/wordOutlineNumbering'

/** Entfernt KI-Doppelnummerierung («1.» / «1.1»), wenn wir bereits automatische Nummern zeigen. */
function stripLeadingEnumerationFromHeadingDisplay(text: string): string {
  return text
    .replace(/^\d+\.\d+\.\d+\s+/, '')
    .replace(/^\d+\.\d+\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .trim()
}

function stripChapterHeadingPrefixForDisplay(text: string): string {
  const withSepK = text.replace(/^\s*Kapitel\s+\d+\s*[:：.\-–—]\s*/i, '').trim()
  if (withSepK.length > 0) {
    return withSepK
  }
  const withSepC = text.replace(/^\s*Chapter\s+\d+\s*[:：.\-–—]\s*/i, '').trim()
  if (withSepC.length > 0) {
    return withSepC
  }
  if (/^\s*Kapitel\s+\d+\s*$/i.test(text.trim()) || /^\s*Chapter\s+\d+\s*$/i.test(text.trim())) {
    return ''
  }
  return text
}

type Props = {
  outline: WordOutlineV1
  /** Dokumenttitel — nur **oberhalb** der Papier-Karte; im Papier nur Word-Inhalt (`blocks`). */
  bannerTitle?: string | null
}

/** Weiße «Papier»-Karte für Gliederungsvorschau im Chat (nicht Rohtext im Sternenhintergrund). */
export function WordOutlinePaper({ outline, bannerTitle }: Props) {
  const numByIndex = assignOutlineNumberLabels(outline.blocks)
  const banner = bannerTitle?.trim() || null

  return (
    <>
      {banner ? (
        <p className="word-outline-banner-title">{banner}</p>
      ) : null}
      <div className="word-outline-paper" role="region" aria-label="Word-Gliederung">
        <div className="word-outline-paper__body">
        {outline.blocks.map((b, i) => {
          if (b.type === 'table') {
            return (
              <div key={`tbl-${i}`} className="word-outline-paper__table-wrap">
                <table className="word-outline-paper__table">
                  <tbody>
                    {b.rows.map((row, ri) => (
                      <tr key={`r-${ri}`}>
                        {row.map((cell, ci) =>
                          b.header === true && ri === 0 ? (
                            <th key={`c-${ci}`} scope="col">
                              {cell}
                            </th>
                          ) : (
                            <td key={`c-${ci}`}>{cell}</td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
          if (b.type === 'heading') {
            const num = numByIndex.get(i)
            const displayText = stripLeadingEnumerationFromHeadingDisplay(
              stripChapterHeadingPrefixForDisplay(b.text),
            )
            return (
              <p
                key={`h-${i}`}
                className={`word-outline-paper__heading word-outline-paper__heading--lvl-${b.level}`}
              >
                {num ? (
                  <span className="word-outline-paper__heading-num">{num}.</span>
                ) : null}
                {displayText ? (
                  <span className="word-outline-paper__heading-text">{displayText}</span>
                ) : null}
              </p>
            )
          }
          return (
            <p key={`p-${i}`} className="word-outline-paper__paragraph">
              {b.text}
            </p>
          )
        })}
        </div>
      </div>
    </>
  )
}
