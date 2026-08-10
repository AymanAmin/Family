import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './detail-avatar-icons'
import './brand-identity'
import './stats-swipe-fix'
import './home-occasion-greetings'
import './household-terminology'
import './person-relation-scroll-fix'
import InstallPrompt from './components/InstallPrompt'
import PushNotificationSettings from './components/PushNotificationSettings'
import AdminVisitorStat from './components/AdminVisitorStat'
import AdminPendingDashboard from './components/AdminPendingDashboard'
import AdminLineageReview from './components/AdminLineageReview'
import AdminLineageStructure from './components/AdminLineageStructure'
import AdminLineageSyncStatus from './components/AdminLineageSyncStatus'
import AdminActivityAccess from './components/AdminActivityAccess'
import AdminBackupAccess from './components/AdminBackupAccess'
import TreeImageShare from './components/TreeImageShare'
import HouseholdExperienceUpgrade from './components/HouseholdExperienceUpgrade'
import HouseholdPortalLifecycleFix from './components/HouseholdPortalLifecycleFix'
import StructuredScopeExperience from './components/StructuredScopeExperience'
import AdminScopeAssignments from './components/AdminScopeAssignments'
import './styles.css'
import './mobile-app.css'
import './mobile-fixes.css'
import './mobile-shell.css'
import './phase3.css'
import './mobile-v2.css'
import './kinship-scroll.css'
import './people-picker-scroll.css'
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
import './push-admin-moderation.css'
import './admin-pending-dashboard.css'
import './brand-identity.css'
import './home-news-preview.css'
import './family-context-ux.css'
import './home-stats-rtl-fix.css'
import './admin-tabs-mobile-fix.css'
import './person-profile-compact.css'
import './modal-position-fix.css'

type FamilyHistoryState = Record<string, unknown> & {
  __familyApp?: boolean
  __familyDepth?: number
}

type PickerScrollGesture = {
  startX: number
  startY: number
  list: Element
  moved: boolean
}

function historyState(value: unknown): FamilyHistoryState {
  return value && typeof value === 'object' ? value as FamilyHistoryState : {}
}

function scrollAppToTop() {
  const reset = () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0

    const appShell = document.querySelector<HTMLElement>('.app-shell')
    if (appShell) appShell.scrollTop = 0
  }

  reset()
  window.requestAnimationFrame(() => {
    reset()
    window.requestAnimationFrame(reset)
  })
}

function installAppNavigationHistory() {
  const nativeReplaceState = window.history.replaceState.bind(window.history)
  const nativePushState = window.history.pushState.bind(window.history)

  if ('scrollRestoration' in window.history) {
    window.history.scrollRestoration = 'manual'
  }

  const initialState = historyState(window.history.state)
  if (!initialState.__familyApp) {
    nativeReplaceState({ ...initialState, __familyApp: true, __familyDepth: 0 }, document.title, window.location.href)
  }

  window.history.replaceState = ((state: unknown, unused: string, url?: string | URL | null) => {
    const isAppRoute = typeof url === 'string' && url.startsWith('#/')
    if (!isAppRoute) {
      nativeReplaceState(state, unused, url)
      return
    }

    const current = historyState(window.history.state)
    const incoming = historyState(state)
    const currentDepth = typeof current.__familyDepth === 'number' ? current.__familyDepth : 0

    if (window.location.hash === url) {
      nativeReplaceState({ ...incoming, __familyApp: true, __familyDepth: currentDepth }, unused, url)
      return
    }

    nativePushState({ ...incoming, __familyApp: true, __familyDepth: currentDepth + 1 }, unused, url)
    scrollAppToTop()
  }) as History['replaceState']

  window.addEventListener('hashchange', scrollAppToTop)

  window.addEventListener('popstate', () => {
    scrollAppToTop()
    if (window.location.hash.startsWith('#/')) window.location.reload()
  })

  document.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const backButton = target.closest('.back-button')
    if (!backButton) return

    const state = historyState(window.history.state)
    const depth = typeof state.__familyDepth === 'number' ? state.__familyDepth : 0
    if (depth <= 0) return

    event.preventDefault()
    event.stopPropagation()
    window.history.back()
  }, true)
}

function installPickerTouchScrollGuard() {
  const selector = '.picker-touch-scroll-list, .people-picker-menu, .family-picker-menu'
  const gestures = new Map<number, PickerScrollGesture>()
  const movementThreshold = 3
  const suppressDurationMs = 850
  let suppressClickUntil = 0
  let suppressList: Element | null = null

  function listFromTarget(target: EventTarget | null): Element | null {
    if (!(target instanceof Element)) return null
    return target.closest(selector)
  }

  document.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return
    const list = listFromTarget(event.target)
    if (!list) return

    gestures.set(event.pointerId, {
      startX: event.clientX,
      startY: event.clientY,
      list,
      moved: false,
    })
  }, true)

  document.addEventListener('pointermove', (event) => {
    const gesture = gestures.get(event.pointerId)
    if (!gesture) return

    const movedX = Math.abs(event.clientX - gesture.startX)
    const movedY = Math.abs(event.clientY - gesture.startY)
    if (movedX < movementThreshold && movedY < movementThreshold) return

    gesture.moved = true
    suppressList = gesture.list
    suppressClickUntil = Date.now() + suppressDurationMs
  }, true)

  const finishGesture = (event: PointerEvent) => {
    const gesture = gestures.get(event.pointerId)
    if (gesture?.moved) {
      suppressList = gesture.list
      suppressClickUntil = Date.now() + suppressDurationMs
    }
    gestures.delete(event.pointerId)
  }

  document.addEventListener('pointerup', finishGesture, true)
  document.addEventListener('pointercancel', finishGesture, true)

  // Android/iOS may synthesize a click after a completed finger drag. Capture it
  // before React sees it so scrolling can never accidentally select a result.
  document.addEventListener('click', (event) => {
    if (!suppressList || Date.now() > suppressClickUntil) return
    const target = event.target
    if (!(target instanceof Element)) return
    const actionable = target.closest('button, [role="option"], [data-picker-option]')
    if (!actionable || !suppressList.contains(actionable)) return

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    suppressClickUntil = 0
    suppressList = null
  }, true)
}

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

installAppNavigationHistory()
installPickerTouchScrollGuard()
disablePageZoom()
registerServiceWorker()

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element was not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
    <HouseholdExperienceUpgrade />
    <HouseholdPortalLifecycleFix />
    <StructuredScopeExperience />
    <AdminScopeAssignments />
    <InstallPrompt />
    <PushNotificationSettings />
    <AdminPendingDashboard />
    <AdminLineageReview />
    <AdminLineageStructure />
    <AdminLineageSyncStatus />
    <AdminActivityAccess />
    <AdminBackupAccess />
    <TreeImageShare />
    <AdminVisitorStat />
  </StrictMode>,
)
