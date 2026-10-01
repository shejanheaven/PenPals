import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/fraunces/soft.css'
import '@fontsource-variable/fraunces/soft-italic.css'
import './styles/app.css'
import App from './App.jsx'
import { getState } from './store/store.js'
import { applyTheme } from './lib/theme.js'
import { registerServiceWorker, startScheduler } from './services/notifications.js'
import { listenForInstallPrompt } from './services/install.js'
import { initCloud } from './services/cloud.js'
import { drainNotificationActions, readLaunchParams } from './integrations/capture.js'

applyTheme(getState().settings)
const launch = readLaunchParams()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App launch={launch} />
  </StrictMode>,
)

listenForInstallPrompt()
registerServiceWorker().then(() => drainNotificationActions())
startScheduler()
initCloud().catch((err) => console.warn('Cadence: cloud unavailable', err))
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && drainNotificationActions())
