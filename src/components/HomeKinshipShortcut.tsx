import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import '../home-kinship-shortcut.css'

function buttonText(button: Element) {
  return button.textContent?.replace(/\s+/g, ' ').trim() || ''
}

function openKinshipPath() {
  const navigationButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.desktop-nav button, .mobile-bottom-nav button'))
  const treeButton = navigationButtons.find((button) => {
    const text = buttonText(button)
    return text.includes('شجرة العائلة') || text === 'الشجرة'
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

  useEffect(() => {
    let currentHost: HTMLElement | null = null
    let frame = 0

    const locate = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const hero = document.querySelector<HTMLElement>('.home-search-hero')

        if (!hero) {
          if (currentHost?.isConnected) currentHost.remove()
          currentHost = null
          setHost(null)
          return
        }

        if (!currentHost || !currentHost.isConnected) {
          currentHost = document.createElement('div')
          currentHost.className = 'home-kinship-shortcut-host'
          hero.insertAdjacentElement('afterend', currentHost)
          setHost(currentHost)
          return
        }

        if (currentHost.previousElementSibling !== hero) {
          hero.insertAdjacentElement('afterend', currentHost)
        }
      })
    }

    locate()
    const observer = new MutationObserver(locate)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      currentHost?.remove()
    }
  }, [])

  if (!host) return null

  return createPortal(
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
        <span className="home-kinship-shortcut-action" aria-hidden="true">←</span>
      </button>
    </section>,
    host,
  )
}
