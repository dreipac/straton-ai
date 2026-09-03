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

import { useMemo, useRef, useState } from 'react'
import { ContentBottomSheet, type ContentBottomSheetHandle } from '../../../../components/ui/bottom-sheet/ContentBottomSheet'
import type { BrainPathState } from '../hooks/useBrainPath'
import type { MapQuestionResponse } from '../ui/insightsView'
import { buildInsightsCard } from '../ui/insightsView'
import { buildNodePanel, buildNowCard, groupIntoTopics, type BrainValueTerm } from '../ui/pathView'
import type { SprintCardView } from '../ui/sprintView'
import { BrainInsightsCard } from './BrainInsightsCard'
import { BrainNodePanel } from './BrainNodePanel'
import { BrainNowCard, BrainNowCardEmpty } from './BrainNowCard'
import { BrainSprintNotice } from './BrainSprintNotice'
import { BrainTopicList } from './BrainTopicList'

export type BrainPathTabProps = {
  state: BrainPathState
  /**
   * „Oeffnet sich beim Antippen eines Knotens — rechts auf Desktop, als Sheet von unten auf Mobil"
   * (`BrainNodePanel`-Dateikopf, Kapitel 3.6). Steuert, ob das Knoten-Panel als seitlicher/unten
   * wachsender Slot (Desktop/Tablet) oder als eigenes Sheet (Mobil) erscheint.
   */
  isMobile: boolean
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
  /*
   * Der Sprint-Hinweis (Kapitel 6.3). Fertig berechnet von aussen statt hier: der Zustand „fuer
   * diesmal ausgeschlagen" muss einen Tabwechsel ueberleben, dieser Tab wird dabei aber
   * abgeraeumt. Die Ansicht selbst haengt am Fuss der Jetzt-Karte und gehoert deshalb hierher.
   */
  sprintCard: SprintCardView
  /** Den vorgeschlagenen Umfang uebernehmen — oder zusaetzliche Konzepte hereinnehmen. */
  onApplySprintScope: (conceptIds: string[]) => void
  /** Den vollen Umfang behalten — die Tiefe sinkt trotzdem (Leiter des Verzichts). */
  onKeepFullSprintScope: () => void
  /** Das Rueckhol-Angebot fuer diesmal ausschlagen. */
  onDismissSprintOffer: () => void
  isBusy?: boolean
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
   * Auf Mobil ist das Panel ein `ContentBottomSheet` statt des in-flow wachsenden Slots — dessen
   * Schliess-Animation laeuft ueber `requestClose()` (siehe `ContentBottomSheet`-Dateikopf), nicht
   * ueber direktes Nullen von `selectedConceptId`. Beide Wege muenden am Ende in `onExitComplete`
   * bzw. direkt hier, je nachdem, welcher aktiv ist.
   */
  const nodeSheetRef = useRef<ContentBottomSheetHandle | null>(null)

  function closeNodePanel() {
    if (props.isMobile) {
      nodeSheetRef.current?.requestClose()
      return
    }
    setSelectedConceptId(null)
  }

  function handleSelectNode(conceptId: string) {
    if (selectedConceptId === conceptId) {
      closeNodePanel()
      return
    }
    setSelectedConceptId(conceptId)
  }

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
        goal: data.goal,
        nowIso,
      }),
    [data.concepts, data.images, data.order, currentConceptId, data.goal, nowIso],
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
      {/*
        * Die Klammer ist noetig, damit der Gitterabstand von `.brain-path` sich nicht zwischen
        * Jetzt-Karte und Sprint-Band legt: das Band liegt dicht darunter (siehe
        * `BrainSprintNotice`), der Abstand zum naechsten Baustein bleibt der normale.
        */}
      <div className="brain-now-stack">
        {nowCard ? (
          <BrainNowCard
            card={nowCard}
            onStart={() => props.onStartSession(nowCard.conceptId)}
            onDefer={() => props.onDeferConcept(nowCard.conceptId)}
          />
        ) : (
          <BrainNowCardEmpty hasConcepts={data.concepts.length > 0} />
        )}

        <BrainSprintNotice
          card={props.sprintCard}
          onApplyScope={props.onApplySprintScope}
          onKeepAll={props.onKeepFullSprintScope}
          onDismiss={props.onDismissSprintOffer}
          isBusy={props.isBusy}
        />
      </div>

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
          onSelectNode={handleSelectNode}
        />

        {props.isMobile ? (
          /*
           * Mobil: „als Sheet von unten" (Kapitel 3.6) statt des seitlichen/wachsenden Slots.
           * `open` bleibt waehrend der Schliess-Animation `true` — `closeNodePanel` nullt
           * `selectedConceptId` erst in `onExitComplete`, wenn das Sheet schon unten ist.
           */
          <ContentBottomSheet
            ref={nodeSheetRef}
            open={selectedConceptId !== null}
            onExitComplete={() => setSelectedConceptId(null)}
            showCloseButton={false}
            showHandle
            panelClassName="brain-node-panel-sheet-panel"
          >
            {selectedPanel ? (
              <BrainNodePanel
                panel={selectedPanel}
                onShowValueInfo={props.onShowValueInfo}
                onPractise={props.onPractiseConcept}
                onExplain={props.onExplainConcept}
                onAskInChat={props.onAskInChat}
                onEdit={props.onEditConcept}
                onClose={closeNodePanel}
              />
            ) : null}
          </ContentBottomSheet>
        ) : (
          /*
           * Der Slot bleibt immer im DOM und wandert nur per Klasse zwischen zu und offen —
           * dasselbe Muster wie `.brain-node-list-panel` bei den Themen (siehe `BrainTopicList`),
           * damit das Panel mit derselben Animation erscheint, mit der auch ein Thema aufklappt,
           * und die Themenliste-Spalte im selben Zug sichtbar schrumpft statt hart umzuspringen.
           */
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
                  onClose={closeNodePanel}
                />
              ) : null}
            </div>
          </div>
        )}
      </div>

      <BrainInsightsCard
        card={insights}
        onRespondObservation={props.onRespondObservation}
        onRespondMapQuestion={props.onRespondMapQuestion}
      />
    </div>
  )
}
