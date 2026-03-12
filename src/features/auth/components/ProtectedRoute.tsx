import type { PropsWithChildren } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

export function ProtectedRoute({ children }: PropsWithChildren) {
  const { user, isLoading, isConfigured } = useAuth()

  if (!isConfigured) {
    return (
      <main className="page-shell">
        <section className="panel">
          <h1>Supabase Setup fehlt</h1>
          <p>
            Bitte setze <code>VITE_SUPABASE_URL</code> und <code>VITE_SUPABASE_ANON_KEY</code>,
            dann neu starten.
          </p>
        </section>
      </main>
    )
  }

  if (isLoading) {
    return (
      <main className="page-shell">
        <section className="panel">
          <p>Lade Session...</p>
        </section>
      </main>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
