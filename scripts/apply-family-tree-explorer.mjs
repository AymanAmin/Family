import fs from 'node:fs'

const path = 'src/App.tsx'
let source = fs.readFileSync(path, 'utf8')

function replaceOnce(before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing marker: ${label}`)
  source = source.replace(before, after)
}

replaceOnce(
  "const DuplicatePersonCheck = lazy(() => import('./components/DuplicatePersonCheck'))\n",
  "const DuplicatePersonCheck = lazy(() => import('./components/DuplicatePersonCheck'))\nconst FamilyTreeScreen = lazy(() => import('./components/FamilyTreeScreen'))\n",
  'lazy tree component',
)

replaceOnce(
  "type View = 'home' | 'search' | 'add' | 'admin' | 'person' | 'family' | 'account'",
  "type View = 'home' | 'search' | 'tree' | 'add' | 'admin' | 'person' | 'family' | 'account'",
  'view type',
)

replaceOnce(
  "} else if (target === 'search' || target === 'add' || target === 'admin' || target === 'account') {",
  "} else if (target === 'search' || target === 'tree' || target === 'add' || target === 'admin' || target === 'account') {",
  'route restore',
)

replaceOnce(
  "          <button onClick={() => setView('search')} className={view === 'search' ? 'active' : ''}>البحث</button>\n          <button onClick={() => requireAccount() && setView('add')} className={view === 'add' ? 'active' : ''}>إضافة</button>",
  "          <button onClick={() => setView('search')} className={view === 'search' ? 'active' : ''}>البحث</button>\n          <button onClick={() => setView('tree')} className={view === 'tree' ? 'active' : ''}>شجرة العائلة</button>\n          <button onClick={() => requireAccount() && setView('add')} className={view === 'add' ? 'active' : ''}>إضافة</button>",
  'desktop tree nav',
)

const oldMobileNav = `      <nav className="mobile-bottom-nav" aria-label="التنقل الرئيسي">
        <button type="button" onClick={() => setView('home')} className={view === 'home' ? 'active' : ''}><span className="mobile-nav-icon">⌂</span><span>الرئيسية</span></button>
        <button type="button" onClick={() => setView('search')} className={view === 'search' ? 'active' : ''}><span className="mobile-nav-icon">⌕</span><span>البحث</span></button>
        <button type="button" onClick={() => requireAccount() && setView('add')} className={view === 'add' ? 'active add-nav-action' : 'add-nav-action'}><span className="mobile-nav-icon">＋</span><span>إضافة</span></button>
        {isAdmin && <button type="button" onClick={() => setView('admin')} className={view === 'admin' ? 'active' : ''}><span className="mobile-nav-icon">▦</span><span>الإدارة</span></button>}
      </nav>`

const newMobileNav = `      <nav className="mobile-bottom-nav" aria-label="التنقل الرئيسي">
        <button type="button" onClick={() => setView('home')} className={view === 'home' ? 'active' : ''}><span className="mobile-nav-icon">⌂</span><span>الرئيسية</span></button>
        <button type="button" onClick={() => setView('search')} className={view === 'search' ? 'active' : ''}><span className="mobile-nav-icon">⌕</span><span>الدليل</span></button>
        <button type="button" onClick={() => requireAccount() && setView('add')} className={view === 'add' ? 'active add-nav-action' : 'add-nav-action'}><span className="mobile-nav-icon">＋</span><span>إضافة</span></button>
        <button type="button" onClick={() => setView('tree')} className={view === 'tree' ? 'active' : ''}><span className="mobile-nav-icon">⌘</span><span>الشجرة</span></button>
        {isAdmin ? <button type="button" onClick={() => setView('admin')} className={view === 'admin' ? 'active' : ''}><span className="mobile-nav-icon">▦</span><span>الإدارة</span></button> : <button type="button" onClick={() => { if (session) setView('account'); else { setView('home'); window.setTimeout(() => document.getElementById('auth-panel')?.scrollIntoView({ behavior: 'smooth' }), 60) } }} className={view === 'account' ? 'active' : ''}><span className="mobile-nav-icon">◉</span><span>{session ? 'حسابي' : 'دخول'}</span></button>}
      </nav>`
replaceOnce(oldMobileNav, newMobileNav, 'mobile bottom nav')

replaceOnce(
  "<button className=\"service-tile\" type=\"button\" onClick={() => requireAccount() && (setAddMode('relationship'), setView('add'))}><span className=\"service-icon\">ش</span><span><strong>شجرة العائلة</strong><small>أضف صلات القرابة وابنِ النسب</small></span></button>",
  "<button className=\"service-tile\" type=\"button\" onClick={() => setView('tree')}><span className=\"service-icon\">ش</span><span><strong>شجرة العائلة</strong><small>استكشف القرابة ومسارات النسب</small></span></button>",
  'home tree service',
)

replaceOnce(
  "<div className=\"home-section-heading\"><h2>شجرة العائلة</h2><button type=\"button\" onClick={() => requireAccount() && (setAddMode('relationship'), setView('add'))}>إضافة صلة</button></div>",
  "<div className=\"home-section-heading\"><h2>شجرة العائلة</h2><button type=\"button\" onClick={() => setView('tree')}>فتح الشجرة</button></div>",
  'home tree preview',
)

const familyMarker = `        {schemaReady && view === 'family' && selectedFamily && (`
const treeRender = `        {schemaReady && view === 'tree' && (
          <Suspense fallback={<LazyPanelFallback />}>
            <FamilyTreeScreen
              initialPersonId={profile?.linked_person_id || selectedPerson?.id || null}
              onOpenPerson={(id) => void openPersonById(id)}
              onAddRelation={(id) => {
                if (!requireAccount()) return
                if (id) setRelationshipForm((current) => ({ ...current, source_person_id: id }))
                setAddMode('relationship')
                setView('add')
              }}
            />
          </Suspense>
        )}

`
if (!source.includes(familyMarker)) throw new Error('Missing marker: family render')
source = source.replace(familyMarker, treeRender + familyMarker)

fs.writeFileSync(path, source)
console.log('Family tree explorer integrated into App.tsx')
