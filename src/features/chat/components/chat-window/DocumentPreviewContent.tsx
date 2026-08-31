import {
  isDocumentPreviewSectionHeading,
  normalizeDocumentPreviewText,
} from '../../utils/documentPreviewFormat'

type DocumentPreviewContentProps = {
  text: string
}

export function DocumentPreviewContent({ text }: DocumentPreviewContentProps) {
  const normalized = normalizeDocumentPreviewText(text)
  const blocks = normalized.split(/\n\n+/).filter((block) => block.trim())

  if (blocks.length === 0) {
    return null
  }

  return (
    <div className="chat-document-preview-content">
      {blocks.map((block, blockIndex) => {
        const lines = block
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)

        return (
          <div key={blockIndex} className="chat-document-preview-block">
            {lines.map((line, lineIndex) =>
              isDocumentPreviewSectionHeading(line) ? (
                <h3 key={lineIndex} className="chat-document-preview-section">
                  {line}
                </h3>
              ) : (
                <p key={lineIndex} className="chat-document-preview-paragraph">
                  {line}
                </p>
              ),
            )}
          </div>
        )
      })}
    </div>
  )
}
