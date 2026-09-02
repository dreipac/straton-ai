/**
 * Ziel setzen (UI-Spezifikation Kapitel 7).
 *
 * Drei Eingaben, eine Aussage: Termin, Umfang, Zeit pro Tag — und darunter, waehrend man tippt,
 * die Machbarkeit in einem Satz. Die Aussage ist bewusst kein Motivationsspruch, und sie steht
 * bewusst VOR dem Speichern: ein Ziel, dessen Unmoeglichkeit erst danach erscheint, ist eine
 * Falle mit Bestaetigungsknopf.
 *
 * Gerechnet wird nichts in dieser Datei. Sie haelt Formularzustand und zeigt, was
 * `ui/goalView.ts` aus dem Planer zurueckbekommt.
 */

import { useMemo, useState } from 'react'
import { ModalShell } from '../../../../components/ui/modal/ModalShell'
import { ModalHeader } from '../../../../components/ui/modal/ModalHeader'
import { PrimaryButton } from '../../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../../components/ui/buttons/SecondaryButton'
import type { BrainConcept, LearnerConceptImage, LearningGoal } from '../types'
import { buildGoalPreview, defaultDueDate, groupConceptsForScope, type GoalDraft } from '../ui/goalView'

export type BrainGoalDialogProps = {
  userId: string
  pathId: string
  concepts: BrainConcept[]
  images: Map<string, LearnerConceptImage>
  /** Ein laufendes Ziel wird zur Vorbelegung — Aendern ist der haeufigere Fall als Neuanlegen. */
  goal: LearningGoal | null
  onSave: (draft: GoalDraft) => void
  onClear: () => void
  onClose: () => void
  isBusy?: boolean
}

export function BrainGoalDialog(props: BrainGoalDialogProps) {
  const nowIso = useMemo(() => new Date().toISOString(), [])
  const nameById = useMemo(
    () => new Map(props.concepts.map((concept) => [concept.id, concept.name])),
    [props.concepts],
  )
  const groups = useMemo(() => groupConceptsForScope(props.concepts), [props.concepts])

  const [title, setTitle] = useState(props.goal?.title ?? '')
  const [dueAt, setDueAt] = useState(
    props.goal ? props.goal.dueAt.slice(0, 10) : defaultDueDate(nowIso),
  )
  const [minutesPerDay, setMinutesPerDay] = useState(props.goal?.minutesPerDay ?? 30)
  const [conceptIds, setConceptIds] = useState<Set<string>>(
    () => new Set(props.goal?.conceptIds ?? props.concepts.map((concept) => concept.id)),
  )

  const draft: GoalDraft = {
    title,
    // Der Termin gilt zum Tagesende — sonst waere „bis Freitag" in Wahrheit „bis Freitag null Uhr".
    dueAt: dueAt ? new Date(`${dueAt}T23:59:59`).toISOString() : '',
    conceptIds: [...conceptIds],
    minutesPerDay,
  }

  const preview = buildGoalPreview({
    draft,
    userId: props.userId,
    pathId: props.pathId,
    images: props.images,
    nowIso,
  })

  const toggleConcept = (conceptId: string) => {
    setConceptIds((current) => {
      const next = new Set(current)
      if (next.has(conceptId)) {
        next.delete(conceptId)
      } else {
        next.add(conceptId)
      }
      return next
    })
  }

  const toggleGroup = (groupConceptIds: string[]) => {
    setConceptIds((current) => {
      const next = new Set(current)
      const allSelected = groupConceptIds.every((id) => next.has(id))
      for (const id of groupConceptIds) {
        if (allSelected) {
          next.delete(id)
        } else {
          next.add(id)
        }
      }
      return next
    })
  }

  return (
    <ModalShell isOpen className="brain-dialog-overlay" onRequestClose={props.onClose}>
      <section className="ui-dialog-card brain-dialog" role="dialog" aria-modal="true" aria-label="Ziel setzen">
        <ModalHeader title="Ziel setzen" onClose={props.onClose} closeLabel="Schliessen" />

        <div className="brain-dialog-body">
          <label className="brain-field">
            <span className="brain-field-label">Wofür</span>
            <input
              className="brain-field-input"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Prüfung, Test, Vortrag …"
            />
          </label>

          <div className="brain-field-row">
            <label className="brain-field">
              <span className="brain-field-label">Termin</span>
              <input
                className="brain-field-input"
                type="date"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
            </label>

            <label className="brain-field">
              <span className="brain-field-label">Minuten pro Tag</span>
              <input
                className="brain-field-input"
                type="number"
                min={5}
                max={480}
                step={5}
                value={minutesPerDay}
                onChange={(event) => setMinutesPerDay(Math.max(0, Number(event.target.value) || 0))}
              />
            </label>
          </div>

          <div className="brain-field">
            <span className="brain-field-label">{`Umfang · ${conceptIds.size} von ${props.concepts.length}`}</span>
            <div className="brain-scope-groups">
              {groups.map((group) => {
                const allSelected = group.conceptIds.every((id) => conceptIds.has(id))
                return (
                  <div key={group.title} className="brain-scope-group">
                    <button
                      type="button"
                      className={`brain-scope-group-head${allSelected ? ' is-selected' : ''}`}
                      onClick={() => toggleGroup(group.conceptIds)}
                    >
                      {group.title}
                    </button>
                    <div className="brain-scope-chips">
                      {group.conceptIds.map((conceptId) => (
                        <button
                          key={conceptId}
                          type="button"
                          className={`brain-scope-chip${conceptIds.has(conceptId) ? ' is-selected' : ''}`}
                          onClick={() => toggleConcept(conceptId)}
                          aria-pressed={conceptIds.has(conceptId)}
                        >
                          {nameById.get(conceptId) ?? conceptId}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Die ehrliche Aussage — mit Zahlen, ohne Zuspruch (Kapitel 7). */}
          <div className={`brain-goal-verdict${preview.feasible ? ' is-feasible' : ' is-tight'}`}>
            <p className="brain-goal-verdict-sentence">{preview.sentence}</p>
            {preview.suggestion ? (
              <p className="brain-goal-verdict-suggestion">{preview.suggestion}</p>
            ) : null}
          </div>
        </div>

        <footer className="brain-dialog-actions">
          <PrimaryButton
            type="button"
            onClick={() => props.onSave(draft)}
            disabled={props.isBusy || !preview.isComplete}
          >
            Ziel setzen
          </PrimaryButton>
          {props.goal ? (
            <SecondaryButton type="button" onClick={props.onClear} disabled={props.isBusy}>
              Ziel aufheben
            </SecondaryButton>
          ) : null}
        </footer>
      </section>
    </ModalShell>
  )
}
