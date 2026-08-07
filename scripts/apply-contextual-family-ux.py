from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"Missing anchor for {label}")
    return text.replace(old, new, 1)


app_path = Path('src/App.tsx')
app = app_path.read_text(encoding='utf-8')

app = replace_once(
    app,
    "const FamilyMembersPanel = lazy(() => import('./components/FamilyMembersPanel'))\n",
    "const FamilyMembersPanel = lazy(() => import('./components/FamilyMembersPanel'))\nconst PersonFamilyOverview = lazy(() => import('./components/PersonFamilyOverview'))\nconst FamilyQuickAddPerson = lazy(() => import('./components/FamilyQuickAddPerson'))\n",
    'lazy family components',
)

app = replace_once(
    app,
    "import { PersonVerifiedBadge } from './components/VerifiedBadge'\n",
    "import { PersonVerifiedBadge } from './components/VerifiedBadge'\nimport EventShareButton from './components/EventShareButton'\n",
    'event share import',
)

family_old = "            <Suspense fallback={<LazyPanelFallback />}><FamilyMembersPanel familyId={selectedFamily.id} people={approvedPeople} onOpenPerson={(id) => void openPersonById(id)} /></Suspense>"
family_new = """            <Suspense fallback={<LazyPanelFallback />}>
              <FamilyQuickAddPerson
                familyId={selectedFamily.id}
                familyName={selectedFamily.name}
                sessionUserId={session?.user.id}
                isAdmin={isAdmin}
                onOpenPerson={(id) => void openPersonById(id)}
                onChanged={async () => { setRelationshipRefresh((value) => value + 1); await loadCommunityData() }}
              />
            </Suspense>
            <Suspense fallback={<LazyPanelFallback />}><FamilyMembersPanel key={`${selectedFamily.id}-${relationshipRefresh}`} familyId={selectedFamily.id} people={approvedPeople} onOpenPerson={(id) => void openPersonById(id)} /></Suspense>"""
app = replace_once(app, family_old, family_new, 'family quick add')

if 'person-detail-quick-actions' in app:
    app, count = re.subn(
        r'\n\s*\{session && <div className="person-detail-quick-actions".*?\n\s*</div>\}\n\s*<div className="detail-facts">',
        '\n            <div className="detail-facts">',
        app,
        count=1,
        flags=re.S,
    )
    if count != 1:
        raise SystemExit('Could not simplify old person quick actions')

person_fact_anchor = """            {isAdmin && <div className="relationship-sync-card">"""
person_overview = """            <Suspense fallback={<LazyPanelFallback />}>
              <PersonFamilyOverview
                key={`${selectedPerson.id}-${relationshipRefresh}`}
                personId={selectedPerson.id}
                personName={selectedPerson.full_name}
                personGender={selectedPerson.gender}
                primaryFamilyId={selectedPerson.family_id}
                sessionUserId={session?.user.id}
                isAdmin={isAdmin}
                onOpenPerson={(id) => void openPersonById(id)}
                onChanged={() => setRelationshipRefresh((value) => value + 1)}
              />
            </Suspense>
            {isAdmin && <div className="relationship-sync-card">"""
app = replace_once(app, person_fact_anchor, person_overview, 'person family overview')

home_share_anchor = """                      <small>{item.location_name || familyName(item.families) || 'المكان غير محدد'}</small>
                      <RecordEditButton"""
home_share = """                      <small>{item.location_name || familyName(item.families) || 'المكان غير محدد'}</small>
                      <EventShareButton compact event={{ id: item.id, event_type: item.event_type, title: item.title, description: item.description, event_date: item.event_date, location_name: item.location_name, family_name: familyName(item.families) || null, people: (item.mentions ?? []).map((mention) => personName(mention.people)).filter(Boolean) }} />
                      <RecordEditButton"""
app = replace_once(app, home_share_anchor, home_share, 'home event sharing')

app_path.write_text(app, encoding='utf-8')

news_path = Path('src/components/NewsScreen.tsx')
news = news_path.read_text(encoding='utf-8')
news = replace_once(
    news,
    "import RecordEditButton from './RecordEditButton'\n",
    "import RecordEditButton from './RecordEditButton'\nimport EventShareButton from './EventShareButton'\n",
    'news share import',
)

news_old = """                    <div className="news-admin-edit">
                      <RecordEditButton
                        entityType="events"
                        recordId={item.id}
                        createdBy={item.created_by}
                        sessionUserId={sessionUserId}
                        isAdmin={isAdmin}
                        initialData={{
                          event_type: item.event_type,
                          title: item.title,
                          family_id: item.family_id,
                          event_date: item.event_date,
                          location_name: item.location_name,
                          description: item.description,
                        }}
                        onSaved={() => loadPage(0, false)}
                      />
                    </div>"""
news_new = """                    <div className="news-card-actions">
                      <EventShareButton event={{ id: item.id, event_type: item.event_type, title: item.title, description: item.description, event_date: item.event_date, location_name: item.location_name, family_name: family || null, people: (item.mentions ?? []).map((mention) => personName(mention.people)).filter(Boolean) }} />
                      <div className="news-admin-edit">
                        <RecordEditButton
                          entityType="events"
                          recordId={item.id}
                          createdBy={item.created_by}
                          sessionUserId={sessionUserId}
                          isAdmin={isAdmin}
                          initialData={{
                            event_type: item.event_type,
                            title: item.title,
                            family_id: item.family_id,
                            event_date: item.event_date,
                            location_name: item.location_name,
                            description: item.description,
                          }}
                          onSaved={() => loadPage(0, false)}
                        />
                      </div>
                    </div>"""
news = replace_once(news, news_old, news_new, 'news event share action')
news_path.write_text(news, encoding='utf-8')

main_path = Path('src/main.tsx')
main = main_path.read_text(encoding='utf-8')
main = replace_once(
    main,
    "import './home-news-preview.css'\n",
    "import './home-news-preview.css'\nimport './family-context-ux.css'\n",
    'context UX CSS import',
)
main_path.write_text(main, encoding='utf-8')

print('Contextual family UX integrated successfully.')
