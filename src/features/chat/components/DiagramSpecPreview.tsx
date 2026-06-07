import { useEffect, useId, useState } from 'react'
import mermaid from 'mermaid'
import type { DiagramSpecV1 } from '../diagram/diagramSpec'

let mermaidInitialized = false

function ensureMermaidInit(): void {
  if (mermaidInitialized) {
    return
  }
  const isDark =
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'dark'
  mermaid.initialize({
    startOnLoad: false,
    theme: isDark ? 'dark' : 'neutral',
    securityLevel: 'strict',
    fontFamily: 'inherit',
    flowchart: { htmlLabels: true, curve: 'basis' },
  })
  mermaidInitialized = true
}

type Props = {
  spec: DiagramSpecV1
}

export function DiagramSpecPreviewBuilding() {
  return (
    <div className="diagram-spec-preview diagram-spec-preview--building" role="status" aria-live="polite">
      <p className="word-outline-paper__building-hint">Diagramm wird aufgebaut …</p>
    </div>
  )
}

export function DiagramSpecPreview({ spec }: Props) {
  const reactId = useId()
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ensureMermaidInit()
    const renderId = `straton-mermaid-${reactId.replace(/:/g, '')}`

    void (async () => {
      try {
        const { svg: rendered } = await mermaid.render(renderId, spec.source)
        if (!cancelled) {
          setSvg(rendered)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setSvg(null)
          setError(err instanceof Error ? err.message : 'Diagramm konnte nicht gerendert werden.')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [reactId, spec.source])

  if (error) {
    return (
      <div className="diagram-spec-preview diagram-spec-preview--error" role="alert">
        <p className="chat-message-body chat-excel-fallback-text">
          Das Diagramm konnte nicht dargestellt werden ({error}). Bitte die Anfrage erneut senden.
        </p>
      </div>
    )
  }

  if (!svg) {
    return <DiagramSpecPreviewBuilding />
  }

  return (
    <div
      className="diagram-spec-preview"
      role="region"
      aria-label="Diagramm-Vorschau"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
