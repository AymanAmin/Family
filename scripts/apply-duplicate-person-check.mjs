import fs from 'node:fs'

const path = 'src/App.tsx'
let src = fs.readFileSync(path, 'utf8')

function replaceOnce(from, to, label) {
  if (!src.includes(from)) throw new Error(`Marker not found: ${label}`)
  src = src.replace(from, to)
}

replaceOnce(
  "const Phase3AdminQueue = lazy(() => import('./components/Phase3AdminQueue'))\n",
  "const Phase3AdminQueue = lazy(() => import('./components/Phase3AdminQueue'))\nconst DuplicatePersonCheck = lazy(() => import('./components/DuplicatePersonCheck'))\n",
  'lazy duplicate component',
)

const oldForm = `{addMode === 'person' && <form className="data-form" onSubmit={submitPerson}><label><span>الاسم الكامل *</span><input value={personForm.full_name} onChange={(e) => setPersonForm({ ...personForm, full_name: e.target.value })} required /></label><label><span>العائلة</span><select value={personForm.family_id} onChange={(e) => setPersonForm({ ...personForm, family_id: e.target.value })}><option value="">غير محددة</option>{visibleFamilies.map((item) => <option key={item.id} value={item.id}>{item.name}{item.status === 'pending' ? ' (معلقة)' : ''}</option>)}</select></label><label><span>الجنس</span><select value={personForm.gender} onChange={(e) => setPersonForm({ ...personForm, gender: e.target.value })}><option value="">غير محدد</option><option value="male">ذكر</option><option value="female">أنثى</option></select></label><label><span>سنة الميلاد</span><input type="number" min="1800" max="2100" value={personForm.birth_year} onChange={(e) => setPersonForm({ ...personForm, birth_year: e.target.value })} /></label><label className="full"><span>وصف أو نبذة</span><textarea value={personForm.description} onChange={(e) => setPersonForm({ ...personForm, description: e.target.value })} rows={5} /></label><button className="primary full" disabled={busy}>إرسال للمراجعة</button></form>}`

const newForm = `{addMode === 'person' && <form className="data-form person-create-form" onSubmit={submitPerson}>
              <label className="full"><span>الاسم الكامل *</span><input value={personForm.full_name} onChange={(e) => setPersonForm({ ...personForm, full_name: e.target.value })} autoComplete="off" enterKeyHint="next" required /></label>
              <Suspense fallback={<div className="duplicate-person-hint"><span>⌕</span><p>يتم تجهيز فحص الأسماء المشابهة…</p></div>}>
                <DuplicatePersonCheck name={personForm.full_name} onOpenPerson={(id) => void openPersonById(id)} />
              </Suspense>
              <label><span>العائلة</span><select value={personForm.family_id} onChange={(e) => setPersonForm({ ...personForm, family_id: e.target.value })}><option value="">غير محددة</option>{visibleFamilies.map((item) => <option key={item.id} value={item.id}>{item.name}{item.status === 'pending' ? ' (معلقة)' : ''}</option>)}</select></label>
              <label><span>الجنس</span><select value={personForm.gender} onChange={(e) => setPersonForm({ ...personForm, gender: e.target.value })}><option value="">غير محدد</option><option value="male">ذكر</option><option value="female">أنثى</option></select></label>
              <label><span>سنة الميلاد</span><input type="number" min="1800" max="2100" value={personForm.birth_year} onChange={(e) => setPersonForm({ ...personForm, birth_year: e.target.value })} /></label>
              <label className="full"><span>وصف أو نبذة</span><textarea value={personForm.description} onChange={(e) => setPersonForm({ ...personForm, description: e.target.value })} rows={4} /></label>
              <button className="primary full" disabled={busy}>إرسال للمراجعة</button>
            </form>}`

replaceOnce(oldForm, newForm, 'person create form')

fs.writeFileSync(path, src)
console.log('Integrated smart duplicate-person check')
