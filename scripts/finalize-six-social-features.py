from pathlib import Path

app_path = Path('src/App.tsx')
app = app_path.read_text(encoding='utf-8')


def replace_once(before: str, after: str, label: str):
    global app
    if before in app:
        app = app.replace(before, after, 1)
        return
    if after in app:
        return
    raise RuntimeError(f'Marker not found: {label}')

replace_once(
    "const DirectRelationshipEditor = lazy(() => import('./components/DirectRelationshipEditor'))",
    "const DirectRelationshipManager = lazy(() => import('./components/DirectRelationshipManager'))\nconst RelationshipChangeQueue = lazy(() => import('./components/RelationshipChangeQueue'))",
    'relationship lazy imports',
)

replace_once(
    "<PersonFamilyMemberships personId={selectedPerson.id} recordCreatedBy={selectedPerson.created_by} sessionUserId={session?.user.id} isAdmin={isAdmin} onChanged={async () => { await loadCommunityData(); await openPersonById(selectedPerson.id) }} />",
    "<PersonFamilyMemberships personId={selectedPerson.id} recordCreatedBy={selectedPerson.created_by} sessionUserId={session?.user.id} isAdmin={isAdmin} isLinkedPerson={profile?.linked_person_id === selectedPerson.id} onChanged={async () => { await loadCommunityData(); await openPersonById(selectedPerson.id) }} />",
    'linked person primary family',
)

replace_once(
    "<Suspense fallback={<LazyPanelFallback />}><DirectRelationshipEditor personId={selectedPerson.id} sessionUserId={session?.user.id} isAdmin={isAdmin} onChanged={() => setRelationshipRefresh((value) => value + 1)} /></Suspense>",
    "<Suspense fallback={<LazyPanelFallback />}><DirectRelationshipManager personId={selectedPerson.id} sessionUserId={session?.user.id} isAdmin={isAdmin} onOpenPerson={(id) => void openPersonById(id)} onChanged={() => setRelationshipRefresh((value) => value + 1)} /></Suspense>",
    'relationship manager',
)

replace_once(
    "              {adminTab === 'edits' && <Suspense fallback={<LazyPanelFallback />}><Phase3AdminQueue active={adminTab === 'edits' && canModerate} isAdmin={isAdmin} onChanged={loadCommunityData} /></Suspense>}",
    "              {adminTab === 'edits' && <>\n                <Suspense fallback={<LazyPanelFallback />}><Phase3AdminQueue active={adminTab === 'edits' && canModerate} isAdmin={isAdmin} onChanged={loadCommunityData} /></Suspense>\n                {isAdmin && <Suspense fallback={<LazyPanelFallback />}><RelationshipChangeQueue active={adminTab === 'edits'} onChanged={() => { setRelationshipRefresh((value) => value + 1); void loadCommunityData() }} /></Suspense>}\n              </>}",
    'relationship admin queue',
)

replace_once(
    "{approvedEvents.length ? <div className=\"nasab-event-list\">{approvedEvents.slice(0, 4).map((item) => <div className=\"nasab-event-item\" key={item.id}><span className=\"nasab-event-date\">{formatDate(item.event_date)}</span><div><h3>{item.title}</h3><p>{eventLabels[item.event_type] || item.event_type} · {item.location_name || familyName(item.families) || 'المكان غير محدد'}</p></div></div>)}</div>",
    "{approvedEvents.length ? <div className=\"nasab-event-list\">{approvedEvents.slice(0, 4).map((item) => <div className=\"nasab-event-item\" key={item.id}><span className=\"nasab-event-date\">{formatDate(item.event_date)}</span><div><h3>{item.title}</h3><p>{eventLabels[item.event_type] || item.event_type} · {item.location_name || familyName(item.families) || 'المكان غير محدد'}</p>{item.mentions?.length ? <div className=\"event-mention-chips\">{item.mentions.map((mention) => { const id = personId(mention.people); const name = personName(mention.people); return name ? <button className=\"event-mention-chip\" type=\"button\" key={`${item.id}-${id}-${mention.participant_role}`} onClick={() => id && void openPersonById(id)}>@ {name}</button> : null })}</div> : null}</div></div>)}</div>",
    'home feed mentions',
)

app_path.write_text(app, encoding='utf-8')
print('Finalized six social feature integration.')
