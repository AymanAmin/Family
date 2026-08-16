import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import PersonPhotoAdminControl from './PersonPhotoAdminControl'
import AdminStorageUsageAlert from './AdminStorageUsageAlert'
import '../home-kinship-shortcut.css'
import '../person-photo-upload.css'

function buttonText(button: Element) {
  return button.textContent?.replace(/\s+/g, ' ').trim() || ''
}

function currentPersonContextKey() {
  if (typeof window === 'undefined') return ''

  const anchor = document.querySelector<HTMLElement>('.detail-hero .person-context-anchor[data-person-context-id]')
  const anchoredId = anchor?.dataset.personContextId?.trim() || ''
  if (anchoredId) return anchoredId

  const match = window.location.hash.match(/^#\/person\/([^/?#]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

function openKinshipPath() {
  const navigationButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.desktop-nav button, .mobile-bottom-nav button'))
  const treeButton = navigationButtons.find((button) => {
    const text = buttonText(button)
    return text.includes('شجرة العائلة') || text === 'الشجرة' || text.includes('شجرة النسب')
  })

  treeButton?.click()

  let attempts = 0
  const maxAttempts = 30
  const openPathTab = () => {
    attempts += 1
    const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.tree-mode-tabs button'))
    const pathButton = tabs.find((button) => buttonText(button).includes('صلة القرابة'))
    if (pathButton) {
      pathButton.click()
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
      return
    }
    if (attempts < maxAttempts) window.setTimeout(openPathTab, 50)
  }

  window.setTimeout(openPathTab, 0)
}

export default function HomeKinshipShortcut() {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [photoContextKey, setPhotoContextKey] = useState(() => currentPersonContextKey())

  useEffect(() => {
    let currentHost: HTMLElement | null = null
    let frame = 0

    const clearHost = () => {
      if (currentHost?.isConnected) currentHost.remove()
      currentHost = null
      setHost(null)
    }

    const locate = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const nextPhotoContextKey = currentPersonContextKey()
        setPhotoContextKey((current) => current === nextPhotoContextKey ? current : nextPhotoContextKey)

        const dashboard = document.querySelector<HTMLElement>('.nasab-dashboard')
        const welcome = dashboard?.querySelector<HTMLElement>(':scope > .compact-family-welcome') ?? null
        const stats = dashboard?.querySelector<HTMLElement>(':scope > .app-services.unified-home-stats') ?? null

        if (!dashboard || !welcome || !stats) {
          if (currentHost) clearHost()
          return
        }

        // Never move the React-managed welcome card. Moving it outside its parent
        // made React recreate it on later renders, which produced duplicated hero
        // cards and unstable ordering on the home screen.
        if (!currentHost || !currentHost.isConnected || currentHost.parentElement !== dashboard) {
          if (currentHost?.isConnected) currentHost.remove()
          currentHost = document.createElement('div')
          currentHost.className = 'home-kinship-shortcut-host'
          dashboard.appendChild(currentHost)
          setHost(currentHost)
        }
      })
    }

    locate()
    const observer = new MutationObserver(locate)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-person-context-id'],
    })
    window.addEventListener('hashchange', locate)
    window.addEventListener('popstate', locate)
    window.addEventListener('sila:route-changed', locate)

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('hashchange', locate)
      window.removeEventListener('popstate', locate)
      window.removeEventListener('sila:route-changed', locate)
      clearHost()
    }
  }, [])

  return <>
    <PersonPhotoAdminControl key={photoContextKey || 'no-person'} />
    <AdminStorageUsageAlert />
    {host && createPortal(
      <section className="home-kinship-shortcut" aria-label="اختصار معرفة صلة القرابة">
        <button type="button" className="home-kinship-shortcut-button" onClick={openKinshipPath}>
          <span className="home-kinship-shortcut-icon" aria-hidden="true">
            <svg viewBox="0 0 48 48" fill="none">
              <circle cx="14" cy="14" r="6" />
              <circle cx="34" cy="14" r="6" />
              <circle cx="24" cy="34" r="6" />
              <path d="M18.5 17.5 22 28M29.5 17.5 26 28M20 14h8" />
            </svg>
          </span>
          <span className="home-kinship-shortcut-copy">
            <strong>صلة القرابة</strong>
            <small>اعرف صلة شخص بآخر مباشرة</small>
          </span>
          <span className="home-kinship-shortcut-action" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="7" r="3.5" />
              <circle cx="8" cy="24" r="3.5" />
              <circle cx="24" cy="24" r="3.5" />
              <path d="M16 10.5v5.5M8 20.5v-4.5h16v4.5" />
            </svg>
          </span>
        </button>
      </section>,
      host,
    )}
  </>
}
