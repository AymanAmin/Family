import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { getApplicationUrl, supabase, supabaseConfiguration } from './lib/supabase'
import RecordEditButton from './components/RecordEditButton'
import PersonFamilyMemberships from './components/PersonFamilyMemberships'
import PeoplePicker from './components/PeoplePicker'
import EventPeopleFields, { eventParticipantPayload, eventParticipantsRequired } from './components/EventPeopleFields'
import { PersonVerifiedBadge } from './components/VerifiedBadge'
import EventShareButton from './components/EventShareButton'
import ModerationRequestDetails from './components/ModerationRequestDetails'

const DirectoryScreen = lazy(() => import('./components/DirectoryScreen'))
const NewsScreen = lazy(() => import('./components/NewsScreen'))
const KinshipNetwork = lazy(() => import('./components/KinshipNetwork'))
const FamilyMembersPanel = lazy(() => import('./components/FamilyMembersPanel'))
const PersonFamilyOverview = lazy(() => import('./components/PersonFamilyOverview'))
const FamilyQuickAddPerson = lazy(() => import('./components/FamilyQuickAddPerson'))
const Phase3AdminQueue = lazy(() => import('./components/Phase3AdminQueue'))
const DuplicatePersonCheck = lazy(() => import('./components/DuplicatePersonCheck'))
const FamilyTreeScreen = lazy(() => import('./components/FamilyTreeScreen'))
const AdminUserRoles = lazy(() => import('./components/AdminUserRoles'))
const AdminContributorStats = lazy(() => import('./components/AdminContributorStats'))
const MySubmissionActivity = lazy(() => import('./components/MySubmissionActivity'))
const DirectRelationshipManager = lazy(() => import('./components/DirectRelationshipManager'))
const RelationshipChangeQueue = lazy(() => import('./components/RelationshipChangeQueue'))
const FamilyPicker = lazy(() => import('./components/FamilyPicker'))
import './details.css'
import './nasab-inspired.css'
import './event-card-themes.css'

type AuthMode = 'signin' | 'signup' | 'forgot' | 'recovery'
type View = 'home' | 'news' | 'search' | 'tree' | 'add' | 'admin' | 'person' | 'family' | 'account'
type AddMode = 'family' | 'person' | 'event' | 'relationship'
type AdminTab = 'requests' | 'edits' | 'activity' | 'users'
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

type EventPersonMention = {
  event_id: string
  participant_role: string
  people?: RelatedPerson
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
  mentions?: EventPersonMention[]
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
  general: 'خبر عائلي',
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
  const [relationshipRefresh, setRelationshipRefresh] = useState(0)
  const [relationshipSyncBusy, setRelationshipSyncBusy] = useState(false)
  const [ownLinkRequest, setOwnLinkRequest] = useState<AccountLinkRequest | null>(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [directoryInitialTab, setDirectoryInitialTab] = useState<'all' | 'people' | 'families'>('all')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')

  const [familyForm, setFamilyForm] = useState({ name: '', origin_place: '', description: '' })
  const [personForm, setPersonForm] = useState({ full_name: '', family_id: '', gender: '', birth_year: '', is_deceased: false, death_date: '', description: '' })
  const [personRelationForm, setPersonRelationForm] = useState({ relation_type: '', related_person_id: '', notes: '' })
  const [eventForm, setEventForm] = useState({ event_type: 'general', title: '', family_id: '', event_date: '', location_name: '', description: '' })
  const [eventPeopleForm, setEventPeopleForm] = useState({ primary_person_id: '', secondary_person_id: '' })
  const [relationshipForm, setRelationshipForm] = useState({ source_person_id: '', relation_type: 'parent', target_person_id: '', notes: '' })

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'
  const canModerate = profile?.role === 'family_moderator' || profile?.role === 'content_moderator' || isAdmin

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

    const baseEvents = (eventResult.data ?? []) as CommunityEvent[]
    let hydratedEvents = baseEvents
    const eventIds = baseEvents.map((item) => item.id)
    if (eventIds.length) {
      const mentionResult = await supabase
        .from('event_people')
        .select('event_id,participant_role,people(id,full_name)')
        .in('event_id', eventIds)
        .order('sort_order')
      if (!mentionResult.error) {
        const byEvent = new Map<string, EventPersonMention[]>()
        for (const row of (mentionResult.data ?? []) as EventPersonMention[]) {
          const bucket = byEvent.get(row.event_id) ?? []
          bucket.push(row)
          byEvent.set(row.event_id, bucket)
        }
        hydratedEvents = baseEvents.map((item) => ({ ...item, mentions: byEvent.get(item.id) ?? [] }))
      }
    }
    setEvents(hydratedEvents)
    if (!statsResult.error) {
      const statsRow = Array.isArray(statsResult.data) ? statsResult.data[0] : null
      setPlatformStats((statsRow as PlatformStats | undefined) ?? null)
    } else {
      setPlatformStats(null)
    }
    setDataLoading(false)
  }, [])

  const loadPending = useCallback(async (offset = 0, append = false) => {
    if (!supabase || !canModerate) {
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
  }, [canModerate])

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
    if (!routeReady || (view !== 'home' && view !== 'admin')) return
    void loadPending()
  }, [routeReady, view, loadPending])

  useEffect(() => {
    if (!supabase || !session) {
      setOwnLinkRequest(null)
      return
    }

    void supabase
      .from('account_link_requests')
      .select('id,person_id,status,note,created_at,people(id,full_name)')
      .eq('user_id', session.user.id)
      .ord…11075 tokens truncated…className="back-button" type="button" onClick={() => setView('home')}>→ العودة للرئيسية</button>
            <div className="detail-hero account-hero"><span className="detail-avatar">{userName[0]}</span><div><span className="eyebrow">حسابي</span><h1>{userName}</h1><p>{session.user.email}</p></div></div>
            <div className="account-status-card">
              <span className={`status ${profile?.linked_person_id ? 'approved' : ownLinkRequest?.status === 'pending' ? 'pending' : ''}`}>{profile?.linked_person_id ? 'مرتبط' : ownLinkRequest?.status === 'pending' ? 'قيد المراجعة' : 'غير مرتبط'}</span>
              <h2>{profile?.linked_person_id ? 'الحساب مرتبط بسجل شخص' : ownLinkRequest?.status === 'pending' ? 'طلب الربط قيد المراجعة' : 'اربط حسابك بسجلك داخل الدليل'}</h2>
              <p>{profile?.linked_person_id ? people.find((item) => item.id === profile.linked_person_id)?.full_name || 'تم اعتماد الربط.' : ownLinkRequest?.status === 'pending' ? `السجل المطلوب: ${personName(ownLinkRequest.people)}` : 'ابحث عن اسمك في الدليل وافتح ملف الشخص ثم اضغط «هذا أنا».'}</p>
              {!profile?.linked_person_id && ownLinkRequest?.status !== 'pending' && <button className="primary" type="button" onClick={() => { setDirectoryInitialTab('people'); setView('search') }}>البحث عن سجلي</button>}
            </div>
            <div className="account-logout-card"><div><strong>تسجيل الخروج</strong><small>إنهاء الجلسة الحالية على هذا الجهاز.</small></div><button type="button" disabled={busy} onClick={() => void signOut()}>{busy ? 'جارٍ الخروج…' : 'تسجيل الخروج'}</button></div>
            <Suspense fallback={<LazyPanelFallback />}>
              <MySubmissionActivity
                active={view === 'account'}
                role={profile?.role || 'member'}
                onOpenPerson={(id) => void openPersonById(id)}
                onOpenFamily={(id) => void openFamilyById(id)}
              />
            </Suspense>
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
              <div className="person-relation-card full">
                <div className="person-relation-heading">
                  <div><strong>صلة القرابة مع شخص موجود</strong><small>اختياري — يمكنك إضافة الشخص وحده أو الشخص والصلة في نفس الطلب.</small></div>
                  <span>{personRelationForm.relation_type ? 'مفعّلة' : 'اختيارية'}</span>
                </div>
                <label className="full"><span>نوع العلاقة</span><select value={personRelationForm.relation_type} onChange={(e) => setPersonRelationForm((current) => ({ ...current, relation_type: e.target.value }))}><option value="">بدون صلة الآن</option>{Object.entries(relationshipLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                {personRelationForm.relation_type && <PeoplePicker label={personRelationForm.relation_type === 'child' ? 'الأب الذي يُنسب إليه الشخص الجديد' : 'الشخص المرتبط'} value={personRelationForm.related_person_id} onChange={(selectedId) => setPersonRelationForm((current) => ({ ...current, related_person_id: selectedId }))} required />}
                {personRelationForm.relation_type === 'child' && <div className="paternal-inheritance-note full"><strong>توريث عوائل جهة الأب تلقائيًا</strong><span>سيأخذ الابن أو الابنة العائلة الأساسية للأب إذا لم تحدد عائلة يدويًا، وتُضاف بقية عوائل الأب إليه كعلاقات عائلية من جهة الأب.</span></div>}
                {personRelationForm.relation_type && <label className="full"><span>ملاحظة عن صلة القرابة</span><textarea value={personRelationForm.notes} onChange={(e) => setPersonRelationForm((current) => ({ ...current, notes: e.target.value }))} rows={3} /></label>}
              </div>
              <Suspense fallback={<div className="picker-skeleton">جارٍ تجهيز بحث العائلات…</div>}>
                <FamilyPicker
                  label={personRelationForm.relation_type === 'child' ? 'العائلة الأساسية (اختياري — تُؤخذ من الأب عند تركها فارغة)' : 'العائلة'}
                  value={personForm.family_id}
                  onChange={(familyId) => setPersonForm((current) => ({ ...current, family_id: familyId }))}
                  emptyLabel={personRelationForm.relation_type === 'child' ? 'استخدام عائلة الأب تلقائيًا' : 'بدون عائلة محددة'}
                />
              </Suspense>
              <label><span>الجنس</span><select value={personForm.gender} onChange={(e) => setPersonForm({ ...personForm, gender: e.target.value })}><option value="">غير محدد</option><option value="male">ذكر</option><option value="female">أنثى</option></select></label>
              <label><span>سنة الميلاد</span><input type="number" min="1800" max="2100" value={personForm.birth_year} onChange={(e) => setPersonForm({ ...personForm, birth_year: e.target.value })} /></label>
              <div className={`life-status-card full ${personForm.is_deceased ? 'deceased' : 'alive'}`}><div className="life-status-copy"><span className="life-status-icon">{personForm.is_deceased ? '✦' : '●'}</span><div><strong>{personForm.is_deceased ? 'متوفى' : 'على قيد الحياة'}</strong><small>{personForm.is_deceased ? 'تاريخ الوفاة اختياري ويمكن استكماله لاحقًا' : 'فعّل الخيار فقط إذا كان الشخص متوفى'}</small></div></div><label className="life-status-switch"><input type="checkbox" checked={personForm.is_deceased} onChange={(e) => setPersonForm({ ...personForm, is_deceased: e.target.checked, death_date: e.target.checked ? personForm.death_date : '' })} /><span /></label></div>
              {personForm.is_deceased && <label className="full death-date-field"><span>تاريخ الوفاة <small>اختياري</small></span><input type="date" value={personForm.death_date} onChange={(e) => setPersonForm({ ...personForm, death_date: e.target.value })} /></label>}
              <label className="full"><span>وصف أو نبذة</span><textarea value={personForm.description} onChange={(e) => setPersonForm({ ...personForm, description: e.target.value })} rows={4} /></label>
              <button className="primary full" disabled={busy}>{busy ? 'جارٍ الحفظ…' : personRelationForm.relation_type ? (isAdmin ? 'إضافة الشخص والصلة واعتمادهما' : 'إرسال الشخص والصلة للمراجعة') : (isAdmin ? 'إضافة واعتماد' : 'إرسال للمراجعة')}</button>
            </form>}

            {addMode === 'event' && <form className="data-form" onSubmit={submitEvent}>
              <label><span>نوع المناسبة *</span><select value={eventForm.event_type} onChange={(e) => { setEventForm({ ...eventForm, event_type: e.target.value }); setEventPeopleForm({ primary_person_id: '', secondary_person_id: '' }) }}>{Object.entries(eventLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label><span>عنوان المناسبة *</span><input value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} required /></label>
              <Suspense fallback={<div className="picker-skeleton">جارٍ تجهيز بحث العائلات…</div>}><FamilyPicker label="العائلة المرتبطة" value={eventForm.family_id} onChange={(familyId) => setEventForm((current) => ({ ...current, family_id: familyId }))} emptyLabel="مناسبة عامة" /></Suspense>
              <label><span>التاريخ</span><input type="date" value={eventForm.event_date} onChange={(e) => setEventForm({ ...eventForm, event_date: e.target.value })} /></label>
              <EventPeopleFields eventType={eventForm.event_type} primaryPersonId={eventPeopleForm.primary_person_id} secondaryPersonId={eventPeopleForm.secondary_person_id} onPrimaryChange={(id) => setEventPeopleForm((current) => ({ ...current, primary_person_id: id }))} onSecondaryChange={(id) => setEventPeopleForm((current) => ({ ...current, secondary_person_id: id }))} />
              <label className="full"><span>المكان</span><input value={eventForm.location_name} onChange={(e) => setEventForm({ ...eventForm, location_name: e.target.value })} /></label>
              <label className="full"><span>التفاصيل</span><textarea value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} rows={4} /></label>
              <button className="primary full" disabled={busy}>{isAdmin ? 'إضافة واعتماد' : 'إرسال للمراجعة'}</button>
            </form>}


            {addMode === 'relationship' && <form className="data-form" onSubmit={submitRelationship}><PeoplePicker label="الشخص الأول" value={relationshipForm.source_person_id} onChange={(selectedId) => setRelationshipForm({ ...relationshipForm, source_person_id: selectedId })} excludeId={relationshipForm.target_person_id || undefined} required /><label><span>صلته بالشخص الثاني *</span><select value={relationshipForm.relation_type} onChange={(e) => setRelationshipForm({ ...relationshipForm, relation_type: e.target.value })}>{Object.entries(relationshipLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><PeoplePicker label="الشخص الثاني" value={relationshipForm.target_person_id} onChange={(selectedId) => setRelationshipForm({ ...relationshipForm, target_person_id: selectedId })} excludeId={relationshipForm.source_person_id || undefined} required /><label className="full"><span>ملاحظة أو مصدر المعلومة</span><textarea value={relationshipForm.notes} onChange={(e) => setRelationshipForm({ ...relationshipForm, notes: e.target.value })} rows={4} /></label><button className="primary full" disabled={busy}>{isAdmin ? 'إضافة واعتماد صلة القرابة' : 'إرسال صلة القرابة للمراجعة'}</button></form>}
          </section>
        )}

        {schemaReady && view === 'admin' && canModerate && (
          <section className="page-section admin-console">
            <div className="admin-console-hero">
              <div><span className="eyebrow">لوحة الإدارة</span><h1>إدارة المحتوى والمستخدمين</h1><p>كل قسم يُحمّل بياناته عند فتحه فقط لتبقى اللوحة سريعة على الجوال.</p></div>
              <span className="admin-console-count"><b>{pending.length}</b><small>طلب محمّل</small></span>
            </div>

            <div className="admin-console-tabs" role="tablist" aria-label="أقسام لوحة الإدارة">
              <button type="button" role="tab" aria-selected={adminTab === 'requests'} className={adminTab === 'requests' ? 'active' : ''} onClick={() => setAdminTab('requests')}>الطلبات <span>{pending.length}</span></button>
              <button type="button" role="tab" aria-selected={adminTab === 'edits'} className={adminTab === 'edits' ? 'active' : ''} onClick={() => setAdminTab('edits')}>التعديلات والانتماءات</button>
              {profile?.is_primary_admin && <button type="button" role="tab" aria-selected={adminTab === 'activity'} className={adminTab === 'activity' ? 'active' : ''} onClick={() => setAdminTab('activity')}>النشاط والإحصائيات</button>}
              {profile?.is_primary_admin && <button type="button" role="tab" aria-selected={adminTab === 'users'} className={adminTab === 'users' ? 'active' : ''} onClick={() => setAdminTab('users')}>المستخدمون</button>}
            </div>

            <div className="admin-console-panel">
              {adminTab === 'requests' && (
                <>
                  {pending.length ? <div className="review-list">{pending.map((record) => <article className="review-row moderation-rich-row" key={`${record.table}-${record.id}`}>
                    <div><span className="status pending">معلق</span><h3>{record.title}</h3><p>{record.subtitle} · {formatDate(record.created_at)}</p></div>
                    <ModerationRequestDetails requestType={record.table} requestId={record.id} />
                    <div className="review-actions"><button className="approve" onClick={() => moderate(record, 'approved')} disabled={busy}>اعتماد</button><button className="reject" onClick={() => moderate(record, 'rejected')} disabled={busy}>رفض</button></div>
                  </article>)}</div> : <div className="empty-state"><strong>لا توجد طلبات معلقة</strong><span>جميع الطلبات الأساسية تمت مراجعتها.</span></div>}
                  {pendingHasMore && <button className="admin-load-more" type="button" disabled={pendingLoadingMore} onClick={() => void loadPending(pending.length, true)}>{pendingLoadingMore ? 'جارٍ تحميل المزيد…' : 'عرض المزيد من الطلبات'}</button>}
                </>
              )}
              {adminTab === 'edits' && <>
                <Suspense fallback={<LazyPanelFallback />}><Phase3AdminQueue active={adminTab === 'edits' && canModerate} isAdmin={isAdmin} onChanged={loadCommunityData} /></Suspense>
                {isAdmin && <Suspense fallback={<LazyPanelFallback />}><RelationshipChangeQueue active={adminTab === 'edits'} onChanged={() => { setRelationshipRefresh((value) => value + 1); void loadCommunityData() }} /></Suspense>}
              </>}
              {adminTab === 'activity' && profile?.is_primary_admin && <Suspense fallback={<LazyPanelFallback />}><AdminContributorStats active={adminTab === 'activity'} /></Suspense>}
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
