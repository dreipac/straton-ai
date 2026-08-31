/**
 * Anbindung: Material-Bereich, Abschnitt „Quellen" (UI-Spezifikation Kapitel 6).
 *
 * „Hochgeladene Dokumente mit abgeleiteter Konzeptanzahl, aus Chats gewonnene Konzepte, und
 * getrennt aufgefuehrt die KI-ergaenzten Konzepte mit Hinweis, dass sie nicht im Skript stehen.
 * Das ist die Oberflaechenumsetzung von Invariante I4 auf Pfadebene."
 *
 * Die Trennung ist der ganze Zweck dieser Ansicht. Eine gemeinsame Liste „deine Konzepte" waere
 * bequemer und wuerde genau die Unterscheidung einebnen, die I4 fuehrt: was im Material steht,
 * und was das System dazuerfunden hat, weil es ohne die Zwischenstufe nicht weitergeht.
 *
 * Rein — kein DOM, kein I/O.
 */

import type { BrainConcept } from '../types'

export type SourceGroupView = {
  /** Dokument oder Abschnitt, wie im Material benannt. */
  title: string
  conceptCount: number
  conceptNames: string[]
}

export type MaterialSourcesView = {
  /** Aus hochgeladenem Material abgeleitet — mit Beleg (I4). */
  fromMaterial: SourceGroupView[]
  /** Vom Nutzer selbst aufgenommen, etwa aus dem Chat (Kapitel 11). */
  fromUser: SourceGroupView[]
  /** Getrennt aufgefuehrt, mit Hinweis. */
  aiSupplemented: SourceGroupView[]
  /**
   * Altbestand ohne belegte Herkunft.
   *
   * Eigene Gruppe statt stiller Einordnung: diese Konzepte als Materialherkunft zu fuehren waere
   * eine Quellenangabe, die niemand nachweisen kann — und sie den KI-Ergaenzungen zuzuschlagen
   * waere ein Vorwurf, den niemand belegen kann. Was unbekannt ist, heisst unbekannt.
   */
  unverified: SourceGroupView[]
  totalConceptCount: number
  /** Der Hinweis zu den KI-Ergaenzungen. Leer, wenn es keine gibt. */
  aiNotice: string
}

export const AI_SUPPLEMENT_NOTICE =
  'Diese Konzepte stehen nicht in deinem Material. Ich habe sie ergaenzt, weil ohne sie eine ' +
  'Luecke im Aufbau bliebe — pruef bitte, ob sie im Unterricht vorkamen.'

export const UNVERIFIED_NOTICE =
  'Zu diesen Konzepten ist keine Herkunft hinterlegt. Sie stammen aus einem aelteren Stand, in ' +
  'dem die Herkunft noch nicht mitgeschrieben wurde.'

function groupByTitle(concepts: BrainConcept[]): SourceGroupView[] {
  const groups = new Map<string, string[]>()

  for (const concept of concepts) {
    const title =
      concept.sourceRef.doc?.trim() || concept.sourceRef.section?.trim() || 'Ohne Dokumentangabe'
    const bucket = groups.get(title)
    if (bucket) {
      bucket.push(concept.name)
    } else {
      groups.set(title, [concept.name])
    }
  }

  return [...groups.entries()]
    .map(([title, conceptNames]) => ({ title, conceptCount: conceptNames.length, conceptNames }))
    .sort((a, b) => b.conceptCount - a.conceptCount)
}

export function buildMaterialSources(concepts: BrainConcept[]): MaterialSourcesView {
  const byOrigin = {
    material: [] as BrainConcept[],
    user: [] as BrainConcept[],
    aiSupplement: [] as BrainConcept[],
    unknown: [] as BrainConcept[],
  }

  for (const concept of concepts) {
    byOrigin[concept.origin].push(concept)
  }

  return {
    fromMaterial: groupByTitle(byOrigin.material),
    fromUser: groupByTitle(byOrigin.user),
    aiSupplemented: groupByTitle(byOrigin.aiSupplement),
    unverified: groupByTitle(byOrigin.unknown),
    totalConceptCount: concepts.length,
    aiNotice: byOrigin.aiSupplement.length > 0 ? AI_SUPPLEMENT_NOTICE : '',
  }
}
