type RelationSelectSnapshot = {
  scrollX: number
  scrollY: number
  bodyOverflow: string
  bodyOverflowY: string
  bodyTouchAction: string
  htmlOverflow: string
  htmlOverflowY: string
  htmlTouchAction: string
}

let snapshot: RelationSelectSnapshot | null = null

function isRelationSelect(target: EventTarget | null): target is HTMLSelectElement {
  return target instanceof HTMLSelectElement && Boolean(target.closest('.person-create-form .person-relation-card'))
}

function captureScrollState() {
  snapshot = {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    bodyOverflow: document.body.style.overflow,
    bodyOverflowY: document.body.style.overflowY,
    bodyTouchAction: document.body.style.touchAction,
    htmlOverflow: document.documentElement.style.overflow,
    htmlOverflowY: document.documentElement.style.overflowY,
    htmlTouchAction: document.documentElement.style.touchAction,
  }
}

function restoreInlineScrollState(state: RelationSelectSnapshot) {
  document.body.style.overflow = state.bodyOverflow
  document.body.style.overflowY = state.bodyOverflowY
  document.body.style.touchAction = state.bodyTouchAction
  document.documentElement.style.overflow = state.htmlOverflow
  document.documentElement.style.overflowY = state.htmlOverflowY
  document.documentElement.style.touchAction = state.htmlTouchAction
}

function recoverRelationFormScroll(select: HTMLSelectElement) {
  const state = snapshot ?? {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    bodyOverflow: document.body.style.overflow,
    bodyOverflowY: document.body.style.overflowY,
    bodyTouchAction: document.body.style.touchAction,
    htmlOverflow: document.documentElement.style.overflow,
    htmlOverflowY: document.documentElement.style.overflowY,
    htmlTouchAction: document.documentElement.style.touchAction,
  }

  // Android browsers can keep the native <select> interaction/focus alive while
  // React mounts the related-person picker below it. Releasing focus first and
  // restoring the exact pre-select scroll state prevents the page from becoming
  // stuck after the relationship type changes.
  select.blur()

  requestAnimationFrame(() => {
    restoreInlineScrollState(state)
    window.scrollTo(state.scrollX, state.scrollY)

    requestAnimationFrame(() => {
      restoreInlineScrollState(state)
      window.scrollTo(state.scrollX, state.scrollY)
      snapshot = null
    })
  })
}

export function installPersonRelationScrollFix() {
  document.addEventListener('pointerdown', (event) => {
    if (isRelationSelect(event.target)) captureScrollState()
  }, true)

  document.addEventListener('touchstart', (event) => {
    if (isRelationSelect(event.target)) captureScrollState()
  }, { capture: true, passive: true })

  document.addEventListener('change', (event) => {
    if (!isRelationSelect(event.target)) return
    recoverRelationFormScroll(event.target)
  }, true)
}

installPersonRelationScrollFix()
