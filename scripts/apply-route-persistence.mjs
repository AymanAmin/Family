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

const routeEffects = `  useEffect(() => {\n    if (routeReady || dataLoading || sessionLoading || !schemaReady) return\n    let cancelled = false\n\n    async function restoreRoute() {\n      const rawHash = window.location.hash\n      if (rawHash.startsWith('#access_token=') || rawHash.startsWith('#error=')) {\n        if (!cancelled) setRouteReady(true)\n        return\n      }\n\n      const route = decodeURIComponent(rawHash.replace(/^#\\/?/, ''))\n      const [target, id] = route.split('/')\n\n      if (target === 'person' && id) {\n        await openPersonById(id)\n      } else if (target === 'family' && id) {\n        await openFamilyById(id)\n      } else if (target === 'search' || target === 'add' || target === 'admin' || target === 'account') {\n        setView(target as View)\n      } else {\n        setView('home')\n      }\n\n      if (!cancelled) setRouteReady(true)\n    }\n\n    void restoreRoute()\n    return () => { cancelled = true }\n  }, [routeReady, dataLoading, sessionLoading, schemaReady])\n\n  useEffect(() => {\n    if (!routeReady) return\n\n    let route = view\n    if (view === 'person' && selectedPerson?.id) route = \\`person/\\${selectedPerson.id}\\` as View\n    if (view === 'family' && selectedFamily?.id) route = \\`family/\\${selectedFamily.id}\\` as View\n\n    const nextHash = \\`#/\\${route}\\`\n    if (window.location.hash !== nextHash) {\n      window.history.replaceState(null, '', nextHash)\n    }\n  }, [routeReady, view, selectedPerson?.id, selectedFamily?.id])\n\n`

replaceOnce(
  "  }, [session, profile?.linked_person_id])\n\n  const visibleFamilies",
  "  }, [session, profile?.linked_person_id])\n\n" + routeEffects + "  const visibleFamilies",
  'route effects insertion',
)

const oldOpenFamily = `  function openFamily(item: Family) {\n    setSelectedFamily(item)\n    setView('family')\n    window.scrollTo({ top: 0, behavior: 'smooth' })\n  }\n\n`

const newOpenFamily = oldOpenFamily + `  async function openFamilyById(id: string) {\n    const cached = families.find((item) => item.id === id)\n    if (cached) {\n      openFamily(cached)\n      return\n    }\n    if (!supabase) return\n\n    const { data, error } = await supabase\n      .from('families')\n      .select('id,name,description,origin_place,status,created_by,created_at')\n      .eq('id', id)\n      .maybeSingle()\n\n    if (error) return showMessage(friendlyError(error.message), 'error')\n    if (data) openFamily(data as Family)\n  }\n\n`

replaceOnce(oldOpenFamily, newOpenFamily, 'openFamilyById')

fs.writeFileSync(path, src)
console.log('Applied persistent hash routing to App.tsx')
