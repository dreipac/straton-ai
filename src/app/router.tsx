import { Navigate, Outlet, RouterProvider, createHashRouter, useLocation, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { FirstLoginPasswordModal } from '../features/auth/components/FirstLoginPasswordModal'
import { useAuth } from '../features/auth/context/useAuth'
import { ChatPage } from '../pages/ChatPage'
import { LearnPage } from '../pages/LearnPage'
import { LoginPage } from '../pages/LoginPage'
import { RegisterPage } from '../pages/RegisterPage'

function AuthSessionLayout() {
  const { user, profile, isLoading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (isLoading) {
      return
    }
    const path = location.pathname
    if (!user) {
      if (path === '/first-login-password') {
        navigate('/login', { replace: true })
      }
      return
    }
    if (!profile) {
      return
    }
    if (path === '/first-login-password') {
      navigate('/chat', { replace: true })
    }
  }, [isLoading, user, profile, location.pathname, navigate])

  return (
    <>
      <Outlet />
      <FirstLoginPasswordModal />
    </>
  )
}

const router = createHashRouter([
  {
    element: <AuthSessionLayout />,
    children: [
      {
        path: '/',
        element: <Navigate to="/chat" replace />,
      },
      {
        path: '/login',
        element: <LoginPage />,
      },
      {
        path: '/register',
        element: <RegisterPage />,
      },
      {
        path: '/first-login-password',
        element: <Navigate to="/chat" replace />,
      },
      {
        path: '/chat',
        element: <ChatPage />,
      },
      {
        path: '/learn',
        element: <LearnPage />,
      },
      {
        path: '/settings',
        element: <Navigate to="/chat" replace />,
      },
      {
        path: '*',
        element: <Navigate to="/chat" replace />,
      },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
