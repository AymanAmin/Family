from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'Could not find expected {label} block')
    return text.replace(old, new, 1)


app_path = Path('src/App.tsx')
app = app_path.read_text(encoding='utf-8')

state_line = "  const [personForm, setPersonForm] = useState({ full_name: '', family_id: '', gender: '', birth_year: '', is_deceased: false, death_date: '', description: '' })"
if 'const [personRelationForm, setPersonRelationForm]' not in app:
    app = replace_once(
        app,
        state_line,
        state_line + "\n  const [personRelationForm, setPersonRelationForm] = useState({ relation_type: '', related_person_id: '', notes: '' })",
        'person relation state',
    )

start = app.index('  async function submitPerson(event: FormEvent<HTMLFormElement>) {')
end = app.index('\n  async function submitEvent', start)
new_submit_person = r'''  async function submitPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !session || !requireAccount()) return
    if (personForm.full_name.trim().length < 3) return showMessage('اكتب الاسم الكامل.', 'error')
    if (personForm.is_deceased && !personForm.death_date) return showMessage('حدد تاريخ الوفاة.', 'error')

    const relationType = personRelationForm.relation_type
    const relatedPersonId = personRelationForm.related_person_id
    if (relationType && !relatedPersonId) return showMessage('اختر الشخص المرتبط بصلة القرابة أو اختر «بدون صلة الآن».', 'error')

    setBusy(true)
    const directApproval = isAdmin
    const approvedAt = directApproval ? new Date().toISOString() : null

    let inheritedPrimaryFamilyId = ''
    let inheritedFamilyIds: string[] = []

    if (relationType === 'child' && relatedPersonId) {
      const [fatherResult, membershipsResult] = await Promise.all([
        supabase
          .from('people')
          .select('id,gender,family_id')
          .eq('id', relatedPersonId)
          .eq('status', 'approved')
          .maybeSingle(),
        supabase
          .from('person_family_memberships')
          .select('family_id,is_primary')
          .eq('person_id', relatedPersonId)
          .eq('status', 'approved'),
      ])

      if (fatherResult.error) {
        setBusy(false)
        return showMessage(friendlyError(fatherResult.error.message), 'error')
      }
      if (!fatherResult.data) {
        setBusy(false)
        return showMessage('تعذر العثور على سجل الأب المختار.', 'error')
      }
      if (fatherResult.data.gender === 'female') {
        setBusy(false)
        return showMessage('عند اختيار «ابن أو ابنة» اختر سجل الأب حتى يتم توريث عوائل جهة الأب تلقائيًا.', 'error')
      }

      const fatherMemberships = membershipsResult.error ? [] : (membershipsResult.data ?? [])
      const primaryMembership = fatherMemberships.find((item) => item.is_primary)
      inheritedPrimaryFamilyId = fatherResult.data.family_id || primaryMembership?.family_id || fatherMemberships[0]?.family_id || ''
      inheritedFamilyIds = Array.from(new Set([
        ...(fatherResult.data.family_id ? [fatherResult.data.family_id] : []),
        ...fatherMemberships.map((item) => item.family_id).filter(Boolean),
      ]))
    }

    const effectiveFamilyId = personForm.family_id || inheritedPrimaryFamilyId || ''
    const { data: newPerson, error } = await supabase.from('people').insert({
      full_name: personForm.full_name.trim(),
      family_id: effectiveFamilyId || null,
      gender: personForm.gender || null,
      birth_year: personForm.birth_year ? Number(personForm.birth_year) : null,
      is_deceased: personForm.is_deceased,
      death_date: personForm.is_deceased ? personForm.death_date : null,
      description: personForm.description.trim() || null,
      created_by: session.user.id,
      status: directApproval ? 'approved' : 'pending',
      approved_by: directApproval ? session.user.id : null,
      approved_at: approvedAt,
    }).select('id').single()

    if (error) {
      setBusy(false)
      return showMessage(friendlyError(error.message), 'error')
    }

    if (newPerson?.id) {
      const membershipRows: Array<Record<string, unknown>> = []
      if (effectiveFamilyId) {
        membershipRows.push({
          person_id: newPerson.id,
          family_id: effectiveFamilyId,
          membership_type: 'birth',
          is_primary: true,
          status: directApproval ? 'approved' : 'pending',
          created_by: session.user.id,
          approved_by: directApproval ? session.user.id : null,
          approved_at: approvedAt,
        })
      }

      if (relationType === 'child' && relatedPersonId) {
        inheritedFamilyIds
          .filter((familyId) => familyId && familyId !== effectiveFamilyId)
          .forEach((familyId) => membershipRows.push({
            person_id: newPerson.id,
            family_id: familyId,
            membership_type: 'paternal',
            is_primary: false,
            notes: 'أضيفت تلقائيًا من عوائل الأب عند تسجيل ابن أو ابنة',
            status: directApproval ? 'approved' : 'pending',
            created_by: session.user.id,
            approved_by: directApproval ? session.user.id : null,
            approved_at: approvedAt,
          }))
      }

      if (membershipRows.length) {
        const { error: membershipError } = await supabase.from('person_family_memberships').insert(membershipRows)
        if (membershipError && !membershipError.message.toLowerCase().includes('does not exist')) {
          setBusy(false)
          return showMessage(`تم إنشاء الشخص، لكن تعذر حفظ بعض الانتماءات العائلية: ${friendlyError(membershipError.message)}`, 'error')
        }
      }

      if (relationType && relatedPersonId) {
        const { error: relationshipError } = await supabase.from('person_relationships').insert({
          source_person_id: newPerson.id,
          target_person_id: relatedPersonId,
          relation_type: relationType,
          notes: personRelationForm.notes.trim() || null,
          created_by: session.user.id,
          status: directApproval ? 'approved' : 'pending',
          approved_by: directApproval ? session.user.id : null,
          approved_at: approvedAt,
        })
        if (relationshipError) {
          setBusy(false)
          return showMessage(`تم إنشاء الشخص، لكن تعذر حفظ صلة القرابة: ${friendlyError(relationshipError.message)}`, 'error')
        }
      }
    }

    setBusy(false)
    setPersonForm({ full_name: '', family_id: '', gender: '', birth_year: '', is_deceased: false, death_date: '', description: '' })
    setPersonRelationForm({ relation_type: '', related_person_id: '', notes: '' })

    if (relationType === 'child') {
      showMessage(
        isAdmin
          ? 'تمت إضافة الشخص وصلة الابن/الابنة ونسخ عوائل الأب واعتمادها مباشرة.'
          : 'تم إرسال الشخص وصلة الابن/الابنة وعوائل جهة الأب للمراجعة في خطوة واحدة.',
        'success',
      )
    } else if (relationType) {
      showMessage(
        isAdmin ? 'تمت إضافة الشخص وصلة القرابة واعتمادهما مباشرة.' : 'تم إرسال الشخص وصلة القرابة للمراجعة في خطوة واحدة.',
        'success',
      )
    } else {
      showMessage(isAdmin ? 'تمت إضافة الشخص واعتماده مباشرة.' : 'تم إرسال الشخص للمراجعة.', 'success')
    }
    void loadCommunityData()
    void loadPending()
  }
'''
app = app[:start] + new_submit_person + app[end:]

old_tree_props = '''            <FamilyTreeScreen
              initialPersonId={profile?.linked_person_id || selectedPerson?.id || null}
              onOpenPerson={(id) => void openPersonById(id)}
              onAddRelation={(id) => {'''
new_tree_props = '''            <FamilyTreeScreen
              initialPersonId={profile?.linked_person_id || selectedPerson?.id || null}
              onOpenPerson={(id) => void openPersonById(id)}
              onAddPerson={(id) => {
                if (!requireAccount()) return
                setPersonRelationForm({ relation_type: id ? 'child' : '', related_person_id: id || '', notes: '' })
                setAddMode('person')
                setView('add')
              }}
              onAddRelation={(id) => {'''
if 'onAddPerson={(id) =>' not in app:
    app = replace_once(app, old_tree_props, new_tree_props, 'tree add-person props')

old_family_picker = '''              <Suspense fallback={<div className="picker-skeleton">جارٍ تجهيز بحث العائلات…</div>}>
                <FamilyPicker
                  label="العائلة"
                  value={personForm.family_id}
                  onChange={(familyId) => setPersonForm((current) => ({ ...current, family_id: familyId }))}
                  emptyLabel="بدون عائلة محددة"
                />
              </Suspense>'''
new_family_picker = '''              <div className="person-relation-card full">
                <div className="person-relation-heading">
                  <div><strong>صلة القرابة مع شخص موجود</strong><small>اختياري — يمكنك إضافة الشخص وحده أو الشخص والصلة في نفس الطلب.</small></div>
                  <span>{personRelationForm.relation_type ? 'مفعّلة' : 'اختيارية'}</span>
                </div>
                <label className="full"><span>نوع العلاقة</span><select value={personRelationForm.relation_type} onChange={(e) => setPersonRelationForm((current) => ({ ...current, relation_type: e.target.value }))}><option value="">بدون صلة الآن</option>{Object.entries(relationshipLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                {personRelationForm.relation_type && <PeoplePicker label={personRelationForm.relation_type === 'child' ? 'الأب الذي يُنسب إليه الشخص الجديد' : 'الشخص المرتبط'} value={personRelationForm.related_person_id} onChange={(selectedId) => setPersonRelationForm((current) => ({ ...current, related_person_id: selectedId }))} required />}
                {personRelationForm.relation_type === 'child' && <div className="paternal-inheritance-note full"><strong>توريث عوائل جهة الأب تلقائيًا</strong><span>سيأخذ الابن أو الابنة العائلة الأساسية للأب إذا لم تحدد عائلة يدويًا، وتُضاف بقية عوائل الأب إليه كعلاقات عائلية من جهة الأب.</span></div>}
                {personRelationForm.relation_type && <label className="full"><span>ملاحظة عن صلة القرابة</span><textarea value={personRelationForm.notes} onChange={(e) => setPersonRelationForm((current) => ({ ...current, notes: e.target.value }))} rows={3} /></label>}
              </div>
              <Suspense fallback={<div className="picker-skeleton">جارٍ تجهيز بحث العائلات…</div>}>
                <FamilyPicker
                  label={personRelationForm.relation_type === 'child' ? 'العائلة الأساسية (اختياري — تُؤخذ من الأب عند تركها فارغة)' : 'العائلة'}
                  value={personForm.family_id}
                  onChange={(familyId) => setPersonForm((current) => ({ ...current, family_id: familyId }))}
                  emptyLabel={personRelationForm.relation_type === 'child' ? 'استخدام عائلة الأب تلقائيًا' : 'بدون عائلة محددة'}
                />
              </Suspense>'''
if 'person-relation-card full' not in app:
    app = replace_once(app, old_family_picker, new_family_picker, 'combined person relationship form')

old_person_button = '''              <button className="primary full" disabled={busy}>{isAdmin ? 'إضافة واعتماد' : 'إرسال للمراجعة'}</button>
            </form>}'''
new_person_button = '''              <button className="primary full" disabled={busy}>{busy ? 'جارٍ الحفظ…' : personRelationForm.relation_type ? (isAdmin ? 'إضافة الشخص والصلة واعتمادهما' : 'إرسال الشخص والصلة للمراجعة') : (isAdmin ? 'إضافة واعتماد' : 'إرسال للمراجعة')}</button>
            </form>}'''
if "personRelationForm.relation_type ? (isAdmin ? 'إضافة الشخص والصلة" not in app:
    # This exact button text appears first in the person form after the family form button.
    person_form_start = app.index("            {addMode === 'person'")
    button_pos = app.index(old_person_button, person_form_start)
    app = app[:button_pos] + new_person_button + app[button_pos + len(old_person_button):]

app_path.write_text(app, encoding='utf-8')


tree_path = Path('src/components/FamilyTreeScreen.tsx')
tree = tree_path.read_text(encoding='utf-8')
if 'onAddPerson: (personId?: string) => void' not in tree:
    tree = replace_once(
        tree,
        "  onOpenPerson: (personId: string) => void\n  onAddRelation: (personId?: string) => void",
        "  onOpenPerson: (personId: string) => void\n  onAddPerson: (personId?: string) => void\n  onAddRelation: (personId?: string) => void",
        'tree props type',
    )
    tree = replace_once(
        tree,
        'export default function FamilyTreeScreen({ initialPersonId, onOpenPerson, onAddRelation }: Props) {',
        'export default function FamilyTreeScreen({ initialPersonId, onOpenPerson, onAddPerson, onAddRelation }: Props) {',
        'tree function signature',
    )

old_focus_button = '''                <div><strong>{focus.full_name}</strong><small>{familyName(focus.families) || 'العائلة غير محددة'}{focus.birth_year ? ` · ${focus.birth_year}` : ''}</small></div>
                <button type="button" onClick={() => onAddRelation(focus.id)}>＋ صلة</button>'''
new_focus_button = '''                <div><strong>{focus.full_name}</strong><small>{familyName(focus.families) || 'العائلة غير محددة'}{focus.birth_year ? ` · ${focus.birth_year}` : ''}</small></div>
                <div className="tree-focus-actions">
                  <button type="button" className="tree-add-person" onClick={() => onAddPerson(focus.id)}>＋ فرد</button>
                  <button type="button" onClick={() => onAddRelation(focus.id)}>＋ صلة</button>
                </div>'''
if 'className="tree-focus-actions"' not in tree:
    tree = replace_once(tree, old_focus_button, new_focus_button, 'tree focus actions')

tree_path.write_text(tree, encoding='utf-8')


main_path = Path('src/main.tsx')
main = main_path.read_text(encoding='utf-8')
if "import './person-create-combined.css'" not in main:
    main = replace_once(
        main,
        "import './relationship-manager.css'",
        "import './relationship-manager.css'\nimport './person-create-combined.css'",
        'combined person form stylesheet import',
    )
main_path.write_text(main, encoding='utf-8')


css_path = Path('src/person-create-combined.css')
css_path.write_text(r'''.person-relation-card {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  padding: 16px;
  border: 1px solid rgba(15, 95, 75, 0.18);
  border-radius: 18px;
  background: rgba(15, 95, 75, 0.045);
}

.person-relation-heading {
  grid-column: 1 / -1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.person-relation-heading > div {
  display: grid;
  gap: 4px;
}

.person-relation-heading strong {
  font-size: 1rem;
}

.person-relation-heading small,
.paternal-inheritance-note span {
  color: #66756f;
  line-height: 1.65;
}

.person-relation-heading > span {
  flex: 0 0 auto;
  padding: 5px 9px;
  border-radius: 999px;
  background: rgba(15, 95, 75, 0.1);
  color: #0f5f4b;
  font-size: 0.76rem;
  font-weight: 700;
}

.paternal-inheritance-note {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(187, 145, 52, 0.09);
  border: 1px solid rgba(187, 145, 52, 0.2);
}

.paternal-inheritance-note strong {
  color: #725514;
}

.tree-focus-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.tree-focus-actions .tree-add-person {
  background: #0f5f4b;
  color: #fff;
}

@media (max-width: 720px) {
  .person-relation-card {
    grid-template-columns: 1fr;
    padding: 14px;
  }

  .person-relation-heading {
    align-items: stretch;
  }

  .person-relation-heading > span {
    align-self: flex-start;
  }

  .tree-focus-actions {
    width: 100%;
  }

  .tree-focus-actions button {
    flex: 1 1 120px;
  }
}
''', encoding='utf-8')

print('Applied combined person + optional relationship flow with paternal family inheritance.')
