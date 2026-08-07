import fs from 'node:fs'

const appPath = 'src/App.tsx'
const cssPath = 'src/home-news-preview.css'
const swPath = 'public/sw.js'

let app = fs.readFileSync(appPath, 'utf8')

if (!app.includes('home-search-hero')) {
  const dashboardPattern = /            <section className="nasab-dashboard">[\s\S]*?            <\/section>\n\n            <section className="section-block soft">/
  const dashboardReplacement = `            <section className="hero-panel home-search-hero" aria-label="البحث في دليل المنطقة">
              <div className="hero-copy">
                <form className="search-bar home-search-bar" onSubmit={runSearch}>
                  <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="ابحث باسم شخص أو عائلة" aria-label="ابحث باسم شخص أو عائلة" />
                  <button className="primary" type="submit">بحث</button>
                </form>
              </div>
            </section>

            <section className="nasab-dashboard">
              <div className="app-services unified-home-stats" aria-label="اختصارات وإحصائيات المنصة">
                <button className="service-tile stat-service-tile" type="button" onClick={() => setView('search')}><span className="service-icon">{platformStats?.approved_families ?? '—'}</span><span><strong>العائلات</strong><small>الأسر المعتمدة في الدليل</small></span></button>
                <button className="service-tile stat-service-tile" type="button" onClick={() => setView('search')}><span className="service-icon">{platformStats?.approved_people ?? '—'}</span><span><strong>الأفراد</strong><small>ملفات الأشخاص الموثقة</small></span></button>
                <button className="service-tile stat-service-tile" type="button" onClick={() => setView('news')}><span className="service-icon">{platformStats?.approved_events ?? '—'}</span><span><strong>المناسبات</strong><small>الأخبار والمناسبات المنشورة</small></span></button>
                <button className="service-tile" type="button" onClick={() => setView('tree')}><span className="service-icon">ش</span><span><strong>شجرة العائلة</strong><small>استكشف القرابة ومسارات النسب</small></span></button>
                {isAdmin && <button className="service-tile stat-service-tile" type="button" onClick={() => setView('admin')}><span className="service-icon">{pending.length}</span><span><strong>بانتظار الاعتماد</strong><small>الطلبات التي تحتاج مراجعة</small></span></button>}
                <button className="service-tile" type="button" onClick={() => session ? setView('account') : document.getElementById('auth-panel')?.scrollIntoView({ behavior: 'smooth' })}><span className="service-icon">{session ? userName[0] : 'د'}</span><span><strong>{session ? 'حسابي' : 'الدخول'}</strong><small>{session ? 'الربط والملف الشخصي' : 'ساهم في توثيق العائلة'}</small></span></button>
              </div>

              <article className="family-welcome-card compact-family-welcome">
                <span className="eyebrow">صلة — البيت الرقمي للعائلة</span>
                <h2>{session ? \`مرحبًا \${userName}، أهلك أقرب إليك.\` : 'عائلتك، تاريخها، وأخبارها في مكان واحد.'}</h2>
                <p>استعرض الأسر والأفراد، وثّق صلات القرابة، وتابع المناسبات من واجهة واحدة مصممة لكل الأجيال.</p>
              </article>
            </section>

            <section className="section-block soft">`

  if (!dashboardPattern.test(app)) {
    throw new Error('Could not locate the current home dashboard block.')
  }
  app = app.replace(dashboardPattern, dashboardReplacement)

  const oldHeroPattern = /\n            <section className="hero-panel">[\s\S]*?            <\/section>\n\n            <section className="section-block">/
  if (!oldHeroPattern.test(app)) {
    throw new Error('Could not locate the old home hero/search block.')
  }
  app = app.replace(oldHeroPattern, '\n            <section className="section-block">')

  fs.writeFileSync(appPath, app)
}

let css = fs.readFileSync(cssPath, 'utf8')
const marker = '/* Home top search + unified non-duplicated stats */'
if (!css.includes(marker)) {
  css += `\n\n${marker}\n.home-search-hero {\n  display: block;\n  padding: 20px 18px 8px;\n}\n\n.home-search-hero .hero-copy {\n  width: min(100%, 920px);\n  margin-inline: auto;\n  padding: 0;\n}\n\n.home-search-hero .home-search-bar {\n  max-width: none;\n  margin: 0;\n  border-color: rgb(61 111 139 / 16%);\n  box-shadow: 0 10px 32px rgb(35 74 120 / 8%);\n}\n\n.unified-home-stats {\n  display: grid;\n  grid-auto-columns: minmax(165px, 1fr);\n  grid-auto-flow: column;\n  grid-template-columns: none;\n  gap: 11px;\n  overflow-x: auto;\n  padding: 2px 2px 10px;\n  scroll-padding-inline: 2px;\n  scroll-snap-type: inline mandatory;\n  scrollbar-width: none;\n}\n\n.unified-home-stats::-webkit-scrollbar {\n  display: none;\n}\n\n.unified-home-stats .service-tile {\n  min-width: 165px;\n  scroll-snap-align: start;\n}\n\n.unified-home-stats .stat-service-tile .service-icon {\n  font-variant-numeric: tabular-nums;\n}\n\n.compact-family-welcome {\n  min-height: 170px;\n}\n\n@media (max-width: 760px) {\n  .home-search-hero {\n    display: block !important;\n    padding: 9px 13px 5px !important;\n  }\n\n  .home-search-hero .hero-copy {\n    padding: 0 !important;\n  }\n\n  .home-search-hero .home-search-bar,\n  .home-search-hero .search-bar {\n    margin: 0 !important;\n  }\n\n  .home-search-hero .home-search-bar input {\n    min-width: 0;\n  }\n\n  .nasab-dashboard {\n    padding-top: 6px !important;\n  }\n\n  .unified-home-stats {\n    grid-auto-columns: minmax(112px, 36vw) !important;\n    gap: 9px !important;\n    margin-inline: 0;\n    padding: 2px 0 8px !important;\n  }\n\n  .unified-home-stats .service-tile {\n    min-width: 112px !important;\n  }\n\n  .compact-family-welcome {\n    min-height: 150px;\n    padding: 20px 18px;\n  }\n}\n`
  fs.writeFileSync(cssPath, css)
}

if (fs.existsSync(swPath)) {
  let sw = fs.readFileSync(swPath, 'utf8')
  if (sw.includes("const CACHE_VERSION = 'sila-region-v7'")) {
    sw = sw.replace("const CACHE_VERSION = 'sila-region-v7'", "const CACHE_VERSION = 'sila-region-v8'")
    fs.writeFileSync(swPath, sw)
  }
}
