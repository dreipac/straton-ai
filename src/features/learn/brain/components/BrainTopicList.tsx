/**
 * Themenliste und Knotenzustaende (UI-Spezifikation 3.4 und 3.5).
 *
 * Die Zustandskodierung ist verbindlich und sitzt **primaer in der Form**, nicht in der Farbe:
 * „Farbenblindheit und ein einzelner Akzentfarbwechsel duerfen die Bedeutung nicht zerstoeren."
 * Deshalb traegt jeder Punkt eine eigene Klasse mit eigener Form (leer, gefuellt, gestrichelt,
 * Halo), und die Marken stehen zusaetzlich als Text daneben.
 *
 * Der Einschub ist ausdruecklich kein Sondermodus: „Er ist ein normaler Konzeptknoten an
 * ungewohnter Stelle. Gleiches Panel, gleiche Sitzung, nur mit Markierung und Begruendungszeile."
 * Deshalb rendert er hier dieselbe Zeile wie jeder andere Knoten — nur eingerueckt.
 */

import type { NodeBadge, NodeView, TopicView } from '../ui/pathView'

const BADGE_LABEL: Record<NodeBadge, string> = {
  insert: 'Einschub',
  new: 'neu',
  due: 'fällig',
}

const STATE_LABEL: Record<NodeView['state'], string> = {
  open: 'offen',
  current: 'jetzt dran',
  uncertain: 'unsicher',
  settled: 'gefestigt',
  due: 'fällig',
}

export type BrainTopicListProps = {
  topics: TopicView[]
  expandedTitles: Set<string>
  selectedConceptId: string | null
  onToggleTopic: (title: string) => void
  onSelectNode: (conceptId: string) => void
}

export function BrainTopicList(props: BrainTopicListProps) {
  const { topics, expandedTitles, selectedConceptId, onToggleTopic, onSelectNode } = props

  if (topics.length === 0) {
    return null
  }

  return (
    <div className="brain-topic-list">
      {topics.map((topic) => {
        const isOpen = expandedTitles.has(topic.title)
        return (
          <section key={topic.title} className={`brain-topic${isOpen ? ' is-open' : ''}`}>
            <button
              type="button"
              className="brain-topic-head"
              onClick={() => onToggleTopic(topic.title)}
              aria-expanded={isOpen}
            >
              <TopicRing settled={topic.settledCount} total={topic.nodes.length} />
              <span className="brain-topic-title">{topic.title}</span>
              <span className="brain-topic-chevron" aria-hidden="true" />
            </button>

            {/*
             * Die Liste bleibt immer im DOM und wird nur per Klasse ein-/ausgeblendet — sonst
             * springt sie beim Auf-/Zuklappen (Kapitel 3.4 verlangt keine harte Kante, siehe
             * dasselbe Muster bei `.learn-path-completed-panel` in `LearnPage.tsx`).
             */}
            <div className={`brain-node-list-panel${isOpen ? ' is-open' : ''}`} aria-hidden={!isOpen}>
              <div className="brain-node-list-panel-inner">
                <ul className="brain-node-list">
                  {topic.nodes.map((node) => (
                    <li
                      key={node.conceptId}
                      className={`brain-node brain-node--${node.state}${node.indented ? ' is-indented' : ''}${
                        node.conceptId === selectedConceptId ? ' is-selected' : ''
                      }`}
                    >
                      <button
                        type="button"
                        className="brain-node-button"
                        onClick={() => onSelectNode(node.conceptId)}
                        aria-label={`${node.name}, ${STATE_LABEL[node.state]}`}
                        tabIndex={isOpen ? 0 : -1}
                      >
                        <span className="brain-node-dot" aria-hidden="true" />
                        <span className="brain-node-body">
                          <span className="brain-node-name">{node.name}</span>
                          {node.badges.length > 0 ? (
                            <span className="brain-node-badges">
                              {node.badges.map((badge) => (
                                <span key={badge} className={`brain-node-badge brain-node-badge--${badge}`}>
                                  {BADGE_LABEL[badge]}
                                </span>
                              ))}
                            </span>
                          ) : null}
                          {/*
                           * Die Begruendungszeile gehoert zum Einschub, nicht zum Panel: der Nutzer
                           * soll den Umweg im Pfad verstehen, ohne ihn erst antippen zu muessen.
                           */}
                          {node.insertReason ? (
                            <span className="brain-node-insert-reason">{node.insertReason}</span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )
      })}
    </div>
  )
}

const RING_RADIUS = 9
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

function TopicRing({ settled, total }: { settled: number; total: number }) {
  const ratio = total > 0 ? settled / total : 0
  return (
    <span className="brain-topic-ring" aria-hidden="true">
      <svg viewBox="0 0 22 22">
        <circle className="brain-topic-ring-track" cx="11" cy="11" r={RING_RADIUS} />
        <circle
          className="brain-topic-ring-value"
          cx="11"
          cy="11"
          r={RING_RADIUS}
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - ratio)}
        />
      </svg>
    </span>
  )
}
