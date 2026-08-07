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
    "const AdminUserRoles = lazy(() => import('./components/AdminUserRoles'))",
    "const AdminUserRoles = lazy(() => import('./components/AdminUserRoles'))\nconst MySubmissionActivity = lazy(() => import('./components/MySubmissionActivity'))",
    'lazy account activity',
)

marker = '''            <div className="account-status-card">
              <span className={`status ${profile?.linked_person_id ? 'approved' : ownLinkRequest?.status === 'pending' ? 'pending' : ''}`}>{profile?.linked_person_id ? 'مرتبط' : ownLinkRequest?.status === 'pending' ? 'قيد المراجعة' : 'غير مرتبط'}</span>
              <h2>{profile?.linked_person_id ? 'الحساب مرتبط بسجل شخص' : ownLinkRequest?.status === 'pending' ? 'طلب الربط قيد المراجعة' : 'اربط حسابك بسجلك داخل الدليل'}</h2>
              <p>{profile?.linked_person_id ? people.find((item) => item.id === profile.linked_person_id)?.full_name || 'تم اعتماد الربط.' : ownLinkRequest?.status === 'pending' ? `السجل المطلوب: ${personName(ownLinkRequest.people)}` : 'ابحث عن اسمك في الدليل وافتح ملف الشخص ثم اضغط «هذا أنا».'}</p>
              {!profile?.linked_person_id && ownLinkRequest?.status !== 'pending' && <button className="primary" type="button" onClick={() => setView('search')}>البحث عن سجلي</button>}
            </div>'''

after = marker + '''
            <Suspense fallback={<LazyPanelFallback />}>
              <MySubmissionActivity
                active={view === 'account'}
                role={profile?.role || 'member'}
                onOpenPerson={(id) => void openPersonById(id)}
                onOpenFamily={(id) => void openFamilyById(id)}
              />
            </Suspense>'''

app = replace_once(app, marker, after, 'account activity panel')

if "import './account-activity.css'" not in main:
    main = main.replace("import './role-management.css'", "import './role-management.css'\nimport './account-activity.css'")

app_path.write_text(app, encoding='utf-8')
main_path.write_text(main, encoding='utf-8')
print('Applied personal submission activity panel.')
