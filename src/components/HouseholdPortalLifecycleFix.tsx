import { useEffect } from 'react'

function hasHomeHouseholdAnchor(): boolean {
  return Boolean(document.querySelector('.household-home-anchor'))
}

function removeStaleHouseholdPreview(): void {
  if (hasHomeHouseholdAnchor()) return
  document.querySelectorAll<HTMLElement>('.household-home-portal-host').forEach((host) => host.remove())
}

function isVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0
}

function findDialogCloseButton(dialog: HTMLElement): HTMLButtonElement | null {
  const semanticClose = dialog.querySelector<HTMLButtonElement>([
    'button[data-modal-close]',
    'button[data-dialog-close]',
    'button[aria-label*="إغلاق"]',
    'button[aria-label*="اغلاق"]',
    'button[aria-label*="Close"]',
    'button.modal-close',
    'button.dialog-close',
    'button.sheet-close',
    'button.close-button',
  ].join(','))
  if (semanticClose) return semanticClose

  return Array.from(dialog.querySelectorAll<HTMLButtonElement>('button')).find((button) => {
    const label = button.textContent?.trim() ?? ''
    return label === '×' || label === '✕' || label === 'إغلاق' || label === 'اغلاق' || label === 'Close'
  }) ?? null
}

function closeOpenDialogs(): void {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], dialog[open]'))
    .filter(isVisible)
    .reverse()

  dialogs.forEach((dialog) => {
    const closeButton = findDialogCloseButton(dialog)
    if (closeButton && !closeButton.disabled) {
      closeButton.click()
      return
    }

    if (dialog instanceof HTMLDialogElement && dialog.open) {
      dialog.close()
    }
  })
}

function isNavigationAction(target: Element): boolean {
  if (target.closest('a[href*="#/"]')) return true

  // Keep the same close-before-leave behavior across public screens,
  // person/family drill-downs and administration/settings navigation.
  return Boolean(target.closest([
    '.desktop-nav button',
    '.mobile-bottom-nav button',
    '.back-button',
    '.service-tile',
    '.home-section-heading button',
    '.admin-console-tabs button',
    '.admin-tabs button',
    '.settings-tabs button',
    '.household-open-husband',
    '.household-spouse-heading button',
    '.household-child-grid button',
    '[data-route]',
    '[data-navigate-to-person]',
  ].join(',')))
}

export default function HouseholdPortalLifecycleFix(): null {
  useEffect(() => {
    let frame = 0
    let routeSyncTimer = 0
    let lastKnownHash = window.location.hash

    const scheduleCleanup = (): void => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(removeStaleHouseholdPreview)
    }

    const closeForNavigation = (): void => {
      closeOpenDialogs()
      scheduleCleanup()
    }

    // React changes the visible screen first and then updates the SPA hash via
    // history.pushState/replaceState. Those APIs do not emit hashchange, while
    // several route-aware enhancements (including person photos/admin controls)
    // rely on that signal. Re-emit it only when a DOM transition reveals that
    // the hash really changed, after the route has had time to settle.
    const syncSpaRoute = (): void => {
      window.clearTimeout(routeSyncTimer)
      routeSyncTimer = window.setTimeout(() => {
        const nextHash = window.location.hash
        if (nextHash === lastKnownHash) return
        lastKnownHash = nextHash
        window.dispatchEvent(new Event('hashchange'))
      }, 120)
    }

    const handleObservedMutation = (): void => {
      scheduleCleanup()
      syncSpaRoute()
    }

    const handleRouteEvent = (): void => {
      lastKnownHash = window.location.hash
      closeForNavigation()
    }

    const handleNavigationClick = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof Element) || !isNavigationAction(target)) return

      // Let the clicked control finish its own routing first, then close the
      // previous surface before the browser paints the destination screen.
      window.queueMicrotask(closeForNavigation)
      syncSpaRoute()
    }

    scheduleCleanup()

    const root = document.getElementById('root') ?? document.body
    const observer = new MutationObserver(handleObservedMutation)
    observer.observe(root, { childList: true, subtree: true })

    document.addEventListener('click', handleNavigationClick, true)
    window.addEventListener('hashchange', handleRouteEvent)
    window.addEventListener('popstate', handleRouteEvent)
    window.addEventListener('sila:navigation-start', closeForNavigation)

    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
      window.clearTimeout(routeSyncTimer)
      document.removeEventListener('click', handleNavigationClick, true)
      window.removeEventListener('hashchange', handleRouteEvent)
      window.removeEventListener('popstate', handleRouteEvent)
      window.removeEventListener('sila:navigation-start', closeForNavigation)
      removeStaleHouseholdPreview()
    }
  }, [])

  return null
}
