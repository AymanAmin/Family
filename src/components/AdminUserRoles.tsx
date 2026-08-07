import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

type ManagedUser = {
  user_id: string
  email: string | null
  display_name: string | null
  role: string
  is_primary_admin: boolean
  created_at: string
  last_sign_in_at: string | null
}

type Props = {
  active: boolean
  currentUserId?: string | null
}

const PAGE_SIZE = 20

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
  const [confirmUserId, setConfirmUserId] = useState<string | null>(null)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
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
      setMessage(error.message.toLowerCase().includes('does not exist') ? 'شغّل migration إدارة المدراء أولًا في Supabase.' : 'تعذر تحميل قائمة المستخدمين الآن.')
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

  async function changeRole(user: ManagedUser) {
    if (!supabase || user.is_primary_admin) return
    const nextRole = user.role === 'admin' ? 'member' : 'admin'
    setBusyUserId(user.user_id)
    setMessage('')
    const { error } = await supabase.rpc('set_basic_user_role', {
      p_user_id: user.user_id,
      p_role: nextRole,
    })
    setBusyUserId(null)
    setConfirmUserId(null)

    if (error) {
      setMessage(error.message || 'تعذر تغيير الصلاحية.')
      return
    }

    setRows((current) => current.map((item) => item.user_id === user.user_id ? { ...item, role: nextRole } : item))
    setMessage(nextRole === 'admin' ? 'تم منح صلاحية المدير.' : 'تمت إعادة المستخدم إلى عضو.')
  }

  if (!active) return null

  return (
    <section className="admin-users-panel">
      <header className="admin-users-heading">
        <div>
          <span className="eyebrow">صلاحيات مؤقتة</span>
          <h2>المستخدمون والمدراء</h2>
          <p>حاليًا يمكنك التحويل بين «عضو» و«مدير». المدير يستطيع الإضافة المباشرة واعتماد الطلبات، لكنه لا يستطيع إدارة المدراء.</p>
        </div>
        <span className="primary-admin-lock">◆ المدير الرئيسي فقط</span>
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
            const isAdmin = user.role === 'admin' || user.role === 'super_admin'
            const confirming = confirmUserId === user.user_id
            return (
              <article className={`admin-user-card ${isAdmin ? 'is-admin' : ''}`} key={user.user_id}>
                <span className="admin-user-avatar">{(user.display_name || user.email || 'م').trim().charAt(0)}</span>
                <div className="admin-user-copy">
                  <div className="admin-user-name-line">
                    <strong>{user.display_name || 'مستخدم بدون اسم'}</strong>
                    {user.is_primary_admin ? <span className="role-badge primary">مدير رئيسي</span> : <span className={`role-badge ${isAdmin ? 'admin' : 'member'}`}>{isAdmin ? 'مدير' : 'عضو'}</span>}
                  </div>
                  <small dir="ltr">{user.email || '—'}</small>
                  <p>آخر دخول: {formatDate(user.last_sign_in_at)}{isSelf ? ' · حسابك' : ''}</p>
                </div>

                {!user.is_primary_admin && (
                  <div className="admin-user-actions">
                    {!confirming ? (
                      <button type="button" className={isAdmin ? 'demote' : 'promote'} onClick={() => setConfirmUserId(user.user_id)}>{isAdmin ? 'تحويل لعضو' : 'تعيين مدير'}</button>
                    ) : (
                      <div className="role-confirm-actions">
                        <span>{isAdmin ? 'إزالة صلاحية المدير؟' : 'منح صلاحية المدير؟'}</span>
                        <button type="button" className="confirm" disabled={busyUserId === user.user_id} onClick={() => void changeRole(user)}>{busyUserId === user.user_id ? '…' : 'تأكيد'}</button>
                        <button type="button" onClick={() => setConfirmUserId(null)}>إلغاء</button>
                      </div>
                    )}
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
