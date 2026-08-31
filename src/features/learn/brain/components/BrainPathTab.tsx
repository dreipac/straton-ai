/**
 * Der Pfad-Tab (UI-Spezifikation Kapitel 3).
 *
 * Setzt die Bausteine des Bereichs zusammen: Jetzt-Karte, Themenliste mit Knoten-Panel und —
 * ganz unten — die Einsichten-Karte. Fortschrittsring und Ziel-Chip sitzen im Seitentitel
 * (`LearnPage`) statt hier — sie gelten fuer den ganzen Pfad, nicht nur fuer diesen Tab.
 *
 * Diese Datei haelt ausschliesslich Oberflaechenzustand: welches Thema aufgeklappt ist, welcher
 * Knoten gewaehlt wurde. Alles Inhaltliche kommt aus `brain/ui/` und damit aus dem Gehirn. Die
 * Trennung ist der Grund, warum ein Layoutumbau die Produktentscheidungen aus 3.5 und 4.8 nicht
 * mitnehmen kann.
 */

import { useMemo, useState } from 'react'
import type { BrainPathState } from '../hooks/useBrainPath'
import type { MapQuestionResponse } from '../ui/insightsView'
import { buildInsightsCard } from '../ui/insightsView'
import { buildNodePanel, buildNowCard, groupIntoTopics, type BrainValueTerm } from '../ui/pathView'
import { BrainInsightsCard } from './BrainInsightsCard'
import { BrainNodePanel } from './BrainNodePanel'
import { BrainNowCard, BrainNowCardEmpty } from './BrainNowCard'
import { BrainTopicList } from './BrainTopicList'

export type BrainPathTabProps = {
  state: BrainPathState
  onStartSession: (conceptId: string) => void
  /** „Spaeter" — die Ablehnung ist selbst ein Signal (Kapitel 3.3). */
  onDeferConcept: (conceptId: string) => void
  onPractiseConcept: (conceptId: string) => void
  onExplainConcept: (conceptId: string) => void
  onAskInChat: (conceptId: string) => void
  onEditConcept: (conceptId: string) => void
  /** Oeffnet die Ein-Satz-Erklaerung eines Werts im Knoten-Panel (Kapitel 3.6). */
  onShowValueInfo: (term: BrainValueTerm) => void
  onRespondObservation: (patternId: string, agreed: boolean) => void
  onRespondMapQuestion: (proposalId: string, answer: MapQuestionResponse['answer']) => void
  /** Letzter Prueferbefund je Konzept, im Klartext (Kapitel 3.6, Punkt 4). */
  findingsByConcept?: Map<string, string>
}

export function BrainPathTab(props: BrainPathTabProps) {
  const { state } = props
  const { data, plan, conceptNames } = state

  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null)
  /*
   * Der Panel-Slot bleibt beim Schliessen im DOM, damit er per CSS wegschrumpfen kann (dieselbe
   * Aufklapp-Technik wie bei den Themen) — dafuer braucht er waehrend der Animation noch seinen
   * zuletzt gezeigten Inhalt. `displayedConceptId` haelt deshalb die letzte AUSGEWAEHLTE Id fest
   * und wird nur beim Oeffnen nachgezogen, nie beim Schliessen geleert.
   */
  const [displayedConceptId, setDisplayedConceptId] = useState<string | null>(null)
  /*
   * Setzen waehrend des Renderns statt in einem Effekt (react-hooks/set-state-in-effect,
   * gleiches Muster wie die Profil-Hydration in `useSettingsUiPreferences.ts`): `trackedConceptId`
   * verfolgt den zuletzt gesehenen `selectedConceptId` — weicht er ab, war es eine neue Auswahl,
   * und nur dann (nicht beim Schliessen auf `null`) wird `displayedConceptId` nachgezogen.
   */
  const [trackedConceptId, setTrackedConceptId] = useState(selectedConceptId)
  if (trackedConceptId !== selectedConceptId) {
    setTrackedConceptId(selectedConceptId)
    if (selectedConceptId) {
      setDisplayedConceptId(selectedConceptId)
    }
  }
  /*
   * Nur die ABWEICHUNGEN vom Standard werden gehalten, nicht der Zustand selbst.
   *
   * Der Standard steht in Kapitel 3.4: „das Thema mit dem aktuellen Knoten ist offen, alle anderen
   * zu." Er haengt am aktuellen Knoten und aendert sich damit nach jeder Sitzung. Den fertigen
   * Zustand zu speichern hiesse, ihn nach jedem Datenwechsel nachzuziehen — und genau daraus
   * entstehen die Effekte, die eine Ansicht zum Flackern bringen. Ein Umschalter ist eine
   * Abweichung; der Rest ergibt sich.
   */
  const [toggledTitles, setToggledTitles] = useState<Set<string>>(new Set())

  /*
   * `nowIso` einmal je Datenstand statt bei jedem Rendern: sonst koennte ein Knoten zwischen zwei
   * Renderdurchgaengen von „faellig" auf „gefestigt" springen, ohne dass sich etwas geaendert hat.
   */
  const nowIso = useMemo(
    () => new Date().toISOString(),
    // Absichtlich an den Daten haengend: neuer Datenstand, neuer Zeitpunkt.
    [data.concepts, data.images, data.order],
  )

  const currentConceptId = plan?.tasks[0]?.conceptId ?? null

  const nowCard = useMemo(
    () => (plan ? buildNowCard({ tasks: plan.tasks, conceptNames }) : null),
    [plan, conceptNames],
  )

  const topics = useMemo(
    () =>
      groupIntoTopics({
        concepts: data.concepts,
        images: data.images,
        order: data.order,
        currentConceptId,
        nowIso,
      }),
    [data.concepts, data.images, data.order, currentConceptId, nowIso],
  )

  const insights = useMemo(
    () =>
      buildInsightsCard({
        patterns: data.patterns,
        proposals: data.proposals,
        context: 'pathTab',
        nowIso,
      }),
    [data.patterns, data.proposals, nowIso],
  )

  /** Standard aus Kapitel 3.4, umgeschaltet durch die Abweichungen des Nutzers. */
  const expandedTitles = useMemo(() => {
    const open = new Set<string>()
    for (const topic of topics) {
      const isOpenByDefault = topic.expandedByDefault
      const isToggled = toggledTitles.has(topic.title)
      if (isOpenByDefault !== isToggled) {
        open.add(topic.title)
      }
    }
    return open
  }, [topics, toggledTitles])

  const selectedPanel = useMemo(() => {
    if (!displayedConceptId) {
      return null
    }
    const concept = data.concepts.find((entry) => entry.id === displayedConceptId)
    if (!concept) {
      return null
    }
    return buildNodePanel({
      concept,
      image: data.images.get(concept.id),
      concepts: data.concepts,
      edges: data.edges,
      lastFinding: props.findingsByConcept?.get(concept.id) ?? '',
      nowIso,
    })
  }, [displayedConceptId, data.concepts, data.images, data.edges, props.findingsByConcept, nowIso])

  if (state.error) {
    return <p className="error-text">{state.error}</p>
  }

  if (!state.hasLoadedOnce && state.isLoading) {
    return <div className="brain-path-loading" aria-busy="true">Lernstand wird geladen …</div>
  }

  return (
    <div className="brain-path">
      {nowCard ? (
        <BrainNowCard
          card={nowCard}
          onStart={() => props.onStartSession(nowCard.conceptId)}
          onDefer={() => props.onDeferConcept(nowCard.conceptId)}
        />
      ) : (
        <BrainNowCardEmpty hasConcepts={data.concepts.length > 0} />
      )}

      <div className="brain-path-body">
        <BrainTopicList
          topics={topics}
          expandedTitles={expandedTitles}
          selectedConceptId={selectedConceptId}
          onToggleTopic={(title) =>
            setToggledTitles((current) => {
              const next = new Set(current)
              if (next.has(title)) {
                next.delete(title)
              } else {
                next.add(title)
              }
              return next
            })
          }
          onSelectNode={(conceptId) =>
            setSelectedConceptId((current) => (current === conceptId ? null : conceptId))
          }
        />

        {/*
         * Der Slot bleibt immer im DOM und wandert nur per Klasse zwischen zu und offen — dasselbe
         * Muster wie `.brain-node-list-panel` bei den Themen (siehe `BrainTopicList`), damit das
         * Panel mit derselben Animation erscheint, mit der auch ein Thema aufklappt, und die
         * Themenliste-Spalte im selben Zug sichtbar schrumpft statt hart umzuspringen.
         */}
        <div
          className={`brain-node-panel-slot${selectedConceptId ? ' is-open' : ''}`}
          aria-hidden={!selectedConceptId}
          inert={!selectedConceptId}
        >
          <div className="brain-node-panel-slot-inner">
            {selectedPanel ? (
              <BrainNodePanel
                panel={selectedPanel}
                onShowValueInfo={props.onShowValueInfo}
                onPractise={props.onPractiseConcept}
                onExplain={props.onExplainConcept}
                onAskInChat={props.onAskInChat}
                onEdit={props.onEditConcept}
                onClose={() => setSelectedConceptId(null)}
              />
            ) : null}
          </div>
        </div>
      </div>

      <BrainInsightsCard
        card={insights}
        onRespondObservation={props.onRespondObservation}
        onRespondMapQuestion={props.onRespondMapQuestion}
      />
    </div>
  )
}
