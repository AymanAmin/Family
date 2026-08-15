from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Marker not found: {label}")
    return text.replace(old, new, 1)


def replace_all_checked(text: str, old: str, new: str, label: str, minimum: int = 1) -> str:
    count = text.count(old)
    if count < minimum:
        raise RuntimeError(f"Expected at least {minimum} occurrence(s) for {label}, found {count}")
    return text.replace(old, new)


# ---------------------------------------------------------------------------
# App.tsx: keep the heavy top-level screens mounted, refresh on forward entry,
# and restore the already-rendered state on browser/app back navigation.
# ---------------------------------------------------------------------------
app_path = Path('src/App.tsx')
app = app_path.read_text(encoding='utf-8')

app = replace_once(
    app,
    "import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'",
    "import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'",
    'React useRef import',
)

app = replace_once(
    app,
    "  const [view, setView] = useState<View>('home')\n  const [routeReady, setRouteReady] = useState(false)\n",
    "  const [view, setView] = useState<View>('home')\n"
    "  const [routeReady, setRouteReady] = useState(false)\n"
    "  const [directoryLaunchTerm, setDirectoryLaunchTerm] = useState('')\n"
    "  const [treeLaunchPersonId, setTreeLaunchPersonId] = useState<string | null>(null)\n"
    "  const [keptScreens, setKeptScreens] = useState({ news: false, search: false, tree: false })\n"
    "  const [screenEpochs, setScreenEpochs] = useState({ news: 0, search: 0, tree: 0 })\n"
    "  const screenScrollRef = useRef<Partial<Record<View, number>>>({})\n"
    "  const personHistoryCacheRef = useRef(new Map<string, { person: Person; relationships: PersonRelationship[] }>())\n"
    "  const familyHistoryCacheRef = useRef(new Map<string, Family>())\n",
    'navigation cache state',
)

helper_marker = "  }, [canModerate])\n\n  useEffect(() => {\n    if (!supabase) {"
helper_code = """  }, [canModerate])

  function keepScreen(target: View) {
    if (target !== 'news' && target !== 'search' && target !== 'tree') return
    setKeptScreens((current) => current[target] ? current : { ...current, [target]: true })
  }

  function rememberCurrentScroll() {
    screenScrollRef.current[view] = window.scrollY
  }

  function navigateFresh(
    target: View,
    options: {
      directoryTerm?: string
      directoryTab?: 'all' | 'people' | 'families'
      treePersonId?: string | null
    } = {},
  ) {
    rememberCurrentScroll()

    if (target === 'search') {
      setDirectoryLaunchTerm(options.directoryTerm ?? '')
      if (options.directoryTab) setDirectoryInitialTab(options.directoryTab)
    }
    if (target === 'tree') {
      setTreeLaunchPersonId(options.treePersonId ?? profile?.linked_person_id ?? selectedPerson?.id ?? null)
    }

    if (target === 'news' || target === 'search' || target === 'tree') {
      keepScreen(target)
      setScreenEpochs((current) => ({ ...current, [target]: current[target] + 1 }))
    }

    if (target === 'home') void loadCommunityData()
    if (target === 'admin') void loadPending()
    if (target === 'account' && session) void loadProfile(session)

    setView(target)
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }))
  }

  function restoreCachedView(target: View, historyScrollY?: number) {
    rememberCurrentScroll()
    keepScreen(target)
    setView(target)
    const top = typeof historyScrollY === 'number'
      ? historyScrollY
      : (screenScrollRef.current[target] ?? 0)
    window.requestAnimationFrame(() => window.scrollTo({ top, left: 0, behavior: 'auto' }))
  }

  function goBackCached(fallback: View) {
    const state = window.history.state as { __familyDepth?: number } | null
    if (typeof state?.__familyDepth === 'number' && state.__familyDepth > 0) {
      window.history.back()
      return
    }
    restoreCachedView(fallback)
  }

  useEffect(() => {
    if (view === 'news' || view === 'search' || view === 'tree') keepScreen(view)
  }, [view])

  useEffect(() => {
    if (!supabase) {"""
app = replace_once(app, helper_marker, helper_code, 'navigation helper insertion')

# Initial/manual page load should use the route but still perform a normal fresh mount.
app = replace_once(
    app,
    "      } else if (target === 'news' || target === 'search' || target === 'tree' || target === 'add' || target === 'admin' || target === 'account') {\n        setView(target as View)\n",
    "      } else if (target === 'tree') {\n"
    "        setTreeLaunchPersonId(profile?.linked_person_id ?? selectedPerson?.id ?? null)\n"
    "        setView('tree')\n"
    "      } else if (target === 'news' || target === 'search' || target === 'add' || target === 'admin' || target === 'account') {\n"
    "        setView(target as View)\n",
    'initial route tree launch state',
)

# Listen to the lightweight history event emitted by main.tsx instead of relying
# on a full document reload. Back = restore; browser forward = refresh.
route_sync_marker = """  }, [routeReady, view, selectedPerson?.id, selectedFamily?.id])

  const visibleFamilies"""
route_listener = """  }, [routeReady, view, selectedPerson?.id, selectedFamily?.id])

  useEffect(() => {
    if (!routeReady) return

    const handleHistoryNavigation = (event: Event) => {
      const detail = (event as CustomEvent<{ direction?: 'back' | 'forward' | 'unknown'; scrollY?: number }>).detail
      const rawHash = window.location.hash
      if (!rawHash.startsWith('#/')) return

      const route = decodeURIComponent(rawHash.replace(/^#\\/?/, ''))
      const [target, id] = route.split('/')
      const restore = detail?.direction !== 'forward'
      const scrollY = detail?.scrollY

      if (target === 'person' && id) {
        void openPersonById(id, { restore, scrollY })
        return
      }
      if (target === 'family' && id) {
        void openFamilyById(id, { restore, scrollY })
        return
      }

      const nextView: View = target === 'news' || target === 'search' || target === 'tree' || target === 'add' || target === 'admin' || target === 'account'
        ? target
        : 'home'

      if (restore) {
        restoreCachedView(nextView, scrollY)
      } else {
        navigateFresh(nextView, {
          directoryTerm: nextView === 'search' ? directoryLaunchTerm : undefined,
          directoryTab: nextView === 'search' ? directoryInitialTab : undefined,
          treePersonId: nextView === 'tree' ? treeLaunchPersonId : undefined,
        })
      }
    }

    window.addEventListener('sila:history-navigation', handleHistoryNavigation as EventListener)
    return () => window.removeEventListener('sila:history-navigation', handleHistoryNavigation as EventListener)
  }, [routeReady, view, directoryLaunchTerm, directoryInitialTab, treeLaunchPersonId, profile?.linked_person_id, selectedPerson?.id])

  const visibleFamilies"""
app = replace_once(app, route_sync_marker, route_listener, 'history navigation listener')

# Search entry always launches a fresh directory snapshot.
app = replace_once(
    app,
    "  async function runSearch(event?: FormEvent<HTMLFormElement>) {\n    event?.preventDefault()\n    if (!schemaReady) return\n    setDirectoryInitialTab('all')\n    setView('search')\n  }",
    "  async function runSearch(event?: FormEvent<HTMLFormElement>) {\n"
    "    event?.preventDefault()\n"
    "    if (!schemaReady) return\n"
    "    navigateFresh('search', { directoryTerm: searchTerm, directoryTab: 'all' })\n"
    "  }",
    'fresh directory search launch',
)

# Person/family records are fetched fresh on a normal transition. Only a back
# navigation may reuse the in-memory record/relationship snapshot.
old_family_person = """  function openFamily(item: Family) {
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
"""
new_family_person = """  function openFamily(item: Family, options: { restore?: boolean; scrollY?: number } = {}) {
    rememberCurrentScroll()
    familyHistoryCacheRef.current.set(item.id, item)
    setSelectedFamily(item)
    setView('family')
    const top = options.restore ? (options.scrollY ?? screenScrollRef.current.family ?? 0) : 0
    window.requestAnimationFrame(() => window.scrollTo({ top, left: 0, behavior: 'auto' }))
  }

  async function openFamilyById(id: string, options: { restore?: boolean; scrollY?: number } = {}) {
    if (options.restore) {
      const cached = familyHistoryCacheRef.current.get(id) ?? families.find((item) => item.id === id)
      if (cached) {
        openFamily(cached, options)
        return
      }
    }
    if (!supabase) return

    const { data, error } = await supabase
      .from('families')
      .select('id,name,description,origin_place,status,created_by,created_at')
      .eq('id', id)
      .maybeSingle()

    if (error) return showMessage(friendlyError(error.message), 'error')
    if (data) openFamily(data as Family, options)
  }

  async function openPerson(
    item: Person,
    options: { restore?: boolean; scrollY?: number; cachedRelationships?: PersonRelationship[] } = {},
  ) {
    rememberCurrentScroll()
    setSelectedPerson(item)
    setView('person')

    if (options.restore && options.cachedRelationships) {
      setRelationsLoading(false)
      setRelationships(options.cachedRelationships)
      const top = options.scrollY ?? screenScrollRef.current.person ?? 0
      window.requestAnimationFrame(() => window.scrollTo({ top, left: 0, behavior: 'auto' }))
      return
    }

    setRelationsLoading(true)
    setRelationships([])
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
    const resolvedRelationships = (data ?? []) as PersonRelationship[]
    setRelationships(resolvedRelationships)
    personHistoryCacheRef.current.set(item.id, { person: item, relationships: resolvedRelationships })
    const top = options.restore ? (options.scrollY ?? screenScrollRef.current.person ?? 0) : 0
    window.requestAnimationFrame(() => window.scrollTo({ top, left: 0, behavior: 'auto' }))
  }

  async function openPersonById(id: string, options: { restore?: boolean; scrollY?: number } = {}) {
    if (options.restore) {
      const cached = personHistoryCacheRef.current.get(id)
      if (cached) {
        await openPerson(cached.person, { ...options, cachedRelationships: cached.relationships })
        return
      }
    }
    if (!supabase) return

    const { data, error } = await supabase
      .from('people')
      .select('id,full_name,gender,birth_year,is_deceased,death_date,description,status,family_id,created_by,created_at,families(name)')
      .eq('id', id)
      .maybeSingle()

    if (error) return showMessage(friendlyError(error.message), 'error')
    if (data) await openPerson(data as Person, options)
  }
"""
app = replace_once(app, old_family_person, new_family_person, 'fresh detail / cached back behavior')

# User-facing navigation = fresh transition. Back controls = cached transition.
replacements = [
    ("onClick={() => setView('home')}", "onClick={() => navigateFresh('home')}", 'home navigation'),
    ("onClick={() => setView('news')}", "onClick={() => navigateFresh('news')}", 'news navigation'),
    ("onClick={() => setView('tree')}", "onClick={() => navigateFresh('tree')}", 'tree navigation'),
    ("onClick={() => requireAccount() && setView('add')}", "onClick={() => requireAccount() && navigateFresh('add')}", 'add navigation'),
    ("onClick={() => setView('admin')}", "onClick={() => navigateFresh('admin')}", 'admin navigation'),
    ("onClick={() => setView('account')}", "onClick={() => navigateFresh('account')}", 'account navigation'),
]
for old, new, label in replacements:
    app = replace_all_checked(app, old, new, label)

app = replace_all_checked(
    app,
    "onClick={() => { setDirectoryInitialTab('all'); setView('search') }}",
    "onClick={() => navigateFresh('search', { directoryTerm: '', directoryTab: 'all' })}",
    'general directory navigation',
)
app = replace_all_checked(
    app,
    "onClick={() => { setDirectoryInitialTab('families'); setView('search') }}",
    "onClick={() => navigateFresh('search', { directoryTerm: '', directoryTab: 'families' })}",
    'family directory navigation',
)
app = replace_all_checked(
    app,
    "onClick={() => { setDirectoryInitialTab('people'); setView('search') }}",
    "onClick={() => navigateFresh('search', { directoryTerm: '', directoryTab: 'people' })}",
    'people directory navigation',
)

# Mobile account fallback has a compound handler.
app = replace_once(
    app,
    "if (session) setView('account'); else { setView('home'); window.setTimeout(() => document.getElementById('auth-panel')?.scrollIntoView({ behavior: 'smooth' }), 60) }",
    "if (session) navigateFresh('account'); else { navigateFresh('home'); window.setTimeout(() => document.getElementById('auth-panel')?.scrollIntoView({ behavior: 'smooth' }), 60) }",
    'mobile account navigation',
)

# The three heavy screens remain mounted after first visit. A fresh forward entry
# changes the key; a back navigation only reveals the existing instance.
app = replace_once(
    app,
    "        {schemaReady && view === 'news' && (\n          <Suspense",
    "        {schemaReady && (keptScreens.news || view === 'news') && (\n"
    "          <div style={{ display: view === 'news' ? 'contents' : 'none' }}>\n"
    "          <Suspense",
    'news keep-alive start',
)
app = replace_once(
    app,
    "            <NewsScreen\n              onBack={() => setView('home')}\n",
    "            <NewsScreen\n              key={`news-${screenEpochs.news}`}\n              onBack={() => goBackCached('home')}\n",
    'news keep-alive key/back',
)
app = replace_once(
    app,
    "          </Suspense>\n        )}\n\n        {schemaReady && view === 'search' && (",
    "          </Suspense>\n          </div>\n        )}\n\n        {schemaReady && (keptScreens.search || view === 'search') && (\n          <div style={{ display: view === 'search' ? 'contents' : 'none' }}>",
    'news/search keep-alive bridge',
)
app = replace_once(
    app,
    "            <DirectoryScreen\n              initialTerm={searchTerm}\n",
    "            <DirectoryScreen\n              key={`search-${screenEpochs.search}`}\n              initialTerm={directoryLaunchTerm}\n",
    'directory keep-alive key',
)
app = replace_once(
    app,
    "          </Suspense>\n        )}\n\n        {schemaReady && view === 'tree' && (",
    "          </Suspense>\n          </div>\n        )}\n\n        {schemaReady && (keptScreens.tree || view === 'tree') && (\n          <div style={{ display: view === 'tree' ? 'contents' : 'none' }}>",
    'search/tree keep-alive bridge',
)
app = replace_once(
    app,
    "            <FamilyTreeScreen\n              initialPersonId={profile?.linked_person_id || selectedPerson?.id || null}\n",
    "            <FamilyTreeScreen\n              key={`tree-${screenEpochs.tree}`}\n              initialPersonId={treeLaunchPersonId}\n",
    'tree keep-alive key',
)
app = replace_once(
    app,
    "          </Suspense>\n        )}\n\n        {schemaReady && view === 'family' && selectedFamily && (",
    "          </Suspense>\n          </div>\n        )}\n\n        {schemaReady && view === 'family' && selectedFamily && (",
    'tree keep-alive close',
)

app = replace_all_checked(
    app,
    "<button className=\"back-button\" type=\"button\" onClick={() => setView('search')}>→ العودة للدليل</button>",
    "<button className=\"back-button\" type=\"button\" onClick={() => goBackCached('search')}>→ العودة للدليل</button>",
    'detail cached back buttons',
    minimum=2,
)

app_path.write_text(app, encoding='utf-8')


# ---------------------------------------------------------------------------
# DirectoryScreen.tsx: an actual new screen entry bypasses the short TTL cache.
# The mounted instance itself is preserved for back navigation by App.tsx.
# ---------------------------------------------------------------------------
dir_path = Path('src/components/DirectoryScreen.tsx')
dir_src = dir_path.read_text(encoding='utf-8')

dir_src = replace_once(
    dir_src,
    "async function fetchPeoplePage(page: number, queryTerm: string): Promise<PeoplePage> {",
    "async function fetchPeoplePage(page: number, queryTerm: string, forceFresh = false): Promise<PeoplePage> {",
    'people forceFresh signature',
)
dir_src = replace_once(
    dir_src,
    "  const cached = peopleCache.get(key)\n  if (cached && Date.now() - cached.savedAt < CACHE_TTL) return cached",
    "  const cached = peopleCache.get(key)\n  if (!forceFresh && cached && Date.now() - cached.savedAt < CACHE_TTL) return cached",
    'people forceFresh cache check',
)
dir_src = replace_once(
    dir_src,
    "async function fetchHouseholdPage(page: number, queryTerm: string): Promise<HouseholdPage> {",
    "async function fetchHouseholdPage(page: number, queryTerm: string, forceFresh = false): Promise<HouseholdPage> {",
    'household forceFresh signature',
)
dir_src = replace_once(
    dir_src,
    "  const cached = householdCache.get(key)\n  if (cached && Date.now() - cached.savedAt < CACHE_TTL) return cached",
    "  const cached = householdCache.get(key)\n  if (!forceFresh && cached && Date.now() - cached.savedAt < CACHE_TTL) return cached",
    'household forceFresh cache check',
)
dir_src = replace_once(
    dir_src,
    "  const reload = useCallback(async (queryTerm: string) => {\n    if (!supabase) return",
    "  const reload = useCallback(async (queryTerm: string, forceFresh = false) => {\n"
    "    if (!supabase) return\n"
    "    if (forceFresh) {\n"
    "      peopleCache.clear()\n"
    "      householdCache.clear()\n"
    "    }",
    'directory reload forceFresh',
)
dir_src = replace_once(
    dir_src,
    "      const [peopleResult, householdResult] = await Promise.all([fetchPeoplePage(0, queryTerm), fetchHouseholdPage(0, queryTerm)])",
    "      const [peopleResult, householdResult] = await Promise.all([fetchPeoplePage(0, queryTerm, forceFresh), fetchHouseholdPage(0, queryTerm, forceFresh)])",
    'directory fresh fetch calls',
)
dir_src = replace_once(
    dir_src,
    "    void reload(value)\n  }, [initialTerm, reload])",
    "    void reload(value, true)\n  }, [initialTerm, reload])",
    'directory initial fresh reload',
)

dir_path.write_text(dir_src, encoding='utf-8')


# ---------------------------------------------------------------------------
# main.tsx: stop forcing a full page reload on popstate. Emit direction + saved
# scroll position so React can restore the already-rendered screen instead.
# ---------------------------------------------------------------------------
main_path = Path('src/main.tsx')
main = main_path.read_text(encoding='utf-8')

main = replace_once(
    main,
    "type FamilyHistoryState = Record<string, unknown> & {\n  __familyApp?: boolean\n  __familyDepth?: number\n}",
    "type FamilyHistoryState = Record<string, unknown> & {\n"
    "  __familyApp?: boolean\n"
    "  __familyDepth?: number\n"
    "  __familyScrollY?: number\n"
    "}",
    'history scroll state type',
)

main = replace_once(
    main,
    "  const initialState = historyState(window.history.state)\n  if (!initialState.__familyApp) {\n    nativeReplaceState({ ...initialState, __familyApp: true, __familyDepth: 0 }, document.title, window.location.href)\n  }\n\n  window.history.replaceState =",
    "  const initialState = historyState(window.history.state)\n"
    "  if (!initialState.__familyApp) {\n"
    "    nativeReplaceState({ ...initialState, __familyApp: true, __familyDepth: 0, __familyScrollY: window.scrollY }, document.title, window.location.href)\n"
    "  }\n"
    "  let lastKnownDepth = typeof historyState(window.history.state).__familyDepth === 'number'\n"
    "    ? Number(historyState(window.history.state).__familyDepth)\n"
    "    : 0\n\n"
    "  window.history.replaceState =",
    'history depth tracker',
)

old_replace_body = """    const current = historyState(window.history.state)
    const incoming = historyState(state)
    const currentDepth = typeof current.__familyDepth === 'number' ? current.__familyDepth : 0

    if (window.location.hash === url) {
      nativeReplaceState({ ...incoming, __familyApp: true, __familyDepth: currentDepth }, unused, url)
      return
    }

    nativePushState({ ...incoming, __familyApp: true, __familyDepth: currentDepth + 1 }, unused, url)
    scrollAppToTop()
"""
new_replace_body = """    const current = historyState(window.history.state)
    const incoming = historyState(state)
    const currentDepth = typeof current.__familyDepth === 'number' ? current.__familyDepth : 0

    if (window.location.hash === url) {
      nativeReplaceState({ ...current, ...incoming, __familyApp: true, __familyDepth: currentDepth, __familyScrollY: window.scrollY }, unused, url)
      lastKnownDepth = currentDepth
      return
    }

    nativeReplaceState({ ...current, __familyApp: true, __familyDepth: currentDepth, __familyScrollY: window.scrollY }, document.title, window.location.href)
    nativePushState({ ...incoming, __familyApp: true, __familyDepth: currentDepth + 1, __familyScrollY: 0 }, unused, url)
    lastKnownDepth = currentDepth + 1
    scrollAppToTop()
"""
main = replace_once(main, old_replace_body, new_replace_body, 'history push saves previous scroll')

old_pop = """  window.addEventListener('hashchange', scrollAppToTop)

  window.addEventListener('popstate', () => {
    scrollAppToTop()
    if (window.location.hash.startsWith('#/')) window.location.reload()
  })
"""
new_pop = """  window.addEventListener('popstate', () => {
    const state = historyState(window.history.state)
    const nextDepth = typeof state.__familyDepth === 'number' ? state.__familyDepth : lastKnownDepth
    const direction = nextDepth < lastKnownDepth ? 'back' : nextDepth > lastKnownDepth ? 'forward' : 'unknown'
    lastKnownDepth = nextDepth

    if (window.location.hash.startsWith('#/')) {
      window.dispatchEvent(new CustomEvent('sila:history-navigation', {
        detail: {
          direction,
          depth: nextDepth,
          scrollY: typeof state.__familyScrollY === 'number' ? state.__familyScrollY : 0,
        },
      }))
    }
  })
"""
main = replace_once(main, old_pop, new_pop, 'remove popstate reload')

main_path.write_text(main, encoding='utf-8')


# ---------------------------------------------------------------------------
# TopAncestorsScreen.tsx: direct/forward entry refreshes; returning to it by back
# preserves the already-loaded list. Its back button now uses history when safe.
# ---------------------------------------------------------------------------
anc_path = Path('src/components/TopAncestorsScreen.tsx')
anc = anc_path.read_text(encoding='utf-8')

anc = replace_once(
    anc,
    "  useEffect(() => {\n    const sync = () => setActive(isAncestorsScreen())\n    window.addEventListener('popstate', sync)\n    return () => window.removeEventListener('popstate', sync)\n  }, [])",
    "  useEffect(() => {\n"
    "    const sync = () => setActive(isAncestorsScreen())\n"
    "    const syncDirection = (event: Event) => {\n"
    "      const detail = (event as CustomEvent<{ direction?: string }>).detail\n"
    "      if (detail?.direction === 'forward' && isAncestorsScreen()) setLoaded(false)\n"
    "    }\n"
    "    window.addEventListener('popstate', sync)\n"
    "    window.addEventListener('sila:history-navigation', syncDirection as EventListener)\n"
    "    return () => {\n"
    "      window.removeEventListener('popstate', sync)\n"
    "      window.removeEventListener('sila:history-navigation', syncDirection as EventListener)\n"
    "    }\n"
    "  }, [])",
    'ancestor direction handling',
)

anc = replace_once(
    anc,
    "  function openScreen() {\n    const url = new URL(window.location.href)\n    url.searchParams.set('screen', 'ancestors')\n    url.searchParams.delete('ancestorTree')\n    window.history.pushState(window.history.state, '', url.toString())\n    setActive(true)\n  }",
    "  function openScreen() {\n"
    "    const url = new URL(window.location.href)\n"
    "    url.searchParams.set('screen', 'ancestors')\n"
    "    url.searchParams.delete('ancestorTree')\n"
    "    const current = window.history.state && typeof window.history.state === 'object' ? window.history.state : {}\n"
    "    const depth = typeof current.__familyDepth === 'number' ? current.__familyDepth : 0\n"
    "    window.history.pushState({ ...current, __familyApp: true, __familyDepth: depth + 1, __familyScrollY: 0 }, '', url.toString())\n"
    "    setLoaded(false)\n"
    "    setActive(true)\n"
    "  }",
    'ancestor fresh open',
)

anc = replace_once(
    anc,
    "  function closeScreen() {\n    const url = new URL(window.location.href)\n    url.searchParams.delete('screen')\n    window.history.replaceState(window.history.state, '', url.toString())\n    setActive(false)\n  }",
    "  function closeScreen() {\n"
    "    const state = window.history.state && typeof window.history.state === 'object' ? window.history.state : {}\n"
    "    if (typeof state.__familyDepth === 'number' && state.__familyDepth > 0) {\n"
    "      window.history.back()\n"
    "      return\n"
    "    }\n"
    "    const url = new URL(window.location.href)\n"
    "    url.searchParams.delete('screen')\n"
    "    window.history.replaceState(window.history.state, '', url.toString())\n"
    "    setActive(false)\n"
    "  }",
    'ancestor cached back',
)

anc_path.write_text(anc, encoding='utf-8')

print('Applied app-like navigation caching and fresh-forward / cached-back behavior.')
