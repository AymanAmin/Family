import fs from 'node:fs'

function patchFile(path, patches) {
  let source = fs.readFileSync(path, 'utf8')
  for (const { from, to, label } of patches) {
    if (to && source.includes(to)) continue
    if (!source.includes(from)) throw new Error(`Could not find ${label} in ${path}.`)
    source = source.replace(from, to)
  }
  fs.writeFileSync(path, source)
}

patchFile('src/components/FamilyTreeScreen.tsx', [
  {
    label: 'React hooks import',
    from: "import { useEffect, useMemo, useState } from 'react'",
    to: "import { useEffect, useMemo, useRef, useState } from 'react'",
  },
  {
    label: 'path cache constants',
    from: "type Mode = 'tree' | 'path'\n",
    to: `type Mode = 'tree' | 'path'\n\nconst PATH_MAX_DEPTH = 6\nconst PATH_CACHE_TTL = 5 * 60_000\nconst pathResultCache = new Map<string, { savedAt: number; rows: PathRow[] }>()\n\nfunction pathCacheKey(fromId: string, toId: string) {\n  return \`${'${fromId}'}>${'${toId}'}>${'${PATH_MAX_DEPTH}'}\`\n}\n`,
  },
  {
    label: 'path request ref',
    from: "  const [pathLoading, setPathLoading] = useState(false)\n  const [pathMessage, setPathMessage] = useState('')\n",
    to: "  const [pathLoading, setPathLoading] = useState(false)\n  const [pathMessage, setPathMessage] = useState('')\n  const pathRequestRef = useRef(0)\n",
  },
  {
    label: 'path request cleanup',
    from: `  useEffect(() => {\n    if (!initialPersonId) return\n    setFocusId((current) => current || initialPersonId)\n    setFromId((current) => current || initialPersonId)\n  }, [initialPersonId])\n`,
    to: `  useEffect(() => {\n    if (!initialPersonId) return\n    setFocusId((current) => current || initialPersonId)\n    setFromId((current) => current || initialPersonId)\n  }, [initialPersonId])\n\n  useEffect(() => () => {\n    pathRequestRef.current += 1\n  }, [])\n`,
  },
  {
    label: 'discoverPath function',
    from: `  async function discoverPath() {\n    if (!supabase || !fromId || !toId) {\n      setPathMessage('اختر شخصين أولًا.')\n      return\n    }\n    if (fromId === toId) {\n      setPathMessage('اختر شخصين مختلفين.')\n      return\n    }\n\n    setPathLoading(true)\n    setPath([])\n    setPathMessage('')\n    const { data, error } = await supabase.rpc('get_kinship_path', {\n      p_from_person_id: fromId,\n      p_to_person_id: toId,\n      p_max_depth: 6,\n    })\n    setPathLoading(false)\n\n    if (error) {\n      const unavailable = error.message.toLowerCase().includes('does not exist') || error.message.toLowerCase().includes('schema cache')\n      setPathMessage(unavailable ? 'فعّل migration مسار القرابة في Supabase لاستخدام هذه الأداة.' : 'تعذر حساب مسار القرابة الآن.')\n      return\n    }\n\n    const rows = (data ?? []) as PathRow[]\n    setPath(rows)\n    setPathMessage(rows.length ? '' : 'لم نجد مسار قرابة موثقًا بين الشخصين ضمن ست درجات.')\n  }`,
    to: `  async function discoverPath() {\n    if (!supabase || !fromId || !toId) {\n      setPathMessage('اختر شخصين أولًا.')\n      return\n    }\n    if (fromId === toId) {\n      setPathMessage('اختر شخصين مختلفين.')\n      return\n    }\n\n    const cacheKey = pathCacheKey(fromId, toId)\n    const cached = pathResultCache.get(cacheKey)\n    if (cached && Date.now() - cached.savedAt < PATH_CACHE_TTL) {\n      setPath(cached.rows)\n      setPathMessage(cached.rows.length ? '' : 'لم نجد مسار قرابة موثقًا بين الشخصين ضمن ست درجات.')\n      return\n    }\n\n    const requestId = ++pathRequestRef.current\n    setPathLoading(true)\n    setPathMessage('')\n\n    const { data, error } = await supabase.rpc('get_kinship_path', {\n      p_from_person_id: fromId,\n      p_to_person_id: toId,\n      p_max_depth: PATH_MAX_DEPTH,\n    })\n\n    if (requestId !== pathRequestRef.current) return\n    setPathLoading(false)\n\n    if (error) {\n      const lowered = error.message.toLowerCase()\n      const unavailable = lowered.includes('does not exist') || lowered.includes('schema cache')\n      const timedOut = lowered.includes('statement timeout') || lowered.includes('57014') || lowered.includes('canceling statement')\n      setPathMessage(\n        unavailable\n          ? 'خدمة مسار القرابة غير متاحة حاليًا.'\n          : timedOut\n            ? 'استغرق التحليل وقتًا أطول من المتوقع. أعد المحاولة بعد لحظة.'\n            : 'تعذر حساب مسار القرابة الآن. أعد المحاولة.',\n      )\n      return\n    }\n\n    const rows = (data ?? []) as PathRow[]\n    pathResultCache.set(cacheKey, { savedAt: Date.now(), rows })\n    setPath(rows)\n    setPathMessage(rows.length ? '' : 'لم نجد مسار قرابة موثقًا بين الشخصين ضمن ست درجات.')\n  }`,
  },
  {
    label: 'from picker stale request cancellation',
    from: `<PeoplePicker searchMode="broad" label="من" value={fromId} onChange={(id) => { setFromId(id); setPath([]); setPathMessage('') }} excludeId={toId || undefined} required />`,
    to: `<PeoplePicker searchMode="broad" label="من" value={fromId} onChange={(id) => { pathRequestRef.current += 1; setPathLoading(false); setFromId(id); setPath([]); setPathMessage('') }} excludeId={toId || undefined} required />`,
  },
  {
    label: 'to picker stale request cancellation',
    from: `<PeoplePicker searchMode="broad" label="إلى" value={toId} onChange={(id) => { setToId(id); setPath([]); setPathMessage('') }} excludeId={fromId || undefined} required />`,
    to: `<PeoplePicker searchMode="broad" label="إلى" value={toId} onChange={(id) => { pathRequestRef.current += 1; setPathLoading(false); setToId(id); setPath([]); setPathMessage('') }} excludeId={fromId || undefined} required />`,
  },
])

patchFile('src/App.tsx', [
  {
    label: 'lazy moderation feed loading',
    from: `  useEffect(() => {\n    void loadPending()\n  }, [loadPending])`,
    to: `  useEffect(() => {\n    if (!routeReady || (view !== 'home' && view !== 'admin')) return\n    void loadPending()\n  }, [routeReady, view, loadPending])`,
  },
])

const setupPath = 'supabase/SETUP.sql'
let setup = fs.readFileSync(setupPath, 'utf8')
const marker = '-- INCLUDED MIGRATION: 20260808125913_optimize_kinship_path_bfs.sql'
if (!setup.includes(marker)) {
  const migration = fs.readFileSync('supabase/migrations/20260808125913_optimize_kinship_path_bfs.sql', 'utf8')
  setup = `${setup.trimEnd()}\n\n${marker}\n${migration}\n`
  fs.writeFileSync(setupPath, setup)
}

console.log('Kinship path UI caching, stale-request protection, lazy moderation loading, and setup migration integration applied.')
