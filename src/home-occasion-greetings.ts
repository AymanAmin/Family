import { supabase } from './lib/supabase'
import './home-occasion-greetings.css'

type OccasionGreeting = {
  event_id: string
  event_type: 'birth' | 'wedding'
  title: string
  event_date: string
  day_offset: number
  anniversary_years: number
  person_names: string[] | null
  family_name: string | null
}

const HOST_CLASS = 'home-occasion-greetings-host'
let greetings: OccasionGreeting[] | null = null
let loading: Promise<void> | null = null
let scheduled = false
let loadedDateKey = ''

function riyadhDateKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function relativeLabel(offset: number) {
  if (offset === 0) return 'اليوم'
  if (offset === 1) return 'غدًا'
  return 'بالأمس'
}

function relativeClass(offset: number) {
  if (offset === 0) return 'today'
  if (offset === 1) return 'tomorrow'
  return 'yesterday'
}

function subject(row: OccasionGreeting) {
  const names = (row.person_names ?? []).filter(Boolean)
  if (names.length >= 2) return `${names[0]} و${names[1]}`
  if (names.length === 1) return names[0]
  return row.title || (row.event_type === 'wedding' ? 'أصحاب المناسبة' : 'صاحب المناسبة')
}

function greetingText(row: OccasionGreeting) {
  const name = subject(row)

  if (row.event_type === 'birth') {
    if (row.day_offset === 0) {
      return {
        headline: `عيد ميلاد سعيد لـ ${name} 🎂`,
        detail: 'كل عام وأنتم بخير، وأعوام قادمة مليئة بالصحة والسعادة والبركة.',
      }
    }
    if (row.day_offset === 1) {
      return {
        headline: `غدًا عيد ميلاد ${name} 🎂`,
        detail: 'تهانينا مقدمًا، ونتمنى عامًا جديدًا جميلًا ومليئًا بالخير.',
      }
    }
    return {
      headline: `تهنئة متأخرة بعيد ميلاد ${name} 🎂`,
      detail: 'كل عام وأنتم بخير، وعقبال أعوام مديدة في صحة وسعادة.',
    }
  }

  const isFirstWeddingDay = row.anniversary_years <= 0
  if (row.day_offset === 0) {
    return isFirstWeddingDay
      ? {
          headline: `ألف مبروك زواج ${name} 💍`,
          detail: 'بارك الله لكما وبارك عليكما وجمع بينكما في خير وسعادة.',
        }
      : {
          headline: `ذكرى زواج سعيدة لـ ${name} 💍`,
          detail: 'أطيب التهاني بهذه الذكرى الجميلة، ودوام المودة والسعادة والبركة.',
        }
  }

  if (row.day_offset === 1) {
    return isFirstWeddingDay
      ? {
          headline: `غدًا زواج ${name} 💍`,
          detail: 'ألف مبروك مقدمًا، ونسأل الله لكما حياة مليئة بالمودة والرحمة.',
        }
      : {
          headline: `غدًا ذكرى زواج ${name} 💍`,
          detail: 'تهانينا مقدمًا بهذه الذكرى، ودوام المحبة والسعادة بينكما.',
        }
  }

  return isFirstWeddingDay
    ? {
        headline: `تهانينا المتأخرة بزواج ${name} 💍`,
        detail: 'بارك الله لكما وجمع بينكما في خير، وأدام عليكما الأفراح.',
      }
    : {
        headline: `تهنئة متأخرة بذكرى زواج ${name} 💍`,
        detail: 'أطيب الأمنيات بدوام المودة والسعادة والبركة في حياتكما.',
      }
}

function createGreetingCard(row: OccasionGreeting) {
  const card = document.createElement('article')
  card.className = `home-occasion-card ${row.event_type} ${relativeClass(row.day_offset)}`

  const symbol = document.createElement('span')
  symbol.className = 'home-occasion-symbol'
  symbol.setAttribute('aria-hidden', 'true')
  symbol.textContent = row.event_type === 'birth' ? '🎂' : '💍'

  const copy = document.createElement('div')
  copy.className = 'home-occasion-card-copy'

  const relative = document.createElement('span')
  relative.className = 'home-occasion-relative'
  relative.textContent = relativeLabel(row.day_offset)

  const text = greetingText(row)
  const headline = document.createElement('strong')
  headline.textContent = text.headline

  const detail = document.createElement('p')
  detail.textContent = text.detail

  copy.append(relative, headline, detail)

  if (row.family_name) {
    const family = document.createElement('span')
    family.className = 'home-occasion-family'
    family.textContent = row.family_name
    copy.append(family)
  }

  card.append(symbol, copy)
  return card
}

function renderHost(host: HTMLElement, rows: OccasionGreeting[]) {
  host.replaceChildren()

  const section = document.createElement('section')
  section.className = 'home-occasion-greetings'
  section.setAttribute('aria-label', 'تهاني المناسبات القريبة')

  const heading = document.createElement('div')
  heading.className = 'home-occasion-heading'

  const headingCopy = document.createElement('div')
  headingCopy.className = 'home-occasion-heading-copy'
  const small = document.createElement('small')
  small.textContent = 'من صلة القرابة إلى أهلنا'
  const title = document.createElement('strong')
  title.textContent = rows.some((row) => row.day_offset === 0) ? 'فرحة اليوم تستحق التهنئة' : 'مناسبات قريبة من أهلنا'
  headingCopy.append(small, title)

  const icon = document.createElement('span')
  icon.className = 'home-occasion-heading-icon'
  icon.setAttribute('aria-hidden', 'true')
  icon.textContent = '🎉'

  heading.append(headingCopy, icon)

  const list = document.createElement('div')
  list.className = 'home-occasion-list'
  rows.slice(0, 6).forEach((row) => list.append(createGreetingCard(row)))

  section.append(heading, list)
  host.append(section)
}

function ensureHost() {
  scheduled = false
  const dashboard = document.querySelector<HTMLElement>('.nasab-dashboard')
  if (!dashboard) return

  const existing = dashboard.querySelector<HTMLElement>(`:scope > .${HOST_CLASS}`)
  if (!greetings?.length) {
    existing?.remove()
    return
  }

  const host = existing ?? document.createElement('div')
  if (!existing) {
    host.className = HOST_CLASS
    const welcome = dashboard.querySelector<HTMLElement>('.compact-family-welcome')
    if (welcome) dashboard.insertBefore(host, welcome)
    else dashboard.append(host)
  }

  const signature = greetings.map((row) => `${row.event_id}:${row.day_offset}`).join('|')
  if (host.dataset.signature === signature) return
  host.dataset.signature = signature
  renderHost(host, greetings)
}

function scheduleEnsure() {
  if (scheduled) return
  scheduled = true
  window.requestAnimationFrame(ensureHost)
}

async function loadGreetings(force = false) {
  const dateKey = riyadhDateKey()
  if (!force && greetings !== null && loadedDateKey === dateKey) {
    scheduleEnsure()
    return
  }
  if (loading) return loading

  loading = (async () => {
    if (!supabase) {
      greetings = []
      loadedDateKey = dateKey
      return
    }

    const { data, error } = await supabase.rpc('get_home_occasion_greetings')
    if (error) {
      console.warn('Unable to load home occasion greetings.', error.message)
      greetings = []
    } else {
      greetings = (data ?? []) as OccasionGreeting[]
    }
    loadedDateKey = dateKey
    scheduleEnsure()
  })().finally(() => {
    loading = null
  })

  return loading
}

if (typeof document !== 'undefined') {
  void loadGreetings()

  const observer = new MutationObserver(scheduleEnsure)
  observer.observe(document.documentElement, { childList: true, subtree: true })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void loadGreetings()
  })

  window.setInterval(() => {
    if (riYadhDateChanged()) void loadGreetings(true)
  }, 30 * 60 * 1000)
}

function riYadhDateChanged() {
  return Boolean(loadedDateKey && loadedDateKey !== riyadhDateKey())
}
