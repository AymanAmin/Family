type SwipeState = {
  active: boolean
  startX: number
  startY: number
  startScrollLeft: number
  moved: boolean
}

const attached = new WeakSet<HTMLElement>()

function attachHorizontalSwipe(el: HTMLElement) {
  if (attached.has(el)) return
  attached.add(el)

  const state: SwipeState = {
    active: false,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    moved: false,
  }

  el.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) return
    const touch = event.touches[0]
    state.active = true
    state.startX = touch.clientX
    state.startY = touch.clientY
    state.startScrollLeft = el.scrollLeft
    state.moved = false
  }, { passive: true })

  el.addEventListener('touchmove', (event) => {
    if (!state.active || event.touches.length !== 1) return

    const touch = event.touches[0]
    const deltaX = touch.clientX - state.startX
    const deltaY = touch.clientY - state.startY

    // Keep normal page scrolling for vertical gestures. For a clearly
    // horizontal swipe, take control and move the statistic strip ourselves.
    if (Math.abs(deltaX) < 4 || Math.abs(deltaX) <= Math.abs(deltaY)) return

    state.moved = true
    el.scrollLeft = state.startScrollLeft - deltaX
    event.preventDefault()
  }, { passive: false })

  const finish = () => {
    state.active = false
  }

  el.addEventListener('touchend', finish, { passive: true })
  el.addEventListener('touchcancel', finish, { passive: true })

  // A swipe starts on a clickable statistic card. Suppress the synthetic click
  // after a real drag, while preserving ordinary taps.
  el.addEventListener('click', (event) => {
    if (!state.moved) return
    event.preventDefault()
    event.stopPropagation()
    state.moved = false
  }, true)
}

function attachAll() {
  document.querySelectorAll<HTMLElement>('.app-services.unified-home-stats').forEach(attachHorizontalSwipe)
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachAll, { once: true })
  } else {
    attachAll()
  }

  const observer = new MutationObserver(attachAll)
  observer.observe(document.documentElement, { childList: true, subtree: true })
}
