type RequirementChecklistItem = {
  /** Fällt auf den Index zurück, falls nicht gesetzt. */
  id?: string
  met: boolean
  label: string
}

type RequirementChecklistProps = {
  items: RequirementChecklistItem[]
  className?: string
}

/* X (unerfüllt) bzw. Haken (erfüllt) im Kreis. `key` wechselt mit dem Zustand, damit die Pop-Animation
   (`requirement-checklist-pop`, siehe ui.css) bei jedem Wechsel neu abspielt statt nur beim ersten
   Rendern. */
function RequirementMark({ met }: { met: boolean }) {
  return (
    <span className="requirement-checklist-mark" aria-hidden="true">
      {met ? (
        <svg key="met" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M2.4 6.3L4.7 8.6L9.6 3.4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg key="unmet" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 3L9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M9 3L3 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )}
    </span>
  )
}

/**
 * Dezente Mindestanforderungen-Liste: pro Zeile ein Kreis (rot/X unerfüllt, grün/Haken erfüllt, mit
 * kurzem Pop beim Wechsel) und ein Label, das von gedämpft auf normale Textfarbe wechselt, sobald
 * erfüllt. Ursprünglich für die Passwort-Anforderungen in `SecuritySettingsSection` gebaut, aber
 * bewusst ohne Passwort-Bezug gehalten — für jede Art von Mindestanforderungen wiederverwendbar.
 */
export function RequirementChecklist({ items, className }: RequirementChecklistProps) {
  const classes = ['requirement-checklist', className ?? ''].filter(Boolean).join(' ')

  return (
    <ul className={classes}>
      {items.map((item, index) => (
        <li key={item.id ?? index} className={`requirement-checklist-item${item.met ? ' is-met' : ''}`}>
          <RequirementMark met={item.met} />
          <span className="requirement-checklist-label">{item.label}</span>
        </li>
      ))}
    </ul>
  )
}
