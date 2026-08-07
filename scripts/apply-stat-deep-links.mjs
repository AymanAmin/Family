import fs from 'node:fs'

const appPath = 'src/App.tsx'
const directoryPath = 'src/components/DirectoryScreen.tsx'

let app = fs.readFileSync(appPath, 'utf8')
let directory = fs.readFileSync(directoryPath, 'utf8')

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source
  if (!source.includes(from)) throw new Error(`Could not locate ${label}`)
  return source.replace(from, to)
}

app = replaceRequired(
  app,
  "  const [searchTerm, setSearchTerm] = useState('')\n",
  "  const [searchTerm, setSearchTerm] = useState('')\n  const [directoryInitialTab, setDirectoryInitialTab] = useState<'all' | 'people' | 'families'>('all')\n",
  'directory tab state',
)

app = replaceRequired(
  app,
  "  async function runSearch(event?: FormEvent<HTMLFormElement>) {\n    event?.preventDefault()\n    if (!schemaReady) return\n    setView('search')\n  }",
  "  async function runSearch(event?: FormEvent<HTMLFormElement>) {\n    event?.preventDefault()\n    if (!schemaReady) return\n    setDirectoryInitialTab('all')\n    setView('search')\n  }",
  'runSearch',
)

app = replaceRequired(
  app,
  "<button onClick={() => setView('search')} className={view === 'search' ? 'active' : ''}>البحث</button>",
  "<button onClick={() => { setDirectoryInitialTab('all'); setView('search') }} className={view === 'search' ? 'active' : ''}>البحث</button>",
  'desktop search navigation',
)

app = replaceRequired(
  app,
  "<button type=\"button\" onClick={() => setView('search')} className={view === 'search' ? 'active' : ''}><span className=\"mobile-nav-icon\">⌕</span><span>الدليل</span></button>",
  "<button type=\"button\" onClick={() => { setDirectoryInitialTab('all'); setView('search') }} className={view === 'search' ? 'active' : ''}><span className=\"mobile-nav-icon\">⌕</span><span>الدليل</span></button>",
  'mobile directory navigation',
)

app = replaceRequired(
  app,
  "<button className=\"service-tile stat-service-tile\" type=\"button\" onClick={() => setView('search')}><span className=\"service-icon\">{platformStats?.approved_families ?? '—'}</span><span><strong>العائلات</strong><small>الأسر المعتمدة في الدليل</small></span></button>",
  "<button className=\"service-tile stat-service-tile\" type=\"button\" onClick={() => { setDirectoryInitialTab('families'); setView('search') }}><span className=\"service-icon\">{platformStats?.approved_families ?? '—'}</span><span><strong>العائلات</strong><small>الأسر المعتمدة في الدليل</small></span></button>",
  'families stat target',
)

app = replaceRequired(
  app,
  "<button className=\"service-tile stat-service-tile\" type=\"button\" onClick={() => setView('search')}><span className=\"service-icon\">{platformStats?.approved_people ?? '—'}</span><span><strong>الأفراد</strong><small>ملفات الأشخاص الموثقة</small></span></button>",
  "<button className=\"service-tile stat-service-tile\" type=\"button\" onClick={() => { setDirectoryInitialTab('people'); setView('search') }}><span className=\"service-icon\">{platformStats?.approved_people ?? '—'}</span><span><strong>الأفراد</strong><small>ملفات الأشخاص الموثقة</small></span></button>",
  'people stat target',
)

app = replaceRequired(
  app,
  "{isAdmin && <button className=\"service-tile stat-service-tile\" type=\"button\" onClick={() => setView('admin')}><span className=\"service-icon\">{pending.length}</span><span><strong>بانتظار الاعتماد</strong><small>الطلبات التي تحتاج مراجعة</small></span></button>}",
  "{isAdmin && <button className=\"service-tile stat-service-tile\" type=\"button\" onClick={() => { setAdminTab('requests'); setView('admin') }}><span className=\"service-icon\">{pending.length}</span><span><strong>بانتظار الاعتماد</strong><small>الطلبات التي تحتاج مراجعة</small></span></button>}",
  'pending stat target',
)

app = replaceRequired(
  app,
  "              initialTerm={searchTerm}\n              onOpenPerson=",
  "              initialTerm={searchTerm}\n              initialTab={directoryInitialTab}\n              onOpenPerson=",
  'DirectoryScreen initial tab prop',
)

app = replaceRequired(
  app,
  "<button className=\"text-link\" onClick={() => setView('search')}>عرض الكل</button>",
  "<button className=\"text-link\" onClick={() => { setDirectoryInitialTab('families'); setView('search') }}>عرض الكل</button>",
  'families show-all target',
)

app = replaceRequired(
  app,
  "<button className=\"primary\" type=\"button\" onClick={() => setView('search')}>البحث عن سجلي</button>",
  "<button className=\"primary\" type=\"button\" onClick={() => { setDirectoryInitialTab('people'); setView('search') }}>البحث عن سجلي</button>",
  'account person search target',
)

directory = replaceRequired(
  directory,
  "type Props = {\n  initialTerm?: string\n  onOpenPerson: (person: DirectoryPerson) => void",
  "type Props = {\n  initialTerm?: string\n  initialTab?: 'all' | 'people' | 'families'\n  onOpenPerson: (person: DirectoryPerson) => void",
  'DirectoryScreen Props initialTab',
)

directory = replaceRequired(
  directory,
  "export default function DirectoryScreen({ initialTerm = '', onOpenPerson, onOpenFamily }: Props) {\n  const [term, setTerm] = useState(initialTerm)\n  const [submittedTerm, setSubmittedTerm] = useState(initialTerm.trim())\n  const [tab, setTab] = useState<Tab>('all')",
  "export default function DirectoryScreen({ initialTerm = '', initialTab = 'all', onOpenPerson, onOpenFamily }: Props) {\n  const [term, setTerm] = useState(initialTerm)\n  const [submittedTerm, setSubmittedTerm] = useState(initialTerm.trim())\n  const [tab, setTab] = useState<Tab>(initialTab)",
  'DirectoryScreen initialTab state',
)

directory = replaceRequired(
  directory,
  "  useEffect(() => {\n    const value = initialTerm.trim()\n    setTerm(initialTerm); setSubmittedTerm(value); void reload(value)\n  }, [initialTerm, reload])\n\n  useEffect(() => () => { if (debounceRef.current) window.clearTimeout(debounceRef.current) }, [])",
  "  useEffect(() => {\n    const value = initialTerm.trim()\n    setTerm(initialTerm); setSubmittedTerm(value); void reload(value)\n  }, [initialTerm, reload])\n\n  useEffect(() => {\n    setTab(initialTab)\n  }, [initialTab])\n\n  useEffect(() => () => { if (debounceRef.current) window.clearTimeout(debounceRef.current) }, [])",
  'DirectoryScreen initialTab sync',
)

fs.writeFileSync(appPath, app)
fs.writeFileSync(directoryPath, directory)
