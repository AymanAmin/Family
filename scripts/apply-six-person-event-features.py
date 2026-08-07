from pathlib import Path
import re

app_path = Path('src/App.tsx')
main_path = Path('src/main.tsx')
app = app_path.read_text(encoding='utf-8')
main = main_path.read_text(encoding='utf-8')


def replace_once(source: str, before: str, after: str, label: str) -> str:
    if before not in source:
        if after in source:
            return source
        raise RuntimeError(f'Marker not found: {label}')
    return source.replace(before, after, 1)

app = replace_once(
    app,
    "import PeoplePicker from './components/PeoplePicker'",
    "import PeoplePicker from './components/PeoplePicker'\nimport EventPeopleFields, { eventParticipantPayload, eventParticipantsRequired } from './components/EventPeopleFields'\nimport { PersonVerifiedBadge } from './components/VerifiedBadge'",
    'feature imports',
)
app = replace_once(
    app,
    "const MySubmissionActivity = lazy(() => import('./components/MySubmissionActivity'))",
    "const MySubmissionActivity = lazy(() => import('./components/MySubmissionActivity'))\nconst DirectRelationshipEditor = lazy(() => import('./components/DirectRelationshipEditor'))",
    'relationship editor lazy import',
)

app = replace_once(
    app,
    "  const [relationships, setRelationships] = useState<PersonRelationship[]>([])\n  const [relationsLoading, setRelationsLoading] = useState(false)",
    "  const [relationships, setRelationships] = useState<PersonRelationship[]>([])\n  const [relationsLoading, setRelationsLoading] = useState(false)\n  const [relationshipRefresh, setRelationshipRefresh] = useState(0)",
    'relationship refresh state',
)
app = replace_once(
    app,
    "  const [eventForm, setEventForm] = useState({ event_type: 'general', title: '', family_id: '', event_date: '', location_name: '', description: '' })",
    "  const [eventForm, setEventForm] = useState({ event_type: 'general', title: '', family_id: '', event_date: '', location_name: '', description: '' })\n  const [eventPeopleForm, setEventPeopleForm] = useState({ primary_person_id: '', secondary_person_id: '' })",
    'event people state',
)

old_submit_event = '''  async function submitEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !session || !requireAccount()) return
    if (eventForm.title.trim().length < 3) return showMessage('اكتب عنوان المناسبة.', 'error')
    setBusy(true)
    const directApproval = isAdmin
    const { error } = await supabase.from('events').insert({
      event_type: eventForm.event_type,
      title: eventForm.title.trim(),
      family_id: eventForm.family_id || null,
      event_date: eventForm.event_date || null,
      location_name: eventForm.location_name.trim() || null,
      description: eventForm.description.trim() || null,
      created_by: session.user.id,
      status: directApproval ? 'approved' : 'pending',
      approved_by: directApproval ? session.user.id : null,
      approved_at: directApproval ? new Date().toISOString() : null,
    })
    setBusy(false)
    if (error) return showMessage(friendlyError(error.message), 'error')
    setEventForm({ event_type: 'general', title: '', family_id: '', event_date: '', location_name: '', description: '' })
    showMessage(isAdmin ? 'تمت إضافة المناسبة واعتمادها مباشرة.' : 'تم إرسال المناسبة للمراجعة.', 'success')
    void loadCommunityData()
  }'''

new_submit_event = '''  async function submitEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !session || !requireAccount()) return
    if (eventForm.title.trim().length < 3) return showMessage('اكتب عنوان المناسبة.', 'error')
    if (eventParticipantsRequired(eventForm.event_type) && !eventPeopleForm.primary_person_id) return showMessage('اختر الشخص المرتبط بالمناسبة.', 'error')
    if (eventForm.event_type === 'wedding' && !eventPeopleForm.secondary_person_id) return showMessage('اختر الشخصين المرتبطين بالزواج.', 'error')

    const participants = eventParticipantPayload(eventForm.event_type, eventPeopleForm.primary_person_id, eventPeopleForm.secondary_person_id)
    setBusy(true)
    const { error } = await supabase.rpc('create_event_with_people', {
      p_event_type: eventForm.event_type,
      p_title: eventForm.title.trim(),
      p_family_id: eventForm.family_id || null,
      p_event_date: eventForm.event_date || null,
      p_location_name: eventForm.location_name.trim() || null,
      p_description: eventForm.description.trim() || null,
      p_participants: participants,
    })
    setBusy(false)
    if (error) {
      if (error.message.toLowerCase().includes('does not exist')) return showMessage('شغّل migration رقم 020 في Supabase لتفعيل الإشارة إلى الأشخاص داخل المناسبات.', 'error')
      return showMessage(friendlyError(error.message), 'error')
    }
    setEventForm({ event_type: 'general', title: '', family_id: '', event_date: '', location_name: '', description: '' })
    setEventPeopleForm({ primary_person_id: '', secondary_person_id: '' })
    showMessage(isAdmin ? 'تمت إضافة المناسبة والأشخاص المشار إليهم واعتمادها مباشرة.' : 'تم إرسال المناسبة والأشخاص المشار إليهم للمراجعة.', 'success')
    void loadCommunityData()
  }'''
app = replace_once(app, old_submit_event, new_submit_event, 'submit event with people')

app = replace_once(
    app,
    "              <button className=\"ghost-button\" onClick={signOut} disabled={busy}>خروج</button>",
    "",
    'remove header logout',
)

app = replace_once(
    app,
    "              <div><span className=\"eyebrow\">ملف شخص</span><h1>{selectedPerson.full_name}</h1><p>{selectedPerson.description || 'لا توجد نبذة مضافة لهذا الشخص.'}</p></div>",
    "              <div><span className=\"eyebrow\">ملف شخص</span><div className=\"person-title-line\"><h1>{selectedPerson.full_name}</h1><PersonVerifiedBadge personId={selectedPerson.id} /></div><p>{selectedPerson.description || 'لا توجد نبذة مضافة لهذا الشخص.'}</p></div>",
    'person verified badge',
)

app = replace_once(
    app,
    "            <PersonFamilyMemberships personId={selectedPerson.id} sessionUserId={session?.user.id} isAdmin={isAdmin} onChanged={loadCommunityData} />",
    "            <PersonFamilyMemberships personId={selectedPerson.id} recordCreatedBy={selectedPerson.created_by} sessionUserId={session?.user.id} isAdmin={isAdmin} onChanged={async () => { await loadCommunityData(); await openPersonById(selectedPerson.id) }} />\n            <Suspense fallback={<LazyPanelFallback />}><DirectRelationshipEditor personId={selectedPerson.id} sessionUserId={session?.user.id} isAdmin={isAdmin} onChanged={() => setRelationshipRefresh((value) => value + 1)} /></Suspense>",
    'primary family and relationship edit UI',
)

app = replace_once(
    app,
    "              <KinshipNetwork\n                personId={selectedPerson.id}",
    "              <KinshipNetwork\n                key={`${selectedPerson.id}-${relationshipRefresh}`}\n                personId={selectedPerson.id}",
    'kinship refresh key',
)

account_marker = '''            <div className="account-status-card">
              <span className={`status ${profile?.linked_person_id ? 'approved' : ownLinkRequest?.status === 'pending' ? 'pending' : ''}`}>{profile?.linked_person_id ? 'مرتبط' : ownLinkRequest?.status === 'pending' ? 'قيد المراجعة' : 'غير مرتبط'}</span>
              <h2>{profile?.linked_person_id ? 'الحساب مرتبط بسجل شخص' : ownLinkRequest?.status === 'pending' ? 'طلب الربط قيد المراجعة' : 'اربط حسابك بسجلك داخل الدليل'}</h2>
              <p>{profile?.linked_person_id ? people.find((item) => item.id === profile.linked_person_id)?.full_name || 'تم اعتماد الربط.' : ownLinkRequest?.status === 'pending' ? `السجل المطلوب: ${personName(ownLinkRequest.people)}` : 'ابحث عن اسمك في الدليل وافتح ملف الشخص ثم اضغط «هذا أنا».'}</p>
              {!profile?.linked_person_id && ownLinkRequest?.status !== 'pending' && <button className="primary" type="button" onClick={() => setView('search')}>البحث عن سجلي</button>}
            </div>'''
account_after = account_marker + '''
            <div className="account-logout-card">
              <div><strong>تسجيل الخروج</strong><small>إنهاء الجلسة الحالية على هذا الجهاز.</small></div>
              <button type="button" disabled={busy} onClick={() => void signOut()}>{busy ? 'جارٍ الخروج…' : 'تسجيل الخروج'}</button>
            </div>'''
app = replace_once(app, account_marker, account_after, 'account logout card')

start = app.find("            {addMode === 'event' && <form className=\"data-form\" onSubmit={submitEvent}>")
end = app.find("\n\n\n            {addMode === 'relationship'", start)
if start == -1 or end == -1:
    if 'event-people-fields' not in app:
        raise RuntimeError('Event form block not found')
else:
    new_event_form = '''            {addMode === 'event' && <form className="data-form" onSubmit={submitEvent}>
              <label><span>نوع المناسبة *</span><select value={eventForm.event_type} onChange={(e) => { setEventForm({ ...eventForm, event_type: e.target.value }); setEventPeopleForm({ primary_person_id: '', secondary_person_id: '' }) }}>{Object.entries(eventLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label><span>عنوان المناسبة *</span><input value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} required /></label>
              <Suspense fallback={<div className="picker-skeleton">جارٍ تجهيز بحث العائلات…</div>}><FamilyPicker label="العائلة المرتبطة" value={eventForm.family_id} onChange={(familyId) => setEventForm((current) => ({ ...current, family_id: familyId }))} emptyLabel="مناسبة عامة" /></Suspense>
              <label><span>التاريخ</span><input type="date" value={eventForm.event_date} onChange={(e) => setEventForm({ ...eventForm, event_date: e.target.value })} /></label>
              <EventPeopleFields eventType={eventForm.event_type} primaryPersonId={eventPeopleForm.primary_person_id} secondaryPersonId={eventPeopleForm.secondary_person_id} onPrimaryChange={(id) => setEventPeopleForm((current) => ({ ...current, primary_person_id: id }))} onSecondaryChange={(id) => setEventPeopleForm((current) => ({ ...current, secondary_person_id: id }))} />
              <label className="full"><span>المكان</span><input value={eventForm.location_name} onChange={(e) => setEventForm({ ...eventForm, location_name: e.target.value })} /></label>
              <label className="full"><span>التفاصيل</span><textarea value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} rows={4} /></label>
              <button className="primary full" disabled={busy}>{isAdmin ? 'إضافة واعتماد' : 'إرسال للمراجعة'}</button>
            </form>}'''
    app = app[:start] + new_event_form + app[end:]

if "import './social-verification-events.css'" not in main:
    main = main.replace("import './admin-death.css'", "import './admin-death.css'\nimport './social-verification-events.css'")

app_path.write_text(app, encoding='utf-8')
main_path.write_text(main, encoding='utf-8')
print('Applied six requested person/event features to the app.')
