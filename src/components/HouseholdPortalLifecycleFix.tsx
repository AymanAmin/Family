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

    const scheduleCleanup = (): void => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(removeStaleHouseholdPreview)
    }

    const closeForNavigation = (): void => {
      closeOpenDialogs()
      scheduleCleanup()
    }

    const handleNavigationClick = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof Element) || !isNavigationAction(target)) return

      // Let the clicked control finish its own routing first, then close the
      // previous surface before the browser paints the destination screen.
      window.queueMicrotask(closeForNavigation)
    }

    scheduleCleanup()

    const root = document.getElementById('root') ?? document.body
    const observer = new MutationObserver(scheduleCleanup)
    observer.observe(root, { childList: true, subtree: true })

    document.addEventListener('click', handleNavigationClick, true)
    window.addEventListener('hashchange', closeForNavigation)
    window.addEventListener('popstate', closeForNavigation)
    window.addEventListener('sila:navigation-start', closeForNavigation)

    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
      document.removeEventListener('click', handleNavigationClick, true)
      window.removeEventListener('hashchange', closeForNavigation)
      window.removeEventListener('popstate', closeForNavigation)
      window.removeEventListener('sila:navigation-start', closeForNavigation)
      removeStaleHouseholdPreview()
    }
  }, [])

  return null
}
