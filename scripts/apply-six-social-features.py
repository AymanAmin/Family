from pathlib import Path

app_path = Path('src/App.tsx')
main_path = Path('src/main.tsx')
app = app_path.read_text(encoding='utf-8')
main = main_path.read_text(encoding='utf-8')


def replace_once(source: str, before: str, after: str, label: str) -> str:
    if before in source:
        return source.replace(before, after, 1)
    if after in source:
        return source
    raise RuntimeError(f'Marker not found: {label}')

# Imports / lazy chunks.
app = replace_once(
    app,
    "import PeoplePicker from './components/PeoplePicker'",
    "import PeoplePicker from './components/PeoplePicker'\nimport VerifiedBadge from './components/VerifiedBadge'\nimport EventPeopleFields, { eventParticipantPayload, eventParticipantsRequired } from './components/EventPeopleFields'",
    'social imports',
)
app = replace_once(
    app,
    "const FamilyPicker = lazy(() => import('./components/FamilyPicker'))",
    "const FamilyPicker = lazy(() => import('./components/FamilyPicker'))\nconst DirectRelationshipManager = lazy(() => import('./components/DirectRelationshipManager'))\nconst RelationshipChangeQueue = lazy(() => import('./components/RelationshipChangeQueue'))",
    'social lazy chunks',
)

# Person verification + event people types.
app = replace_once(
    app,
    "  is_deceased: boolean\n  death_date: string | null",
    "  is_deceased: boolean\n  is_verified?: boolean\n  death_date: string | null",
    'person verification type',
)
app = replace_once(
    app,
    "type CommunityEvent = {",
    "type EventTaggedPerson = { id?: string; full_name?: string; is_verified?: boolean } | { id?: string; full_name?: string; is_verified?: boolean }[] | null\ntype EventPersonLink = { event_id?: string; participant_role: string; sort_order: number; people?: EventTaggedPerson }\n\ntype CommunityEvent = {",
    'event people type',
)
app = replace_once(
    app,
    "  created_by: string\n  created_at: string\n}\n\ntype PendingRecord",
    "  created_by: string\n  created_at: string\n  event_people?: EventPersonLink[]\n}\n\ntype PendingRecord",
    'community event people field',
)

# Event participant state + kinship revision.
app = replace_once(
    app,
    "  const [eventForm, setEventForm] = useState({ event_type: 'general', title: '', family_id: '', event_date: '', location_name: '', description: '' })",
    "  const [eventForm, setEventForm] = useState({ event_type: 'general', title: '', family_id: '', event_date: '', location_name: '', description: '' })\n  const [eventPrimaryPersonId, setEventPrimaryPersonId] = useState('')\n  const [eventSecondaryPersonId, setEventSecondaryPersonId] = useState('')",
    'event participant state',
)
app = replace_once(
    app,
    "  const [relationships, setRelationships] = useState<PersonRelationship[]>([])\n  const [relationsLoading, setRelationsLoading] = useState(false)",
    "  const [relationships, setRelationships] = useState<PersonRelationship[]>([])\n  const [relationsLoading, setRelationsLoading] = useState(false)\n  const [kinshipRevision, setKinshipRevision] = useState(0)",
    'kinship revision',
)

# Enrich event sample with tagged people without making the whole app depend on migration 020.
app = replace_once(
    app,
    "    setEvents((eventResult.data ?? []) as CommunityEvent[])",
    "    let eventRows = (eventResult.data ?? []) as CommunityEvent[]\n    if (eventRows.length) {\n      const eventIds = eventRows.map((item) => item.id)\n      const mentionResult = await supabase.from('event_people').select('event_id,participant_role,sort_order,people(id,full_name,is_verified)').in('event_id', eventIds).order('sort_order')\n      if (!mentionResult.error) {\n        const mentions = (mentionResult.data ?? []) as EventPersonLink[]\n        eventRows = eventRows.map((item) => ({ ...item, event_people: mentions.filter((mention) => mention.event_id === item.id) }))\n      }\n    }\n    setEvents(eventRows)",
    'event mention enrichment',
)

# Person fetch includes verification; if migration is missing, fall back to the old shape.
old_person_fetch = """    const { data, error } = await supabase
      .from('people')
      .select('id,full_name,gender,birth_year,is_deceased,death_date,description,status,family_id,created_by,created_at,families(name)')
      .eq('id', id)
      .maybeSingle()

    if (error) return showMessage(friendlyError(error.message), 'error')
    if (data) await openPerson(data as Person)"""
new_person_fetch = """    let personResult = await supabase
      .from('people')
      .select('id,full_name,gender,birth_year,is_deceased,is_verified,death_date,description,status,family_id,created_by,created_at,families(name)')
      .eq('id', id)
      .maybeSingle()

    if (personResult.error?.message.toLowerCase().includes('is_verified')) {
      personResult = await supabase
        .from('people')
        .select('id,full_name,gender,birth_year,is_deceased,death_date,description,status,family_id,created_by,created_at,families(name)')
        .eq('id', id)
        .maybeSingle()
    }

    if (personResult.error) return showMessage(friendlyError(personResult.error.message), 'error')
    if (personResult.data) await openPerson({ ...(personResult.data as Person), is_verified: Boolean((personResult.data as Person).is_verified) })"""
app = replace_once(app, old_person_fetch, new_person_fetch, 'verified person fetch')

# Event creation through one atomic RPC, with backward-compatible fallback.
old_submit_event = """  async function submitEvent(event: FormEvent<HTMLFormElement>) {
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
  }"""
new_submit_event = """  async function submitEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !session || !requireAccount()) return
    if (eventForm.title.trim().length < 3) return showMessage('اكتب عنوان المناسبة.', 'error')
    if (eventParticipantsRequired(eventForm.event_type)) {
      if (!eventPrimaryPersonId) return showMessage('اختر الشخص المرتبط بالمناسبة.', 'error')
      if (eventForm.event_type === 'wedding' && !eventSecondaryPersonId) return showMessage('اختر طرفي الزواج.', 'error')
    }

    setBusy(true)
    const participants = eventParticipantPayload(eventForm.event_type, eventPrimaryPersonId, eventSecondaryPersonId)
    let result = await supabase.rpc('create_event_with_people', {
      p_event_type: eventForm.event_type,
      p_title: eventForm.title.trim(),
      p_family_id: eventForm.family_id || null,
      p_event_date: eventForm.event_date || null,
      p_location_name: eventForm.location_name.trim() || null,
      p_description: eventForm.description.trim() || null,
      p_participants: participants,
    })

    if (result.error?.message.toLowerCase().includes('does not exist')) {
      const directApproval = isAdmin
      result = await supabase.from('events').insert({
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
    }

    setBusy(false)
    if (result.error) return showMessage(friendlyError(result.error.message), 'error')
    setEventForm({ event_type: 'general', title: '', family_id: '', event_date: '', location_name: '', description: '' })
    setEventPrimaryPersonId('')
    setEventSecondaryPersonId('')
    showMessage(isAdmin ? 'تمت إضافة المناسبة واعتمادها مباشرة.' : 'تم إرسال المناسبة للمراجعة.', 'success')
    void loadCommunityData()
  }"""
app = replace_once(app, old_submit_event, new_submit_event, 'event mention creation')

# Header logout removed; logout now lives in account profile.
app = replace_once(
    app,
    "              <button className=\"ghost-button\" onClick={signOut} disabled={busy}>خروج</button>\n",
    "",
    'remove header logout',
)

# Person title verification.
app = replace_once(
    app,
    "<div><span className=\"eyebrow\">ملف شخص</span><h1>{selectedPerson.full_name}</h1><p>{selectedPerson.description || 'لا توجد نبذة مضافة لهذا الشخص.'}</p></div>",
    "<div><span className=\"eyebrow\">ملف شخص</span><span className=\"person-title-line\"><h1>{selectedPerson.full_name}</h1>{selectedPerson.is_verified && <VerifiedBadge />}</span><p>{selectedPerson.description || 'لا توجد نبذة مضافة لهذا الشخص.'}</p></div>",
    'person verified title',
)

# Family memberships get ownership + linked identity awareness.
app = replace_once(
    app,
    "<PersonFamilyMemberships personId={selectedPerson.id} sessionUserId={session?.user.id} isAdmin={isAdmin} onChanged={loadCommunityData} />",
    "<PersonFamilyMemberships personId={selectedPerson.id} recordCreatedBy={selectedPerson.created_by} sessionUserId={session?.user.id} isAdmin={isAdmin} isLinkedPerson={profile?.linked_person_id === selectedPerson.id} onChanged={loadCommunityData} />",
    'primary family props',
)

# Kinship network refresh key + direct relationship management.
app = replace_once(
    app,
    "              <KinshipNetwork\n                personId={selectedPerson.id}",
    "              <KinshipNetwork\n                key={`${selectedPerson.id}-${kinshipRevision}`}\n                personId={selectedPerson.id}",
    'kinship refresh key',
)
kinship_end = """                }}
                />
            </Suspense>
          </section>"""
kinship_after = """                }}
                />
            </Suspense>
            <Suspense fallback={<LazyPanelFallback />}>
              <DirectRelationshipManager
                personId={selectedPerson.id}
                sessionUserId={session?.user.id}
                isAdmin={isAdmin}
                onOpenPerson={(id) => void openPersonById(id)}
                onChanged={() => setKinshipRevision((value) => value + 1)}
              />
            </Suspense>
          </section>"""
app = replace_once(app, kinship_end, kinship_after, 'relationship manager')

# Account logout card.
activity_marker = """            <Suspense fallback={<LazyPanelFallback />}>
              <MySubmissionActivity"""
logout_insert = """            <div className="account-logout-card">
              <div><strong>تسجيل الخروج</strong><small>إنهاء الجلسة الحالية على هذا الجهاز.</small></div>
              <button type="button" onClick={() => void signOut()} disabled={busy}>{busy ? 'جارٍ الخروج…' : 'تسجيل الخروج'}</button>
            </div>
            <Suspense fallback={<LazyPanelFallback />}>
              <MySubmissionActivity"""
app = replace_once(app, activity_marker, logout_insert, 'account logout card')

# Event people fields before family picker.
event_form_marker = """{addMode === 'event' && <form className="data-form" onSubmit={submitEvent}><label><span>نوع المناسبة *</span><select value={eventForm.event_type} onChange={(e) => setEventForm({ ...eventForm, event_type: e.target.value })}>{Object.entries(eventLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>عنوان المناسبة *</span><input value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} required /></label><Suspense"""
event_form_after = """{addMode === 'event' && <form className="data-form" onSubmit={submitEvent}><label><span>نوع المناسبة *</span><select value={eventForm.event_type} onChange={(e) => { setEventForm({ ...eventForm, event_type: e.target.value }); setEventPrimaryPersonId(''); setEventSecondaryPersonId('') }}>{Object.entries(eventLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>عنوان المناسبة *</span><input value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} required /></label><EventPeopleFields eventType={eventForm.event_type} primaryPersonId={eventPrimaryPersonId} secondaryPersonId={eventSecondaryPersonId} onPrimaryChange={setEventPrimaryPersonId} onSecondaryChange={setEventSecondaryPersonId} /><Suspense"""
app = replace_once(app, event_form_marker, event_form_after, 'event people fields')

# Helper JSX for tagged event people in both home event styles.
old_home_event = """<p>{eventLabels[item.event_type] || item.event_type} · {item.location_name || familyName(item.families) || 'المكان غير محدد'}</p></div></div>)"""
new_home_event = """<p>{eventLabels[item.event_type] || item.event_type} · {item.location_name || familyName(item.families) || 'المكان غير محدد'}</p>{item.event_people?.length ? <div className="event-mention-chips">{item.event_people.map((link,index) => { const person = Array.isArray(link.people) ? link.people[0] : link.people; return person?.full_name ? <span className="event-mention-chip" key={`${person.id || index}-${index}`}>{person.full_name}{person.is_verified && <VerifiedBadge compact />}</span> : null })}</div> : null}</div></div>)"""
app = replace_once(app, old_home_event, new_home_event, 'home event mentions')

old_event_card = """                      <small>{item.location_name || familyName(item.families) || 'المكان غير محدد'}</small>
                      <RecordEditButton"""
new_event_card = """                      <small>{item.location_name || familyName(item.families) || 'المكان غير محدد'}</small>
                      {item.event_people?.length ? <div className="event-mention-chips">{item.event_people.map((link,index) => { const person = Array.isArray(link.people) ? link.people[0] : link.people; return person?.full_name ? <span className="event-mention-chip" key={`${person.id || index}-${index}`}>{person.full_name}{person.is_verified && <VerifiedBadge compact />}</span> : null })}</div> : null}
                      <RecordEditButton"""
app = replace_once(app, old_event_card, new_event_card, 'event card mentions')

# Admin relationship change queue sits below the existing edit/membership queue for full admins.
admin_edits = """              {adminTab === 'edits' && <Suspense fallback={<LazyPanelFallback />}><Phase3AdminQueue active={adminTab === 'edits' && canModerate} isAdmin={isAdmin} onChanged={loadCommunityData} /></Suspense>}"""
admin_edits_after = """              {adminTab === 'edits' && <>
                <Suspense fallback={<LazyPanelFallback />}><Phase3AdminQueue active={adminTab === 'edits' && canModerate} isAdmin={isAdmin} onChanged={loadCommunityData} /></Suspense>
                {isAdmin && <Suspense fallback={<LazyPanelFallback />}><RelationshipChangeQueue active={adminTab === 'edits'} onChanged={() => { setKinshipRevision((value) => value + 1); void loadCommunityData() }} /></Suspense>}
              </>}"""
app = replace_once(app, admin_edits, admin_edits_after, 'relationship review queue')

# CSS loaded last.
if "import './social-verification-events.css'" not in main:
    main = main.replace("import './account-activity.css'", "import './account-activity.css'\nimport './social-verification-events.css'")

app_path.write_text(app, encoding='utf-8')
main_path.write_text(main, encoding='utf-8')
print('Applied six social features to App and main CSS imports.')
