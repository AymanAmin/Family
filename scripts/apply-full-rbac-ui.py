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
    "  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'",
    "  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'\n  const canModerate = profile?.role === 'family_moderator' || profile?.role === 'content_moderator' || isAdmin",
    'moderation capability',
)

app = replace_once(
    app,
    "    if (!supabase || !isAdmin) {",
    "    if (!supabase || !canModerate) {",
    'pending capability guard',
)
app = replace_once(app, "  }, [isAdmin])\n\n  useEffect(() => {", "  }, [canModerate])\n\n  useEffect(() => {", 'pending callback dependency')

old_moderate = '''  async function moderate(record: PendingRecord, status: 'approved' | 'rejected') {
    if (!supabase || !session || !isAdmin) return
    setBusy(true)

    const result = record.table === 'account_link_requests'
      ? await supabase.rpc('review_account_link_request', { p_request_id: record.id, p_status: status })
      : await supabase
          .from(record.table)
          .update({ status, approved_by: session.user.id, approved_at: status === 'approved' ? new Date().toISOString() : null })
          .eq('id', record.id)

    setBusy(false)
    if (result.error) return showMessage(friendlyError(result.error.message), 'error')
    showMessage(status === 'approved' ? 'تم اعتماد السجل.' : 'تم رفض السجل.', 'success')
    await loadCommunityData()
    await loadProfile(session)
    await loadPending()
  }'''

new_moderate = '''  async function moderate(record: PendingRecord, status: 'approved' | 'rejected') {
    if (!supabase || !session || !canModerate) return
    setBusy(true)

    let result = await supabase.rpc('review_pending_moderation_record', {
      p_table_name: record.table,
      p_record_id: record.id,
      p_status: status,
    })

    // Compatibility fallback for administrators until migration 017 is applied.
    if (result.error?.message.toLowerCase().includes('does not exist') && isAdmin) {
      result = record.table === 'account_link_requests'
        ? await supabase.rpc('review_account_link_request', { p_request_id: record.id, p_status: status })
        : await supabase
            .from(record.table)
            .update({ status, approved_by: session.user.id, approved_at: status === 'approved' ? new Date().toISOString() : null })
            .eq('id', record.id)
    }

    setBusy(false)
    if (result.error) return showMessage(friendlyError(result.error.message), 'error')
    showMessage(status === 'approved' ? 'تم اعتماد السجل.' : 'تم رفض السجل.', 'success')
    await loadCommunityData()
    await loadProfile(session)
    await loadPending()
  }'''

app = replace_once(app, old_moderate, new_moderate, 'secure moderation endpoint')

app = app.replace("{isAdmin && <button onClick={() => setView('admin')} className={view === 'admin' ? 'active' : ''}>الإدارة</button>}", "{canModerate && <button onClick={() => setView('admin')} className={view === 'admin' ? 'active' : ''}>الإدارة</button>}")
app = app.replace("{isAdmin ? <button type=\"button\" onClick={() => setView('admin')} className={view === 'admin' ? 'active' : ''}><span className=\"mobile-nav-icon\">▦</span><span>الإدارة</span></button> :", "{canModerate ? <button type=\"button\" onClick={() => setView('admin')} className={view === 'admin' ? 'active' : ''}><span className=\"mobile-nav-icon\">▦</span><span>الإدارة</span></button> :")

app = replace_once(
    app,
    "        {schemaReady && view === 'admin' && isAdmin && (",
    "        {schemaReady && view === 'admin' && canModerate && (",
    'admin view capability',
)

app = replace_once(
    app,
    "              {adminTab === 'edits' && <Suspense fallback={<LazyPanelFallback />}><Phase3AdminQueue active={adminTab === 'edits'} onChanged={loadCommunityData} /></Suspense>}",
    "              {adminTab === 'edits' && <Suspense fallback={<LazyPanelFallback />}><Phase3AdminQueue active={adminTab === 'edits' && canModerate} isAdmin={isAdmin} onChanged={loadCommunityData} /></Suspense>}",
    'secondary queue capability',
)

if "import './role-management.css'" not in main:
    main = main.replace("import './moderation-pagination.css'", "import './moderation-pagination.css'\nimport './role-management.css'")

app_path.write_text(app, encoding='utf-8')
main_path.write_text(main, encoding='utf-8')
print('Applied full RBAC capabilities to App.')
