import fs from 'node:fs'

const path = 'src/App.tsx'
let source = fs.readFileSync(path, 'utf8')

if (!source.includes('className="desktop-nav"')) {
  const marker = `        <nav>\n          <button onClick={() => setView('home')} className={view === 'home' ? 'active' : ''}>الرئيسية</button>`
  const replacement = `        <nav className="desktop-nav">\n          <button onClick={() => setView('home')} className={view === 'home' ? 'active' : ''}>الرئيسية</button>`
  if (!source.includes(marker)) throw new Error('Desktop nav marker not found')
  source = source.replace(marker, replacement)
}

if (!source.includes('className="mobile-bottom-nav"')) {
  const marker = `      </header>\n\n      {message &&`
  const replacement = `      </header>\n\n      <nav className="mobile-bottom-nav" aria-label="التنقل الرئيسي">\n        <button type="button" onClick={() => setView('home')} className={view === 'home' ? 'active' : ''}><span className="mobile-nav-icon">⌂</span><span>الرئيسية</span></button>\n        <button type="button" onClick={() => setView('search')} className={view === 'search' ? 'active' : ''}><span className="mobile-nav-icon">⌕</span><span>البحث</span></button>\n        <button type="button" onClick={() => requireAccount() && setView('add')} className={view === 'add' ? 'active add-nav-action' : 'add-nav-action'}><span className="mobile-nav-icon">＋</span><span>إضافة</span></button>\n        <button type="button" onClick={() => session ? setView('account') : requireAccount()} className={view === 'account' ? 'active' : ''}><span className="mobile-nav-icon">◉</span><span>حسابي</span></button>\n        {isAdmin && <button type="button" onClick={() => setView('admin')} className={view === 'admin' ? 'active' : ''}><span className="mobile-nav-icon">▦</span><span>الإدارة</span></button>}\n      </nav>\n\n      {message &&`
  if (!source.includes(marker)) throw new Error('Header closing marker not found')
  source = source.replace(marker, replacement)
}

fs.writeFileSync(path, source)
