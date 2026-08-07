import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import RecordEditButton from './RecordEditButton'
import './NewsScreen.css'

type RelatedFamily = { name?: string } | { name?: string }[] | null
type RelatedPerson = { id?: string; full_name?: string } | { id?: string; full_name?: string }[] | null

type EventMention = {
  event_id: string
  participant_role: string
  people?: RelatedPerson
}

type NewsItem = {
  id: string
  event_type: string
  title: string
  description: string | null
  event_date: string | null
  location_name: string | null
  family_id: string | null
  created_by: string
  created_at: string
  families?: RelatedFamily
  mentions?: EventMention[]
}

type Props = {
  onBack: () => void
  onAdd: () => void
  onOpenPerson: (personId: string) => void | Promise<void>
}

const PAGE_SIZE = 8

const eventLabels: Record<string, string> = {
  death: 'وفاة وعزاء',
  wedding: 'زواج',
  birth: 'مولود',
  naming: 'سماية',
  graduation: 'تخرج ونجاح',
  general: 'خبر عائلي',
  other: 'مناسبة',
}

const eventGlyphs: Record<string, string> = {
  death: '✦',
  wedding: '♡',
  birth: '☆',
  naming: '◌',
  graduation: '◇',
  general: '◈',
  other: '•',
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

function formatDate(value: string | null): string {
  if (!value) return 'بدون تاريخ محدد'
  return new Intl.DateTimeFormat('ar-SA', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value))
}

export default function NewsScreen({ onBack, onAdd, onOpenPerson }: Props) {
  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)

  const loadAdminAccess = useCallback(async (userId: string | null | undefined) => {
    setSessionUserId(userId ?? null)
    if (!supabase || !userId) {
      setIsAdmin(false)
      return
    }

    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('role,account_status')
      .eq('id', userId)
      .maybeSingle()

    setIsAdmin(!profileError && data?.account_status === 'active' && ['admin', 'super_admin'].includes(data.role))
  }, [])

  const loadPage = useCallback(async (offset: number, append: boolean) => {
    if (!supabase) {
      setError('تعذر الاتصال بقاعدة البيانات.')
      setLoading(false)
      setLoadingMore(false)
      return
    }

    append ? setLoadingMore(true) : setLoading(true)
    setError('')

    const result = await supabase
      .from('events')
      .select('id,event_type,title,description,event_date,location_name,family_id,created_by,created_at,families(name)')
      .eq('status', 'approved')
      .order('event_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE)

    if (result.error) {
      setError('تعذر تحميل الأخبار الآن. حاول مرة أخرى.')
      setLoading(false)
      setLoadingMore(false)
      return
    }

    const fetched = (result.data ?? []) as NewsItem[]
    const page = fetched.slice(0, PAGE_SIZE)
    const eventIds = page.map((item) => item.id)
    let hydrated = page

    if (eventIds.length) {
      const mentionsResult = await supabase
        .from('event_people')
        .select('event_id,participant_role,people(id,full_name)')
        .in('event_id', eventIds)
        .order('sort_order')

      if (!mentionsResult.error) {
        const mentionMap = new Map<string, EventMention[]>()
        for (const mention of (mentionsResult.data ?? []) as EventMention[]) {
          const bucket = mentionMap.get(mention.event_id) ?? []
          bucket.push(mention)
          mentionMap.set(mention.event_id, bucket)
        }
        hydrated = page.map((item) => ({ ...item, mentions: mentionMap.get(item.id) ?? [] }))
      }
    }

    setItems((current) => append ? [...current, ...hydrated] : hydrated)
    setHasMore(fetched.length > PAGE_SIZE)
    setLoading(false)
    setLoadingMore(false)
  }, [])

  useEffect(() => {
    void loadPage(0, false)
  }, [loadPage])

  useEffect(() => {
    if (!supabase) return

    let mounted = true
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) void loadAdminAccess(data.session?.user.id)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) void loadAdminAccess(session?.user.id)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadAdminAccess])

  return (
    <section className="news-page page-section">
      <div className="news-page-topbar">
        <button className="news-back" type="button" onClick={onBack}>→ العودة للرئيسية</button>
        <button className="news-add" type="button" onClick={onAdd}>＋ إضافة خبر أو مناسبة</button>
      </div>

      <header className="news-hero">
        <div className="news-hero-mark" aria-hidden="true"><span>صلة</span></div>
        <div>
          <span className="eyebrow">ذاكرة العائلة الحيّة</span>
          <h1>أخبار ومناسبات العائلة</h1>
          <p>المناسبات والذكريات والأخبار المعتمدة، مرتبة من الأحدث مع تحميل تدريجي يحافظ على سرعة التطبيق.</p>
        </div>
      </header>

      {loading ? (
        <div className="news-skeleton-grid" aria-label="جارٍ تحميل الأخبار">
          {Array.from({ length: 4 }, (_, index) => <div className="news-card-skeleton" key={index} />)}
        </div>
      ) : error ? (
        <div className="news-error"><strong>{error}</strong><button type="button" onClick={() => void loadPage(0, false)}>إعادة المحاولة</button></div>
      ) : items.length ? (
        <>
          <div className="news-grid">
            {items.map((item) => {
              const family = familyName(item.families)
              return (
                <article className={`news-card news-type-${item.event_type}`} key={item.id}>
                  <div className="news-card-accent" aria-hidden="true"><span>{eventGlyphs[item.event_type] ?? '•'}</span></div>
                  <div className="news-card-body">
                    <div className="news-card-kicker">
                      <span className="news-type-pill">{eventLabels[item.event_type] ?? item.event_type}</span>
                      <time dateTime={item.event_date ?? item.created_at}>{formatDate(item.event_date)}</time>
                    </div>
                    <h2>{item.title}</h2>
                    {item.description && <p className="news-description">{item.description}</p>}
                    <div className="news-meta">
                      {item.location_name && <span><b aria-hidden="true">⌖</b>{item.location_name}</span>}
                      {family && <span><b aria-hidden="true">⌂</b>{family}</span>}
                    </div>
                    {item.mentions?.length ? (
                      <div className="news-people" aria-label="الأشخاص المرتبطون بالخبر">
                        {item.mentions.map((mention) => {
                          const id = personId(mention.people)
                          const name = personName(mention.people)
                          if (!id || !name) return null
                          return <button type="button" key={`${item.id}-${id}-${mention.participant_role}`} onClick={() => void onOpenPerson(id)}>@ {name}</button>
                        })}
                      </div>
                    ) : null}
                    {isAdmin && (
                      <div className="news-admin-edit">
                        <RecordEditButton
                          entityType="events"
                          recordId={item.id}
                          createdBy={item.created_by}
                          sessionUserId={sessionUserId}
                          isAdmin
                          initialData={{
                            event_type: item.event_type,
                            title: item.title,
                            family_id: item.family_id,
                            event_date: item.event_date,
                            location_name: item.location_name,
                            description: item.description,
                          }}
                          onSaved={() => loadPage(0, false)}
                        />
                      </div>
                    )}
                  </div>
                </article>
              )
            })}
          </div>

          {hasMore && (
            <div className="news-load-more-wrap">
              <button className="news-load-more" type="button" disabled={loadingMore} onClick={() => void loadPage(items.length, true)}>
                {loadingMore ? 'جارٍ تحميل المزيد…' : 'عرض أخبار أقدم'}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="news-empty"><span aria-hidden="true">◇</span><strong>لا توجد أخبار منشورة بعد</strong><p>عند اعتماد أول مناسبة أو خبر سيظهر هنا تلقائيًا.</p></div>
      )}
    </section>
  )
}
