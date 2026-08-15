import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { notifyPersonPhotoUpdated } from './PersonPhotoEverywhere'

type ContextState = {
  personId: string
  personName: string
  host: HTMLElement
}

type ProfileRole = {
  role?: string | null
  account_status?: string | null
}

function readPersonContext(): ContextState | null {
  const anchor = document.querySelector<HTMLElement>('.detail-hero .person-context-anchor[data-person-context-id]')
  const personId = anchor?.dataset.personContextId?.trim() || ''
  const hero = anchor?.closest<HTMLElement>('.detail-hero') ?? null
  const personName = hero?.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim() || ''
  const host = hero?.querySelector<HTMLElement>('.record-action-group') ?? hero
  if (!personId || !personName || !host) return null
  return { personId, personName, host }
}

function isValidHttpsUrl(value: string) {
  if (!value.trim()) return true
  try {
    return new URL(value.trim()).protocol === 'https:'
  } catch {
    return false
  }
}

export default function PersonPhotoAdminControl() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [context, setContext] = useState<ContextState | null>(null)
  const [open, setOpen] = useState(false)
  const [photoUrl, setPhotoUrl] = useState('')
  const [draftUrl, setDraftUrl] = useState('')
  const [loadingPhoto, setLoadingPhoto] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadRole() {
      if (!supabase) return
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user.id
      if (!userId) {
        if (!cancelled) setIsAdmin(false)
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('role,account_status')
        .eq('id', userId)
        .maybeSingle()

      if (cancelled) return
      const profile = (data as ProfileRole | null) ?? null
      setIsAdmin(!error && profile?.account_status === 'active' && (profile.role === 'admin' || profile.role === 'super_admin'))
    }

    void loadRole()
    const { data: authListener } = supabase?.auth.onAuthStateChange(() => { void loadRole() }) ?? { data: null }
    return () => {
      cancelled = true
      authListener?.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let frame = 0
    const refresh = () => {
      if (frame) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        frame = 0
        const next = readPersonContext()
        setContext((current) => {
          if (!next && !current) return current
          if (next && current && next.personId === current.personId && next.personName === current.personName && next.host === current.host) return current
          return next
        })
      })
    }

    const observer = new MutationObserver(refresh)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('hashchange', refresh)
    refresh()

    return () => {
      observer.disconnect()
      window.removeEventListener('hashchange', refresh)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadPhoto() {
      if (!supabase || !context?.personId) {
        setPhotoUrl('')
        return
      }
      setLoadingPhoto(true)
      const { data, error } = await supabase
        .from('people')
        .select('photo_url')
        .eq('id', context.personId)
        .maybeSingle()
      if (cancelled) return
      const value = !error && typeof data?.photo_url === 'string' ? data.photo_url : ''
      setPhotoUrl(value)
      setLoadingPhoto(false)
    }
    void loadPhoto()
    return () => { cancelled = true }
  }, [context?.personId])

  function openEditor() {
    setDraftUrl(photoUrl)
    setMessage('')
    setOpen(true)
  }

  async function savePhotoUrl() {
    if (!supabase || !context?.personId || busy) return
    const value = draftUrl.trim()
    if (!isValidHttpsUrl(value)) {
      setMessage('استخدم رابط صورة يبدأ بـ https:// فقط.')
      return
    }

    setBusy(true)
    setMessage('')
    const { data, error } = await supabase.rpc('set_person_photo_url', {
      p_person_id: context.personId,
      p_photo_url: value || null,
    })
    setBusy(false)

    if (error) {
      const lowered = error.message.toLowerCase()
      if (lowered.includes('only administrators')) setMessage('هذه الخاصية متاحة للمدراء فقط.')
      else if (lowered.includes('https')) setMessage('الرابط يجب أن يكون رابط HTTPS صالحًا.')
      else setMessage(error.message || 'تعذر حفظ رابط الصورة.')
      return
    }

    const saved = typeof data === 'string' ? data : ''
    setPhotoUrl(saved)
    notifyPersonPhotoUpdated(context.personName, saved || null)
    setMessage(saved ? 'تم حفظ رابط الصورة، وسيظهر في بطاقات الشخص مباشرة.' : 'تم حذف رابط الصورة والعودة للأيقونة الافتراضية.')
    window.setTimeout(() => setOpen(false), 850)
  }

  if (!isAdmin || !context) return null

  const action = createPortal(
    <button className="person-photo-admin-trigger" type="button" onClick={openEditor} disabled={loadingPhoto}>
      <span aria-hidden="true">▣</span>
      {loadingPhoto ? 'جارٍ التحميل…' : photoUrl ? 'تعديل الصورة' : 'إضافة صورة'}
    </button>,
    context.host,
  )

  const modal = open ? createPortal(
    <div className="record-edit-overlay person-photo-admin-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && setOpen(false)}>
      <section className="record-edit-sheet person-photo-admin-sheet" role="dialog" aria-modal="true" aria-label={`صورة ${context.personName}`}>
        <div className="record-edit-heading">
          <div><span>للمدراء فقط</span><h2>رابط صورة {context.personName}</h2></div>
          <button type="button" onClick={() => !busy && setOpen(false)} aria-label="إغلاق">×</button>
        </div>

        <div className="person-photo-admin-form">
          <p className="person-photo-admin-note">لا يتم رفع أي ملف إلى السيرفر. النظام يحفظ رابط الصورة فقط ويستخدمه عند عرض هذا الشخص في المنصة.</p>
          <label className="person-photo-url-field">
            <span>رابط الصورة <small>استخدم رابط HTTPS مباشر للصورة.</small></span>
            <input type="url" inputMode="url" dir="ltr" value={draftUrl} onChange={(event) => setDraftUrl(event.target.value)} placeholder="https://example.com/photo.jpg" autoComplete="off" />
          </label>

          {draftUrl.trim() && isValidHttpsUrl(draftUrl) && <div className="person-photo-admin-preview">
            <img src={draftUrl.trim()} alt={`معاينة صورة ${context.personName}`} />
            <span><strong>معاينة الرابط</strong><small>{draftUrl.trim()}</small></span>
          </div>}

          {message && <div className="record-edit-message">{message}</div>}
          <div className="person-photo-admin-actions">
            <button type="button" className="secondary" disabled={busy} onClick={() => setOpen(false)}>إلغاء</button>
            {photoUrl && <button type="button" className="person-photo-remove" disabled={busy} onClick={() => setDraftUrl('')}>إزالة الصورة</button>}
            <button type="button" className="primary" disabled={busy} onClick={() => void savePhotoUrl()}>{busy ? 'جارٍ الحفظ…' : 'حفظ الرابط'}</button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  ) : null

  return <>{action}{modal}</>
}
