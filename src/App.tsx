import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { getApplicationUrl, supabase, supabaseConfiguration } from './lib/supabase'
import RecordEditButton from './components/RecordEditButton'
import PersonFamilyMemberships from './components/PersonFamilyMemberships'
import PeoplePicker from './components/PeoplePicker'

const DirectoryScreen = lazy(() => import('./components/DirectoryScreen'))
const KinshipNetwork = lazy(() => import('./components/KinshipNetwork'))
const FamilyMembersPanel = lazy(() => import('./components/FamilyMembersPanel'))
const Phase3AdminQueue = lazy(() => import('./components/Phase3AdminQueue'))
const DuplicatePersonCheck = lazy(() => import('./components/DuplicatePersonCheck'))
const FamilyTreeScreen = lazy(() => import('./components/FamilyTreeScreen'))
const AdminUserRoles = lazy(() => import('./components/AdminUserRoles'))
const FamilyPicker = lazy(() => import('./components/FamilyPicker'))
import './details.css'
import './nasab-inspired.css'

type AuthMode = 'signin' | 'signup' | 'forgot' | 'recovery'
type View = 'home' | 'search' | 'tree' | 'add' | 'admin' | 'person' | 'family' | 'account'
type AddMode = 'family' | 'person' | 'event' | 'relationship'
type AdminTab = 'requests' | 'edits' | 'users'
type MessageTone = 'info' | 'success' | 'error'
type PlatformStats = { approved_families: number; approved_people: number; approved_events: number; updated_at: string }
type RecordStatus = 'pending' | 'approved' | 'rejected'

type Profile = {
  id: string
  display_name: string | null
  avatar_url: string | null
  email: string | null
  role: string
  is_primary_admin: boolean
  linked_person_id: string | null
}

type Family = {
  id: string
  name: string
  description: string | null
  origin_place: string | null
  status: RecordStatus
  created_by: string
  created_at: string
}

type RelatedFamily = { name?: string } | { name?: string }[] | null

type Person = {
  id: string
  full_name: string
  gender: 'male' | 'female' | null
  birth_year: number | null
  is_deceased: boolean
  death_date: string | null
  description: string | null
  status: RecordStatus
  family_id: string | null
  families?: RelatedFamily
  created_by: string
  created_at: string
}

type RelatedPerson =
  | { id?: string; full_name?: string }
  | { id?: string; full_name?: string }[]
  | null

type PersonRelationship = {
  id: string
  source_person_id: string
  target_person_id: string
  relation_type: string
  notes: string | null
  status: RecordStatus
  source?: RelatedPerson
  target?: RelatedPerson
  created_at: string
}

type AccountLinkRequest = {
  id: string
  person_id: string
  status: RecordStatus
  note: string | null
  people?: RelatedPerson
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
  created_by: string
  created_at: string
}

type PendingRecord = {
  id: string
  title: string
  subtitle: string
  table: 'families' | 'people' | 'events' | 'person_relationships' | 'account_link_requests'
  created_at: string
}

type PendingFeedRow = {
  id: string
  table_name: PendingRecord['table']
  title: string
  subtitle: string
  created_at: string
}

const PENDING_PAGE_SIZE = 15

const eventLabels: Record<string, string> = {
  death: 'وفاة وعزاء',
  wedding: 'زواج',
  birth: 'مولود',
  naming: 'سماية',
  graduation: 'تخرج ونجاح',
  general: 'مناسبة عامة',
  other: 'أخرى',
}

const relationshipLabels: Record<string, string> = {
  parent: 'والد أو والدة',
  child: 'ابن أو ابنة',
  spouse: 'زوج أو زوجة',
  sibling: 'أخ أو أخت',
  guardian: 'ولي أو وصي',
  other: 'صلة أخرى',
}

const inverseRelationshipLabels: Record<string, string> = {
  parent: 'ابن أو ابنة',
  child: 'والد أو والدة',
  spouse: 'زوج أو زوجة',
  sibling: 'أخ أو أخت',
  guardian: 'تحت الوصاية',
  other: 'صلة أخرى',
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

function personName(value: RelatedPerson): string {
  if (!value) return ''
  if (Array.isArray(value)) return value[0]?.full_name ?? ''
  return value.full_name ?? ''
}

function personId(value: RelatedPerson): string {
  if (!value) return ''
  if (Array.isArray(value)) return value[0]?.id ?? ''
  return value.id ?? ''
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

function LazyPanelFallback() {
  return <div className="lazy-panel-skeleton" aria-label="جارٍ تحميل الجزء المطلوب" />
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(true)
  const [schemaReady, setSchemaReady] = useState(true)
  const [view, setView] = useState<View>('home')
  const [routeReady, setRouteReady] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('signin')
  const [addMode, setAddMode] = useState<AddMode>('family')
  const [adminTab, setAdminTab] = useState<AdminTab>('requests')
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<MessageTone>('info')
  const [busy, setBusy] = useState(false)

  const [families, setFamilies] = useState<Family[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [events, setEvents] = useState<CommunityEvent[]>([])
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null)
  const [pending, setPending] = useState<PendingRecord[]>([])
  const [pendingHasMore, setPendingHasMore] = useState(false)
  const [pendingLoadingMore, setPendingLoadingMore] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  const [selectedFamily, setSelectedFamily] = useState<Family | null>(null)
  const [relationships, setRelationships] = useState<PersonRelationship[]>([])
  const [relationsLoading, setRelationsLoading] = useState(false)
  const [ownLinkRequest, setOwnLinkRequest] = useState<AccountLinkRequest | null>(null)

  const [searchTerm, setSearchTerm] = useState('')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')

  const [familyForm, setFamilyForm] = useState({ name: '', origin_place: '', description: '' })
  const [personForm, setPersonForm] = useState({ full_name: '', family_id: '', gender: '', birth_year: '', is_deceased: false, death_date: '', description: '' })
  const [eventForm, setEventForm] = useState({ event_type: 'general', title: '', family_id: '', event_date: '', location_name: '', description: '' })
  const [relationshipForm, setRelationshipForm] = useState({ source_person_id: '', relation_type: 'parent', target_person_id: '', notes: '' })

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
      .select('id,email,display_name,avatar_url,role,is_primary_admin,linked_person_id')
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
    const [familyResult, peopleResult, eventResult, statsResult] = await Promise.all([
      supabase.from('families').select('id,name,description,origin_place,status,created_by,created_at').order('created_at', { ascending: false }).limit(8),
      supabase.from('people').select('id,full_name,gender,birth_year,is_deceased,death_date,description,status,family_id,created_by,created_at,families(name)').order('created_at', { ascending: false }).limit(8),
      supabase.from('events').select('id,event_type,title,description,event_date,location_name,status,family_id,created_by,created_at,families(name)').order('event_date', { ascending: false, nullsFirst: false }).limit(8),
      supabase.rpc('get_public_platform_stats'),
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
    if (!statsResult.error) {
      const statsRow = Array.isArray(statsResult.data) ? statsResult.data[0] : null
      setPlatformStats((statsRow as PlatformStats | undefined) ?? null)
    } else {
      setPlatformStats(null)
    }
    setDataLoading(false)
  }, [])

  const loadPending = useCallback(async (offset = 0, append = false) => {
    if (!supabase || !isAdmin) {
      setPending([])
      setPendingHasMore(false)
      setPendingLoadingMore(false)
      return
    }

    if (append) setPendingLoadingMore(true)

    const feedResult = await supabase.rpc('list_pending_moderation_feed', {
      p_limit: PENDING_PAGE_SIZE + 1,
      p_offset: offset,
    })

    if (!feedResult.error) {
      const received = (feedResult.data ?? []) as PendingFeedRow[]
      const page = received.slice(0, PENDING_PAGE_SIZE).map((item): PendingRecord => ({
        id: item.id,
        title: item.title,
        subtitle: item.subtitle,
        table: item.table_name,
        created_at: item.created_at,
      }))
      setPendingHasMore(received.length > PENDING_PAGE_SIZE)
      setPending((current) => append ? [...current, ...page] : page)
      setPendingLoadingMore(false)
      return
    }

    // Compatibility fallback until migration 015 is applied. It is deliberately capped.
    if (offset > 0) {
      setPendingHasMore(false)
      setPendingLoadingMore(false)
      return
    }

    const [familyResult, peopleResult, eventResult, relationshipResult, linkResult] = await Promise.all([
      supabase.from('families').select('id,name,origin_place,created_at').eq('status', 'pending').order('created_at').limit(4),
      supabase.from('people').select('id,full_name,created_at,families(name)').eq('status', 'pending').order('created_at').limit(4),
      supabase.from('events').select('id,title,event_type,created_at').eq('status', 'pending').order('created_at').limit(4),
      supabase.from('person_relationships').select('id,relation_type,created_at,source:people!person_relationships_source_person_id_fkey(full_name),target:people!person_relationships_target_person_id_fkey(full_name)').eq('status', 'pending').order('created_at').limit(4),
      supabase.from('account_link_requests').select('id,created_at,people(full_name)').eq('status', 'pending').order('created_at').limit(4),
    ])

    const rows: PendingRecord[] = []
    for (const item of familyResult.data ?? []) rows.push({ id: item.id, title: item.name, subtitle: item.origin_place || 'عائلة جديدة', table: 'families', created_at: item.created_at })
    for (const item of peopleResult.data ?? []) rows.push({ id: item.id, title: item.full_name, subtitle: familyName(item.families as RelatedFamily) || 'شخص جديد', table: 'people', created_at: item.created_at })
    for (const item of eventResult.data ?? []) rows.push({ id: item.id, title: item.title, subtitle: eventLabels[item.event_type] || item.event_type, table: 'events', created_at: item.created_at })
    for (const item of relationshipResult.data ?? []) {
      const source = personName(item.source as RelatedPerson) || 'شخص أول'
      const target = personName(item.target as RelatedPerson) || 'شخص ثانٍ'
      rows.push({ id: item.id, title: `${source} — ${target}`, subtitle: relationshipLabels[item.relation_type] || item.relation_type, table: 'person_relationships', created_at: item.created_at })
    }
    for (const item of linkResult.data ?? []) rows.push({ id: item.id, title: personName(item.people as RelatedPerson) || 'طلب ربط حساب', subtitle: 'طلب إثبات أن الحساب يعود لهذا الشخص', table: 'account_link_requests', created_at: item.created_at })

    setPending(rows.sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, PENDING_PAGE_SIZE))
    setPendingHasMore(false)
    setPendingLoadingMore(false)
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
  }, [loadPending])

  useEffect(() => {
    if (!supabase || !session) {
      setOwnLinkRequest(null)
      return
    }

    void supabase
      .from('account_link_requests')
      .select('id,person_id,status,note,created_at,people(id,full_name)')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setOwnLinkRequest((data as AccountLinkRequest | null) ?? null))
  }, [session, profile?.linked_person_id])

  useEffect(() => {
    if (routeReady || dataLoading || sessionLoading || !schemaReady) return
    let cancelled = false

    async function restoreRoute() {
      const rawHash = window.location.hash
      if (rawHash.startsWith('#access_token=') || rawHash.startsWith('#error=')) {
        if (!cancelled) setRouteReady(true)
        return
      }

      const route = decodeURIComponent(rawHash.replace(/^#\/?/, ''))
      const [target, id] = route.split('/')

      if (target === 'person' && id) {
        await openPersonById(id)
      } else if (target === 'family' && id) {
        await openFamilyById(id)
      } else if (target === 'search' || target === 'tree' || target === 'add' || target === 'admin' || target === 'account') {
        setView(target as View)
      } else {
        setView('home')
      }

      if (!cancelled) setRouteReady(true)
    }

    void restoreRoute()
    return () => { cancelled = true }
  }, [routeReady, dataLoading, sessionLoading, schemaReady])

  useEffect(() => {
    if (!routeReady) return

    let route: string = view
    if (view === 'person' && selectedPerson?.id) route = `person/${selectedPerson.id}`
    if (view === 'family' && selectedFamily?.id) route = `family/${selectedFamily.id}`

    const nextHash = `#/${route}`
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', nextHash)
    }
  }, [routeReady, view, selectedPerson?.id, selectedFamily?.id])

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
    if (!schemaReady) return
    setView('search')
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
    const directApproval = isAdmin
    const approvedAt = directApproval ? new Date().toISOString() : null
    const { error } = await supabase.from('families').insert({
      name: familyForm.name.trim(),
      origin_place: familyForm.origin_place.trim() || null,
      description: familyForm.description.trim() || null,
      created_by: session.user.id,
      status: directApproval ? 'approved' : 'pending',
      approved_by: directApproval ? session.user.id : null,
      approved_at: approvedAt,
    })
    setBusy(false)
    if (error) return showMessage(friendlyError(error.message), 'error')
    setFamilyForm({ name: '', origin_place: '', description: '' })
    showMessage(isAdmin ? 'تمت إضافة العائلة واعتمادها مباشرة.' : 'تم إرسال العائلة للمراجعة. لن تظهر للعامة قبل الاعتماد.', 'success')
    void loadCommunityData()
  }

  async function submitPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !session || !requireAccount()) return
    if (personForm.full_name.trim().length < 3) return showMessage('اكتب الاسم الكامل.', 'error')
    if (personForm.is_deceased && !personForm.death_date) return showMessage('حدد تاريخ الوفاة.', 'error')
    setBusy(true)
    const directApproval = isAdmin
    const approvedAt = directApproval ? new Date().toISOString() : null
    const { data: newPerson, error } = await supabase.from('people').insert({
      full_name: personForm.full_name.trim(),
      family_id: personForm.family_id || null,
      gender: personForm.gender || null,
      birth_year: personForm.birth_year ? Number(personForm.birth_year) : null,
      is_deceased: personForm.is_deceased,
      death_date: personForm.is_deceased ? personForm.death_date : null,
      description: personForm.description.trim() || null,
      created_by: session.user.id,
      status: directApproval ? 'approved' : 'pending',
      approved_by: directApproval ? session.user.id : null,
      approved_at: approvedAt,
    }).select('id').single()

    if (error) {
      setBusy(false)
      return showMessage(friendlyError(error.message), 'error')
    }

    if (newPerson?.id && personForm.family_id) {
      const { error: membershipError } = await supabase.from('person_family_memberships').insert({
        person_id: newPerson.id,
        family_id: personForm.family_id,
        membership_type: 'birth',
        is_primary: true,
        status: isAdmin ? 'approved' : 'pending',
        created_by: session.user.id,
        approved_by: isAdmin ? session.user.id : null,
        approved_at: isAdmin ? new Date().toISOString() : null,
      })
      if (membershipError && !membershipError.message.toLowerCase().includes('does not exist')) {
        setBusy(false)
        return showMessage(friendlyError(membershipError.message), 'error')
      }
    }

    setBusy(false)
    setPersonForm({ full_name: '', family_id: '', gender: '', birth_year: '', is_deceased: false, death_date: '', description: '' })
    showMessage(isAdmin ? 'تمت إضافة الشخص واعتماده مباشرة.' : 'تم إرسال الشخص وانتمائه العائلي للمراجعة.', 'success')
    void loadCommunityData()
  }

  async function submitEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !session || !requireAccount()) return
    if (eventForm.title.trim().length < 3) return showMessage('اكتب عنوان المناسبة.', 'error')
    setBusy(true)
    const directApproval = isAdmin
    const { error } = await supabase.from('events').insert({
      event_type: eventForm.event_type,
      title: eventForm.title.trim(),
      family_id: eventForm.family_id || null,
      event_date: eventForm.event_date || null,
      location_name: eventForm.location_name.trim() || null,
      description: eventForm.description.trim() || null,
      created_by: session.user.id,
      status: directApproval ? 'approved' : 'pending',
      approved_by: directApproval ? session.user.id : null,
      approved_at: directApproval ? new Date().toISOString() : null,
    })
    setBusy(false)
    if (error) return showMessage(friendlyError(error.message), 'error')
    setEventForm({ event_type: 'general', title: '', family_id: '', event_date: '', location_name: '', description: '' })
    showMessage(isAdmin ? 'تمت إضافة المناسبة واعتمادها مباشرة.' : 'تم إرسال المناسبة للمراجعة.', 'success')
    void loadCommunityData()
  }

  function openFamily(item: Family) {
    setSelectedFamily(item)
    setView('family')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  async function openFamilyById(id: string) {
    const cached = families.find((item) => item.id === id)
    if (cached) {
      openFamily(cached)
      return
    }
    if (!supabase) return

    const { data, error } = await supabase
      .from('families')
      .select('id,name,description,origin_place,status,created_by,created_at')
      .eq('id', id)
      .maybeSingle()

    if (error) return showMessage(friendlyError(error.message), 'error')
    if (data) openFamily(data as Family)
  }

  async function openPerson(item: Person) {
    setSelectedPerson(item)
    setView('person')
    setRelationsLoading(true)
    setRelationships([])
    window.scrollTo({ top: 0, behavior: 'smooth' })
    if (!supabase) {
      setRelationsLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('person_relationships')
      .select('id,source_person_id,target_person_id,relation_type,notes,status,created_at,source:people!person_relationships_source_person_id_fkey(id,full_name),target:people!person_relationships_target_person_id_fkey(id,full_name)')
      .or(`source_person_id.eq.${item.id},target_person_id.eq.${item.id}`)
      .order('created_at')

    setRelationsLoading(false)
    if (error) return showMessage(friendlyError(error.message), 'error')
    setRelationships((data ?? []) as PersonRelationship[])
  }

  async function openPersonById(id: string) {
    const cached = people.find((item) => item.id === id)
    if (cached) {
      await openPerson(cached)
      return
    }
    if (!supabase) return

    const { data, error } = await supabase
      .from('people')
      .select('id,full_name,gender,birth_year,is_deceased,death_date,description,status,family_id,created_by,created_at,families(name)')
      .eq('id', id)
      .maybeSingle()

    if (error) return showMessage(friendlyError(error.message), 'error')
    if (data) await openPerson(data as Person)
  }

  async function submitRelationship(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !session || !requireAccount()) return
    if (!relationshipForm.source_person_id || !relationshipForm.target_person_id) return showMessage('اختر الشخصين.', 'error')
    if (relationshipForm.source_person_id === relationshipForm.target_person_id) return showMessage('لا يمكن ربط الشخص بنفسه.', 'error')

    setBusy(true)
    const directApproval = isAdmin
    const { error } = await supabase.from('person_relationships').insert({
      source_person_id: relationshipForm.source_person_id,
      target_person_id: relationshipForm.target_person_id,
      relation_type: relationshipForm.relation_type,
      notes: relationshipForm.notes.trim() || null,
      created_by: session.user.id,
      status: directApproval ? 'approved' : 'pending',
      approved_by: directApproval ? session.user.id : null,
      approved_at: directApproval ? new Date().toISOString() : null,
    })
    setBusy(false)
    if (error) return showMessage(friendlyError(error.message), 'error')

    setRelationshipForm({ source_person_id: '', relation_type: 'parent', target_person_id: '', notes: '' })
    showMessage(isAdmin ? 'تمت إضافة صلة القرابة واعتمادها مباشرة.' : 'تم إرسال صلة القرابة للمراجعة.', 'success')
    await loadPending()
  }

  async function requestAccountLink(item: Person) {
    if (!supabase || !session || !requireAccount()) return
    if (profile?.linked_person_id) return showMessage('حسابك مرتبط بشخص بالفعل.', 'info')
    if (ownLinkRequest?.status === 'pending') return showMessage('لديك طلب ربط قيد المراجعة.', 'info')

    setBusy(true)
    const { data, error } = await supabase
      .from('account_link_requests')
      .insert({ user_id: session.user.id, person_id: item.id, status: 'pending' })
      .select('id,person_id,status,note,created_at,people(id,full_name)')
      .single()
    setBusy(false)
    if (error) return showMessage(friendlyError(error.message), 'error')

    setOwnLinkRequest(data as AccountLinkRequest)
    showMessage('تم إرسال طلب ربط الحساب للمراجعة.', 'success')
  }

  async function moderate(record: PendingRecord, status: 'approved' | 'rejected') {
    if (!supabase || !session || !isAdmin) return
    setBusy(true)

    const result = record.table === 'account_link_requests'
      ? await supabase.rpc('review_account_link_request', { p_request_id: record.id, p_status: status })
      : await supabase
          .from(record.table)
          .update({ status, approved_by: session.user.id, approved_at: status === 'approved' ? new Date().toISOString() : null })
          .eq('id', record.id)

    setBusy(false)
    if (result.error) return showMessage(friendlyError(result.error.message), 'error')
    showMessage(status === 'approved' ? 'تم اعتماد السجل.' : 'تم رفض السجل.', 'success')
    await loadCommunityData()
    await loadProfile(session)
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
        <nav className="desktop-nav">
          <button onClick={() => setView('home')} className={view === 'home' ? 'active' : ''}>الرئيسية</button>
          <button onClick={() => setView('search')} className={view === 'search' ? 'active' : ''}>البحث</button>
          <button onClick={() => setView('tree')} className={view === 'tree' ? 'active' : ''}>شجرة العائلة</button>
          <button onClick={() => requireAccount() && setView('add')} className={view === 'add' ? 'active' : ''}>إضافة</button>
          {isAdmin && <button onClick={() => setView('admin')} className={view === 'admin' ? 'active' : ''}>الإدارة</button>}
        </nav>
        <div className="account-area">
          {sessionLoading ? <span className="loading-dot" /> : session ? (
            <>
              <button className="account-profile-button" type="button" onClick={() => setView('account')} aria-label="فتح حسابي">{userName.slice(0, 1)}</button>
              <button className="account-copy account-link" type="button" onClick={() => setView('account')}><strong>{userName}</strong><small>{roleLabels[profile?.role || 'member']}</small></button>
              <button className="ghost-button" onClick={signOut} disabled={busy}>خروج</button>
            </>
          ) : <button className="primary small" onClick={() => document.getElementById('auth-panel')?.scrollIntoView({ behavior: 'smooth' })}>دخول</button>}
        </div>
      </header>

      <nav className="mobile-bottom-nav" aria-label="التنقل الرئيسي">
        <button type="button" onClick={() => setView('home')} className={view === 'home' ? 'active' : ''}><span className="mobile-nav-icon">⌂</span><span>الرئيسية</span></button>
        <button type="button" onClick={() => setView('search')} className={view === 'search' ? 'active' : ''}><span className="mobile-nav-icon">⌕</span><span>الدليل</span></button>
        <button type="button" onClick={() => requireAccount() && setView('add')} className={view === 'add' ? 'active add-nav-action' : 'add-nav-action'}><span className="mobile-nav-icon">＋</span><span>إضافة</span></button>
        <button type="button" onClick={() => setView('tree')} className={view === 'tree' ? 'active' : ''}><span className="mobile-nav-icon">⌘</span><span>الشجرة</span></button>
        {isAdmin ? <button type="button" onClick={() => setView('admin')} className={view === 'admin' ? 'active' : ''}><span className="mobile-nav-icon">▦</span><span>الإدارة</span></button> : <button type="button" onClick={() => { if (session) setView('account'); else { setView('home'); window.setTimeout(() => document.getElementById('auth-panel')?.scrollIntoView({ behavior: 'smooth' }), 60) } }} className={view === 'account' ? 'active' : ''}><span className="mobile-nav-icon">◉</span><span>{session ? 'حسابي' : 'دخول'}</span></button>}
      </nav>

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

            <section className="nasab-dashboard">
              <article className="family-welcome-card">
                <span className="eyebrow">صلة — البيت الرقمي للعائلة</span>
                <h2>{session ? `مرحبًا ${userName}، أهلك أقرب إليك.` : 'عائلتك، تاريخها، وأخبارها في مكان واحد.'}</h2>
                <p>استعرض الأسر والأفراد، وثّق صلات القرابة، وتابع المناسبات من واجهة واحدة مصممة لكل الأجيال.</p>
                <div className="family-welcome-actions">
                  <button className="light-action" type="button" onClick={() => setView('search')}>فتح دليل العائلة</button>
                  <button className="outline-action" type="button" onClick={() => requireAccount() && setView('add')}>إضافة معلومة</button>
                </div>
              </article>

              <div className="app-services">
                <button className="service-tile" type="button" onClick={() => setView('tree')}><span className="service-icon">ش</span><span><strong>شجرة العائلة</strong><small>استكشف القرابة ومسارات النسب</small></span></button>
                <button className="service-tile" type="button" onClick={() => setView('search')}><span className="service-icon">{platformStats?.approved_families ?? '—'}</span><span><strong>العائلات</strong><small>الأسر المعتمدة في الدليل</small></span></button>
                <button className="service-tile" type="button" onClick={() => setView('search')}><span className="service-icon">{platformStats?.approved_people ?? '—'}</span><span><strong>الأفراد</strong><small>ملفات الأشخاص الموثقة</small></span></button>
                <button className="service-tile" type="button" onClick={() => session ? setView('account') : document.getElementById('auth-panel')?.scrollIntoView({ behavior: 'smooth' })}><span className="service-icon">{session ? userName[0] : 'د'}</span><span><strong>{session ? 'حسابي' : 'الدخول'}</strong><small>{session ? 'الربط والملف الشخصي' : 'ساهم في توثيق العائلة'}</small></span></button>
              </div>
            </section>

            <section className="home-content-grid">
              <article className="home-feed">
                <div className="home-section-heading"><h2>آخر أخبار العائلة</h2><button type="button" onClick={() => setView('add')}>إضافة مناسبة</button></div>
                {approvedEvents.length ? <div className="nasab-event-list">{approvedEvents.slice(0, 4).map((item) => <div className="nasab-event-item" key={item.id}><span className="nasab-event-date">{formatDate(item.event_date)}</span><div><h3>{item.title}</h3><p>{eventLabels[item.event_type] || item.event_type} · {item.location_name || familyName(item.families) || 'المكان غير محدد'}</p></div></div>)}</div> : <div className="empty-state compact">لا توجد أخبار أو مناسبات معتمدة بعد.</div>}
              </article>

              <article className="family-tree-preview">
                <div className="home-section-heading"><h2>شجرة العائلة</h2><button type="button" onClick={() => setView('tree')}>فتح الشجرة</button></div>
                <div className="tree-orbit" aria-label="معاينة رمزية لشجرة العائلة"><span className="tree-root">صلة</span><span className="tree-node n1">جد</span><span className="tree-node n2">أب</span><span className="tree-node n3">أم</span><span className="tree-node n4">ابن</span><span className="tree-node n5">ابنة</span></div>
              </article>
            </section>
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
                <article><strong>{platformStats?.approved_families ?? '—'}</strong><span>عائلة معتمدة</span></article>
                <article><strong>{platformStats?.approved_people ?? '—'}</strong><span>شخص معتمد</span></article>
                <article><strong>{platformStats?.approved_events ?? '—'}</strong><span>مناسبة منشورة</span></article>
                <article><strong>{isAdmin ? pending.length : '—'}</strong><span>{isAdmin ? 'بانتظار الاعتماد' : 'مراجعة إدارية'}</span></article>
              </div>
            </section>

            <section className="section-block">
              <div className="section-title"><div><span className="eyebrow">دليل الأسر</span><h2>العائلات المعتمدة</h2></div><button className="text-link" onClick={() => setView('search')}>عرض الكل</button></div>
              {dataLoading ? <div className="empty-state">جارٍ تحميل البيانات…</div> : approvedFamilies.length ? (
                <div className="cards-grid">
                  {approvedFamilies.slice(0, 6).map((family) => (
                    <button className="data-card interactive-card" type="button" key={family.id} onClick={() => openFamily(family)}>
                      <span className="card-symbol">{family.name.slice(0, 1)}</span>
                      <div><h3>{family.name}</h3><p>{family.description || family.origin_place || 'لا توجد نبذة مضافة.'}</p></div>
                      <span className="card-chevron">‹</span>
                    </button>
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
                      <RecordEditButton entityType="events" recordId={item.id} createdBy={item.created_by} sessionUserId={session?.user.id} isAdmin={isAdmin} initialData={{ event_type: item.event_type, title: item.title, family_id: item.family_id, event_date: item.event_date, location_name: item.location_name, description: item.description }} onSaved={loadCommunityData} />
                    </article>
                  ))}
                </div>
              ) : <div className="empty-state"><strong>لا توجد مناسبات منشورة</strong><span>ستظهر المناسبات هنا بعد اعتمادها.</span></div>}
            </section>
          </>
        )}

        {schemaReady && view === 'search' && (
          <Suspense fallback={<LazyPanelFallback />}>
            <DirectoryScreen
              initialTerm={searchTerm}
              onOpenPerson={(item) => void openPerson(item as Person)}
              onOpenFamily={(item) => openFamily(item as Family)}
            />
          </Suspense>
        )}

        {schemaReady && view === 'tree' && (
          <Suspense fallback={<LazyPanelFallback />}>
            <FamilyTreeScreen
              initialPersonId={profile?.linked_person_id || selectedPerson?.id || null}
              onOpenPerson={(id) => void openPersonById(id)}
              onAddRelation={(id) => {
                if (!requireAccount()) return
                if (id) setRelationshipForm((current) => ({ ...current, source_person_id: id }))
                setAddMode('relationship')
                setView('add')
              }}
            />
          </Suspense>
        )}

        {schemaReady && view === 'family' && selectedFamily && (
          <section className="page-section detail-page">
            <button className="back-button" type="button" onClick={() => setView('search')}>→ العودة للدليل</button>
            <div className="detail-hero">
              <span className="detail-avatar family-avatar">{selectedFamily.name[0]}</span>
              <div><span className="eyebrow">ملف العائلة</span><h1>{selectedFamily.name}</h1><p>{selectedFamily.description || 'لا توجد نبذة مضافة لهذه العائلة حتى الآن.'}</p></div>
              <RecordEditButton entityType="families" recordId={selectedFamily.id} createdBy={selectedFamily.created_by} sessionUserId={session?.user.id} isAdmin={isAdmin} initialData={{ name: selectedFamily.name, origin_place: selectedFamily.origin_place, description: selectedFamily.description }} onSaved={loadCommunityData} />
            </div>
            <div className="detail-facts">
              <article><span>مكان الأصل</span><strong>{selectedFamily.origin_place || 'غير محدد'}</strong></article>
              <article><span>دليل الأفراد</span><strong>تحميل تدريجي</strong></article>
              <article><span>حالة السجل</span><strong>{selectedFamily.status === 'approved' ? 'معتمد' : 'بانتظار الاعتماد'}</strong></article>
            </div>
            <Suspense fallback={<LazyPanelFallback />}><FamilyMembersPanel familyId={selectedFamily.id} people={approvedPeople} onOpenPerson={(id) => void openPersonById(id)} /></Suspense>
          </section>
        )}

        {schemaReady && view === 'person' && selectedPerson && (
          <section className="page-section detail-page">
            <button className="back-button" type="button" onClick={() => setView('search')}>→ العودة للدليل</button>
            <div className="detail-hero">
              <span className="detail-avatar">{selectedPerson.full_name[0]}</span>
              <div><span className="eyebrow">ملف شخص</span><h1>{selectedPerson.full_name}</h1><p>{selectedPerson.description || 'لا توجد نبذة مضافة لهذا الشخص.'}</p></div>
              <RecordEditButton entityType="people" recordId={selectedPerson.id} createdBy={selectedPerson.created_by} sessionUserId={session?.user.id} isAdmin={isAdmin} initialData={{ full_name: selectedPerson.full_name, gender: selectedPerson.gender, birth_year: selectedPerson.birth_year, is_deceased: selectedPerson.is_deceased, death_date: selectedPerson.death_date, description: selectedPerson.description }} onSaved={loadCommunityData} />
            </div>
            <div className="detail-facts">
              <article><span>العائلة الأساسية</span><strong>{familyName(selectedPerson.families) || 'غير محددة'}</strong></article>
              <article><span>سنة الميلاد</span><strong>{selectedPerson.birth_year || 'غير محددة'}</strong></article>
              <article className={selectedPerson.is_deceased ? 'deceased-fact' : 'alive-fact'}><span>الحالة</span><strong>{selectedPerson.is_deceased ? 'متوفى' : 'على قيد الحياة'}</strong>{selectedPerson.is_deceased && <small>تاريخ الوفاة: {formatDate(selectedPerson.death_date)}</small>}</article>
            </div>
            <PersonFamilyMemberships personId={selectedPerson.id} sessionUserId={session?.user.id} isAdmin={isAdmin} onChanged={loadCommunityData} />
            {session && !profile?.linked_person_id && (
              <div className="link-account-card">
                <div><strong>هل هذا سجلك؟</strong><p>قدّم طلب ربط حسابك بهذا الشخص للوصول إلى ميزات الملف الشخصي لاحقًا.</p></div>
                <button className="primary" type="button" disabled={busy || ownLinkRequest?.status === 'pending'} onClick={() => void requestAccountLink(selectedPerson)}>{ownLinkRequest?.status === 'pending' ? 'الطلب قيد المراجعة' : 'هذا أنا — ربط الحساب'}</button>
              </div>
            )}
            <Suspense fallback={<LazyPanelFallback />}>
              <KinshipNetwork
                personId={selectedPerson.id}
                personName={selectedPerson.full_name}
                onOpenPerson={(id) => void openPersonById(id)}
                onAddRelation={() => {
                  if (!requireAccount()) return
                  setRelationshipForm((current) => ({ ...current, source_person_id: selectedPerson.id }))
                  setAddMode('relationship')
                  setView('add')
                }}
                />
            </Suspense>
          </section>
        )}

        {schemaReady && view === 'account' && session && (
          <section className="page-section narrow account-page">
            <button className="back-button" type="button" onClick={() => setView('home')}>→ العودة للرئيسية</button>
            <div className="detail-hero account-hero"><span className="detail-avatar">{userName[0]}</span><div><span className="eyebrow">حسابي</span><h1>{userName}</h1><p>{session.user.email}</p></div></div>
            <div className="account-status-card">
              <span className={`status ${profile?.linked_person_id ? 'approved' : ownLinkRequest?.status === 'pending' ? 'pending' : ''}`}>{profile?.linked_person_id ? 'مرتبط' : ownLinkRequest?.status === 'pending' ? 'قيد المراجعة' : 'غير مرتبط'}</span>
              <h2>{profile?.linked_person_id ? 'الحساب مرتبط بسجل شخص' : ownLinkRequest?.status === 'pending' ? 'طلب الربط قيد المراجعة' : 'اربط حسابك بسجلك داخل الدليل'}</h2>
              <p>{profile?.linked_person_id ? people.find((item) => item.id === profile.linked_person_id)?.full_name || 'تم اعتماد الربط.' : ownLinkRequest?.status === 'pending' ? `السجل المطلوب: ${personName(ownLinkRequest.people)}` : 'ابحث عن اسمك في الدليل وافتح ملف الشخص ثم اضغط «هذا أنا».'}</p>
              {!profile?.linked_person_id && ownLinkRequest?.status !== 'pending' && <button className="primary" type="button" onClick={() => setView('search')}>البحث عن سجلي</button>}
            </div>
          </section>
        )}

        {schemaReady && view === 'add' && session && (
          <section className="page-section narrow">
            <div className="page-heading"><span className="eyebrow">مساهمة جديدة</span><h1>أضف معلومة للمنصة</h1><p>{isAdmin ? 'أنت مدير؛ ستُنشر إضافاتك مباشرة دون انتظار اعتماد إضافي.' : 'تُحفظ الإضافة بحالة «بانتظار الاعتماد» ولا تظهر للعامة مباشرة.'}</p></div>
            <div className="segmented-control">
              <button className={addMode === 'family' ? 'active' : ''} onClick={() => setAddMode('family')}>عائلة</button>
              <button className={addMode === 'person' ? 'active' : ''} onClick={() => setAddMode('person')}>شخص</button>
              <button className={addMode === 'event' ? 'active' : ''} onClick={() => setAddMode('event')}>مناسبة</button>
              <button className={addMode === 'relationship' ? 'active' : ''} onClick={() => setAddMode('relationship')}>صلة قرابة</button>
            </div>

            {addMode === 'family' && <form className="data-form" onSubmit={submitFamily}><label><span>اسم العائلة *</span><input value={familyForm.name} onChange={(e) => setFamilyForm({ ...familyForm, name: e.target.value })} required /></label><label><span>مكان الأصل</span><input value={familyForm.origin_place} onChange={(e) => setFamilyForm({ ...familyForm, origin_place: e.target.value })} /></label><label className="full"><span>نبذة عن العائلة</span><textarea value={familyForm.description} onChange={(e) => setFamilyForm({ ...familyForm, description: e.target.value })} rows={5} /></label><button className="primary full" disabled={busy}>{isAdmin ? 'إضافة واعتماد' : 'إرسال للمراجعة'}</button></form>}

            {addMode === 'person' && <form className="data-form person-create-form" onSubmit={submitPerson}>
              <label className="full"><span>الاسم الكامل *</span><input value={personForm.full_name} onChange={(e) => setPersonForm({ ...personForm, full_name: e.target.value })} autoComplete="off" enterKeyHint="next" required /></label>
              <Suspense fallback={<div className="duplicate-person-hint"><span>⌕</span><p>يتم تجهيز فحص الأسماء المشابهة…</p></div>}>
                <DuplicatePersonCheck name={personForm.full_name} onOpenPerson={(id) => void openPersonById(id)} />
              </Suspense>
              <Suspense fallback={<div className="picker-skeleton">جارٍ تجهيز بحث العائلات…</div>}>
                <FamilyPicker
                  label="العائلة"
                  value={personForm.family_id}
                  onChange={(familyId) => setPersonForm((current) => ({ ...current, family_id: familyId }))}
                  emptyLabel="بدون عائلة محددة"
                />
              </Suspense>
              <label><span>الجنس</span><select value={personForm.gender} onChange={(e) => setPersonForm({ ...personForm, gender: e.target.value })}><option value="">غير محدد</option><option value="male">ذكر</option><option value="female">أنثى</option></select></label>
              <label><span>سنة الميلاد</span><input type="number" min="1800" max="2100" value={personForm.birth_year} onChange={(e) => setPersonForm({ ...personForm, birth_year: e.target.value })} /></label>
              <div className={`life-status-card full ${personForm.is_deceased ? 'deceased' : 'alive'}`}><div className="life-status-copy"><span className="life-status-icon">{personForm.is_deceased ? '✦' : '●'}</span><div><strong>{personForm.is_deceased ? 'متوفى' : 'على قيد الحياة'}</strong><small>{personForm.is_deceased ? 'حدد تاريخ الوفاة لإكمال السجل' : 'فعّل الخيار فقط إذا كان الشخص متوفى'}</small></div></div><label className="life-status-switch"><input type="checkbox" checked={personForm.is_deceased} onChange={(e) => setPersonForm({ ...personForm, is_deceased: e.target.checked, death_date: e.target.checked ? personForm.death_date : '' })} /><span /></label></div>
              {personForm.is_deceased && <label className="full death-date-field"><span>تاريخ الوفاة *</span><input type="date" required value={personForm.death_date} onChange={(e) => setPersonForm({ ...personForm, death_date: e.target.value })} /></label>}
              <label className="full"><span>وصف أو نبذة</span><textarea value={personForm.description} onChange={(e) => setPersonForm({ ...personForm, description: e.target.value })} rows={4} /></label>
              <button className="primary full" disabled={busy}>{isAdmin ? 'إضافة واعتماد' : 'إرسال للمراجعة'}</button>
            </form>}

            {addMode === 'event' && <form className="data-form" onSubmit={submitEvent}><label><span>نوع المناسبة *</span><select value={eventForm.event_type} onChange={(e) => setEventForm({ ...eventForm, event_type: e.target.value })}>{Object.entries(eventLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>عنوان المناسبة *</span><input value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} required /></label><Suspense fallback={<div className="picker-skeleton">جارٍ تجهيز بحث العائلات…</div>}>
                <FamilyPicker
                  label="العائلة المرتبطة"
                  value={eventForm.family_id}
                  onChange={(familyId) => setEventForm((current) => ({ ...current, family_id: familyId }))}
                  emptyLabel="مناسبة عامة"
                />
              </Suspense><label><span>التاريخ</span><input type="date" value={eventForm.event_date} onChange={(e) => setEventForm({ ...eventForm, event_date: e.target.value })} /></label><label className="full"><span>المكان</span><input value={eventForm.location_name} onChange={(e) => setEventForm({ ...eventForm, location_name: e.target.value })} /></label><label className="full"><span>التفاصيل</span><textarea value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} rows={5} /></label><button className="primary full" disabled={busy}>{isAdmin ? 'إضافة واعتماد' : 'إرسال للمراجعة'}</button></form>}


            {addMode === 'relationship' && <form className="data-form" onSubmit={submitRelationship}><PeoplePicker label="الشخص الأول" value={relationshipForm.source_person_id} onChange={(selectedId) => setRelationshipForm({ ...relationshipForm, source_person_id: selectedId })} excludeId={relationshipForm.target_person_id || undefined} required /><label><span>صلته بالشخص الثاني *</span><select value={relationshipForm.relation_type} onChange={(e) => setRelationshipForm({ ...relationshipForm, relation_type: e.target.value })}>{Object.entries(relationshipLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><PeoplePicker label="الشخص الثاني" value={relationshipForm.target_person_id} onChange={(selectedId) => setRelationshipForm({ ...relationshipForm, target_person_id: selectedId })} excludeId={relationshipForm.source_person_id || undefined} required /><label className="full"><span>ملاحظة أو مصدر المعلومة</span><textarea value={relationshipForm.notes} onChange={(e) => setRelationshipForm({ ...relationshipForm, notes: e.target.value })} rows={4} /></label><button className="primary full" disabled={busy}>{isAdmin ? 'إضافة واعتماد صلة القرابة' : 'إرسال صلة القرابة للمراجعة'}</button></form>}
          </section>
        )}

        {schemaReady && view === 'admin' && isAdmin && (
          <section className="page-section admin-console">
            <div className="admin-console-hero">
              <div><span className="eyebrow">لوحة الإدارة</span><h1>إدارة المحتوى والمستخدمين</h1><p>كل قسم يُحمّل بياناته عند فتحه فقط لتبقى اللوحة سريعة على الجوال.</p></div>
              <span className="admin-console-count"><b>{pending.length}</b><small>طلب محمّل</small></span>
            </div>

            <div className="admin-console-tabs" role="tablist" aria-label="أقسام لوحة الإدارة">
              <button type="button" role="tab" aria-selected={adminTab === 'requests'} className={adminTab === 'requests' ? 'active' : ''} onClick={() => setAdminTab('requests')}>الطلبات <span>{pending.length}</span></button>
              <button type="button" role="tab" aria-selected={adminTab === 'edits'} className={adminTab === 'edits' ? 'active' : ''} onClick={() => setAdminTab('edits')}>التعديلات والانتماءات</button>
              {profile?.is_primary_admin && <button type="button" role="tab" aria-selected={adminTab === 'users'} className={adminTab === 'users' ? 'active' : ''} onClick={() => setAdminTab('users')}>المستخدمون</button>}
            </div>

            <div className="admin-console-panel">
              {adminTab === 'requests' && (
                <>
                  {pending.length ? <div className="review-list">{pending.map((record) => <article className="review-row" key={`${record.table}-${record.id}`}><div><span className="status pending">معلق</span><h3>{record.title}</h3><p>{record.subtitle} · {formatDate(record.created_at)}</p></div><div className="review-actions"><button className="approve" onClick={() => moderate(record, 'approved')} disabled={busy}>اعتماد</button><button className="reject" onClick={() => moderate(record, 'rejected')} disabled={busy}>رفض</button></div></article>)}</div> : <div className="empty-state"><strong>لا توجد طلبات معلقة</strong><span>جميع الطلبات الأساسية تمت مراجعتها.</span></div>}
                  {pendingHasMore && <button className="admin-load-more" type="button" disabled={pendingLoadingMore} onClick={() => void loadPending(pending.length, true)}>{pendingLoadingMore ? 'جارٍ تحميل المزيد…' : 'عرض المزيد من الطلبات'}</button>}
                </>
              )}
              {adminTab === 'edits' && <Suspense fallback={<LazyPanelFallback />}><Phase3AdminQueue active={adminTab === 'edits'} onChanged={loadCommunityData} /></Suspense>}
              {adminTab === 'users' && profile?.is_primary_admin && <Suspense fallback={<LazyPanelFallback />}><AdminUserRoles active={adminTab === 'users'} currentUserId={session?.user.id} /></Suspense>}
            </div>
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
