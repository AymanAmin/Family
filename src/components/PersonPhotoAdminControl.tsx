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
  linked_person_id?: string | null
}

function personIdFromHash() {
  if (typeof window === 'undefined') return ''
  const route = decodeURIComponent(window.location.hash.replace(/^#\/?/, ''))
  const [target, id] = route.split('/')
  return target === 'person' && id ? id.trim() : ''
}

function readPersonContext(): ContextState | null {
  const anchor = document.querySelector<HTMLElement>('.detail-hero .person-context-anchor[data-person-context-id]')
  const personId = anchor?.dataset.personContextId?.trim() || personIdFromHash()
  if (!personId) return null

  const hero = document.querySelector<HTMLElement>('.detail-page .detail-hero')
  const personName = hero?.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim() || ''
  const host = hero?.querySelector<HTMLElement>('.record-action-group') ?? hero
  if (!personName || !host) return null
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

function httpsMetadataPhoto(value: unknown) {
  if (typeof value !== 'string') return ''
  const url = value.trim()
  return url && isValidHttpsUrl(url) ? url : ''
}

function googlePhotoFromSessionUser(user: { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null | undefined) {
  if (!user) return ''
  const provider = typeof user.app_metadata?.provider === 'string' ? user.app_metadata.provider : ''
  const providers = Array.isArray(user.app_metadata?.providers) ? user.app_metadata.providers.map(String) : []
  if (provider !== 'google' && !providers.includes('google')) return ''

  return httpsMetadataPhoto(user.user_metadata?.picture) || httpsMetadataPhoto(user.user_metadata?.avatar_url)
}

export default function PersonPhotoAdminControl() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [linkedPersonId, setLinkedPersonId] = useState('')
  const [googlePhotoUrl, setGooglePhotoUrl] = useState('')
  const [personVerified, setPersonVerified] = useState(false)
  const [context, setContext] = useState<ContextState | null>(null)
  const [open, setOpen] = useState(false)
  const [googleOpen, setGoogleOpen] = useState(false)
  const [photoUrl, setPhotoUrl] = useState('')
  const [draftUrl, setDraftUrl] = useState('')
  const [loadingPhoto, setLoadingPhoto] = useState(false)
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [googleMessage, setGoogleMessage] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadRole() {
      if (!supabase) return
      const { data: sessionData } = await supabase.auth.getSession()
      const user = sessionData.session?.user
      const userId = user?.id
      if (!userId) {
        if (!cancelled) {
          setIsAdmin(false)
          setLinkedPersonId('')
          setGooglePhotoUrl('')
        }
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('role,account_status,linked_person_id')
        .eq('id', userId)
        .maybeSingle()

      if (cancelled) return
      const profile = (data as ProfileRole | null) ?? null
      const active = !error && profile?.account_status === 'active'
      setIsAdmin(Boolean(active && (profile?.role === 'admin' || profile?.role === 'super_admin')))
      setLinkedPersonId(active && typeof profile?.linked_person_id === 'string' ? profile.linked_person_id : '')
      setGooglePhotoUrl(active ? googlePhotoFromSessionUser(user ?? null) : '')
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
        setPersonVerified(false)
        return
      }
      setLoadingPhoto(true)
      const { data, error } = await supabase
        .from('people')
        .select('photo_url,is_verified')
        .eq('id', context.personId)
        .maybeSingle()
      if (cancelled) return
      const value = !error && typeof data?.photo_url === 'string' ? data.photo_url : ''
      setPhotoUrl(value)
      setPersonVerified(!error && Boolean(data?.is_verified))
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

  function openGoogleImporter() {
    setGoogleMessage('')
    setGoogleOpen(true)
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

  async function importGooglePhoto() {
    if (!supabase || !context || googleBusy) return
    setGoogleBusy(true)
    setGoogleMessage('')
    const { data, error } = await supabase.rpc('import_my_google_photo')
    setGoogleBusy(false)

    if (error) {
      const lowered = error.message.toLowerCase()
      if (lowered.includes('not linked')) setGoogleMessage('اربط حسابك بسجل الشخص أولًا.')
      else if (lowered.includes('verified first')) setGoogleMessage('يجب اعتماد وتوثيق ربط الحساب أولًا.')
      else if (lowered.includes('google account')) setGoogleMessage('هذه الخاصية تحتاج تسجيل الدخول بحساب Google.')
      else if (lowered.includes('photo is not available')) setGoogleMessage('لا توجد صورة متاحة في حساب Google حاليًا.')
      else setGoogleMessage(error.message || 'تعذر استيراد صورة Google.')
      return
    }

    const saved = typeof data === 'string' ? data : googlePhotoUrl
    setPhotoUrl(saved)
    notifyPersonPhotoUpdated(context.personName, saved || null)
    setGoogleMessage('تم استيراد صورة Google كرابط فقط، وستظهر في المنصة مباشرة.')
    window.setTimeout(() => setGoogleOpen(false), 950)
  }

  const canImportGoogle = Boolean(
    context
    && linkedPersonId
    && context.personId === linkedPersonId
    && personVerified
    && googlePhotoUrl,
  )

  if (!context || (!isAdmin && !canImportGoogle)) return null

  const action = createPortal(
    <>
      {isAdmin && <button className="person-photo-admin-trigger" type="button" onClick={openEditor} disabled={loadingPhoto}>
        <span aria-hidden="true">▣</span>
        {loadingPhoto ? 'جارٍ التحميل…' : photoUrl ? 'تعديل الصورة' : 'إضافة صورة'}
      </button>}
      {canImportGoogle && <button className="person-photo-admin-trigger person-google-photo-trigger" type="button" onClick={openGoogleImporter} disabled={loadingPhoto || googleBusy}>
        <span className="person-google-g" aria-hidden="true">G</span>
        {photoUrl === googlePhotoUrl ? 'صورة Google مستخدمة' : 'استخدام صورة Google'}
      </button>}
    </>,
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

  const googleModal = googleOpen && canImportGoogle ? createPortal(
    <div className="record-edit-overlay person-photo-admin-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !googleBusy && setGoogleOpen(false)}>
      <section className="record-edit-sheet person-photo-admin-sheet" role="dialog" aria-modal="true" aria-label={`استيراد صورة Google لـ ${context.personName}`}>
        <div className="record-edit-heading">
          <div><span>حساب موثّق</span><h2>استخدام صورة Google</h2></div>
          <button type="button" onClick={() => !googleBusy && setGoogleOpen(false)} aria-label="إغلاق">×</button>
        </div>

        <div className="person-photo-admin-form">
          <p className="person-photo-admin-note">سيتم حفظ رابط صورة حساب Google فقط داخل سجل الشخص. لا يتم تنزيل الصورة أو رفعها إلى خوادم المنصة.</p>
          <div className="person-photo-admin-preview person-google-photo-preview">
            <img src={googlePhotoUrl} alt={`صورة Google لـ ${context.personName}`} />
            <span><strong>صورة حساب Google</strong><small>{googlePhotoUrl}</small></span>
          </div>
          {googleMessage && <div className="record-edit-message">{googleMessage}</div>}
          <div className="person-photo-admin-actions">
            <button type="button" className="secondary" disabled={googleBusy} onClick={() => setGoogleOpen(false)}>إلغاء</button>
            <button type="button" className="primary" disabled={googleBusy || photoUrl === googlePhotoUrl} onClick={() => void importGooglePhoto()}>{googleBusy ? 'جارٍ الاستيراد…' : photoUrl === googlePhotoUrl ? 'الصورة مستخدمة حاليًا' : 'استخدام هذه الصورة'}</button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  ) : null

  return <>{action}{modal}{googleModal}</>
}
