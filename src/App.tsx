import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getApplicationUrl, supabase, supabaseConfiguration } from './lib/supabase'

type AuthStatus = 'idle' | 'loading' | 'error'

const families = [
  { name: 'عائلة النور', people: 186, generations: 7 },
  { name: 'عائلة الأمين', people: 142, generations: 6 },
  { name: 'عائلة الخير', people: 97, generations: 5 },
]

const events = [
  {
    type: 'مناسبة عامة',
    title: 'لقاء أهالي المنطقة',
    details: 'تجمع اجتماعي لتعزيز التواصل وتوثيق تاريخ المنطقة.',
    date: 'الجمعة القادمة',
    icon: '🤝',
  },
  {
    type: 'سماية',
    title: 'سماية المولود محمد',
    details: 'تهنئة للأسرة بالمولود الجديد، وتظهر التفاصيل بعد اعتماد المناسبة.',
    date: 'بعد 8 أيام',
    icon: '👶',
  },
  {
    type: 'زواج',
    title: 'زواج بين أسرتين من المنطقة',
    details: 'تعرض المنصة صلتك بالعريس والعروس والأشخاص الأنسب للتهنئة.',
    date: 'بعد أسبوعين',
    icon: '💍',
  },
]

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.53h3.24c1.9-1.75 2.98-4.33 2.98-7.39Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.64-2.38l-3.24-2.53c-.9.6-2.05.96-3.4.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.61A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.39 13.92A6 6 0 0 1 6.08 12c0-.67.12-1.32.31-1.92V7.47H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.53l3.35-2.61Z" />
      <path fill="#EA4335" d="M12 5.95c1.47 0 2.79.5 3.83 1.5l2.88-2.88A9.66 9.66 0 0 0 12 2a10 10 0 0 0-8.96 5.47l3.35 2.61C7.18 7.71 9.39 5.95 12 5.95Z" />
    </svg>
  )
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [authStatus, setAuthStatus] = useState<AuthStatus>('idle')
  const [authMessage, setAuthMessage] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    if (!supabase) {
      setSessionLoading(false)
      return
    }

    let isMounted = true

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return
      if (error) setAuthMessage('تعذر قراءة جلسة الدخول. حاول تحديث الصفحة.')
      setSession(data.session)
      setSessionLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return
      setSession(nextSession)
      setSessionLoading(false)
      setAuthStatus('idle')
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const userInfo = useMemo(() => {
    if (!session?.user) return null
    const metadata = session.user.user_metadata ?? {}
    return {
      name: metadata.full_name || metadata.name || 'عضو جديد',
      avatar: metadata.avatar_url || metadata.picture || '',
      email: session.user.email || '',
    }
  }, [session])

  async function signInWithGoogle() {
    setAuthMessage('')

    if (!supabase || !supabaseConfiguration.isComplete) {
      setAuthStatus('error')
      setAuthMessage('يلزم إضافة رابط مشروع Supabase لتفعيل تسجيل Google على الموقع المنشور.')
      return
    }

    setAuthStatus('loading')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getApplicationUrl(),
        scopes: 'openid email profile',
        queryParams: {
          prompt: 'select_account',
        },
      },
    })

    if (error) {
      setAuthStatus('error')
      setAuthMessage(error.message || 'تعذر بدء تسجيل الدخول عبر Google.')
    }
  }

  async function signOut() {
    if (!supabase) return
    setAuthStatus('loading')
    const { error } = await supabase.auth.signOut()
    if (error) {
      setAuthStatus('error')
      setAuthMessage('تعذر تسجيل الخروج. حاول مرة أخرى.')
      return
    }
    setAuthStatus('idle')
  }

  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = searchTerm.trim()
    if (!value) {
      setAuthMessage('اكتب اسم شخص أو عائلة للبحث.')
      return
    }
    setAuthMessage(`سيتم البحث عن «${value}» بعد ربط قاعدة بيانات الأشخاص والعائلات.`)
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="الصفحة الرئيسية">
          <span className="brand-mark" aria-hidden="true">ص</span>
          <span>
            <strong>صلة المنطقة</strong>
            <small>الأهل، التاريخ، والمناسبات</small>
          </span>
        </a>

        <nav className="desktop-nav" aria-label="التنقل الرئيسي">
          <a href="#families">العائلات</a>
          <a href="#events">المناسبات</a>
          <a href="#about">عن المنصة</a>
        </nav>

        {sessionLoading ? (
          <span className="session-skeleton" aria-label="جارٍ تحميل الحساب" />
        ) : userInfo ? (
          <div className="user-menu">
            {userInfo.avatar ? <img src={userInfo.avatar} alt="" referrerPolicy="no-referrer" /> : <span>{userInfo.name.slice(0, 1)}</span>}
            <div>
              <strong>{userInfo.name}</strong>
              <small>{userInfo.email}</small>
            </div>
            <button className="text-button" type="button" onClick={signOut} disabled={authStatus === 'loading'}>
              خروج
            </button>
          </div>
        ) : (
          <button className="header-login" type="button" onClick={signInWithGoogle} disabled={authStatus === 'loading'}>
            دخول
          </button>
        )}
      </header>

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <span className="eyebrow">منصة مجتمعية موثوقة لأهالي المنطقة</span>
            <h1 id="hero-title">اعرف أهلك، واحفظ تاريخ منطقتك، وكن حاضرًا في مناسباتهم.</h1>
            <p>
              ابحث عن الأشخاص والعائلات، استعرض صلات القرابة الموثقة، وتعرّف على من تعزّي أو تهنئ بطريقة واضحة تحترم الخصوصية.
            </p>

            <form className="hero-search" role="search" onSubmit={handleSearch}>
              <label htmlFor="community-search">ابحث عن شخص أو عائلة</label>
              <div className="search-control">
                <span aria-hidden="true">⌕</span>
                <input
                  id="community-search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="مثال: محمد أحمد أو عائلة النور"
                  autoComplete="off"
                />
                <button type="submit">بحث</button>
              </div>
            </form>

            <div className="trust-points" aria-label="مزايا المنصة">
              <span>✓ بيانات معتمدة</span>
              <span>✓ خصوصية متعددة المستويات</span>
              <span>✓ متوافق مع الجوال</span>
            </div>
          </div>

          <aside className="auth-card" aria-labelledby="auth-title">
            {userInfo ? (
              <>
                <span className="auth-icon success" aria-hidden="true">✓</span>
                <h2 id="auth-title">مرحبًا {userInfo.name}</h2>
                <p>تم تسجيل دخولك. الخطوة التالية هي طلب ربط حسابك بسجلك داخل شجرة المنطقة.</p>
                <button className="primary-button" type="button">طلب ربط الحساب بشخص</button>
                <small>لن يمنح الربط أي صلاحيات قبل اعتماد الإدارة.</small>
              </>
            ) : (
              <>
                <span className="auth-icon" aria-hidden="true">◎</span>
                <h2 id="auth-title">شارك في توثيق المنطقة</h2>
                <p>سجّل بحساب Gmail لتقديم أشخاص وعلاقات ومناسبات وأخبار. جميع الإضافات تنتظر اعتماد الإدارة.</p>
                <button className="google-button" type="button" onClick={signInWithGoogle} disabled={authStatus === 'loading'}>
                  <GoogleIcon />
                  <span>{authStatus === 'loading' ? 'جارٍ تحويلك إلى Google…' : 'المتابعة باستخدام Google'}</span>
                </button>
                <small>لن ننشر بريدك الإلكتروني أو بيانات حسابك للعامة.</small>
              </>
            )}

            {authMessage && (
              <p className={authStatus === 'error' ? 'inline-message error' : 'inline-message'} role="status">
                {authMessage}
              </p>
            )}
          </aside>
        </section>

        <section className="stats" aria-label="إحصائيات تجريبية للمنصة">
          <article><strong>24</strong><span>عائلة موثقة</span></article>
          <article><strong>1,280</strong><span>شخصًا في السجلات</span></article>
          <article><strong>9</strong><span>أجيال موثقة</span></article>
          <article><strong>36</strong><span>مناسبة هذا العام</span></article>
        </section>

        <section className="content-section" id="families" aria-labelledby="families-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">دليل المنطقة</span>
              <h2 id="families-title">عائلات من المنطقة</h2>
              <p>لكل عائلة هويتها وشجرتها المستقلة، وتظهر الزيجات كروابط بين الأسر دون دمجها.</p>
            </div>
            <button className="secondary-button" type="button">مشاهدة جميع العائلات</button>
          </div>

          <div className="family-grid">
            {families.map((family, index) => (
              <article className="family-card" key={family.name}>
                <span className={`family-symbol family-symbol-${index + 1}`} aria-hidden="true">{family.name.slice(-1)}</span>
                <div>
                  <h3>{family.name}</h3>
                  <p>{family.people} شخصًا · {family.generations} أجيال</p>
                </div>
                <button type="button" aria-label={`عرض ${family.name}`}>←</button>
              </article>
            ))}
          </div>
        </section>

        <section className="content-section muted-section" id="events" aria-labelledby="events-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">كن حاضرًا مع أهلك</span>
              <h2 id="events-title">آخر المناسبات</h2>
              <p>معلومات المكان والزمان والأشخاص المرتبطين تظهر بحسب مستوى الخصوصية والاعتماد.</p>
            </div>
          </div>

          <div className="event-grid">
            {events.map((event) => (
              <article className="event-card" key={event.title}>
                <span className="event-icon" aria-hidden="true">{event.icon}</span>
                <div className="event-meta">
                  <span>{event.type}</span>
                  <time>{event.date}</time>
                </div>
                <h3>{event.title}</h3>
                <p>{event.details}</p>
                <button type="button">عرض التفاصيل</button>
              </article>
            ))}
          </div>
        </section>

        <section className="about-section" id="about" aria-labelledby="about-title">
          <div>
            <span className="eyebrow">مشاركة مسؤولة</span>
            <h2 id="about-title">المعلومات لا تُنشر مباشرة</h2>
            <p>كل شخص أو علاقة أو مناسبة يضيفها عضو مسجل تبقى خاصة به حتى يراجعها مسؤول العائلة أو إدارة المنصة.</p>
          </div>
          <ol>
            <li><span>1</span><div><strong>سجّل بحساب Gmail</strong><small>دخول آمن وسريع عبر Google.</small></div></li>
            <li><span>2</span><div><strong>قدّم المعلومة</strong><small>أضف المصدر والتفاصيل المتاحة.</small></div></li>
            <li><span>3</span><div><strong>تتم المراجعة</strong><small>يفحص المشرف التكرار والتعارض والخصوصية.</small></div></li>
            <li><span>4</span><div><strong>تظهر بعد الاعتماد</strong><small>يصل إشعار للمستخدم بنتيجة الطلب.</small></div></li>
          </ol>
        </section>
      </main>

      <footer>
        <div className="brand footer-brand">
          <span className="brand-mark" aria-hidden="true">ص</span>
          <span><strong>صلة المنطقة</strong><small>سجل اجتماعي وعائلي موثوق</small></span>
        </div>
        <p>الخصوصية والاعتماد الإداري جزء أساسي من تصميم المنصة.</p>
      </footer>
    </div>
  )
}

export default App
