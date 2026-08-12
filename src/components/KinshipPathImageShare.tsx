import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { KinshipPathStep } from './KinshipPathGraph'
import { createKinshipPathImage, type KinshipPathImageExport } from '../lib/kinshipPathImageExport'
import '../kinship-path-image-share.css'

type Props = {
  fromPersonId: string
  toPersonId: string
  fromName: string
  toName: string
  relationshipLabel: string
  relationshipDetail: string
  degree: number | null
  viaMarriage: boolean
  isBloodRelation: boolean
  path: KinshipPathStep[]
}

type Preview = KinshipPathImageExport & { url: string; shareUrl: string }

function currentKinshipShareUrl(fromPersonId: string, toPersonId: string) {
  const url = new URL(window.location.href)
  const sensitiveKeys = ['access_token', 'refresh_token', 'provider_token', 'provider_refresh_token', 'code']
  sensitiveKeys.forEach((key) => url.searchParams.delete(key))
  url.searchParams.set('kinshipFrom', fromPersonId)
  url.searchParams.set('kinshipTo', toPersonId)
  url.searchParams.set('kinshipMode', 'path')
  if (!url.hash || !url.hash.startsWith('#/')) url.hash = '#/tree'
  return url.toString()
}

function shareCopy(props: Props, shareUrl: string) {
  const kind = props.isBloodRelation ? 'صلة نسب' : props.viaMarriage ? 'صلة مصاهرة' : 'صلة قرابة'
  return [
    `🌿 ${props.toName} بالنسبة إلى ${props.fromName}: ${props.relationshipLabel}`,
    `${kind}${props.degree == null ? '' : ` · ${props.degree} درجات`}`,
    props.relationshipDetail,
    '',
    `🔗 عرض المخطط والتفاصيل المحدثة: ${shareUrl}`,
  ].filter(Boolean).join('\n')
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export default function KinshipPathImageShare(props: Props) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const shareUrl = useMemo(() => currentKinshipShareUrl(props.fromPersonId, props.toPersonId), [props.fromPersonId, props.toPersonId])
  const text = useMemo(() => shareCopy(props, shareUrl), [props, shareUrl])

  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url)
  }, [preview?.url])

  useEffect(() => {
    if (!preview) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [preview])

  function close() {
    if (preview?.url) URL.revokeObjectURL(preview.url)
    setPreview(null)
    setMessage('')
  }

  async function generate() {
    if (busy || !props.path.length) return
    setBusy(true)
    setMessage('جارٍ إنشاء صورة صلة القرابة…')
    try {
      const image = await createKinshipPathImage({
        fromName: props.fromName,
        toName: props.toName,
        relationshipLabel: props.relationshipLabel,
        relationshipDetail: props.relationshipDetail,
        degree: props.degree,
        viaMarriage: props.viaMarriage,
        isBloodRelation: props.isBloodRelation,
        path: props.path,
        shareUrl,
      })
      if (preview?.url) URL.revokeObjectURL(preview.url)
      setPreview({ ...image, url: URL.createObjectURL(image.blob), shareUrl })
      setMessage('')
    } catch (error) {
      console.error('kinship path image generation failed', error)
      setMessage(error instanceof Error ? error.message : 'تعذر إنشاء الصورة على هذا الجهاز.')
    } finally {
      setBusy(false)
    }
  }

  async function share() {
    if (!preview) return
    setMessage('')
    try {
      const file = new File([preview.blob], preview.fileName, { type: 'image/png', lastModified: Date.now() })
      const fileOnly: ShareData = { files: [file] }
      const data: ShareData = {
        title: `${props.relationshipLabel} — ${props.fromName} و${props.toName}`,
        text,
        files: [file],
      }
      const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean }
      if (!navigator.share || (nav.canShare && !nav.canShare(fileOnly))) {
        setMessage('هذا المتصفح لا يدعم مشاركة الصورة مباشرة. نزّل PNG ثم شاركها مع نسخ النص والرابط.')
        return
      }
      await navigator.share(data)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      console.error('kinship path share failed', error)
      setMessage('تعذر فتح نافذة المشاركة. يمكنك تنزيل الصورة ونسخ النص والرابط.')
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text)
      setMessage('✓ تم نسخ نص العلاقة والرابط.')
    } catch {
      setMessage('تعذر النسخ التلقائي. يمكنك تحديد النص ونسخه يدويًا.')
    }
  }

  return <>
    <button type="button" className="kinship-path-share-launcher" disabled={busy} onClick={() => void generate()}>
      <span aria-hidden="true">↗</span>{busy ? 'جارٍ إنشاء الصورة…' : 'مشاركة كصورة'}
    </button>
    {!preview && message && <div className="kinship-path-share-inline" role="status">{message}</div>}

    {preview && createPortal(
      <div className="kinship-path-share-overlay" role="dialog" aria-modal="true" aria-labelledby="kinship-path-share-title">
        <section className="kinship-path-share-dialog">
          <header>
            <div><span>جاهزة للمشاركة</span><h2 id="kinship-path-share-title">{props.relationshipLabel}</h2><p>{props.toName} بالنسبة إلى {props.fromName}</p></div>
            <button type="button" className="kinship-path-share-close" onClick={close} aria-label="إغلاق">×</button>
          </header>

          <div className="kinship-path-share-preview"><img src={preview.url} alt={`مخطط صلة ${props.toName} بالنسبة إلى ${props.fromName}: ${props.relationshipLabel}`} /></div>

          <div className="kinship-path-share-text">
            <strong>النص المرفق مع الصورة</strong>
            <p>{text}</p>
          </div>

          {message && <div className="kinship-path-share-message" role="status" aria-live="polite">{message}</div>}

          <footer>
            <button type="button" className="primary" onClick={() => void share()}><span aria-hidden="true">↗</span> مشاركة الصورة والنص</button>
            <button type="button" onClick={() => downloadBlob(preview.blob, preview.fileName)}><span aria-hidden="true">↓</span> تنزيل PNG</button>
            <button type="button" onClick={() => void copyText()}><span aria-hidden="true">⧉</span> نسخ النص والرابط</button>
          </footer>
        </section>
      </div>,
      document.body,
    )}
  </>
}
