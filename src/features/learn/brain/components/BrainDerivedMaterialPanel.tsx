/**
 * Der abgeleitete Lehrstoff — einsehbar und korrigierbar.
 *
 * Warum das kein Nice-to-have ist: Der Aufbereiter (`brain/preparation/derive.ts`) beantwortet die
 * Fragen, die im Arbeitsheft offen bleiben. „Fachlich richtig" und „was die Lehrperson erwartet"
 * sind aber nicht dasselbe — bei Recht und Staatskunde gehen sie regelmaessig auseinander
 * (Kantonsunterschiede, eine aeltere Auflage, eine bewusste Vereinfachung im Unterricht).
 *
 * Zugleich waechst hier das Risiko gegenueber dem alten Zustand: ein falscher abgeleiteter Satz
 * vergiftet nicht mehr eine Aufgabe, sondern ein ganzes Konzept mitsamt allen Aufgaben daraus.
 * Genau die Fehlerfortpflanzung, gegen die Invariante I5 geschrieben wurde, nur eine Stufe
 * frueher. Deshalb muss dieser Text sichtbar und aenderbar sein — sonst waere die Vorverlagerung
 * ein schlechter Tausch.
 */

import { useEffect, useState } from 'react'
import type { WorkbookItem } from '../agents/contracts'
import type { UploadedMaterial } from '../../services/learn.persistence'
import type { DerivationSummary } from '../preparation/derive'

const SOURCE_LABEL: Record<string, string> = {
  material: 'aus deinem Material',
  web: 'recherchiert',
  model: 'vom Modell ergänzt',
}

export type BrainDerivedMaterialPanelProps = {
  material: UploadedMaterial
  /** Die erkannten Punkte. Leer, solange die Aufbereitung dieses Pfads noch nicht lief. */
  items: WorkbookItem[]
  summary: DerivationSummary | null
  /** Speichert den korrigierten Lehrtext. */
  onSave: (materialId: string, text: string) => Promise<void>
}

export function BrainDerivedMaterialPanel({
  material,
  items,
  summary,
  onSave,
}: BrainDerivedMaterialPanelProps) {
  const [draft, setDraft] = useState(material.excerpt)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /*
   * Der Entwurf folgt dem Material nach, solange nichts geaendert wurde. Ohne das stuende nach
   * einer erneuten Aufbereitung weiterhin der alte Text im Feld — und ein Speichern wuerde die
   * neue Fassung stillschweigend ueberschreiben.
   */
  useEffect(() => {
    setDraft(material.excerpt)
  }, [material.id, material.excerpt])

  const dirty = draft !== material.excerpt
  const knowledge = items.filter((item) => item.kind === 'wissensfrage')
  const skipped = items.filter((item) => item.kind !== 'wissensfrage')

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await onSave(material.id, draft)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Speichern fehlgeschlagen.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="brain-derived" aria-label="Ergänzter Lehrstoff">
      <header className="brain-derived-head">
        <h3 className="brain-derived-title">{material.name}</h3>
        <p className="brain-derived-notice">
          Dieser Text steht <strong>nicht</strong> in deinen Unterlagen. Das Gehirn hat die Fragen
          aus deinem Arbeitsheft beantwortet, damit du daran lernen kannst. Weicht etwas von dem ab,
          was im Unterricht gilt, korrigiere es hier — die Aufgaben richten sich danach.
        </p>
      </header>

      {summary ? (
        <ul className="brain-derived-summary">
          <li>{`${summary.wissensfragen} beantwortete Fragen`}</li>
          <li>{`${summary.ergaenzt} davon ergänzt statt aus dem Material`}</li>
          {summary.unsicher > 0 ? (
            <li className="brain-derived-summary-warn">{`${summary.unsicher} unsicher — bitte prüfen`}</li>
          ) : null}
          <li>{`${summary.arbeitsauftraege} Arbeitsaufträge und ${summary.reflexionen} Reflexionsfragen übergangen`}</li>
        </ul>
      ) : null}

      <label className="brain-derived-label" htmlFor={`derived-${material.id}`}>
        Lehrstoff
      </label>
      <textarea
        id={`derived-${material.id}`}
        className="brain-derived-text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={16}
        spellCheck
      />

      <div className="brain-derived-actions">
        <button
          type="button"
          className="ui-button ui-button--primary"
          onClick={() => void handleSave()}
          disabled={!dirty || saving}
        >
          {saving ? 'Wird gespeichert …' : 'Korrektur speichern'}
        </button>
        {dirty && !saving ? (
          <button type="button" className="ui-button" onClick={() => setDraft(material.excerpt)}>
            Verwerfen
          </button>
        ) : null}
        {error ? <span className="brain-derived-error">{error}</span> : null}
      </div>

      {knowledge.length > 0 ? (
        <details className="brain-derived-details">
          <summary>{`Herkunft je Antwort (${knowledge.length})`}</summary>
          <ul className="brain-derived-items">
            {knowledge.map((item, index) => (
              <li key={`${item.question}-${index}`} className="brain-derived-item">
                <span className="brain-derived-question">{item.question}</span>
                <span className="brain-derived-source">
                  {SOURCE_LABEL[item.answerSource ?? 'model'] ?? 'unbekannt'}
                  {item.needsResearch ? ' · unsicher' : ''}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {/*
        Bewusst sichtbar: Was uebergangen wurde, ist eine Aussage ueber das Material, keine Panne.
        Ein Arbeitsauftrag traegt kein Wissen, eine Reflexionsfrage hat keine richtige Antwort —
        wer das nicht sieht, haelt eine luecken­hafte Aufbereitung fuer einen Fehler.
      */}
      {skipped.length > 0 ? (
        <details className="brain-derived-details">
          <summary>{`Übergangen (${skipped.length})`}</summary>
          <ul className="brain-derived-items">
            {skipped.map((item, index) => (
              <li key={`${item.question}-${index}`} className="brain-derived-item">
                <span className="brain-derived-question">{item.question}</span>
                <span className="brain-derived-source">
                  {item.kind === 'arbeitsauftrag' ? 'Arbeitsauftrag' : 'Reflexionsfrage'}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  )
}
