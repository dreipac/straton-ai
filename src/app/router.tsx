import { Navigate, RouterProvider, createHashRouter } from 'react-router-dom'
import { ChatPage } from '../pages/ChatPage'
import { LearnPage } from '../pages/LearnPage'
import { LoginPage } from '../pages/LoginPage'

const router = createHashRouter([
  {
    path: '/',
    element: <Navigate to="/chat" replace />,
  },
  {
    path: '/login',
    element: <LoginPage />,
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
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
