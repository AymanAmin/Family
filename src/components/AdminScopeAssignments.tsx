import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import '../admin-scope-assignments.css'

type ScopeType = 'household' | 'lineage' | 'branch'

type ManagedUser = {
  user_id: string
  email: string | null
  display_name: string | null
  role: string
  is_primary_admin: boolean
}

type ScopeOption = {
  scope_type: ScopeType
  scope_id: string
  scope_name: string
  subtitle: string
}

const scopeLabels: Record<ScopeType, string> = {
  household: 'أسرة',
  lineage: 'نسب',
  branch: 'فرع',
}

export default function AdminScopeAssignments() {
  const [isPrimaryAdmin, setIsPrimaryAdmin] = useState(false)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [userQuery, setUserQuery] = useState('')
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null)
  const [scopes, setScopes] = useState<ScopeOption[]>([])
  const [scopeType, setScopeType] = useState<ScopeType | 'all'>('all')
  const [scopeQuery, setScopeQuery] = useState('')
  const [options, setOptions] = useState<ScopeOption[]>([])
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [busyKey, setBusyKey] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!supabase) return
    let active = true
    async function resolve() {
      const { data: authData } = await supabase!.auth.getSession()
      const id = authData.session?.user.id
      if (!id) return active && setIsPrimaryAdmin(false)
      const { data } = await supabase!.from('profiles').select('is_primary_admin,account_status').eq('id', id).maybeSingle()
      if (active) setIsPrimaryAdmin(Boolean(data?.is_primary_admin && data?.account_status === 'active'))
    }
    void resolve()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { void resolve() })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!isPrimaryAdmin) return setPortalTarget(null)
    const locate = () => setPortalTarget(document.querySelector<HTMLElement>('.admin-console-tabs'))
    locate()
    const observer = new MutationObserver(locate)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [isPrimaryAdmin])

  const loadUsers = useCallback(async (term: string) => {
    if (!supabase || !isPrimaryAdmin) return
    setUsersLoading(true)
    const { data, error } = await supabase.rpc('list_registered_users_for_role_management', {
      p_search: term.trim() || null,
      p_limit: 30,
      p_offset: 0,
    })
    setUsersLoading(false)
    if (error) {
      setMessage('تعذر تحميل المستخدمين الآن.')
      return
    }
    setUsers((data ?? []) as ManagedUser[])
  }, [isPrimaryAdmin])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => { void loadUsers(userQuery) }, 250)
    return () => window.clearTimeout(timer)
  }, [open, userQuery, loadUsers])

  const loadScopes = useCallback(async (userId: string) => {
    if (!supabase) return
    const { data, error } = await supabase.rpc('list_moderator_scope_assignments', { p_user_id: userId })
    if (error) return setMessage('تعذر تحميل نطاقات المستخدم.')
    setScopes((data ?? []) as ScopeOption[])
  }, [])

  const loadOptions = useCallback(async () => {
    if (!supabase || !selectedUser) return
    setOptionsLoading(true)
    const { data, error } = await supabase.rpc('search_scope_options_v1', {
      p_query: scopeQuery.trim() || null,
      p_scope_type: scopeType === 'all' ? null : scopeType,
      p_limit: 30,
    })
    setOptionsLoading(false)
    if (error) return setMessage('تعذر البحث في الأسر والأنساب والفروع.')
    setOptions((data ?? []) as ScopeOption[])
  }, [selectedUser, scopeQuery, scopeType])

  useEffect(() => {
    if (!selectedUser) return
    const timer = window.setTimeout(() => { void loadOptions() }, 220)
    return () => window.clearTimeout(timer)
  }, [selectedUser, scopeQuery, scopeType, loadOptions])

  async function selectUser(user: ManagedUser) {
    setSelectedUser(user)
    setMessage('')
    setScopeQuery('')
    setScopeType('all')
    await loadScopes(user.user_id)
  }

  async function changeScope(option: ScopeOption, enabled: boolean) {
    if (!supabase || !selectedUser) return
    const key = `${option.scope_type}:${option.scope_id}`
    setBusyKey(key)
    setMessage('')
    const { data, error } = await supabase.rpc('set_moderator_scope_assignment', {
      p_user_id: selectedUser.user_id,
      p_scope_type: option.scope_type,
      p_scope_id: option.scope_id,
      p_enabled: enabled,
    })
    setBusyKey('')
    if (error) {
      setMessage(error.message.includes('protected') ? 'لا يمكن تعديل نطاق المدير الأعلى.' : 'تعذر تحديث نطاق الإشراف.')
      return
    }
    const role = typeof data === 'string' ? data : selectedUser.role
    setSelectedUser((current) => current ? { ...current, role } : current)
    setUsers((current) => current.map((user) => user.user_id === selectedUser.user_id ? { ...user, role } : user))
    await loadScopes(selectedUser.user_id)
    setMessage(enabled ? 'تم تعيين نطاق الإشراف. أصبح المستخدم مسؤول نطاق.' : 'تمت إزالة النطاق.')
  }

  const existingKeys = useMemo(() => new Set(scopes.map((scope) => `${scope.scope_type}:${scope.scope_id}`)), [scopes])

  if (!isPrimaryAdmin) return null

  const launcher = portalTarget ? createPortal(
    <button type="button" role="tab" className={`scope-admin-tab ${open ? 'active' : ''}`} aria-selected={open} onClick={() => setOpen(true)}>
      نطاقات الإشراف <span>◎</span>
    </button>,
    portalTarget,
  ) : null

  return <>
    {launcher}
    {open && createPortal(
      <div className="scope-admin-overlay" role="dialog" aria-modal="true" aria-label="نطاقات الإشراف">
        <section className="scope-admin-screen">
          <header className="scope-admin-header">
            <div><span className="eyebrow">صلاحيات بلا مفهوم العائلة القديمة</span><h1>نطاقات الإشراف</h1><p>عيّن للمستخدم أسرة محددة أو نسبًا كاملًا أو فرعًا. لن يرى مسؤول النطاق أو يعتمد ما يقع خارج نطاقه.</p></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق">×</button>
          </header>

          <div className="scope-admin-body">
            <section className="scope-user-column">
              <label className="scope-search"><span>⌕</span><input value={userQuery} onChange={(event) => setUserQuery(event.target.value)} placeholder="ابحث عن المستخدم" /></label>
              {usersLoading ? <div className="scope-state">جارٍ تحميل المستخدمين…</div> : <div className="scope-user-list">
                {users.filter((user) => !user.is_primary_admin).map((user) => (
                  <button type="button" key={user.user_id} className={selectedUser?.user_id === user.user_id ? 'active' : ''} onClick={() => void selectUser(user)}>
                    <span>{(user.display_name || user.email || 'م').trim().charAt(0)}</span>
                    <span><strong>{user.display_name || 'مستخدم'}</strong><small>{user.email || '—'}</small></span>
                    {user.role === 'family_moderator' && <em>مسؤول نطاق</em>}
                  </button>
                ))}
              </div>}
            </section>

            <section className="scope-detail-column">
              {!selectedUser ? <div className="scope-empty"><strong>اختر مستخدمًا</strong><span>بعدها يمكنك تحديد الأسر أو الأنساب أو الفروع التي يديرها.</span></div> : <>
                <div className="scope-selected-user">
                  <div><small>المستخدم المحدد</small><strong>{selectedUser.display_name || selectedUser.email || 'مستخدم'}</strong></div>
                  <span>{scopes.length} نطاق</span>
                </div>

                {message && <div className="scope-message">{message}</div>}

                <div className="scope-current-list">
                  <h2>النطاقات الحالية</h2>
                  {scopes.length ? scopes.map((scope) => {
                    const key = `${scope.scope_type}:${scope.scope_id}`
                    return <article key={key}>
                      <span className={`scope-kind ${scope.scope_type}`}>{scopeLabels[scope.scope_type]}</span>
                      <div><strong>{scope.scope_name}</strong><small>{scope.subtitle}</small></div>
                      <button type="button" disabled={busyKey === key} onClick={() => void changeScope(scope, false)}>{busyKey === key ? '…' : 'إزالة'}</button>
                    </article>
                  }) : <div className="scope-inline-empty">لا توجد نطاقات مخصصة لهذا المستخدم.</div>}
                </div>

                <div className="scope-add-area">
                  <div className="scope-type-tabs">
                    {(['all', 'household', 'lineage', 'branch'] as const).map((type) => <button type="button" key={type} className={scopeType === type ? 'active' : ''} onClick={() => setScopeType(type)}>{type === 'all' ? 'الكل' : scopeLabels[type]}</button>)}
                  </div>
                  <label className="scope-search"><span>⌕</span><input value={scopeQuery} onChange={(event) => setScopeQuery(event.target.value)} placeholder="ابحث باسم الأسرة أو النسب أو الفرع" /></label>
                  {optionsLoading ? <div className="scope-state">جارٍ البحث…</div> : <div className="scope-option-list">
                    {options.map((option) => {
                      const key = `${option.scope_type}:${option.scope_id}`
                      const assigned = existingKeys.has(key)
                      return <article key={key} className={assigned ? 'assigned' : ''}>
                        <span className={`scope-kind ${option.scope_type}`}>{scopeLabels[option.scope_type]}</span>
                        <div><strong>{option.scope_name}</strong><small>{option.subtitle}</small></div>
                        <button type="button" disabled={assigned || busyKey === key} onClick={() => void changeScope(option, true)}>{assigned ? 'مضاف' : busyKey === key ? '…' : 'تعيين'}</button>
                      </article>
                    })}
                  </div>}
                </div>
              </>}
            </section>
          </div>
        </section>
      </div>, document.body,
    )}
  </>
}
