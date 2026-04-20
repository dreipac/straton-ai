import { AppProviders } from './app/providers'
import { AppRouter } from './app/router'
import { DeployUpdatePrompt } from './components/DeployUpdatePrompt'

function App() {
  return (
    <AppProviders>
      <DeployUpdatePrompt />
      <AppRouter />
    </AppProviders>
  )
}

export default App
