/**
 * Straton Gehirn — oeffentliche Schnittstelle.
 *
 * Umsetzung von `straton-gehirn-architektur.md`. Die Dokumentation der Architektur liegt in
 * `dokumentation/` im Projektwurzelverzeichnis.
 *
 * Aufbau (die Reihenfolge entspricht dem geschlossenen Kreislauf aus Kapitel 2):
 *
 *   agents/        Schicht 1 — Kartograf und die uebrigen Modellrollen (Kapitel 3, 12)
 *   memory/        Schicht 2 — Wissensgraph, Lernerbild, Propagation (Kapitel 4)
 *   perception/    Schicht 3 — Pruefer, Chatsignale, Evidenz (Kapitel 5)
 *   planner/       Schicht 4 — deterministische Auswahl, Ziel, Erklaerpflicht (Kapitel 6)
 *   production/    Schicht 5 — Formate, Qualitaetssicherung, Vorproduktion (Kapitel 7)
 *   consolidation/ Schicht 6 — Ausloeser, Fehlermuster, Strukturumbau (Kapitel 8, 10)
 *   coldstart/     Kaltstart — adaptive Suche nach der Front (Kapitel 9)
 *   path/          Vom Netz zum Pfad (Kapitel 11)
 *   services/      Persistenz. Die einzige Schicht mit I/O ausser agents/client.ts.
 *
 * Alles ausserhalb von `services/` und `agents/client.ts` ist rein und ohne Aufbau testbar.
 */

export * from './types'
export * from './invariants'

// Schicht 2 — Gedaechtnis
export * from './memory/learnerImage'
export * from './memory/propagation'
export * from './memory/knowledgeGraph'

// Schicht 3 — Wahrnehmung
export * from './perception/examiner'
export * from './perception/evidence'
export * from './perception/chatSignals'

// Schicht 4 — Exekutive
export * from './planner/goal'
export * from './planner/urgency'
export * from './planner/explanation'
export * from './planner/planner'
export * from './planner/responsibility'

// Schicht 5 — Produktion
export * from './production/formats'
export * from './production/quality'
export * from './production/explanations'
export * from './production/prefetch'
export * from './production/reviewStock'
export * from './production/generateTask'

// Schicht 6 — Konsolidierung
export * from './consolidation/trigger'
export * from './consolidation/patterns'
export * from './consolidation/restructure'

// Kaltstart und Pfad
export * from './coldstart/frontSearch'
export * from './path/ordering'

// Modellrollen
export * from './agents/roles'
export * from './agents/modelRouting'
export * from './agents/prompts'
export * from './agents/contracts'
export * from './agents/client'

// Anbindung an die Oberflaeche (UI-Spezifikation Kapitel 15).
export * from './ui'
