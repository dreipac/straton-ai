/**
 * Der Abschnitt „Quellen" im Material-Bereich (UI-Spezifikation Kapitel 6).
 *
 * Vier Gruppen, streng getrennt: aus dem Material, selbst aufgenommen, KI-ergaenzt, ohne belegte
 * Herkunft. Die Trennung ist Invariante I4 auf Pfadebene — sie hier zugunsten einer ruhigeren
 * Liste einzuebnen hiesse, dem Nutzer die Frage zu nehmen, ob ein Konzept ueberhaupt im Unterricht
 * vorkam.
 */

import type { MaterialSourcesView, SourceGroupView } from '../ui/materialView'
import { UNVERIFIED_NOTICE } from '../ui/materialView'

export type BrainSourcesSectionProps = {
  sources: MaterialSourcesView
}

export function BrainSourcesSection({ sources }: BrainSourcesSectionProps) {
  return (
    <section className="brain-sources" aria-label="Quellen">
      <header className="brain-sources-head">
        <h3 className="brain-sources-title">Quellen</h3>
        <span className="brain-sources-counter">
          {`${sources.totalConceptCount} ${sources.totalConceptCount === 1 ? 'Konzept' : 'Konzepte'}`}
        </span>
      </header>

      <SourceGroupList title="Aus deinem Material" groups={sources.fromMaterial} />
      <SourceGroupList title="Von dir aufgenommen" groups={sources.fromUser} />

      {sources.aiSupplemented.length > 0 ? (
        <div className="brain-sources-block brain-sources-block--ai">
          <SourceGroupList title="KI-ergänzt" groups={sources.aiSupplemented} />
          <p className="brain-sources-notice">{sources.aiNotice}</p>
        </div>
      ) : null}

      {sources.unverified.length > 0 ? (
        <div className="brain-sources-block brain-sources-block--unverified">
          <SourceGroupList title="Ohne hinterlegte Herkunft" groups={sources.unverified} />
          <p className="brain-sources-notice">{UNVERIFIED_NOTICE}</p>
        </div>
      ) : null}
    </section>
  )
}

function SourceGroupList({ title, groups }: { title: string; groups: SourceGroupView[] }) {
  if (groups.length === 0) {
    return null
  }

  return (
    <div className="brain-sources-block">
      <h4 className="brain-sources-group-title">{title}</h4>
      <ul className="brain-sources-list">
        {groups.map((group) => (
          <li key={`${title}-${group.title}`} className="brain-sources-item">
            <details>
              <summary>
                <span className="brain-sources-item-name">{group.title}</span>
                <span className="brain-sources-item-count">
                  {`${group.conceptCount} ${group.conceptCount === 1 ? 'Konzept' : 'Konzepte'}`}
                </span>
              </summary>
              <p className="brain-sources-item-concepts">{group.conceptNames.join(' · ')}</p>
            </details>
          </li>
        ))}
      </ul>
    </div>
  )
}
