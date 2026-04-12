import { Navigate } from 'react-router-dom'
import { LoginForm } from '../features/auth/components/LoginForm'
import { useAuth } from '../features/auth/context/useAuth'

export function LoginPage() {
  const { user, profile } = useAuth()

  if (user && profile?.must_change_password_on_first_login) {
    return <Navigate to="/chat" replace />
  }

  if (user) {
    return <Navigate to="/chat" replace />
  }

  return (
    <main className="page-shell">
      <LoginForm />
    </main>
  )
}
