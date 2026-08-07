import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { getApplicationUrl, supabase, supabaseConfiguration } from './lib/supabase'

type AuthMode = 'signin' | 'signup' | 'forgot' | 'recovery'
type View = 'home' | 'search' | 'add' | 'admin'
type AddMode = 'family' | 'person' | 'event'
type MessageTone = 'info' | 'success' | 'error'
type RecordStatus = 'pending' | 'approved' | 'rejected'

type Profile = {
  id: string
  display_name: string | null
  avatar_url: string | null
  email: string | null
  role: string
  is_primary_admin: boolean
}

type Family = {
  id: string
  name: string
  description: string | null
  origin_place: string | null
  status: RecordStatus
  created_at: string
}

type RelatedFamily = { name?: string } | { name?: string }[] | null

type Person = {
  id: string
  full_name: string
  gender: 'male' | 'female' | null
  birth_year: number | null
  is_deceased: boolean
  description: string | null
  status: RecordStatus
  family_id: string | null
  families?: RelatedFamily
  created_at: string
}

type CommunityEvent = {
  id: string
  event_type: string
  title: string
  description: string | null
  event_date: string | null
  location_name: string | null
  status: RecordStatus
  family_id: string | null
  families?: RelatedFamily
  created_at: string
}

type PendingRecord = {
  id: string
  title: string
  subtitle: string
  table: 'families' | 'people' | 'events'
  created_at: string
}

const eventLabels: Record<string, string> = {
  death: 'وفاة وعزاء',
  wedding: 'زواج',
  birth: 'مولود',
  naming: 'سماية',
  graduation: 'تخرج ونجاح',
  general: 'مناسبة عامة',
  other: 'أخرى',
}

const roleLabels: Record<string, string> = {
  member: 'عضو',
  verified_member: 'عضو موثّق',
  family_moderator: 'مسؤول عائلة',
  content_moderator: 'مشرف محتوى',
  admin: 'مدير',
  super_admin: 'المدير الأعلى',
}

function familyName(value: RelatedFamily): string {
  if (!value) return ''
  if (Array.isArray(value)) return value[0]?.name ?? ''
  return value.name ?? ''
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'غير محدد'
  return new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium' }).format(new Date(value))
}

function friendlyError(message: string): string {
  const value = message.toLowerCase()
  if (value.includes('invalid login credentials')) return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'
  if (value.includes('email not confirmed')) return 'فعّل بريدك الإلكتروني أولًا من الرسالة التي وصلتك.'
  if (value.includes('user already registered')) return 'يوجد حساب مسجل بهذا البريد.'
  if (value.includes('password should be at least')) return 'يجب ألا تقل كلمة المرور عن 8 أحرف.'
  if (value.includes('relation') && value.includes('does not exist')) return 'قاعدة بيانات المنصة لم تُجهّز بعد.'
  if (value.includes('schema cache')) return 'جداول المنصة لم تُنشأ في Supabase بعد.'
  return message || 'تعذر إكمال العملية.'
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="21" height="21">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.53h3.24c1.9-1.75 2.98-4.33 2.98-7.39Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.64-2.38l-3.24-2.53c-.9.6-2.05.96-3.4.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.61A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.39 13.92A6 6 0 0 1 6.08 12c0-.67.12-1.32.31-1.92V7.47H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.53l3.35-2.61Z" />
      <path fill="#EA4335" d="M12 5.95c1.47 0 2.79.5 3.83 1.5l2.88-2.88A9.66 9.66 0 0 0 12 2a10 10 0 0 0-8.96 5.47l3.35 2.61C7.18 7.71 9.39 5.95 12 5.95Z" />
    </svg>
  )
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(true)
  const [schemaReady, setSchemaReady] = useState(true)
  const [view, setView] = useState<View>('home')
  const [authMode, setAuthMode] = useState<AuthMode>('signin')
  const [addMode, setAddMode] = useState<AddMode>('family')
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<MessageTone>('info')
  const [busy, setBusy] = useState(false)

  const [families, setFamilies] = useState<Family[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [events, setEvents] = useState<CommunityEvent[]>([])
  const [pending, setPending] = useState<PendingRecord[]>([])

  const [searchTerm, setSearchTerm] = useState('')
  const [searchFamilies, setSearchFamilies] = useState<Family[]>([])
  const [searchPeople, setSearchPeople] = useState<Person[]>([])
  const [searching, setSearching] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')

  const [familyForm, setFamilyForm] = useState({ name: '', origin_place: '', description: '' })
  const [personForm, setPersonForm] = useState({ full_name: '', family_id: '', gender: '', birth_year: '', description: '' })
  const [eventForm, setEventForm] = useState({ event_type: 'general', title: '', family_id: '', event_date: '', location_name: '', description: '' })

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const showMessage = useCallback((text: string, tone: MessageTone = 'info') => {
    setMessage(text)
    setMessageTone(tone)
  }, [])

  const loadProfile = useCallback(async (activeSession: Session | null) => {
    if (!supabase || !activeSession?.user) {
      setProfile(null)
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id,email,display_name,avatar_url,role,is_primary_admin')
      .eq('id', activeSession.user.id)
      .maybeSingle()

    if (error) {
      if (error.message.toLowerCase().includes('schema cache') || error.message.toLowerCase().includes('does not exist')) {
        setSchemaReady(false)
      }
      setProfile(null)
      return
    }

    setProfile(data as Profile | null)
  }, [])

  const loadCommunityData = useCallback(async () => {
    if (!supabase) {
      setSchemaReady(false)
      setDataLoading(false)
      return
    }

    setDataLoading(true)
    const [familyResult, peopleResult, eventResult] = await Promise.all([
      supabase.from('families').select('id,name,description,origin_place,status,created_at').order('name').limit(100),
      supabase.from('people').select('id,full_name,gender,birth_year,is_deceased,description,status,family_id,created_at,families(name)').order('full_name').limit(100),
      supabase.from('events').select('id,event_type,title,description,event_date,location_name,status,family_id,created_at,families(name)').order('event_date', { ascending: false, nullsFirst: false }).limit(30),
    ])

    const firstError = familyResult.error || peopleResult.error || eventResult.error
    if (firstError) {
      const lowered = firstError.message.toLowerCase()
      setSchemaReady(!(lowered.includes('schema cache') || lowered.includes('does not exist') || firstError.code === 'PGRST205'))
      setFamilies([])
      setPeople([])
      setEvents([])
      setDataLoading(false)
      return
    }

    setSchemaReady(true)
    setFamilies((familyResult.data ?? []) as Family[])
    setPeople((peopleResult.data ?? []) as Person[])
    setEvents((eventResult.data ?? []) as CommunityEvent[])
    setDataLoading(false)
  }, [])

  const loadPending = useCallback(async () => {
    if (!supabase || !isAdmin) {
      setPending([])
      return
    }

    const [familyResult, peopleResult, eventResult] = await Promise.all([
      supabase.from('families').select('id,name,origin_place,created_at').eq('status', 'pending').order('created_at'),
      supabase.from('people').select('id,full_name,created_at,families(name)').eq('status', 'pending').order('created_at'),
      supabase.from('events').select('id,title,event_type,created_at').eq('status', 'pending').order('created_at'),
    ])

    const rows: PendingRecord[] = []
    for (const item of familyResult.data ?? []) {
      rows.push({ id: item.id, title: item.name, subtitle: item.origin_place || 'عائلة جديدة', table: 'families', created_at: item.created_at })
    }
    for (const item of peopleResult.data ?? []) {
      rows.push({ id: item.id, title: item.full_name, subtitle: familyName(item.families as RelatedFamily) || 'شخص جديد', table: 'people', created_at: item.created_at })
    }
    for (const item of eventResult.data ?? []) {
      rows.push({ id: item.id, title: item.title, subtitle: eventLabels[item.event_type] || item.event_type, table: 'events', created_at: item.created_at })
    }
    setPending(rows.sort((a, b) => a.created_at.localeCompare(b.created_at)))
  }, [isAdmin])

  useEffect(() => {
    if (!supabase) {
      setSessionLoading(false)
      void loadCommunityData()
      return
    }

    let mounted = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setSessionLoading(false)
      void loadProfile(data.session)
    })

    const handleAuthChange = (event: AuthChangeEvent, nextSession: Session | null) => {
      if (!mounted) return
      setSession(nextSession)
      setSessionLoading(false)
      void loadProfile(nextSession)
      if (event === 'PASSWORD_RECOVERY') {
        setAuthMode('recovery')
        setView('home')
        showMessage('اكتب كلمة مرور جديدة لحسابك.', 'info')
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthChange)
    void loadCommunityData()

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadCommunityData, loadProfile, showMessage])

  useEffect(() => {
    void loadPending()
  }, [loadPending, families, people, events])

  const visibleFamilies = useMemo(() => families.filter((item) => item.status === 'approved' || item.status === 'pending'), [families])
  const approvedFamilies = useMemo(() => families.filter((item) => item.status === 'approved'), [families])
  const approvedPeople = useMemo(() => people.filter((item) => item.status === 'approved'), [people])
  const approvedEvents = useMemo(() => events.filter((item) => item.status === 'approved'), [events])

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return showMessage('تعذر الاتصال بخدمة الحسابات.', 'error')
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) return showMessage('أدخل البريد الإلكتروني.', 'error')

    setBusy(true)
    if (authMode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo: getApplicationUrl() })
      setBusy(false)
      return error
        ? showMessage(friendlyError(error.message), 'error')
        : showMessage('أرسلنا رابط استعادة كلمة المرور إلى بريدك.', 'success')
    }

    if (password.length < 8) {
      setBusy(false)
      return showMessage('يجب ألا تقل كلمة المرور عن 8 أحرف.', 'error')
    }

    if (authMode === 'signup') {
      if (fullName.trim().length < 3) {
        setBusy(false)
        return showMessage('اكتب اسمك الكامل.', 'error')
      }
      if (password !== confirmPassword) {
        setBusy(false)
        return showMessage('كلمتا المرور غير متطابقتين.', 'error')
      }
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: { emailRedirectTo: getApplicationUrl(), data: { full_name: fullName.trim() } },
      })
      setBusy(false)
      if (error) return showMessage(friendlyError(error.message), 'error')
      return showMessage(data.session ? 'تم إنشاء الحساب وتسجيل الدخول.' : 'تم إنشاء الحساب. افتح رسالة تفعيل البريد ثم سجّل الدخول.', 'success')
    }

    if (authMode === 'recovery') {
      if (password !== confirmPassword) {
        setBusy(false)
        return showMessage('كلمتا المرور غير متطابقتين.', 'error')
      }
      const { error } = await supabase.auth.updateUser({ password })
      setBusy(false)
      if (error) return showMessage(friendlyError(error.message), 'error')
      setAuthMode('signin')
      return showMessage('تم تغيير كلمة المرور بنجاح.', 'success')
    }

    const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
    setBusy(false)
    if (error) return showMessage(friendlyError(error.message), 'error')
    setPassword('')
    showMessage('تم تسجيل الدخول بنجاح.', 'success')
  }

  async function signInWithGoogle() {
    if (!supabase || !supabaseConfiguration.isComplete) return showMessage('إعداد Google غير مكتمل.', 'error')
    setBusy(true)
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: getApplicationUrl(), scopes: 'openid email profile' } })
    if (error) {
      setBusy(false)
      showMessage(friendlyError(error.message), 'error')
    }
  }

  async function signOut() {
    if (!supabase) return
    setBusy(true)
    await supabase.auth.signOut()
    setBusy(false)
    setProfile(null)
    setView('home')
  }

  async function runSearch(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (!supabase || !schemaReady) return
    const term = searchTerm.trim()
    if (!term) return showMessage('اكتب اسم شخص أو عائلة.', 'info')

    setSearching(true)
    setView('search')
    const [familyResult, peopleResult] = await Promise.all([
      supabase.from('families').select('id,name,description,origin_place,status,created_at').ilike('name', `%${term}%`).order('name').limit(50),
      supabase.from('people').select('id,full_name,gender,birth_year,is_deceased,description,status,family_id,created_at,families(name)').ilike('full_name', `%${term}%`).order('full_name').limit(50),
    ])
    setSearching(false)
    if (familyResult.error || peopleResult.error) return showMessage(friendlyError((familyResult.error || peopleResult.error)!.message), 'error')
    setSearchFamilies((familyResult.data ?? []) as Family[])
    setSearchPeople((peopleResult.data ?? []) as Person[])
  }

  function requireAccount(): boolean {
    if (session) return true
    setView('home')
    showMessage('سجّل الدخول أولًا لتقديم إضافة جديدة.', 'info')
    window.setTimeout(() => document.getElementById('auth-panel')?.scrollIntoView({ behavior: 'smooth' }), 50)
    return false
  }

  async function submitFamily(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !session || !requireAccount()) return
    if (familyForm.name.trim().length < 2) return showMessage('اكتب اسم العائلة.', 'error')
    setBusy(true)
    const { error } = await supabase.from('families').insert({
      name: familyForm.name.trim(),
      origin_place: familyForm.origin_place.trim() || null,
      description: familyForm.description.trim() || null,
      created_by: session.user.id,
      status: 'pending',
    })
    setBusy(false)
    if (error) return showMessage(friendlyError(error.message), 'error')
    setFamilyForm({ name: '', origin_place: '', description: '' })
    showMessage('تم إرسال العائلة للمراجعة. لن تظهر للعامة قبل الاعتماد.', 'success')
    void loadCommunityData()
  }

  async function submitPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !session || !requireAccount()) return
    if (personForm.full_name.trim().length < 3) return showMessage('اكتب الاسم الكامل.', 'error')
    setBusy(true)
    const { error } = await supabase.from('people').insert({
      full_name: personForm.full_name.trim(),
      family_id: personForm.family_id || null,
      gender: personForm.gender || null,
      birth_year: personForm.birth_year ? Number(personForm.birth_year) : null,
      description: personForm.description.trim() || null,
      created_by: session.user.id,
      status: 'pending',
    })
    setBusy(false)
    if (error) return showMessage(friendlyError(error.message), 'error')
    setPersonForm({ full_name: '', family_id: '', gender: '', birth_year: '', description: '' })
    showMessage('تم إرسال الشخص للمراجعة.', 'success')
    void loadCommunityData()
  }

  async function submitEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !session || !requireAccount()) return
    if (eventForm.title.trim().length < 3) return showMessage('اكتب عنوان المناسبة.', 'error')
    setBusy(true)
    const { error } = await supabase.from('events').insert({
      event_type: eventForm.event_type,
      title: eventForm.title.trim(),
      family_id: eventForm.family_id || null,
      event_date: eventForm.event_date || null,
      location_name: eventForm.location_name.trim() || null,
      description: eventForm.description.trim() || null,
      created_by: session.user.id,
      status: 'pending',
    })
    setBusy(false)
    if (error) return showMessage(friendlyError(error.message), 'error')
    setEventForm({ event_type: 'general', title: '', family_id: '', event_date: '', location_name: '', description: '' })
    showMessage('تم إرسال المناسبة للمراجعة.', 'success')
    void loadCommunityData()
  }

  async function moderate(record: PendingRecord, status: 'approved' | 'rejected') {
    if (!supabase || !session || !isAdmin) return
    setBusy(true)
    const { error } = await supabase
      .from(record.table)
      .update({ status, approved_by: session.user.id, approved_at: status === 'approved' ? new Date().toISOString() : null })
      .eq('id', record.id)
    setBusy(false)
    if (error) return showMessage(friendlyError(error.message), 'error')
    showMessage(status === 'approved' ? 'تم اعتماد السجل.' : 'تم رفض السجل.', 'success')
    await loadCommunityData()
    await loadPending()
  }

  const userName = profile?.display_name || session?.user.user_metadata.full_name || session?.user.email?.split('@')[0] || 'عضو'

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => setView('home')}>
          <span className="brand-mark">ص</span>
          <span><strong>صلة المنطقة</strong><small>سجل أهالي المنطقة</small></span>
        </button>
        <nav>
          <button onClick={() => setView('home')} className={view === 'home' ? 'active' : ''}>الرئيسية</button>
          <button onClick={() => setView('search')} className={view === 'search' ? 'active' : ''}>البحث</button>
          <button onClick={() => requireAccount() && setView('add')} className={view === 'add' ? 'active' : ''}>إضافة</button>
          {isAdmin && <button onClick={() => setView('admin')} className={view === 'admin' ? 'active' : ''}>الإدارة</button>}
        </nav>
        <div className="account-area">
          {sessionLoading ? <span className="loading-dot" /> : session ? (
            <>
              <div className="account-copy"><strong>{userName}</strong><small>{roleLabels[profile?.role || 'member']}</small></div>
              <button className="ghost-button" onClick={signOut} disabled={busy}>خروج</button>
            </>
          ) : <button className="primary small" onClick={() => document.getElementById('auth-panel')?.scrollIntoView({ behavior: 'smooth' })}>دخول</button>}
        </div>
      </header>

      {message && <div className={`global-message ${messageTone}`} role="status"><span>{message}</span><button onClick={() => setMessage('')}>×</button></div>}

      <main>
        {!schemaReady && (
          <section className="setup-warning">
            <span className="setup-icon">!</span>
            <div>
              <h1>قاعدة البيانات لم تُجهّز بعد</h1>
              <p>الواجهة متصلة بمشروع Supabase، لكن جداول الأسر والأشخاص والمناسبات لم تُنشأ فيه. لذلك أوقفنا البيانات الوهمية بدل عرض معلومات غير حقيقية.</p>
              <code>supabase/SETUP.sql</code>
            </div>
          </section>
        )}

        {schemaReady && view === 'home' && (
          <>
            <section className="hero-panel">
              <div className="hero-copy">
                <span className="eyebrow">بيانات حقيقية فقط</span>
                <h1>ابحث عن أهلك، ووثّق أسر منطقتك ومناسباتها.</h1>
                <p>لا يظهر أي شخص أو عائلة أو مناسبة للعامة إلا بعد مراجعتها واعتمادها.</p>
                <form className="search-bar" onSubmit={runSearch}>
                  <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="ابحث باسم شخص أو عائلة" />
                  <button className="primary" type="submit">بحث</button>
                </form>
                <div className="hero-actions">
                  <button className="primary" onClick={() => requireAccount() && setView('add')}>إضافة معلومة</button>
                  <button className="secondary" onClick={() => setView('search')}>فتح دليل المنطقة</button>
                </div>
              </div>
              <div className="real-stats">
                <article><strong>{approvedFamilies.length}</strong><span>عائلة معتمدة</span></article>
                <article><strong>{approvedPeople.length}</strong><span>شخص معتمد</span></article>
                <article><strong>{approvedEvents.length}</strong><span>مناسبة منشورة</span></article>
                <article><strong>{isAdmin ? pending.length : '—'}</strong><span>{isAdmin ? 'بانتظار الاعتماد' : 'مراجعة إدارية'}</span></article>
              </div>
            </section>

            <section className="section-block">
              <div className="section-title"><div><span className="eyebrow">دليل الأسر</span><h2>العائلات المعتمدة</h2></div><button className="text-link" onClick={() => setView('search')}>عرض الكل</button></div>
              {dataLoading ? <div className="empty-state">جارٍ تحميل البيانات…</div> : approvedFamilies.length ? (
                <div className="cards-grid">
                  {approvedFamilies.slice(0, 6).map((family) => (
                    <article className="data-card" key={family.id}>
                      <span className="card-symbol">{family.name.slice(0, 1)}</span>
                      <div><h3>{family.name}</h3><p>{family.description || family.origin_place || 'لا توجد نبذة مضافة.'}</p></div>
                    </article>
                  ))}
                </div>
              ) : <div className="empty-state"><strong>لا توجد عائلات معتمدة حتى الآن</strong><span>ابدأ بإضافة أول عائلة في المنطقة.</span></div>}
            </section>

            <section className="section-block soft">
              <div className="section-title"><div><span className="eyebrow">آخر الأخبار</span><h2>المناسبات المعتمدة</h2></div></div>
              {approvedEvents.length ? (
                <div className="cards-grid event-grid">
                  {approvedEvents.slice(0, 6).map((item) => (
                    <article className="event-card" key={item.id}>
                      <div className="event-top"><span>{eventLabels[item.event_type] || item.event_type}</span><time>{formatDate(item.event_date)}</time></div>
                      <h3>{item.title}</h3>
                      <p>{item.description || 'لا توجد تفاصيل إضافية.'}</p>
                      <small>{item.location_name || familyName(item.families) || 'المكان غير محدد'}</small>
                    </article>
                  ))}
                </div>
              ) : <div className="empty-state"><strong>لا توجد مناسبات منشورة</strong><span>ستظهر المناسبات هنا بعد اعتمادها.</span></div>}
            </section>
          </>
        )}

        {schemaReady && view === 'search' && (
          <section className="page-section">
            <div className="page-heading"><span className="eyebrow">دليل المنطقة</span><h1>البحث عن الأشخاص والعائلات</h1><p>البحث يشمل السجلات المعتمدة، ويعرض للمستخدم طلباته المعلقة أيضًا.</p></div>
            <form className="search-bar wide" onSubmit={runSearch}>
              <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="اكتب الاسم" autoFocus />
              <button className="primary" type="submit" disabled={searching}>{searching ? 'جارٍ البحث…' : 'بحث'}</button>
            </form>

            {!searchTerm.trim() ? (
              <div className="directory-columns">
                <section><h2>العائلات</h2>{approvedFamilies.length ? approvedFamilies.map((item) => <article className="list-row" key={item.id}><span className="avatar-letter">{item.name[0]}</span><div><strong>{item.name}</strong><small>{item.origin_place || 'المنطقة'}</small></div></article>) : <div className="empty-state compact">لا توجد بيانات</div>}</section>
                <section><h2>الأشخاص</h2>{approvedPeople.length ? approvedPeople.map((item) => <article className="list-row" key={item.id}><span className="avatar-letter">{item.full_name[0]}</span><div><strong>{item.full_name}</strong><small>{familyName(item.families) || 'دون عائلة محددة'}{item.is_deceased ? ' · متوفى' : ''}</small></div></article>) : <div className="empty-state compact">لا توجد بيانات</div>}</section>
              </div>
            ) : (
              <div className="directory-columns">
                <section><h2>العائلات ({searchFamilies.length})</h2>{searchFamilies.length ? searchFamilies.map((item) => <article className="list-row" key={item.id}><span className="avatar-letter">{item.name[0]}</span><div><strong>{item.name}</strong><small>{item.origin_place || 'المنطقة'} · {item.status === 'pending' ? 'بانتظار الاعتماد' : 'معتمدة'}</small></div></article>) : <div className="empty-state compact">لا توجد عائلة بهذا الاسم</div>}</section>
                <section><h2>الأشخاص ({searchPeople.length})</h2>{searchPeople.length ? searchPeople.map((item) => <article className="list-row" key={item.id}><span className="avatar-letter">{item.full_name[0]}</span><div><strong>{item.full_name}</strong><small>{familyName(item.families) || 'دون عائلة'} · {item.status === 'pending' ? 'بانتظار الاعتماد' : 'معتمد'}</small></div></article>) : <div className="empty-state compact">لا يوجد شخص بهذا الاسم</div>}</section>
              </div>
            )}
          </section>
        )}

        {schemaReady && view === 'add' && session && (
          <section className="page-section narrow">
            <div className="page-heading"><span className="eyebrow">مساهمة جديدة</span><h1>أضف معلومة للمنصة</h1><p>تُحفظ الإضافة بحالة «بانتظار الاعتماد» ولا تظهر للعامة مباشرة.</p></div>
            <div className="segmented-control">
              <button className={addMode === 'family' ? 'active' : ''} onClick={() => setAddMode('family')}>عائلة</button>
              <button className={addMode === 'person' ? 'active' : ''} onClick={() => setAddMode('person')}>شخص</button>
              <button className={addMode === 'event' ? 'active' : ''} onClick={() => setAddMode('event')}>مناسبة</button>
            </div>

            {addMode === 'family' && <form className="data-form" onSubmit={submitFamily}><label><span>اسم العائلة *</span><input value={familyForm.name} onChange={(e) => setFamilyForm({ ...familyForm, name: e.target.value })} required /></label><label><span>مكان الأصل</span><input value={familyForm.origin_place} onChange={(e) => setFamilyForm({ ...familyForm, origin_place: e.target.value })} /></label><label className="full"><span>نبذة عن العائلة</span><textarea value={familyForm.description} onChange={(e) => setFamilyForm({ ...familyForm, description: e.target.value })} rows={5} /></label><button className="primary full" disabled={busy}>إرسال للمراجعة</button></form>}

            {addMode === 'person' && <form className="data-form" onSubmit={submitPerson}><label><span>الاسم الكامل *</span><input value={personForm.full_name} onChange={(e) => setPersonForm({ ...personForm, full_name: e.target.value })} required /></label><label><span>العائلة</span><select value={personForm.family_id} onChange={(e) => setPersonForm({ ...personForm, family_id: e.target.value })}><option value="">غير محددة</option>{visibleFamilies.map((item) => <option key={item.id} value={item.id}>{item.name}{item.status === 'pending' ? ' (معلقة)' : ''}</option>)}</select></label><label><span>الجنس</span><select value={personForm.gender} onChange={(e) => setPersonForm({ ...personForm, gender: e.target.value })}><option value="">غير محدد</option><option value="male">ذكر</option><option value="female">أنثى</option></select></label><label><span>سنة الميلاد</span><input type="number" min="1800" max="2100" value={personForm.birth_year} onChange={(e) => setPersonForm({ ...personForm, birth_year: e.target.value })} /></label><label className="full"><span>وصف أو نبذة</span><textarea value={personForm.description} onChange={(e) => setPersonForm({ ...personForm, description: e.target.value })} rows={5} /></label><button className="primary full" disabled={busy}>إرسال للمراجعة</button></form>}

            {addMode === 'event' && <form className="data-form" onSubmit={submitEvent}><label><span>نوع المناسبة *</span><select value={eventForm.event_type} onChange={(e) => setEventForm({ ...eventForm, event_type: e.target.value })}>{Object.entries(eventLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>عنوان المناسبة *</span><input value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} required /></label><label><span>العائلة المرتبطة</span><select value={eventForm.family_id} onChange={(e) => setEventForm({ ...eventForm, family_id: e.target.value })}><option value="">مناسبة عامة</option>{visibleFamilies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>التاريخ</span><input type="date" value={eventForm.event_date} onChange={(e) => setEventForm({ ...eventForm, event_date: e.target.value })} /></label><label className="full"><span>المكان</span><input value={eventForm.location_name} onChange={(e) => setEventForm({ ...eventForm, location_name: e.target.value })} /></label><label className="full"><span>التفاصيل</span><textarea value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} rows={5} /></label><button className="primary full" disabled={busy}>إرسال للمراجعة</button></form>}
          </section>
        )}

        {schemaReady && view === 'admin' && isAdmin && (
          <section className="page-section">
            <div className="page-heading"><span className="eyebrow">لوحة الإدارة</span><h1>طلبات بانتظار المراجعة</h1><p>اعتماد السجل يجعله ظاهرًا للعامة فورًا.</p></div>
            {pending.length ? <div className="review-list">{pending.map((record) => <article className="review-row" key={`${record.table}-${record.id}`}><div><span className="status pending">معلق</span><h3>{record.title}</h3><p>{record.subtitle} · {formatDate(record.created_at)}</p></div><div className="review-actions"><button className="approve" onClick={() => moderate(record, 'approved')} disabled={busy}>اعتماد</button><button className="reject" onClick={() => moderate(record, 'rejected')} disabled={busy}>رفض</button></div></article>)}</div> : <div className="empty-state"><strong>لا توجد طلبات معلقة</strong><span>جميع الطلبات تمت مراجعتها.</span></div>}
          </section>
        )}

        {!session && view === 'home' && (
          <section className="auth-section" id="auth-panel">
            <div className="auth-intro"><span className="eyebrow">حساب المنصة</span><h2>سجّل للمساهمة في توثيق المنطقة</h2><p>الزوار يستطيعون البحث والعرض، والتسجيل مطلوب فقط للإضافة والمتابعة.</p></div>
            <div className="auth-card">
              <div className="auth-tabs"><button className={authMode === 'signin' ? 'active' : ''} onClick={() => setAuthMode('signin')}>دخول</button><button className={authMode === 'signup' ? 'active' : ''} onClick={() => setAuthMode('signup')}>حساب جديد</button></div>
              <form onSubmit={handleAuth} className="auth-form">
                {authMode === 'signup' && <label><span>الاسم الكامل</span><input value={fullName} onChange={(e) => setFullName(e.target.value)} /></label>}
                {authMode !== 'recovery' && <label><span>البريد الإلكتروني</span><input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>}
                {authMode !== 'forgot' && <label><span>{authMode === 'recovery' ? 'كلمة المرور الجديدة' : 'كلمة المرور'}</span><input type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>}
                {(authMode === 'signup' || authMode === 'recovery') && <label><span>تأكيد كلمة المرور</span><input type="password" dir="ltr" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required /></label>}
                <button className="primary" disabled={busy}>{authMode === 'signup' ? 'إنشاء الحساب' : authMode === 'forgot' ? 'إرسال رابط الاستعادة' : authMode === 'recovery' ? 'حفظ كلمة المرور' : 'تسجيل الدخول'}</button>
              </form>
              <div className="auth-links">{authMode === 'signin' && <button onClick={() => setAuthMode('forgot')}>نسيت كلمة المرور؟</button>}{(authMode === 'forgot' || authMode === 'recovery') && <button onClick={() => setAuthMode('signin')}>العودة إلى الدخول</button>}</div>
              {authMode !== 'forgot' && authMode !== 'recovery' && <><div className="divider"><span>أو</span></div><button className="google-button" onClick={signInWithGoogle} disabled={busy}><GoogleIcon />المتابعة باستخدام Google</button></>}
            </div>
          </section>
        )}
      </main>

      <footer><strong>صلة المنطقة</strong><span>بيانات موثقة، خصوصية واضحة، ومراجعة إدارية قبل النشر.</span></footer>
    </div>
  )
}

export default App
