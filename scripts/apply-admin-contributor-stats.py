from pathlib import Path

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
    "const DirectRelationshipEditor = lazy(() => import('./components/DirectRelationshipEditor'))",
    "const DirectRelationshipEditor = lazy(() => import('./components/DirectRelationshipEditor'))\nconst AdminContributorStats = lazy(() => import('./components/AdminContributorStats'))",
    'admin stats lazy import',
)

app = replace_once(
    app,
    "type AdminTab = 'requests' | 'edits' | 'users'",
    "type AdminTab = 'requests' | 'edits' | 'stats' | 'users'",
    'admin stats tab type',
)

old_tabs = '''              <button type="button" role="tab" aria-selected={adminTab === 'requests'} className={adminTab === 'requests' ? 'active' : ''} onClick={() => setAdminTab('requests')}>الطلبات <span>{pending.length}</span></button>
              <button type="button" role="tab" aria-selected={adminTab === 'edits'} className={adminTab === 'edits' ? 'active' : ''} onClick={() => setAdminTab('edits')}>التعديلات والانتماءات</button>
              {profile?.is_primary_admin && <button type="button" role="tab" aria-selected={adminTab === 'users'} className={adminTab === 'users' ? 'active' : ''} onClick={() => setAdminTab('users')}>المستخدمون</button>}'''
new_tabs = '''              <button type="button" role="tab" aria-selected={adminTab === 'requests'} className={adminTab === 'requests' ? 'active' : ''} onClick={() => setAdminTab('requests')}>الطلبات <span>{pending.length}</span></button>
              <button type="button" role="tab" aria-selected={adminTab === 'edits'} className={adminTab === 'edits' ? 'active' : ''} onClick={() => setAdminTab('edits')}>التعديلات والانتماءات</button>
              {isAdmin && <button type="button" role="tab" aria-selected={adminTab === 'stats'} className={adminTab === 'stats' ? 'active' : ''} onClick={() => setAdminTab('stats')}>نشاط المساهمين</button>}
              {profile?.is_primary_admin && <button type="button" role="tab" aria-selected={adminTab === 'users'} className={adminTab === 'users' ? 'active' : ''} onClick={() => setAdminTab('users')}>المستخدمون</button>}'''
app = replace_once(app, old_tabs, new_tabs, 'admin stats tab button')

marker = "              {adminTab === 'users' && profile?.is_primary_admin && <Suspense fallback={<LazyPanelFallback />}><AdminUserRoles active={adminTab === 'users'} currentUserId={session?.user.id} /></Suspense>}"
replacement = "              {adminTab === 'stats' && isAdmin && <Suspense fallback={<LazyPanelFallback />}><AdminContributorStats active={adminTab === 'stats'} /></Suspense>}\n" + marker
app = replace_once(app, marker, replacement, 'admin contributor stats panel')

if "import './admin-contributors.css'" not in main:
    main = main.replace("import './edit-review-diff.css'", "import './edit-review-diff.css'\nimport './admin-contributors.css'")

app_path.write_text(app, encoding='utf-8')
main_path.write_text(main, encoding='utf-8')
print('Integrated admin contributor rankings.')
