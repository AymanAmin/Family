const exactTextReplacements = new Map<string, string>([
  ['شجرة العائلة', 'شجرة النسب'],
  ['العائلات', 'الأسر'],
  ['العائلات المعتمدة', 'الأسر المنشأة تلقائيًا'],
  ['ملف العائلة', 'ملف الأسرة'],
  ['مسؤول عائلة', 'مسؤول أسرة'],
  ['خبر عائلي', 'خبر أسري'],
  ['صلة — البيت الرقمي للعائلة', 'صلة — البيت الرقمي للأسرة والنسب'],
  ['عائلتك، تاريخها، وأخبارها في مكان واحد.', 'أسرتك، نسبها، وأخبارها في مكان واحد.'],
  ['ساهم في توثيق العائلة', 'ساهم في توثيق النسب والأسرة'],
])

function applyHouseholdTerminology() {
  const selector = 'button,span,strong,small,h1,h2,h3,p,label,em'
  for (const element of document.querySelectorAll<HTMLElement>(selector)) {
    if (element.childElementCount > 0) continue
    const current = element.textContent?.trim() || ''
    const replacement = exactTextReplacements.get(current)
    if (replacement && current !== replacement) element.textContent = replacement
  }

  for (const input of document.querySelectorAll<HTMLInputElement>('input')) {
    const placeholder = input.placeholder
    if (placeholder.includes('شخص أو عائلة')) input.placeholder = placeholder.replace('شخص أو عائلة', 'شخص أو أسرة')
    const label = input.getAttribute('aria-label') || ''
    if (label.includes('شخص أو عائلة')) input.setAttribute('aria-label', label.replace('شخص أو عائلة', 'شخص أو أسرة'))
  }
}

let scheduled = false
function scheduleApply() {
  if (scheduled) return
  scheduled = true
  window.requestAnimationFrame(() => {
    scheduled = false
    applyHouseholdTerminology()
  })
}

applyHouseholdTerminology()
const observer = new MutationObserver(scheduleApply)
observer.observe(document.documentElement, { childList: true, subtree: true })
