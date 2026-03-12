import { Navigate } from 'react-router-dom'
import { LoginForm } from '../features/auth/components/LoginForm'
import { useAuth } from '../features/auth/context/useAuth'

export function LoginPage() {
  const { user } = useAuth()

  if (user) {
    return <Navigate to="/chat" replace />
  }

  return (
    <main className="page-shell">
      <LoginForm />
    </main>
  )
}
