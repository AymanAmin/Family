import { useEffect, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { compressPersonPhoto, PERSON_PHOTO_MAX_BYTES, type CompressedPersonPhoto } from '../lib/personPhotoUpload'
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

const PHOTO_BUCKET = 'person-photos'

function personIdFromHash() {
  if (typeof window === 'undefined') return ''
  const route = decodeURIComponent(window.location.hash.replace(/^#\/?/, ''))
  const [target, id] = route.split('/')
  return target === 'person' && id ? id.trim() : ''
}

function ensureActionHost(hero: HTMLElement) {
  const actionGroup = hero.querySelector<HTMLElement>('.record-action-group')
  const parent = actionGroup ?? hero
  let host = hero.querySelector<HTMLElement>('.person-photo-control-host')

  if (!host) {
    host = document.createElement('span')
    host.className = 'person-photo-control-host'
    host.style.display = 'contents'
  }

  // Do not portal directly into RecordEditButton's React-managed children.
  // During client-side navigation that component can render again after this
  // control, which used to remove the externally inserted photo button. A
  // dedicated portal host is recreated/reparented whenever React replaces it.
  if (host.parentElement !== parent) parent.appendChild(host)
  return host
}

function readPersonContext(): ContextState | null {
  const hero = document.querySelector<HTMLElement>('.detail-page .detail-hero')
  if (!hero) return null

  const anchor = hero.querySelector<HTMLElement>('.person-context-anchor[data-person-context-id]')
  const personId = anchor?.dataset.personContextId?.trim() || personIdFromHash()
  if (!personId) return null

  const personName = hero.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim() || ''
  if (!personName) return null

  const host = ensureActionHost(hero)
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

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes >= 100 * 1024 ? 0 : 1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function storageObjectNameFromUrl(value: string) {
  if (!value) return ''
  try {
    const url = new URL(value)
    const marker = `/storage/v1/object/public/${PHOTO_BUCKET}/`
    const index = url.pathname.indexOf(marker)
    if (index < 0) return ''
    const name = decodeURIComponent(url.pathname.slice(index + marker.length))
    return name && !name.includes('/') ? name : ''
  } catch {
    return ''
  }
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
  const [selectedPhoto, setSelectedPhoto] = useState<CompressedPersonPhoto | null>(null)
  const [selectedFileName, setSelectedFileName] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [loadingPhoto, setLoadingPhoto] = useState(false)
  const [compressing, setCompressing] = useState(false)
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
    let retryTimer = 0

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

    const refreshAfterNavigation = () => {
      refresh()
      window.clearTimeout(retryTimer)
      // A second pass covers lazy/Suspense transitions where the destination
      // hero is committed just after the navigation event.
      retryTimer = window.setTimeout(refresh, 120)
    }

    const observer = new MutationObserver(refresh)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-person-context-id'],
    })
    window.addEventListener('hashchange', refreshAfterNavigation)
    window.addEventListener('popstate', refreshAfterNavigation)
    window.addEventListener('sila:route-changed', refreshAfterNavigation)
    window.addEventListener('sila:history-navigation', refreshAfterNavigation)
    refresh()

    return () => {
      observer.disconnect()
      window.removeEventListener('hashchange', refreshAfterNavigation)
      window.removeEventListener('popstate', refreshAfterNavigation)
      window.removeEventListener('sila:route-changed', refreshAfterNavigation)
      window.removeEventListener('sila:history-navigation', refreshAfterNavigation)
      window.clearTimeout(retryTimer)
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

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  function resetSelection() {
    setSelectedPhoto(null)
    setSelectedFileName('')
    setPreviewUrl('')
  }

  function openEditor() {
    resetSelection()
    setMessage('')
    setOpen(true)
  }

  function openGoogleImporter() {
    setGoogleMessage('')
    setGoogleOpen(true)
  }

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || compressing || busy) return

    setCompressing(true)
    setMessage('جارٍ ضغط الصورة تلقائيًا إلى 50KB أو أقل…')
    resetSelection()

    try {
      const compressed = await compressPersonPhoto(file)
      const objectUrl = URL.createObjectURL(compressed.blob)
      setSelectedPhoto(compressed)
      setSelectedFileName(file.name)
      setPreviewUrl(objectUrl)
      setMessage(`تم ضغط الصورة من ${formatFileSize(file.size)} إلى ${formatFileSize(compressed.blob.size)}. النسخة المضغوطة فقط هي التي سترفع.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر ضغط الصورة المختارة.')
    } finally {
      setCompressing(false)
    }
  }

  async function saveUploadedPhoto() {
    if (!supabase || !context?.personId || busy || compressing) return
    if (!selectedPhoto) {
      setMessage('اختر صورة من جهازك أولًا.')
      return
    }

    if (selectedPhoto.blob.size > PERSON_PHOTO_MAX_BYTES) {
      setMessage('الصورة المضغوطة ما زالت أكبر من 50KB. اختر صورة أخرى.')
      return
    }

    setBusy(true)
    setMessage('جارٍ رفع الصورة المضغوطة…')

    const objectName = `${context.personId}.${selectedPhoto.extension}`
    const previousObject = storageObjectNameFromUrl(photoUrl)
    const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(objectName, selectedPhoto.blob, {
      cacheControl: '3600',
      contentType: selectedPhoto.mimeType,
      upsert: true,
    })

    if (uploadError) {
      setBusy(false)
      setMessage(uploadError.message || 'تعذر رفع الصورة.')
      return
    }

    const { data: publicData } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(objectName)
    const versionedUrl = `${publicData.publicUrl}?v=${Date.now()}`
    const { data, error } = await supabase.rpc('set_person_photo_url', {
      p_person_id: context.personId,
      p_photo_url: versionedUrl,
    })

    if (error) {
      setBusy(false)
      setMessage(error.message || 'تم رفع الملف لكن تعذر ربطه بسجل الشخص.')
      return
    }

    const saved = typeof data === 'string' ? data : versionedUrl
    const alternateName = `${context.personId}.${selectedPhoto.extension === 'webp' ? 'jpg' : 'webp'}`
    const cleanup = [previousObject, alternateName].filter((name, index, values) => name && name !== objectName && values.indexOf(name) === index)
    if (cleanup.length) void supabase.storage.from(PHOTO_BUCKET).remove(cleanup)

    setPhotoUrl(saved)
    notifyPersonPhotoUpdated(context.personName, saved)
    window.dispatchEvent(new Event('family:person-photo-storage-changed'))
    setBusy(false)
    setMessage(`تم حفظ الصورة بنجاح بحجم ${formatFileSize(selectedPhoto.blob.size)}.`)
    resetSelection()
    window.setTimeout(() => setOpen(false), 900)
  }

  async function removePhoto() {
    if (!supabase || !context?.personId || busy) return
    setBusy(true)
    setMessage('جارٍ إزالة الصورة…')

    const oldObject = storageObjectNameFromUrl(photoUrl)
    const { error } = await supabase.rpc('set_person_photo_url', {
      p_person_id: context.personId,
      p_photo_url: null,
    })

    if (error) {
      setBusy(false)
      setMessage(error.message || 'تعذر إزالة الصورة.')
      return
    }

    if (oldObject) {
      await supabase.storage.from(PHOTO_BUCKET).remove([oldObject])
      window.dispatchEvent(new Event('family:person-photo-storage-changed'))
    }

    setPhotoUrl('')
    notifyPersonPhotoUpdated(context.personName, null)
    resetSelection()
    setBusy(false)
    setMessage('تم حذف الصورة والعودة للأيقونة الافتراضية.')
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
    setGoogleMessage('تم استخدام صورة Google لحساب الشخص.')
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
    <div className="record-edit-overlay person-photo-admin-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && !compressing && setOpen(false)}>
      <section className="record-edit-sheet person-photo-admin-sheet" role="dialog" aria-modal="true" aria-label={`صورة ${context.personName}`}>
        <div className="record-edit-heading">
          <div><span>للمدراء فقط</span><h2>صورة {context.personName}</h2></div>
          <button type="button" onClick={() => !busy && !compressing && setOpen(false)} aria-label="إغلاق">×</button>
        </div>

        <div className="person-photo-admin-form">
          <p className="person-photo-admin-note">اختر أي صورة من الجوال أو الكمبيوتر. المنصة ستضغطها تلقائيًا إلى حد أقصى 50KB قبل الرفع؛ لا تحتاج إلى تصغير الصورة بنفسك.</p>

          <label className={`person-photo-upload-picker${compressing ? ' is-busy' : ''}`}>
            <input type="file" accept="image/*" onChange={(event) => void choosePhoto(event)} disabled={busy || compressing} />
            <span className="person-photo-upload-icon" aria-hidden="true">＋</span>
            <span>
              <strong>{compressing ? 'جارٍ ضغط الصورة…' : 'اختيار صورة من الجهاز'}</strong>
              <small>يمكن اختيار صورة كبيرة؛ سيتم حفظ النسخة المضغوطة فقط.</small>
            </span>
          </label>

          {previewUrl && selectedPhoto && <div className="person-photo-admin-preview person-photo-upload-preview">
            <img src={previewUrl} alt={`معاينة الصورة المضغوطة لـ ${context.personName}`} />
            <span>
              <strong>{selectedFileName || 'الصورة المختارة'}</strong>
              <small>قبل الضغط: {formatFileSize(selectedPhoto.originalBytes)} · بعد الضغط: {formatFileSize(selectedPhoto.blob.size)} · {selectedPhoto.width}×{selectedPhoto.height}</small>
            </span>
          </div>}

          {!previewUrl && photoUrl && <div className="person-photo-admin-preview person-photo-upload-preview">
            <img src={photoUrl} alt={`الصورة الحالية لـ ${context.personName}`} />
            <span><strong>الصورة الحالية</strong><small>اختر صورة جديدة لاستبدالها.</small></span>
          </div>}

          {message && <div className="record-edit-message">{message}</div>}
          <div className="person-photo-admin-actions">
            <button type="button" className="secondary" disabled={busy || compressing} onClick={() => setOpen(false)}>إلغاء</button>
            {photoUrl && <button type="button" className="person-photo-remove" disabled={busy || compressing} onClick={() => void removePhoto()}>إزالة الصورة</button>}
            <button type="button" className="primary" disabled={busy || compressing || !selectedPhoto} onClick={() => void saveUploadedPhoto()}>{busy ? 'جارٍ الحفظ…' : 'حفظ الصورة'}</button>
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
          <p className="person-photo-admin-note">هذا الخيار يستخدم صورة حساب Google المرتبطة بالحساب الموثّق. رفع الصور اليدوي من زر «إضافة صورة» يتم ضغطه تلقائيًا إلى 50KB.</p>
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
