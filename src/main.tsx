import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './detail-avatar-icons'
import InstallPrompt from './components/InstallPrompt'
import PushNotificationSettings from './components/PushNotificationSettings'
import './styles.css'
import './mobile-app.css'
import './mobile-fixes.css'
import './mobile-shell.css'
import './phase3.css'
import './mobile-v2.css'
import './kinship-scroll.css'
import './directory-v2.css'
import './edit-compact.css'
import './kinship-extended.css'
import './public-scale.css'
import './family-tree-screen.css'
import './tree-pan-fix.css'
import './scale-ui-v2.css'
import './moderation-pagination.css'
import './role-management.css'
import './account-activity.css'
import './admin-death.css'
import './social-verification-events.css'
import './relationship-manager.css'
import './person-create-combined.css'
import './person-profile-actions.css'
import './contributor-stats.css'
import './edit-review-diff.css'
import './tree-action-buttons.css'
import './person-name-wrap.css'
import './detail-avatar-icons.css'
import './pwa-install.css'
import './push-notifications.css'

function disablePageZoom() {
  document.documentElement.style.touchAction = 'pan-x pan-y'
  document.body.style.touchAction = 'pan-x pan-y'

  const preventGesture = (event: Event) => event.preventDefault()

  document.addEventListener('gesturestart', preventGesture, { passive: false })
  document.addEventListener('gesturechange', preventGesture, { passive: false })
  document.addEventListener('gestureend', preventGesture, { passive: false })

  document.addEventListener('touchmove', (event) => {
    if (event.touches.length > 1) event.preventDefault()
  }, { passive: false })

  let lastTouchEnd = 0
  document.addEventListener('touchend', (event) => {
    const now = Date.now()
    if (now - lastTouchEnd <= 300) event.preventDefault()
    lastTouchEnd = now
  }, { passive: false })

  document.addEventListener('dblclick', preventGesture, { passive: false })
}

function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch((error) => console.warn('Service worker registration failed.', error))
  })
}

disablePageZoom()
registerServiceWorker()

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element was not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
    <InstallPrompt />
    <PushNotificationSettings />
  </StrictMode>,
)
