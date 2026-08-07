from pathlib import Path

app_path = Path('src/App.tsx')
css_path = Path('src/relationship-manager.css')

app = app_path.read_text(encoding='utf-8')

state_anchor = "  const [relationshipRefresh, setRelationshipRefresh] = useState(0)\n  const [ownLinkRequest, setOwnLinkRequest] = useState<AccountLinkRequest | null>(null)"
state_replacement = "  const [relationshipRefresh, setRelationshipRefresh] = useState(0)\n  const [relationshipSyncBusy, setRelationshipSyncBusy] = useState(false)\n  const [ownLinkRequest, setOwnLinkRequest] = useState<AccountLinkRequest | null>(null)"
if 'relationshipSyncBusy' not in app:
    if state_anchor not in app:
        raise SystemExit('Could not find relationship refresh state anchor')
    app = app.replace(state_anchor, state_replacement, 1)

function_anchor = "  async function submitRelationship(event: FormEvent<HTMLFormElement>) {"
function_block = """  async function resyncSelectedPersonRelationships() {
    if (!supabase || !selectedPerson || !isAdmin) return

    setRelationshipSyncBusy(true)
    const { data, error } = await supabase.rpc('resync_person_relationships', {
      p_person_id: selectedPerson.id,
    })
    setRelationshipSyncBusy(false)

    if (error) {
      if (error.message.toLowerCase().includes('does not exist')) {
        return showMessage('شغّل أحدث ملف supabase/SETUP.sql لتفعيل إعادة مزامنة العلاقات.', 'error')
      }
      return showMessage(friendlyError(error.message), 'error')
    }

    const summary = Array.isArray(data) ? data[0] : data
    const directCount = Number(summary?.direct_relationship_count ?? 0)
    const smartCount = Number(summary?.smart_relationship_count ?? 0)
    const extendedCount = Number(summary?.extended_relationship_count ?? 0)
    const removedCount = Number(summary?.removed_invalid_count ?? 0)

    setRelationshipRefresh((value) => value + 1)
    showMessage(
      `تمت إعادة مزامنة علاقات ${selectedPerson.full_name}: ${directCount} علاقة مباشرة، ${smartCount} علاقة في الشبكة الأساسية، ${extendedCount} علاقة ممتدة${removedCount ? `، وتم تنظيف ${removedCount} سجل غير صالح أو مكرر` : ''}.`,
      'success',
    )
  }

"""
if 'async function resyncSelectedPersonRelationships()' not in app:
    if function_anchor not in app:
        raise SystemExit('Could not find submitRelationship function anchor')
    app = app.replace(function_anchor, function_block + function_anchor, 1)

membership_anchor = "            <PersonFamilyMemberships personId={selectedPerson.id} recordCreatedBy={selectedPerson.created_by} sessionUserId={session?.user.id} isAdmin={isAdmin} isLinkedPerson={profile?.linked_person_id === selectedPerson.id} onChanged={async () => { await loadCommunityData(); await openPersonById(selectedPerson.id) }} />"
sync_card = """            {isAdmin && <div className=\"relationship-sync-card\">
              <div className=\"relationship-sync-copy\"><span className=\"relationship-sync-icon\" aria-hidden=\"true\">↻</span><div><strong>إعادة مزامنة العلاقات</strong><small>يعيد فحص علاقات هذا الفرد مع جميع الأشخاص، وينظف التكرار غير الصالح، ثم يبني القرابات المستنتجة من جديد.</small></div></div>
              <button className=\"secondary relationship-sync-button\" type=\"button\" disabled={relationshipSyncBusy} onClick={() => void resyncSelectedPersonRelationships()}>{relationshipSyncBusy ? 'جارٍ المزامنة…' : 'إعادة المزامنة'}</button>
            </div>}
"""
if 'relationship-sync-card' not in app:
    if membership_anchor not in app:
        raise SystemExit('Could not find person memberships anchor')
    app = app.replace(membership_anchor, sync_card + membership_anchor, 1)

manager_anchor = '<DirectRelationshipManager personId={selectedPerson.id}'
manager_replacement = '<DirectRelationshipManager key={`${selectedPerson.id}-${relationshipRefresh}`} personId={selectedPerson.id}'
if manager_replacement not in app:
    if manager_anchor not in app:
        raise SystemExit('Could not find DirectRelationshipManager anchor')
    app = app.replace(manager_anchor, manager_replacement, 1)

app_path.write_text(app, encoding='utf-8')

css = css_path.read_text(encoding='utf-8')
css_block = r'''

/* Per-person relationship integrity / rebuild action */
.relationship-sync-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin: 18px 0;
  padding: 16px 18px;
  border: 1px solid rgba(15, 118, 110, 0.16);
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(15, 118, 110, 0.07), rgba(255, 255, 255, 0.94));
}

.relationship-sync-copy {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.relationship-sync-copy > div {
  display: grid;
  gap: 4px;
}

.relationship-sync-copy strong {
  font-size: 0.98rem;
}

.relationship-sync-copy small {
  color: var(--muted, #64748b);
  line-height: 1.7;
}

.relationship-sync-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  border-radius: 14px;
  background: rgba(15, 118, 110, 0.12);
  font-size: 1.45rem;
  font-weight: 800;
}

.relationship-sync-button {
  flex: 0 0 auto;
  white-space: nowrap;
}

@media (max-width: 720px) {
  .relationship-sync-card {
    align-items: stretch;
    flex-direction: column;
    gap: 14px;
    padding: 15px;
  }

  .relationship-sync-button {
    width: 100%;
  }
}
'''
if '/* Per-person relationship integrity / rebuild action */' not in css:
    css = css.rstrip() + css_block + '\n'
    css_path.write_text(css, encoding='utf-8')

print('Applied person relationship resync UI patch.')
