const MESSAGE_SELECTOR = '.global-message'

type MessageTimer = {
  timer: number
  signature: string
}

const messageTimers = new WeakMap<Element, MessageTimer>()
let scanFrame = 0

function messageDelay(message: Element) {
  if (message.classList.contains('error')) return 6500
  if (message.classList.contains('info')) return 5000
  return 3800
}

function messageSignature(message: Element) {
  return `${message.className}|${message.textContent?.trim() ?? ''}`
}

function dismissMessage(message: Element) {
  if (!message.isConnected) return

  const closeButton = message.querySelector<HTMLButtonElement>('button')
  if (closeButton) {
    closeButton.click()
    return
  }

  message.remove()
}

function scheduleMessage(message: Element) {
  const signature = messageSignature(message)
  const existing = messageTimers.get(message)

  if (existing?.signature === signature) return
  if (existing) window.clearTimeout(existing.timer)

  const timer = window.setTimeout(() => {
    dismissMessage(message)
    messageTimers.delete(message)
  }, messageDelay(message))

  messageTimers.set(message, { timer, signature })
}

function scanMessages() {
  document.querySelectorAll(MESSAGE_SELECTOR).forEach(scheduleMessage)
}

function scheduleScan() {
  window.cancelAnimationFrame(scanFrame)
  scanFrame = window.requestAnimationFrame(scanMessages)
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleScan, { once: true })
  } else {
    scheduleScan()
  }

  const observer = new MutationObserver(scheduleScan)
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class'],
  })
}

export {}
