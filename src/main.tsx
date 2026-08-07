import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
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
import './contributor-stats.css'
import './edit-review-diff.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element was not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
