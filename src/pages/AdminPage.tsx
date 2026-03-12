import { useEffect, useMemo, useState } from 'react'
import accountIcon from '../assets/icons/account.svg'
import aiIcon from '../assets/icons/ai.svg'
import generalIcon from '../assets/icons/general.svg'
import { ModalHeader } from '../components/ui/modal/ModalHeader'
import { listAdminUsers, type AdminUser } from '../features/auth/services/admin.service'

type AdminSectionId = 'overview' | 'users' | 'roles' | 'aiProviders'

type AdminSection = {
  id: AdminSectionId
  label: string
  title: string
  icon: string
}

const sections: AdminSection[] = [
  { id: 'overview', label: 'Uebersicht', title: 'Administrator Uebersicht', icon: generalIcon },
  { id: 'users', label: 'Nutzer', title: 'Nutzerverwaltung', icon: accountIcon },
  { id: 'roles', label: 'Rollen', title: 'Rollen und Rechte', icon: accountIcon },
  { id: 'aiProviders', label: 'KI Provider', title: 'KI Provider konfigurieren', icon: aiIcon },
]

type AdministratorModalProps = {
  onClose: () => void
}

export function AdministratorModal({ onClose }: AdministratorModalProps) {
  const [activeSection, setActiveSection] = useState<AdminSectionId>('overview')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [isLoadingUsers, setIsLoadingUsers] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)

  const activeSectionConfig = useMemo(
    () => sections.find((section) => section.id === activeSection) ?? sections[0],
    [activeSection],
  )

  useEffect(() => {
    if (activeSection !== 'users') {
      return
    }

    let isMounted = true

    async function loadUsers() {
      try {
        setIsLoadingUsers(true)
        setUsersError(null)
        const nextUsers = await listAdminUsers()
        if (isMounted) {
          setUsers(nextUsers)
        }
      } catch (err) {
        if (isMounted) {
          setUsersError(err instanceof Error ? err.message : 'Nutzer konnten nicht geladen werden.')
        }
      } finally {
        if (isMounted) {
          setIsLoadingUsers(false)
        }
      }
    }

    void loadUsers()

    return () => {
      isMounted = false
    }
  }, [activeSection])

  function getUserLabel(user: AdminUser) {
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
    if (fullName) {
      return fullName
    }
    return user.email ?? user.id
  }

  return (
    <section className="settings-modal" role="dialog" aria-modal="true" aria-label="Administrator">
      <aside className="settings-sidebar">
        <h2>Menue</h2>
        <nav className="settings-menu">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`settings-menu-item ${activeSection === section.id ? 'is-active' : ''}`}
              onClick={() => setActiveSection(section.id)}
            >
              <img className="ui-icon settings-menu-icon" src={section.icon} alt="" aria-hidden="true" />
              {section.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="settings-content">
        <header className="settings-titlebar">
          <ModalHeader
            title={activeSectionConfig.title}
            headingLevel="h1"
            onClose={onClose}
            closeLabel="Administrator schliessen"
          />
        </header>

        <section className="settings-body">
          {activeSection === 'overview' ? (
            <article className="settings-card">
              <p>Hier kannst du administrative Aktionen und Systemstatus zentral verwalten.</p>
            </article>
          ) : null}
          {activeSection === 'users' ? (
            <div className="admin-users-panel">
              <p className="admin-users-warning">
                Achtung: Aenderungen in diesem Bereich koennen kritische Berechtigungen beeinflussen. Bitte nur mit
                Vorsicht bearbeiten.
              </p>
              {usersError ? <p className="error-text">{usersError}</p> : null}
              {isLoadingUsers ? <p>Lade Nutzer...</p> : null}
              {!isLoadingUsers ? (
                <div className="admin-users-list" role="list" aria-label="Nutzerliste">
                  {users.map((user) => (
                    <div key={user.id} className="admin-user-row" role="listitem">
                      <div className="admin-user-meta">
                        <p className="admin-user-name">{getUserLabel(user)}</p>
                        <p className="admin-user-email">{user.email ?? '-'}</p>
                      </div>
                      {user.is_superadmin ? <span className="account-admin-badge">Admin</span> : null}
                    </div>
                  ))}
                  {!usersError && users.length === 0 ? (
                    <p className="admin-user-empty">Keine Nutzer gefunden.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {activeSection === 'roles' ? (
            <article className="settings-card">
              <p>Hier kannst du Rollen, Zugriffe und Berechtigungskonzepte pflegen.</p>
            </article>
          ) : null}
          {activeSection === 'aiProviders' ? (
            <article className="settings-card">
              <p>
                KI-Provider-Keys werden aus Sicherheitsgruenden nicht mehr in der Datenbank gepflegt.
                Bitte nutze Supabase Secrets fuer die Edge Function.
              </p>
              <div className="admin-ai-form">
                <p>
                  Setze in Supabase unter <strong>Project Settings - Edge Functions - Secrets</strong>:
                </p>
                <ul className="settings-list">
                  <li>
                    <strong>OPENAI_API_KEY</strong>
                  </li>
                  <li>
                    <strong>ANTHROPIC_API_KEY</strong> (optional)
                  </li>
                </ul>
                <p>
                  Danach die Function <strong>chat-completion</strong> neu deployen. Das Frontend braucht keine
                  Provider-Secrets.
                </p>
              </div>
            </article>
          ) : null}
        </section>
      </div>
    </section>
  )
}
