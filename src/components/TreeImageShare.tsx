import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { createTreeImage, downloadTreeImage, type TreeImageExport } from '../lib/treeImageExport'
import '../tree-image-share.css'

type ShareMode = 'network' | 'lineage'

type Preview = TreeImageExport & {
  url: string
  mode: ShareMode
  personName: string
}

function detectMode(section: HTMLElement): ShareMode | null {
  if (section.querySelector('.lineage-hierarchy')) return 'lineage'
  if (section.querySelector('.kinship-map')) return 'network'
  return null
}

function currentPersonName(section: HTMLElement, mode: ShareMode) {
  if (mode === 'network') {
    return section.querySelector<HTMLElement>('.kin-self strong')?.textContent?.trim() || 'شجرة العلاقات'
  }

  return section.querySelector<HTMLElement>('.lineage-focus-path button.current')?.textContent?.trim()
    || section.querySelector<HTMLElement>('.lineage-root-node.current strong')?.textContent?.trim()
    || section.querySelector<HTMLElement>('.lineage-root-node strong')?.textContent?.trim()
    || 'هيكل النسب'
}

function captureElements(section: HTMLElement, mode: ShareMode) {
  if (mode === 'lineage') {
    const hierarchy = section.querySelector<HTMLElement>('.lineage-hierarchy')
    return hierarchy ? [hierarchy] : []
  }

  const elements: HTMLElement[] = []
  const map = section.querySelector<HTMLElement>('.kinship-map')
  const extended = section.querySelector<HTMLElement>('.kin-extended-panel')
  if (map) elements.push(map)
  if (extended) elements.push(extended)
  return elements
}

function currentShareUrl() {
  const url = new URL(window.location.href)
  const sensitiveKeys = ['access_token', 'refresh_token', 'provider_token', 'provider_refresh_token', 'code']
  sensitiveKeys.forEach((key) => url.searchParams.delete(key))

  if (url.hash && !url.hash.startsWith('#/')) {
    const hash = url.hash.toLowerCase()
    if (hash.includes('access_token=') || hash.includes('refresh_token=') || hash.includes('provider_token=')) {
      url.hash = ''
    }
  }

  return url.toString()
}

function shareText(preview: Preview) {
  const viewLabel = preview.mode === 'lineage' ? 'هيكل النسب' : 'شبكة العلاقات'
  return [
    `🌿 هذه شجرة عائلة ${preview.personName}.`,
    `الصورة المرفقة تعرض ${viewLabel} على منصة صلة القرابة.`,
    '',
    'ساهم معنا في استكمال شجرة العائلة وحفظ تاريخها للأجيال القادمة. إذا لاحظت اسمًا أو علاقة ناقصة، أو معلومة تحتاج تصحيحًا، افتح الرابط وساهم بإضافة أو اقتراح البيانات الصحيحة.',
    '',
    `🔗 رابط الملف والشجرة: ${currentShareUrl()}`,
  ].join('\n')
}

export default function TreeImageShare() {
  const [section, setSection] = useState<HTMLElement | null>(null)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const [mode, setMode] = useState<ShareMode | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)

  useEffect(() => {
    let frame = 0
    function locate() {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const nextSection = document.querySelector<HTMLElement>('.kinship-section')
        const nextTarget = nextSection?.querySelector<HTMLElement>('.kinship-heading-actions') ?? null
        setSection(nextSection)
        setPortalTarget(nextTarget)
        setMode(nextSection ? detectMode(nextSection) : null)
      })
    }

    locate()
    const observer = new MutationObserver(locate)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url)
  }, [preview?.url])

  useEffect(() => {
    if (!preview) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [preview])

  const label = useMemo(() => mode === 'lineage' ? 'مشاركة هيكل النسب' : 'مشاركة شبكة العلاقات', [mode])
  const previewShareText = useMemo(() => preview ? shareText(preview) : '', [preview])

  function closePreview() {
    if (preview?.url) URL.revokeObjectURL(preview.url)
    setPreview(null)
    setMessage('')
  }

  async function generate() {
    if (!section || !mode || busy) return
    const elements = captureElements(section, mode)
    if (!elements.length) {
      setMessage('لا يوجد مخطط ظاهر يمكن مشاركته الآن.')
      return
    }

    setBusy(true)
    setMessage('جارٍ بناء صورة PNG قابلة للمشاركة…')
    try {
      const personName = currentPersonName(section, mode)
      const image = await createTreeImage({ mode, personName, elements })
      if (preview?.url) URL.revokeObjectURL(preview.url)
      const url = URL.createObjectURL(image.blob)
      setPreview({ ...image, url, mode, personName })
      setMessage('')
    } catch (error) {
      console.error('tree image generation failed', error)
      setMessage(error instanceof Error ? error.message : 'تعذر إنشاء صورة PNG على هذا الجهاز.')
    } finally {
      setBusy(false)
    }
  }

  function downloadPreview() {
    if (!preview) return
    downloadTreeImage(preview.blob, preview.fileName)
    setMessage('✓ تم تنزيل صورة PNG إلى الجهاز. يمكنك فتحها من التنزيلات أو معرض الصور.')
  }

  async function sharePreview() {
    if (!preview) return
    setMessage('')
    try {
      const viewLabel = preview.mode === 'lineage' ? 'هيكل النسب' : 'شبكة العلاقات'
      const title = `شجرة عائلة ${preview.personName} — ${viewLabel}`
      const file = new File([preview.blob], preview.fileName, { type: 'image/png', lastModified: Date.now() })
      const fileOnlyData: ShareData = { files: [file] }
      const shareData: ShareData = { title, text: shareText(preview), files: [file] }
      const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean }

      if (!navigator.share || (nav.canShare && !nav.canShare(fileOnlyData))) {
        setMessage('هذا المتصفح لا يسمح بمشاركة الملفات مباشرة. نزّل PNG ثم شاركه من معرض الصور أو واتساب.')
        return
      }

      await navigator.share(shareData)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      console.error('tree image share failed', error)
      setMessage('تعذر فتح نافذة المشاركة. نزّل PNG ثم شاركه من معرض الصور أو واتساب.')
    }
  }

  const launcher = portalTarget && mode ? createPortal(
    <button
      type="button"
      className="tree-image-share-launcher"
      disabled={busy}
      onClick={() => void generate()}
      aria-label={label}
    >
      <span aria-hidden="true">↗</span>
      {busy ? 'جارٍ إنشاء PNG…' : 'مشاركة كصورة'}
    </button>,
    portalTarget,
  ) : null

  return <>
    {launcher}
    {!preview && message && section && createPortal(<div className="tree-image-share-inline-message" role="status">{message}</div>, section)}
    {preview && createPortal(
      <div className="tree-image-share-overlay" role="dialog" aria-modal="true" aria-labelledby="tree-share-preview-title">
        <section className="tree-image-share-dialog">
          <header>
            <div>
              <span>جاهزة للمشاركة</span>
              <h2 id="tree-share-preview-title">{preview.mode === 'lineage' ? 'صورة هيكل النسب' : 'صورة شبكة العلاقات'}</h2>
              <p>شجرة عائلة {preview.personName} · PNG بجودة {preview.width.toLocaleString('ar-SA')} × {preview.height.toLocaleString('ar-SA')}</p>
            </div>
            <button type="button" className="tree-image-share-close" onClick={closePreview} aria-label="إغلاق">×</button>
          </header>

          <div className="tree-image-share-preview">
            <img src={preview.url} alt={preview.mode === 'lineage' ? `هيكل نسب ${preview.personName}` : `شبكة علاقات ${preview.personName}`} />
          </div>

          <div className="tree-image-share-copy" aria-label="النص المرفق مع المشاركة">
            <strong>النص المرفق مع الصورة</strong>
            <p>{previewShareText}</p>
          </div>

          {message && <div className="tree-image-share-message" role="status" aria-live="polite">{message}</div>}

          <footer>
            <button type="button" className="primary" onClick={() => void sharePreview()}><span aria-hidden="true">↗</span> مشاركة الصورة والنص</button>
            <button type="button" onClick={downloadPreview}><span aria-hidden="true">↓</span> تنزيل PNG</button>
          </footer>
          <small className="tree-image-share-note">تُرفق عند المشاركة رسالة توضح اسم شجرة العائلة مع رابط الملف ودعوة للمساعدة في استكمال الأسماء والعلاقات وتصحيح المعلومات. يُرتب هيكل النسب حسب الأجيال في صفوف واضحة لتكون الصورة مقروءة عند المشاركة.</small>
        </section>
      </div>,
      document.body,
    )}
  </>
}
