import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import FamilyPicker from './FamilyPicker'

type ManagedUser = {
  user_id: string
  email: string | null
  display_name: string | null
  role: string
  is_primary_admin: boolean
  created_at: string
  last_sign_in_at: string | null
}

type FamilyScope = {
  family_id: string
  family_name: string
  origin_place: string | null
}

type Props = {
  active: boolean
  currentUserId?: string | null
}

const PAGE_SIZE = 20

const roleLabels: Record<string, string> = {
  member: 'عضو',
  verified_member: 'عضو موثّق',
  family_moderator: 'مسؤول عائلة',
  content_moderator: 'مشرف محتوى',
  admin: 'مدير',
  super_admin: 'مدير أعلى',
}

const roleDescriptions: Record<string, string> = {
  member: 'يرسل الإضافات والتعديلات للمراجعة قبل النشر.',
  verified_member: 'عضو مرتبط بسجل شخص معتمد؛ هذه الصفة تُمنح تلقائيًا.',
  family_moderator: 'يراجع فقط الطلبات التابعة للعائلات المحددة له، ولا يعتمد طلبه الشخصي.',
  content_moderator: 'يراجع المناسبات والمحتوى العام، ولا يعتمد طلبه الشخصي.',
  admin: 'يضيف مباشرة ويعتمد جميع الطلبات، لكنه لا يدير صلاحيات المدراء.',
  super_admin: 'الصلاحيات الحساسة وإدارة الأدوار والنطاقات.',
}

function formatDate(value: string | null) {
  if (!value) return 'لم يسجل الدخول بعد'
  return new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium' }).format(new Date(value))
}

export default function AdminUserRoles({ active, currentUserId }: Props) {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [message, setMessage] = useState('')
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null)
  const [pendingRole, setPendingRole] = useState<string | null>(null)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [scopeFamilyId, setScopeFamilyId] = useState('')
  const [scopes, setScopes] = useState<FamilyScope[]>([])
  const [scopesLoading, setScopesLoading] = useState(false)
  const timerRef = useRef<number | null>(null)
  const requestRef = useRef(0)

  async function fetchPage(search: string, offset: number, append: boolean) {
    if (!active || !supabase) return
    const requestId = ++requestRef.current
    append ? setLoadingMore(true) : setLoading(true)
    setMessage('')

    const { data, error } = await supabase.rpc('list_registered_users_for_role_management', {
      p_search: search.trim() || null,
      p_limit: PAGE_SIZE + 1,
      p_offset: offset,
    })

    if (requestId !== requestRef.current) return
    setLoading(false)
    setLoadingMore(false)

    if (error) {
      setMessage(error.message.toLowerCase().includes('does not exist') ? 'شغّل أحدث migration لنظام الأدوار في Supabase.' : 'تعذر تحميل قائمة المستخدمين الآن.')
      return
    }

    const received = (data ?? []) as ManagedUser[]
    const page = received.slice(0, PAGE_SIZE)
    setHasMore(received.length > PAGE_SIZE)
    setRows((current) => append ? [...current, ...page] : page)
  }

  useEffect(() => {
    if (!active) return
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout((): void => {
      void fetchPage(query, 0, false)
    }, 280)
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [active, query])

  async function loadScopes(userId: string) {
    if (!supabase) return
    setScopesLoading(true)
    const { data, error } = await supabase.rpc('list_family_moderator_assignments', { p_user_id: userId })
    setScopesLoading(false)
    if (error) {
      if (!error.message.toLowerCase().includes('does not exist')) setMessage(error.message)
      setScopes([])
      return
    }
    setScopes((data ?? []) as FamilyScope[])
  }

  function openRolePanel(user: ManagedUser) {
    const next = expandedUserId === user.user_id ? null : user.user_id
    setExpandedUserId(next)
    setPendingRole(null)
    setScopeFamilyId('')
    setScopes([])
    if (next) void loadScopes(user.user_id)
  }

  async function changeRole(user: ManagedUser, requestedRole: 'member' | 'content_moderator' | 'admin') {
    if (!supabase || user.is_primary_admin) return
    setBusyUserId(user.user_id)
    setMessage('')
    const { data, error } = await supabase.rpc('set_platform_user_role', {
      p_user_id: user.user_id,
      p_role: requestedRole,
    })
    setBusyUserId(null)
    setPendingRole(null)

    if (error) {
      setMessage(error.message.toLowerCase().includes('does not exist') ? 'شغّل migration رقم 017 أولًا في Supabase.' : error.message)
      return
    }

    const actualRole = typeof data === 'string' && data ? data : requestedRole
    setRows((current) => current.map((item) => item.user_id === user.user_id ? { ...item, role: actualRole } : item))
    setScopes([])
    setScopeFamilyId('')
    setMessage(`تم تحديث الصلاحية إلى «${roleLabels[actualRole] || actualRole}».`)
  }

  async function addFamilyScope(user: ManagedUser) {
    if (!supabase || !scopeFamilyId || user.is_primary_admin) return
    setBusyUserId(user.user_id)
    setMessage('')
    const { data, error } = await supabase.rpc('set_family_moderator_assignment', {
      p_user_id: user.user_id,
      p_family_id: scopeFamilyId,
      p_enabled: true,
    })
    setBusyUserId(null)

    if (error) {
      setMessage(error.message.toLowerCase().includes('does not exist') ? 'شغّل migration رقم 017 أولًا في Supabase.' : error.message)
      return
    }

    const actualRole = typeof data === 'string' && data ? data : 'family_moderator'
    setRows((current) => current.map((item) => item.user_id === user.user_id ? { ...item, role: actualRole } : item))
    setScopeFamilyId('')
    await loadScopes(user.user_id)
    setMessage('تم تعيين نطاق مسؤول العائلة.')
  }

  async function removeFamilyScope(user: ManagedUser, familyId: string) {
    if (!supabase || user.is_primary_admin) return
    setBusyUserId(user.user_id)
    setMessage('')
    const { data, error } = await supabase.rpc('set_family_moderator_assignment', {
      p_user_id: user.user_id,
      p_family_id: familyId,
      p_enabled: false,
    })
    setBusyUserId(null)

    if (error) {
      setMessage(error.message)
      return
    }

    const actualRole = typeof data === 'string' && data ? data : 'member'
    setRows((current) => current.map((item) => item.user_id === user.user_id ? { ...item, role: actualRole } : item))
    await loadScopes(user.user_id)
    setMessage('تمت إزالة نطاق العائلة.')
  }

  if (!active) return null

  return (
    <section className="admin-users-panel rbac-users-panel">
      <header className="admin-users-heading">
        <div>
          <span className="eyebrow">إدارة الصلاحيات</span>
          <h2>المستخدمون والأدوار</h2>
          <p>الأدوار الحساسة تُدار من هنا فقط. مسؤول العائلة مقيد بنطاق عائلاته، ومشرف المحتوى مقيد بالمناسبات، والمدير لا يستطيع إدارة الأدوار.</p>
        </div>
        <span className="primary-admin-lock">◆ المدير الأعلى فقط</span>
      </header>

      <div className="admin-user-search">
        <span>⌕</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالاسم أو البريد الإلكتروني" autoComplete="off" />
        {query && <button type="button" onClick={() => setQuery('')} aria-label="مسح البحث">×</button>}
      </div>

      {message && <div className="admin-users-message">{message}</div>}

      {loading ? (
        <div className="admin-users-skeleton"><i /><i /><i /></div>
      ) : rows.length ? (
        <div className="admin-users-list">
          {rows.map((user) => {
            const isSelf = user.user_id === currentUserId
            const expanded = expandedUserId === user.user_id
            const role = user.role || 'member'
            return (
              <article className={`admin-user-card rbac-user-card role-${role}`} key={user.user_id}>
                <span className="admin-user-avatar">{(user.display_name || user.email || 'م').trim().charAt(0)}</span>
                <div className="admin-user-copy">
                  <div className="admin-user-name-line">
                    <strong>{user.display_name || 'مستخدم بدون اسم'}</strong>
                    <span className={`role-badge ${user.is_primary_admin ? 'primary' : role}`}>{user.is_primary_admin ? 'مدير أعلى' : roleLabels[role] || role}</span>
                  </div>
                  <small dir="ltr">{user.email || '—'}</small>
                  <p>آخر دخول: {formatDate(user.last_sign_in_at)}{isSelf ? ' · حسابك' : ''}</p>
                </div>

                {!user.is_primary_admin && (
                  <div className="admin-user-actions">
                    <button type="button" className="manage-role" onClick={() => openRolePanel(user)}>{expanded ? 'إغلاق الصلاحيات' : 'إدارة الصلاحية'}</button>
                  </div>
                )}

                {expanded && !user.is_primary_admin && (
                  <div className="rbac-role-panel">
                    <div className="rbac-current-role">
                      <span>الدور الحالي</span>
                      <strong>{roleLabels[role] || role}</strong>
                      <small>{roleDescriptions[role] || 'صلاحية مخصصة لهذا الحساب.'}</small>
                    </div>

                    <div className="rbac-role-options" aria-label="اختيار الدور">
                      {(['member', 'content_moderator', 'admin'] as const).map((nextRole) => (
                        <button
                          type="button"
                          key={nextRole}
                          className={pendingRole === nextRole ? 'selected' : role === nextRole || (nextRole === 'member' && role === 'verified_member') ? 'current' : ''}
                          onClick={() => setPendingRole(nextRole)}
                        >
                          <strong>{nextRole === 'member' ? 'عضو' : roleLabels[nextRole]}</strong>
                          <small>{nextRole === 'member' ? 'الموثق يبقى موثقًا تلقائيًا' : roleDescriptions[nextRole]}</small>
                        </button>
                      ))}
                    </div>

                    {pendingRole && (
                      <div className="rbac-confirm-strip">
                        <span>تغيير الدور إلى «{pendingRole === 'member' ? 'عضو' : roleLabels[pendingRole]}»؟</span>
                        <button type="button" className="confirm" disabled={busyUserId === user.user_id} onClick={() => void changeRole(user, pendingRole as 'member' | 'content_moderator' | 'admin')}>{busyUserId === user.user_id ? '…' : 'تأكيد'}</button>
                        <button type="button" onClick={() => setPendingRole(null)}>إلغاء</button>
                      </div>
                    )}

                    <div className="family-scope-manager">
                      <div className="family-scope-heading">
                        <div><strong>مسؤول عائلة أو فرع</strong><small>يمكن تعيين أكثر من عائلة لنفس المسؤول. لن يرى أو يعتمد خارج هذه النطاقات.</small></div>
                        {role === 'family_moderator' && <span>مفعّل</span>}
                      </div>

                      {scopesLoading ? <div className="picker-skeleton compact">جارٍ تحميل النطاقات…</div> : scopes.length ? (
                        <div className="family-scope-chips">
                          {scopes.map((scope) => (
                            <span key={scope.family_id}><b>{scope.family_name}</b><small>{scope.origin_place || 'عائلة معتمدة'}</small><button type="button" disabled={busyUserId === user.user_id} onClick={() => void removeFamilyScope(user, scope.family_id)} aria-label={`إزالة ${scope.family_name}`}>×</button></span>
                          ))}
                        </div>
                      ) : <p className="family-scope-empty">لم يتم تعيين عائلة لهذا المستخدم.</p>}

                      <div className="family-scope-add">
                        <FamilyPicker label="اختر عائلة لإضافتها إلى نطاقه" value={scopeFamilyId} onChange={setScopeFamilyId} required />
                        <button type="button" className="primary" disabled={!scopeFamilyId || busyUserId === user.user_id} onClick={() => void addFamilyScope(user)}>{busyUserId === user.user_id ? 'جارٍ الحفظ…' : 'تعيين مسؤول عائلة'}</button>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      ) : <div className="empty-state compact">لا توجد حسابات مؤكدة مطابقة للبحث.</div>}

      {hasMore && !loading && <button type="button" className="admin-users-more" disabled={loadingMore} onClick={() => void fetchPage(query, rows.length, true)}>{loadingMore ? 'جارٍ التحميل…' : 'عرض المزيد'}</button>}
    </section>
  )
}
