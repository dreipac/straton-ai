/**
 * Admin-Bereich „Gehirn-Agenten" — die Vermittlungsschicht aus Kapitel 12 als Oberflaeche.
 *
 * Hier wird gepflegt, welche Gehirn-Rolle auf welchem Modell laeuft. Aenderungen wirken SOFORT;
 * es gibt bewusst keinen Entwurf/Deploy-Zwischenschritt wie bei den Abo-Einstellungen. Eine
 * Rollenkonfiguration ist eine Betriebseinstellung und soll sich im Fehlerfall in Sekunden
 * zurueckdrehen lassen.
 *
 * Der Planer taucht hier nicht auf und wird es nie: er ist deterministisch (Invariante I11).
 * Statt ihn wegzulassen und dadurch die Frage offenzulassen, steht am Ende der Liste eine Zeile,
 * die das ausdruecklich erklaert — sonst sucht ein Administrator ihn und haelt sein Fehlen fuer
 * einen Fehler.
 *
 * Diese Datei ist die einzige Stelle im `brain/`-Modul mit React. Sie wird von `brain/index.ts`
 * bewusst NICHT reexportiert, damit die oeffentliche Schnittstelle des Gehirns rein bleibt.
 */

import { useEffect, useMemo, useState } from 'react'
import { PrimaryButton } from '../../../../components/ui/buttons/PrimaryButton'
import type { BrainAgentModelBinding, BrainAgentRole, BrainModelProvider } from '../types'
import { ALL_ROLES, roleSpec } from '../agents/roles'
import {
  ALLOWED_MODELS,
  ALL_PROVIDERS,
  FALLBACK_BINDINGS,
  escalationAvailable,
  isAllowedModel,
  validateRouting,
  type RoutingProblem,
} from '../agents/modelRouting'
import {
  loadAgentModelBindings,
  setAgentModelBinding,
} from '../services/brainAgentModels.persistence'

const PROVIDER_LABEL: Record<BrainModelProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Claude (Anthropic)',
  gemini: 'Gemini (Google)',
}

/** Das erste zugelassene Modell eines Anbieters — Vorbelegung beim Anbieterwechsel. */
function firstModelOf(provider: BrainModelProvider): string {
  return ALLOWED_MODELS[provider][0]?.id ?? ''
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Unbekannter Fehler.'
}

type RowState = {
  binding: BrainAgentModelBinding
  saving: boolean
  info: string
  error: string
}

export function BrainAgentModelsSection() {
  const [rows, setRows] = useState<Record<BrainAgentRole, RowState> | null>(null)
  const [loadError, setLoadError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      try {
        const bindings = await loadAgentModelBindings()
        if (cancelled) {
          return
        }
        const next = {} as Record<BrainAgentRole, RowState>
        for (const role of ALL_ROLES) {
          next[role] = {
            binding: bindings.get(role) ?? FALLBACK_BINDINGS[role],
            saving: false,
            info: '',
            error: '',
          }
        }
        setRows(next)
        setLoadError('')
      } catch (error) {
        if (!cancelled) {
          setLoadError(messageFrom(error))
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * Vorabpruefung derselben Regeln, die auch die Datenbank durchsetzt.
   *
   * Doppelt geprueft, weil beide Pruefungen verschiedene Aufgaben haben: hier soll der Fehler
   * sichtbar sein, BEVOR gespeichert wird; dort ist er die verbindliche Grenze, an der auch ein
   * umgangener Client scheitert.
   */
  const problems: RoutingProblem[] = useMemo(() => {
    if (!rows) {
      return []
    }
    const bindings = new Map<BrainAgentRole, BrainAgentModelBinding>()
    for (const role of ALL_ROLES) {
      bindings.set(role, rows[role].binding)
    }
    return validateRouting(bindings)
  }, [rows])

  function problemsFor(role: BrainAgentRole): RoutingProblem[] {
    return problems.filter((problem) => problem.roles.includes(role))
  }

  function patch(role: BrainAgentRole, changes: Partial<BrainAgentModelBinding>) {
    setRows((current) => {
      if (!current) {
        return current
      }
      return {
        ...current,
        [role]: {
          ...current[role],
          binding: { ...current[role].binding, ...changes },
          info: '',
          error: '',
        },
      }
    })
  }

  async function save(role: BrainAgentRole) {
    if (!rows) {
      return
    }
    const binding = rows[role].binding

    setRows((current) =>
      current ? { ...current, [role]: { ...current[role], saving: true, info: '', error: '' } } : current,
    )

    try {
      await setAgentModelBinding({
        role,
        provider: binding.provider,
        model: binding.model,
        escalationProvider: binding.escalationProvider,
        escalationModel: binding.escalationModel,
        maxOutputTokens: binding.maxOutputTokens,
      })
      setRows((current) =>
        current
          ? {
              ...current,
              [role]: { ...current[role], saving: false, info: 'Gespeichert — sofort aktiv.', error: '' },
            }
          : current,
      )
    } catch (error) {
      setRows((current) =>
        current
          ? { ...current, [role]: { ...current[role], saving: false, info: '', error: messageFrom(error) } }
          : current,
      )
    }
  }

  if (isLoading) {
    return (
      <article className="settings-card">
        <p className="admin-users-hint">Rollenkonfiguration wird geladen…</p>
      </article>
    )
  }

  if (loadError || !rows) {
    return (
      <article className="settings-card">
        <p className="admin-users-warning">
          Die Rollenkonfiguration konnte nicht geladen werden: {loadError || 'Unbekannter Fehler.'}
        </p>
        <p className="admin-users-hint">
          Bis dahin laufen alle Rollen auf ihrer Notbelegung. Das Gehirn bleibt damit funktionsfähig.
        </p>
      </article>
    )
  }

  const blockingProblems = problems.filter((problem) => problem.severity === 'error')

  return (
    <>
      <article className="settings-card">
        <p>
          Jede Rolle des Lern-Gehirns läuft auf einem eigenen Modell. Die Rollen kennen die Modelle nie
          direkt — diese Zuordnung ist die Vermittlungsschicht dazwischen. Ein Modellwechsel ist deshalb
          eine Einstellung, kein Umbau, und wirkt <strong>sofort</strong> ohne Deployment.
        </p>
        {blockingProblems.length > 0 ? (
          <p className="admin-users-warning">
            {blockingProblems.length === 1
              ? 'Eine Zuordnung ist unzulässig und wird beim Speichern abgelehnt.'
              : `${blockingProblems.length} Zuordnungen sind unzulässig und werden beim Speichern abgelehnt.`}
          </p>
        ) : null}
      </article>

      {ALL_ROLES.map((role) => {
        const spec = roleSpec(role)
        const row = rows[role]
        const binding = row.binding
        const rowProblems = problemsFor(role)
        const hasEscalation = binding.escalationModel != null
        const blocked = rowProblems.some((problem) => problem.severity === 'error')

        return (
          <article className="settings-card" key={role}>
            <p className="admin-subscriptions-field-label">{spec.label}</p>
            <p className="admin-users-hint" style={{ marginTop: '0.15rem' }}>
              {spec.task}. Anforderungsprofil: {spec.profile}.
            </p>

            <div className="admin-ai-form" style={{ marginTop: '0.7rem' }}>
              <div className="admin-subscriptions-create-row">
                <select
                  className="admin-user-subscription-select"
                  aria-label={`Anbieter für ${spec.label}`}
                  value={binding.provider}
                  disabled={row.saving}
                  onChange={(event) => {
                    const provider = event.target.value as BrainModelProvider
                    /* Beim Anbieterwechsel bleibt das alte Modell nur stehen, wenn der neue
                       Anbieter es kennt — sonst zeigte die Auswahl einen Wert an, den die
                       Datenbank ablehnen wuerde. */
                    patch(role, {
                      provider,
                      model: isAllowedModel(provider, binding.model) ? binding.model : firstModelOf(provider),
                    })
                  }}
                >
                  {ALL_PROVIDERS.map((provider) => (
                    <option key={provider} value={provider}>
                      {PROVIDER_LABEL[provider]}
                    </option>
                  ))}
                </select>

                <select
                  className="admin-user-subscription-select"
                  aria-label={`Modell für ${spec.label}`}
                  value={binding.model}
                  disabled={row.saving}
                  onChange={(event) => patch(role, { model: event.target.value })}
                >
                  {ALLOWED_MODELS[binding.provider].map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </select>

                <PrimaryButton type="button" disabled={row.saving || blocked} onClick={() => void save(role)}>
                  {row.saving ? 'Speichern…' : 'Speichern'}
                </PrimaryButton>
              </div>

              {spec.supportsEscalation ? (
                <>
                  <p className="admin-users-hint" style={{ marginTop: '0.4rem' }}>
                    Eskalation bei Zweifel: das günstige Modell erledigt den Normalfall, das teure wird nur
                    geweckt, wenn die Rolle sich ihrer Sache nicht sicher ist.
                  </p>
                  <div className="admin-subscriptions-create-row">
                    <select
                      className="admin-user-subscription-select"
                      aria-label={`Eskalation für ${spec.label}`}
                      value={hasEscalation ? (binding.escalationProvider ?? 'openai') : 'none'}
                      disabled={row.saving}
                      onChange={(event) => {
                        if (event.target.value === 'none') {
                          patch(role, { escalationProvider: null, escalationModel: null })
                          return
                        }
                        const provider = event.target.value as BrainModelProvider
                        patch(role, {
                          escalationProvider: provider,
                          escalationModel:
                            binding.escalationModel && isAllowedModel(provider, binding.escalationModel)
                              ? binding.escalationModel
                              : firstModelOf(provider),
                        })
                      }}
                    >
                      <option value="none">Keine Eskalation</option>
                      {ALL_PROVIDERS.map((provider) => (
                        <option key={provider} value={provider}>
                          {PROVIDER_LABEL[provider]}
                        </option>
                      ))}
                    </select>

                    {hasEscalation && binding.escalationProvider ? (
                      <select
                        className="admin-user-subscription-select"
                        aria-label={`Eskalationsmodell für ${spec.label}`}
                        value={binding.escalationModel ?? ''}
                        disabled={row.saving}
                        onChange={(event) => patch(role, { escalationModel: event.target.value })}
                      >
                        {ALLOWED_MODELS[binding.escalationProvider].map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.label}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="admin-users-hint" style={{ marginTop: '0.4rem' }}>
                  Diese Rolle eskaliert nicht — {spec.separationReason}
                </p>
              )}

              {spec.supportsEscalation && !escalationAvailable(binding) ? (
                <p className="admin-users-hint">
                  Ohne Eskalationsmodell reagiert diese Rolle auf Zweifel, indem dieselbe Sache später
                  anders verpackt erneut gefragt wird.
                </p>
              ) : null}

              {rowProblems.map((problem, index) => (
                <p
                  key={`${problem.severity}-${index}`}
                  className={problem.severity === 'error' ? 'admin-users-warning' : 'admin-users-hint'}
                >
                  {problem.message}
                </p>
              ))}

              {row.error ? <p className="admin-users-warning">{row.error}</p> : null}
              {row.info ? <p className="admin-ai-info">{row.info}</p> : null}
            </div>
          </article>
        )
      })}

      <article className="settings-card">
        <p className="admin-subscriptions-field-label">Planer</p>
        <p className="admin-users-hint" style={{ marginTop: '0.15rem' }}>
          Der Planer entscheidet, was als Nächstes drankommt — und läuft bewusst auf <strong>keinem
          Modell</strong>. Ein Modell wäre hier nicht reproduzierbar: dieselbe Ausgangslage könnte morgen
          zu einer anderen Entscheidung führen, Fehler wären nicht nachvollziehbar, gezielte Verbesserung
          unmöglich. Die Intelligenz sitzt in den Signalen, die hereinlaufen, nicht in der Auswahl.
        </p>
      </article>

      <article className="settings-card">
        <p className="admin-users-hint">
          Zwei Zuordnungen sind gesperrt, nicht bloss abgeraten: <strong>Prüfer</strong> und{' '}
          <strong>Kontrolleur</strong> dürfen nie auf demselben Modell laufen wie der{' '}
          <strong>Generator</strong>. Beide bewerten dessen Ausgabe — ein Modell, das seine eigene Arbeit
          bewertet, ist systematisch zu milde und findet seine eigenen Fehler nicht.
        </p>
        <p className="admin-users-hint">
          Für Claude-Modelle muss <strong>ANTHROPIC_API_KEY</strong> als Supabase Secret gesetzt sein,
          für Gemini <strong>GEMINI_API_KEY</strong>, für OpenAI <strong>OPENAI_API_KEY</strong>.
          Der Verbrauch erscheint im Admin-Menü «KI-Tokens» unter <code>brain_&lt;rolle&gt;</code>.
        </p>
      </article>
    </>
  )
}
