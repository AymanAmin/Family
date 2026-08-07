from pathlib import Path

app_path = Path('src/App.tsx')
main_path = Path('src/main.tsx')
app = app_path.read_text(encoding='utf-8')
main = main_path.read_text(encoding='utf-8')


def replace_once(before: str, after: str, label: str):
    global app
    if before in app:
        app = app.replace(before, after, 1)
        return
    if after in app:
        return
    raise RuntimeError(f'Marker not found: {label}')

replace_once(
    "const AdminUserRoles = lazy(() => import('./components/AdminUserRoles'))",
    "const AdminUserRoles = lazy(() => import('./components/AdminUserRoles'))\nconst AdminContributorStats = lazy(() => import('./components/AdminContributorStats'))",
    'lazy stats import',
)

replace_once(
    "type AdminTab = 'requests' | 'edits' | 'users'",
    "type AdminTab = 'requests' | 'edits' | 'activity' | 'users'",
    'admin tab type',
)

replace_once(
    "              {profile?.is_primary_admin && <button type=\"button\" role=\"tab\" aria-selected={adminTab === 'users'} className={adminTab === 'users' ? 'active' : ''} onClick={() => setAdminTab('users')}>المستخدمون</button>}",
    "              {profile?.is_primary_admin && <button type=\"button\" role=\"tab\" aria-selected={adminTab === 'activity'} className={adminTab === 'activity' ? 'active' : ''} onClick={() => setAdminTab('activity')}>النشاط والإحصائيات</button>}\n              {profile?.is_primary_admin && <button type=\"button\" role=\"tab\" aria-selected={adminTab === 'users'} className={adminTab === 'users' ? 'active' : ''} onClick={() => setAdminTab('users')}>المستخدمون</button>}",
    'activity tab',
)

replace_once(
    "              {adminTab === 'users' && profile?.is_primary_admin && <Suspense fallback={<LazyPanelFallback />}><AdminUserRoles active={adminTab === 'users'} currentUserId={session?.user.id} /></Suspense>}",
    "              {adminTab === 'activity' && profile?.is_primary_admin && <Suspense fallback={<LazyPanelFallback />}><AdminContributorStats active={adminTab === 'activity'} /></Suspense>}\n              {adminTab === 'users' && profile?.is_primary_admin && <Suspense fallback={<LazyPanelFallback />}><AdminUserRoles active={adminTab === 'users'} currentUserId={session?.user.id} /></Suspense>}",
    'activity panel',
)

if "import './contributor-stats.css'" not in main:
    main = main.replace("import './social-verification-events.css'", "import './social-verification-events.css'\nimport './relationship-manager.css'\nimport './contributor-stats.css'")

app_path.write_text(app, encoding='utf-8')
main_path.write_text(main, encoding='utf-8')
print('Integrated contributor statistics into primary admin console.')
