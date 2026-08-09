import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { createTreeImage, downloadTreeImage, shareTreeImage, type TreeImageExport } from '../lib/treeImageExport'
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

  async function sharePreview() {
    if (!preview) return
    setMessage('')
    try {
      const title = preview.mode === 'lineage' ? `هيكل نسب ${preview.personName}` : `شبكة علاقات ${preview.personName}`
      const shared = await shareTreeImage(preview.blob, preview.fileName, title)
      if (!shared) {
        setMessage('هذا المتصفح لا يسمح بمشاركة الملفات مباشرة. نزّل PNG ثم شاركه من معرض الصور أو واتساب.')
      }
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
              <p>{preview.personName} · PNG بجودة {preview.width.toLocaleString('ar-SA')} × {preview.height.toLocaleString('ar-SA')}</p>
            </div>
            <button type="button" className="tree-image-share-close" onClick={closePreview} aria-label="إغلاق">×</button>
          </header>

          <div className="tree-image-share-preview">
            <img src={preview.url} alt={preview.mode === 'lineage' ? `هيكل نسب ${preview.personName}` : `شبكة علاقات ${preview.personName}`} />
          </div>

          {message && <div className="tree-image-share-message" role="status">{message}</div>}

          <footer>
            <button type="button" className="primary" onClick={() => void sharePreview()}><span aria-hidden="true">↗</span> مشاركة</button>
            <button type="button" onClick={() => downloadTreeImage(preview.blob, preview.fileName)}><span aria-hidden="true">↓</span> تنزيل PNG</button>
          </footer>
          <small className="tree-image-share-note">يُنشئ النظام PNG حقيقيًا من بيانات الشجرة نفسها، وليس لقطة SVG من الصفحة. في هيكل النسب تظهر الأجيال المفتوحة حاليًا؛ افتح ما تريد إظهاره قبل إنشاء الصورة.</small>
        </section>
      </div>,
      document.body,
    )}
  </>
}
