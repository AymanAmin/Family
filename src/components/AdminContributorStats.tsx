import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type Period = '30' | 'all'

type Contributor = {
  user_id: string
  display_name: string
  email: string | null
  role: string
  total_contributions: number
  approved_contributions: number
  pending_contributions: number
  rejected_contributions: number
  people_count: number
  families_count: number
  events_count: number
  relationships_count: number
  memberships_count: number
  edits_count: number
  last_contribution_at: string | null
}

type Overview = {
  total_contributions: number
  active_contributors: number
  approved_contributions: number
  pending_contributions: number
  rejected_contributions: number
  duplicate_linked_people: number
  duplicate_linked_accounts: number
}

type Props = { active: boolean }

const PAGE_SIZE = 10

const roleLabels: Record<string, string> = {
  member: 'عضو',
  verified_member: 'عضو موثّق',
  family_moderator: 'مسؤول عائلة',
  content_moderator: 'مشرف محتوى',
  admin: 'مدير',
  super_admin: 'المدير الأعلى',
}

function number(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeContributor(row: Record<string, unknown>): Contributor {
  return {
    user_id: String(row.user_id ?? ''),
    display_name: String(row.display_name ?? 'مستخدم مسجل'),
    email: typeof row.email === 'string' ? row.email : null,
    role: String(row.role ?? 'member'),
    total_contributions: number(row.total_contributions),
    approved_contributions: number(row.approved_contributions),
    pending_contributions: number(row.pending_contributions),
    rejected_contributions: number(row.rejected_contributions),
    people_count: number(row.people_count),
    families_count: number(row.families_count),
    events_count: number(row.events_count),
    relationships_count: number(row.relationships_count),
    memberships_count: number(row.memberships_count),
    edits_count: number(row.edits_count),
    last_contribution_at: typeof row.last_contribution_at === 'string' ? row.last_contribution_at : null,
  }
}

function normalizeOverview(row?: Record<string, unknown> | null): Overview {
  return {
    total_contributions: number(row?.total_contributions),
    active_contributors: number(row?.active_contributors),
    approved_contributions: number(row?.approved_contributions),
    pending_contributions: number(row?.pending_contributions),
    rejected_contributions: number(row?.rejected_contributions),
    duplicate_linked_people: number(row?.duplicate_linked_people),
    duplicate_linked_accounts: number(row?.duplicate_linked_accounts),
  }
}

function formatDate(value: string | null) {
  if (!value) return 'لا يوجد نشاط'
  return new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium' }).format(new Date(value))
}

export default function AdminContributorStats({ active }: Props) {
  const [period, setPeriod] = useState<Period>('30')
  const [rows, setRows] = useState<Contributor[]>([])
  const [overview, setOverview] = useState<Overview>(() => normalizeOverview())
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [message, setMessage] = useState('')

  const periodDays = period === '30' ? 30 : null

  const load = useCallback(async (offset = 0, append = false) => {
    if (!active || !supabase) return
    append ? setLoadingMore(true) : setLoading(true)
    setMessage('')

    const [rankingResult, overviewResult] = await Promise.all([
      supabase.rpc('list_admin_contributor_stats', {
        p_period_days: periodDays,
        p_limit: PAGE_SIZE + 1,
        p_offset: offset,
      }),
      offset === 0
        ? supabase.rpc('get_admin_contribution_overview', { p_period_days: periodDays })
        : Promise.resolve({ data: null, error: null }),
    ])

    setLoading(false)
    setLoadingMore(false)

    if (rankingResult.error) {
      setRows([])
      setHasMore(false)
      setMessage(rankingResult.error.message.toLowerCase().includes('does not exist') ? 'شغّل migration رقم 026 لتفعيل إحصائيات المساهمين.' : 'تعذر تحميل إحصائيات المساهمين الآن.')
      return
    }

    const received = (rankingResult.data ?? []).map((item: unknown) => normalizeContributor(item as Record<string, unknown>))
    const page = received.slice(0, PAGE_SIZE)
    setHasMore(received.length > PAGE_SIZE)
    setRows((current) => append ? [...current, ...page] : page)

    if (!overviewResult.error && overviewResult.data) {
      const raw = Array.isArray(overviewResult.data) ? overviewResult.data[0] : overviewResult.data
      setOverview(normalizeOverview(raw as Record<string, unknown> | null))
    }
  }, [active, periodDays])

  useEffect(() => {
    if (!active) return
    void load()
  }, [active, load])

  const maximum = useMemo(() => Math.max(1, ...rows.map((item) => item.approved_contributions)), [rows])

  if (!active) return null

  return (
    <section className="contributor-stats-panel">
      <header className="contributor-stats-heading">
        <div><span className="eyebrow">نشاط المجتمع</span><h2>أكثر المساهمين فاعلية</h2><p>الترتيب يعتمد أولًا على المساهمات المعتمدة، ثم إجمالي النشاط. لا يتم تحميل سوى {PAGE_SIZE} مستخدمين في كل دفعة.</p></div>
        <div className="contributor-period-switch" aria-label="فترة الإحصائية">
          <button type="button" className={period === '30' ? 'active' : ''} onClick={() => setPeriod('30')}>30 يومًا</button>
          <button type="button" className={period === 'all' ? 'active' : ''} onClick={() => setPeriod('all')}>كل الوقت</button>
        </div>
      </header>

      <div className="contributor-overview-grid">
        <article><span>إجمالي المساهمات</span><strong>{overview.total_contributions}</strong><small>{period === '30' ? 'خلال آخر 30 يومًا' : 'منذ بداية المنصة'}</small></article>
        <article><span>مساهمون نشطون</span><strong>{overview.active_contributors}</strong><small>لديهم مساهمة واحدة على الأقل</small></article>
        <article><span>مساهمات معتمدة</span><strong>{overview.approved_contributions}</strong><small>{overview.pending_contributions} معلقة حاليًا</small></article>
        <article className={overview.duplicate_linked_people ? 'integrity-warning' : 'integrity-ok'}><span>سلامة ربط الحسابات</span><strong>{overview.duplicate_linked_people}</strong><small>{overview.duplicate_linked_people ? `${overview.duplicate_linked_accounts} حسابًا موزعة على سجلات مكررة` : 'لا توجد روابط مكررة مكتشفة'}</small></article>
      </div>

      {message && <div className="admin-users-message">{message}</div>}

      {loading ? <div className="contributor-ranking-skeleton"><i /><i /><i /><i /></div> : rows.length ? (
        <div className="contributor-ranking-list">
          {rows.map((item, index) => {
            const rank = index + 1
            const progress = Math.max(7, Math.round((item.approved_contributions / maximum) * 100))
            return (
              <article className="contributor-rank-card" key={item.user_id}>
                <span className={`contributor-rank rank-${rank <= 3 ? rank : 'other'}`}>{rank}</span>
                <span className="contributor-avatar">{item.display_name.trim().charAt(0) || 'م'}</span>
                <div className="contributor-copy">
                  <div className="contributor-name-line"><strong>{item.display_name}</strong><span>{roleLabels[item.role] || item.role}</span></div>
                  {item.email && <small dir="ltr">{item.email}</small>}
                  <div className="contributor-progress" aria-label={`${item.approved_contributions} مساهمة معتمدة`}><span style={{ width: `${progress}%` }} /></div>
                  <div className="contributor-kind-chips">
                    {item.people_count > 0 && <span>أفراد <b>{item.people_count}</b></span>}
                    {item.families_count > 0 && <span>عائلات <b>{item.families_count}</b></span>}
                    {item.events_count > 0 && <span>مناسبات <b>{item.events_count}</b></span>}
                    {item.relationships_count > 0 && <span>صلات <b>{item.relationships_count}</b></span>}
                    {item.memberships_count > 0 && <span>انتماءات <b>{item.memberships_count}</b></span>}
                    {item.edits_count > 0 && <span>تعديلات <b>{item.edits_count}</b></span>}
                  </div>
                </div>
                <div className="contributor-numbers">
                  <strong>{item.approved_contributions}</strong><span>معتمد</span>
                  <small>{item.total_contributions} إجمالي · {formatDate(item.last_contribution_at)}</small>
                </div>
              </article>
            )
          })}
        </div>
      ) : <div className="empty-state compact"><strong>لا يوجد نشاط في هذه الفترة</strong><span>ستظهر المساهمات هنا بعد أن يبدأ الأعضاء بإضافة المعلومات.</span></div>}

      {hasMore && !loading && <button className="admin-load-more" type="button" disabled={loadingMore} onClick={() => void load(rows.length, true)}>{loadingMore ? 'جارٍ تحميل المزيد…' : 'عرض مساهمين إضافيين'}</button>}
    </section>
  )
}
