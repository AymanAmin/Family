import { useEffect } from 'react'

function hasHomeHouseholdAnchor() {
  return [...document.querySelectorAll<HTMLElement>('.section-block')]
    .some((section) => section.querySelector('h2')?.textContent?.includes('العائلات المعتمدة'))
}

function removeStaleHouseholdPreview() {
  if (hasHomeHouseholdAnchor()) return
  document.querySelectorAll<HTMLElement>('.household-home-portal-host').forEach((host) => host.remove())
}

export default function HouseholdPortalLifecycleFix() {
  useEffect(() => {
    let frame = 0

    const scheduleCleanup = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(removeStaleHouseholdPreview)
    }

    scheduleCleanup()

    const root = document.getElementById('root') ?? document.body
    const observer = new MutationObserver(scheduleCleanup)
    observer.observe(root, { childList: true, subtree: true })

    window.addEventListener('hashchange', scheduleCleanup)
    window.addEventListener('popstate', scheduleCleanup)

    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
      window.removeEventListener('hashchange', scheduleCleanup)
      window.removeEventListener('popstate', scheduleCleanup)
      removeStaleHouseholdPreview()
    }
  }, [])

  return null
}
