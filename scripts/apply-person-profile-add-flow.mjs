import fs from 'node:fs'

const appPath = 'src/App.tsx'
let app = fs.readFileSync(appPath, 'utf8')
const marker = '              <RecordEditButton entityType="people"'
const actionMarker = 'className="person-detail-quick-actions"'

if (!app.includes(marker)) {
  throw new Error('Could not find person profile edit marker')
}

if (!app.includes(actionMarker)) {
  const start = app.indexOf(marker)
  const insertion = app.indexOf('            <div className="detail-facts">', start)
  if (insertion < 0) throw new Error('Could not find person detail facts insertion point')

  const block = `            {session && <div className="person-detail-quick-actions" aria-label="إجراءات إضافة مرتبطة بهذا الشخص">
              <button className="person-profile-action primary-action" type="button" onClick={() => {
                if (!requireAccount()) return
                setPersonRelationForm({ relation_type: 'child', related_person_id: selectedPerson.id, notes: '' })
                setAddMode('person')
                setView('add')
              }}>
                <span className="person-profile-action-icon" aria-hidden="true">＋</span>
                <span><strong>إضافة فرد مرتبط</strong><small>أضف الشخص وحدد صلته في نفس الخطوة</small></span>
              </button>
              <button className="person-profile-action secondary-action" type="button" onClick={() => {
                if (!requireAccount()) return
                setRelationshipForm((current) => ({ ...current, source_person_id: selectedPerson.id }))
                setAddMode('relationship')
                setView('add')
              }}>
                <span className="person-profile-action-icon" aria-hidden="true">⌘</span>
                <span><strong>إضافة صلة فقط</strong><small>اربط هذا الشخص بشخص موجود</small></span>
              </button>
            </div>}
`

  app = app.slice(0, insertion) + block + app.slice(insertion)
  fs.writeFileSync(appPath, app)
}

const css = `/* Quick actions shown on an individual person profile. */
.person-detail-quick-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: -10px 0 24px;
  padding: 10px;
  border: 1px solid #d9e8e2;
  border-radius: 20px;
  background: linear-gradient(145deg, #f8fcfa, #edf7f3);
  box-shadow: 0 9px 24px rgb(7 56 45 / 5%);
}

.person-profile-action {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 62px;
  padding: 10px 12px;
  border-radius: 15px;
  text-align: right;
  cursor: pointer;
}

.person-profile-action > span:last-child {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.person-profile-action strong {
  font-size: .76rem;
  font-weight: 900;
}

.person-profile-action small {
  overflow: hidden;
  font-size: .57rem;
  line-height: 1.55;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.person-profile-action-icon {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border-radius: 13px;
  font-size: 1.08rem;
  font-weight: 900;
}

.person-profile-action.primary-action {
  border: 1px solid #166f58;
  color: white;
  background: linear-gradient(145deg, var(--green-600), var(--green-800));
  box-shadow: 0 8px 20px rgb(12 88 67 / 16%);
}

.person-profile-action.primary-action .person-profile-action-icon {
  background: rgb(255 255 255 / 14%);
}

.person-profile-action.primary-action small {
  color: rgb(255 255 255 / 74%);
}

.person-profile-action.secondary-action {
  border: 1px solid #c9dfd6;
  color: var(--green-900);
  background: white;
}

.person-profile-action.secondary-action .person-profile-action-icon {
  color: var(--green-700);
  background: #e7f3ee;
}

.person-profile-action.secondary-action small {
  color: #71827b;
}

@media (max-width: 560px) {
  .person-detail-quick-actions {
    grid-template-columns: 1fr;
    margin-top: -12px;
    padding: 8px;
    border-radius: 18px;
  }

  .person-profile-action {
    min-height: 58px;
  }
}
`
fs.writeFileSync('src/person-profile-actions.css', css)

const mainPath = 'src/main.tsx'
let main = fs.readFileSync(mainPath, 'utf8')
const importLine = "import './person-profile-actions.css'"
if (!main.includes(importLine)) {
  const anchor = "import './person-create-combined.css'"
  if (!main.includes(anchor)) throw new Error('Could not find stylesheet import anchor')
  main = main.replace(anchor, `${anchor}\n${importLine}`)
  fs.writeFileSync(mainPath, main)
}

console.log('Person profile combined-add flow patch applied.')
