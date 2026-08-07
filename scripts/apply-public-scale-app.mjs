import fs from 'node:fs'

const path = 'src/App.tsx'
let src = fs.readFileSync(path, 'utf8')

function replaceOnce(from, to, label) {
  if (!src.includes(from)) throw new Error(`Marker not found: ${label}`)
  src = src.replace(from, to)
}

replaceOnce(
  "import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'",
  "import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'",
  'react import',
)

for (const line of [
  "import FamilyMembersPanel from './components/FamilyMembersPanel'\n",
  "import Phase3AdminQueue from './components/Phase3AdminQueue'\n",
  "import KinshipNetwork from './components/KinshipNetwork'\n",
  "import DirectoryScreen from './components/DirectoryScreen'\n",
]) {
  if (!src.includes(line)) throw new Error(`Static import missing: ${line}`)
  src = src.replace(line, '')
}

replaceOnce(
  "import PeoplePicker from './components/PeoplePicker'\n",
  "import PeoplePicker from './components/PeoplePicker'\n\nconst DirectoryScreen = lazy(() => import('./components/DirectoryScreen'))\nconst KinshipNetwork = lazy(() => import('./components/KinshipNetwork'))\nconst FamilyMembersPanel = lazy(() => import('./components/FamilyMembersPanel'))\nconst Phase3AdminQueue = lazy(() => import('./components/Phase3AdminQueue'))\n",
  'lazy component definitions',
)

replaceOnce(
  "type MessageTone = 'info' | 'success' | 'error'\n",
  "type MessageTone = 'info' | 'success' | 'error'\ntype PlatformStats = { approved_families: number; approved_people: number; approved_events: number; updated_at: string }\n",
  'platform stats type',
)

replaceOnce(
  "function App() {",
  "function LazyPanelFallback() {\n  return <div className=\"lazy-panel-skeleton\" aria-label=\"جارٍ تحميل الجزء المطلوب\" />\n}\n\nfunction App() {",
  'lazy fallback',
)

replaceOnce(
  "  const [events, setEvents] = useState<CommunityEvent[]>([])\n",
  "  const [events, setEvents] = useState<CommunityEvent[]>([])\n  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null)\n",
  'stats state',
)

replaceOnce(
  "    const [familyResult, peopleResult, eventResult] = await Promise.all([\n      supabase.from('families').select('id,name,description,origin_place,status,created_by,created_at').order('created_at', { ascending: false }).limit(16),\n      supabase.from('people').select('id,full_name,gender,birth_year,is_deceased,description,status,family_id,created_by,created_at,families(name)').order('created_at', { ascending: false }).limit(12),\n      supabase.from('events').select('id,event_type,title,description,event_date,location_name,status,family_id,created_by,created_at,families(name)').order('event_date', { ascending: false, nullsFirst: false }).limit(30),\n    ])",
  "    const [familyResult, peopleResult, eventResult, statsResult] = await Promise.all([\n      supabase.from('families').select('id,name,description,origin_place,status,created_by,created_at').order('created_at', { ascending: false }).limit(8),\n      supabase.from('people').select('id,full_name,gender,birth_year,is_deceased,description,status,family_id,created_by,created_at,families(name)').order('created_at', { ascending: false }).limit(8),\n      supabase.from('events').select('id,event_type,title,description,event_date,location_name,status,family_id,created_by,created_at,families(name)').order('event_date', { ascending: false, nullsFirst: false }).limit(8),\n      supabase.rpc('get_public_platform_stats'),\n    ])",
  'community queries',
)

replaceOnce(
  "    setEvents((eventResult.data ?? []) as CommunityEvent[])\n    setDataLoading(false)",
  "    setEvents((eventResult.data ?? []) as CommunityEvent[])\n    if (!statsResult.error) {\n      const statsRow = Array.isArray(statsResult.data) ? statsResult.data[0] : null\n      setPlatformStats((statsRow as PlatformStats | undefined) ?? null)\n    } else {\n      setPlatformStats(null)\n    }\n    setDataLoading(false)",
  'stats assignment',
)

src = src.replace(
  '<span className="service-icon">{approvedFamilies.length}</span><span><strong>العائلات</strong>',
  '<span className="service-icon">{platformStats?.approved_families ?? \'—\'}</span><span><strong>العائلات</strong>',
)
src = src.replace(
  '<span className="service-icon">{approvedPeople.length}</span><span><strong>الأفراد</strong>',
  '<span className="service-icon">{platformStats?.approved_people ?? \'—\'}</span><span><strong>الأفراد</strong>',
)
src = src.replace(
  '<article><strong>{approvedFamilies.length}</strong><span>عائلة معتمدة</span></article>',
  '<article><strong>{platformStats?.approved_families ?? \'—\'}</strong><span>عائلة معتمدة</span></article>',
)
src = src.replace(
  '<article><strong>{approvedPeople.length}</strong><span>شخص معتمد</span></article>',
  '<article><strong>{platformStats?.approved_people ?? \'—\'}</strong><span>شخص معتمد</span></article>',
)
src = src.replace(
  '<article><strong>{approvedEvents.length}</strong><span>مناسبة منشورة</span></article>',
  '<article><strong>{platformStats?.approved_events ?? \'—\'}</strong><span>مناسبة منشورة</span></article>',
)
src = src.replace(
  '<article><span>الأفراد الأساسيون</span><strong>{approvedPeople.filter((item) => item.family_id === selectedFamily.id).length}</strong></article>',
  '<article><span>دليل الأفراد</span><strong>تحميل تدريجي</strong></article>',
)

replaceOnce(
  "        {schemaReady && view === 'search' && (\n          <DirectoryScreen\n            initialTerm={searchTerm}\n            onOpenPerson={(item) => void openPerson(item as Person)}\n            onOpenFamily={(item) => openFamily(item as Family)}\n          />\n        )}",
  "        {schemaReady && view === 'search' && (\n          <Suspense fallback={<LazyPanelFallback />}>\n            <DirectoryScreen\n              initialTerm={searchTerm}\n              onOpenPerson={(item) => void openPerson(item as Person)}\n              onOpenFamily={(item) => openFamily(item as Family)}\n            />\n          </Suspense>\n        )}",
  'directory suspense',
)

replaceOnce(
  "            <FamilyMembersPanel familyId={selectedFamily.id} people={approvedPeople} onOpenPerson={(id) => void openPersonById(id)} />",
  "            <Suspense fallback={<LazyPanelFallback />}><FamilyMembersPanel familyId={selectedFamily.id} people={approvedPeople} onOpenPerson={(id) => void openPersonById(id)} /></Suspense>",
  'family members suspense',
)

replaceOnce(
  "        {schemaReady && view === 'admin' && isAdmin && <Phase3AdminQueue active={isAdmin} onChanged={loadCommunityData} />}",
  "        {schemaReady && view === 'admin' && isAdmin && <Suspense fallback={<LazyPanelFallback />}><Phase3AdminQueue active={isAdmin} onChanged={loadCommunityData} /></Suspense>}",
  'admin suspense',
)

const kinshipPattern = /            <KinshipNetwork\n([\s\S]*?)            \/>/
const kinshipMatch = src.match(kinshipPattern)
if (!kinshipMatch) throw new Error('KinshipNetwork usage not found')
src = src.replace(
  kinshipPattern,
  `            <Suspense fallback={<LazyPanelFallback />}>\n              <KinshipNetwork\n${kinshipMatch[1].replace(/^/gm, '  ')}              />\n            </Suspense>`,
)

fs.writeFileSync(path, src)
console.log('Applied public-scale App optimizations')
