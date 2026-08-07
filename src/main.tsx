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

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element was not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
