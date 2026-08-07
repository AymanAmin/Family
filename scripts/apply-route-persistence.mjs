import fs from 'node:fs'

const path = 'src/App.tsx'
let src = fs.readFileSync(path, 'utf8')

function replaceOnce(from, to, label) {
  if (!src.includes(from)) throw new Error(`Marker not found: ${label}`)
  src = src.replace(from, to)
}

replaceOnce(
  "  const [view, setView] = useState<View>('home')\n",
  "  const [view, setView] = useState<View>('home')\n  const [routeReady, setRouteReady] = useState(false)\n",
  'routeReady state',
)

const routeEffects = [
  "  useEffect(() => {",
  "    if (routeReady || dataLoading || sessionLoading || !schemaReady) return",
  "    let cancelled = false",
  "",
  "    async function restoreRoute() {",
  "      const rawHash = window.location.hash",
  "      if (rawHash.startsWith('#access_token=') || rawHash.startsWith('#error=')) {",
  "        if (!cancelled) setRouteReady(true)",
  "        return",
  "      }",
  "",
  "      const route = decodeURIComponent(rawHash.replace(/^#\\/?/, ''))",
  "      const [target, id] = route.split('/')",
  "",
  "      if (target === 'person' && id) {",
  "        await openPersonById(id)",
  "      } else if (target === 'family' && id) {",
  "        await openFamilyById(id)",
  "      } else if (target === 'search' || target === 'add' || target === 'admin' || target === 'account') {",
  "        setView(target as View)",
  "      } else {",
  "        setView('home')",
  "      }",
  "",
  "      if (!cancelled) setRouteReady(true)",
  "    }",
  "",
  "    void restoreRoute()",
  "    return () => { cancelled = true }",
  "  }, [routeReady, dataLoading, sessionLoading, schemaReady])",
  "",
  "  useEffect(() => {",
  "    if (!routeReady) return",
  "",
  "    let route: string = view",
  "    if (view === 'person' && selectedPerson?.id) route = `person/${selectedPerson.id}`",
  "    if (view === 'family' && selectedFamily?.id) route = `family/${selectedFamily.id}`",
  "",
  "    const nextHash = `#/${route}`",
  "    if (window.location.hash !== nextHash) {",
  "      window.history.replaceState(null, '', nextHash)",
  "    }",
  "  }, [routeReady, view, selectedPerson?.id, selectedFamily?.id])",
  "",
].join('\n') + '\n'

replaceOnce(
  "  }, [session, profile?.linked_person_id])\n\n  const visibleFamilies",
  "  }, [session, profile?.linked_person_id])\n\n" + routeEffects + "  const visibleFamilies",
  'route effects insertion',
)

const oldOpenFamily = [
  "  function openFamily(item: Family) {",
  "    setSelectedFamily(item)",
  "    setView('family')",
  "    window.scrollTo({ top: 0, behavior: 'smooth' })",
  "  }",
  "",
].join('\n')

const newOpenFamily = oldOpenFamily + [
  "  async function openFamilyById(id: string) {",
  "    const cached = families.find((item) => item.id === id)",
  "    if (cached) {",
  "      openFamily(cached)",
  "      return",
  "    }",
  "    if (!supabase) return",
  "",
  "    const { data, error } = await supabase",
  "      .from('families')",
  "      .select('id,name,description,origin_place,status,created_by,created_at')",
  "      .eq('id', id)",
  "      .maybeSingle()",
  "",
  "    if (error) return showMessage(friendlyError(error.message), 'error')",
  "    if (data) openFamily(data as Family)",
  "  }",
  "",
].join('\n')

replaceOnce(oldOpenFamily, newOpenFamily, 'openFamilyById')

fs.writeFileSync(path, src)
console.log('Applied persistent hash routing to App.tsx')
