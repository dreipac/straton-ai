/**
 * Knoten bearbeiten — die Handkorrektur (UI-Spezifikation 3.6, Architekturkapitel 3).
 *
 * „Sie ist Pflicht, weil der Kartograf Fehler macht und die Konsolidierung nicht alles
 * repariert." Drei Eingriffe, und mehr soll es hier auch nicht geben: umbenennen, Voraussetzung
 * ergaenzen oder streichen, mit einem anderen Knoten zusammenlegen.
 *
 * Der Unterschied zwischen den ersten beiden und dem dritten ist im Aufbau sichtbar: Umbenennen
 * und Kanten sind umkehrbar und passieren beim Klick. Das Zusammenlegen ist zerstoererisch und
 * verlangt eine zweite, ausdrueckliche Bestaetigung mit angekuendigter Wertregel (I6). Wer diese
 * Trennung aufhebt, hat die Bestaetigungspflicht zu einer Formalie gemacht.
 */

import { useMemo, useState } from 'react'
import { ModalShell } from '../../../../components/ui/modal/ModalShell'
import { ModalHeader } from '../../../../components/ui/modal/ModalHeader'
import { PrimaryButton } from '../../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../../components/ui/buttons/SecondaryButton'
import type { BrainConcept, BrainPrerequisiteEdge } from '../types'
import { MERGE_VALUE_WARNING } from '../ui/insightsView'

export type BrainNodeEditorProps = {
  concept: BrainConcept
  concepts: BrainConcept[]
  edges: BrainPrerequisiteEdge[]
  onRename: (conceptId: string, name: string) => void
  onAddPrerequisite: (conceptId: string, prerequisiteId: string) => void
  onRemovePrerequisite: (conceptId: string, prerequisiteId: string) => void
  onMerge: (keptConceptId: string, mergedConceptId: string) => void
  onClose: () => void
  isBusy?: boolean
  error?: string | null
}

export function BrainNodeEditor(props: BrainNodeEditorProps) {
  const { concept, concepts, edges } = props

  const [name, setName] = useState(concept.name)
  const [prerequisiteToAdd, setPrerequisiteToAdd] = useState('')
  const [mergePartner, setMergePartner] = useState('')
  const [mergeConfirmOpen, setMergeConfirmOpen] = useState(false)

  const nameById = useMemo(() => new Map(concepts.map((entry) => [entry.id, entry.name])), [concepts])

  /** Voraussetzungen dieses Knotens: Kanten, die auf ihn zeigen. */
  const prerequisites = useMemo(
    () => edges.filter((edge) => edge.toConceptId === concept.id).map((edge) => edge.fromConceptId),
    [edges, concept.id],
  )

  const candidates = useMemo(
    () =>
      concepts
        .filter((entry) => entry.id !== concept.id && !prerequisites.includes(entry.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [concepts, concept.id, prerequisites],
  )

  const others = useMemo(
    () => concepts.filter((entry) => entry.id !== concept.id).sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [concepts, concept.id],
  )

  return (
    <ModalShell isOpen className="brain-dialog-overlay" onRequestClose={props.onClose}>
      <section className="ui-dialog-card brain-dialog" role="dialog" aria-modal="true" aria-label="Knoten bearbeiten">
        <ModalHeader title="Knoten bearbeiten" onClose={props.onClose} closeLabel="Schliessen" />

        <div className="brain-dialog-body">
          {props.error ? <p className="error-text">{props.error}</p> : null}

          <div className="brain-field">
            <span className="brain-field-label">Name</span>
            <div className="brain-field-row">
              <input
                className="brain-field-input"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <SecondaryButton
                type="button"
                onClick={() => props.onRename(concept.id, name)}
                disabled={props.isBusy || name.trim().length === 0 || name.trim() === concept.name}
              >
                Umbenennen
              </SecondaryButton>
            </div>
          </div>

          <div className="brain-field">
            <span className="brain-field-label">Voraussetzungen</span>
            {prerequisites.length === 0 ? (
              <p className="brain-field-hint">Keine eingetragen — dieser Knoten steht für sich.</p>
            ) : (
              <ul className="brain-edge-list">
                {prerequisites.map((prerequisiteId) => (
                  <li key={prerequisiteId} className="brain-edge-item">
                    <span>{nameById.get(prerequisiteId) ?? prerequisiteId}</span>
                    <button
                      type="button"
                      className="brain-edge-remove"
                      onClick={() => props.onRemovePrerequisite(concept.id, prerequisiteId)}
                      disabled={props.isBusy}
                    >
                      Streichen
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="brain-field-row">
              <select
                className="brain-field-input"
                value={prerequisiteToAdd}
                onChange={(event) => setPrerequisiteToAdd(event.target.value)}
              >
                <option value="">Voraussetzung ergänzen …</option>
                {candidates.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
              <SecondaryButton
                type="button"
                onClick={() => {
                  props.onAddPrerequisite(concept.id, prerequisiteToAdd)
                  setPrerequisiteToAdd('')
                }}
                disabled={props.isBusy || prerequisiteToAdd.length === 0}
              >
                Ergänzen
              </SecondaryButton>
            </div>
          </div>

          <div className="brain-field brain-field--destructive">
            <span className="brain-field-label">Zusammenlegen</span>
            <p className="brain-field-hint">
              Der andere Knoten geht in diesem auf. Seine Belege bleiben erhalten und zählen ab
              dann hierher.
            </p>
            <div className="brain-field-row">
              <select
                className="brain-field-input"
                value={mergePartner}
                onChange={(event) => {
                  setMergePartner(event.target.value)
                  setMergeConfirmOpen(false)
                }}
              >
                <option value="">Knoten wählen …</option>
                {others.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
              <SecondaryButton
                type="button"
                onClick={() => setMergeConfirmOpen(true)}
                disabled={props.isBusy || mergePartner.length === 0 || mergeConfirmOpen}
              >
                Zusammenlegen
              </SecondaryButton>
            </div>

            {/*
             * Die zweite Bestaetigung (I6) — und mit ihr die Ankuendigung der konservativen
             * Wertregel. Ohne sie sieht die Person Fortschritt verschwinden und haelt es fuer
             * einen Fehler (Architekturkapitel 8.3).
             */}
            {mergeConfirmOpen ? (
              <div className="brain-merge-confirm">
                <p className="brain-merge-confirm-text">{MERGE_VALUE_WARNING}</p>
                <div className="brain-field-row">
                  <PrimaryButton
                    type="button"
                    onClick={() => {
                      props.onMerge(concept.id, mergePartner)
                      setMergeConfirmOpen(false)
                      setMergePartner('')
                    }}
                    disabled={props.isBusy}
                  >
                    {`„${nameById.get(mergePartner) ?? ''}" hier aufgehen lassen`}
                  </PrimaryButton>
                  <SecondaryButton type="button" onClick={() => setMergeConfirmOpen(false)} disabled={props.isBusy}>
                    Abbrechen
                  </SecondaryButton>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </ModalShell>
  )
}
