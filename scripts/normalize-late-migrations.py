from pathlib import Path

old_path = Path('supabase/migrations/202608070021_relationship_edit_delete_requests.sql')
new_path = Path('supabase/migrations/202608070023_relationship_edit_delete_requests.sql')

if old_path.exists() and not new_path.exists():
    old_path.rename(new_path)
    print(f'Renamed {old_path.name} -> {new_path.name}')
elif old_path.exists() and new_path.exists():
    old_path.unlink()
    print(f'Removed duplicate {old_path.name}')
else:
    print('Relationship migration numbering already normalized')

component = Path('src/components/DirectRelationshipManager.tsx')
if component.exists():
    text = component.read_text(encoding='utf-8')
    text = text.replace('migration رقم 021 لتفعيل تعديل وحذف صلات القرابة', 'migration رقم 023 لتفعيل تعديل وحذف صلات القرابة')
    component.write_text(text, encoding='utf-8')

sync = Path('scripts/sync-setup-latest.mjs')
if sync.exists():
    text = sync.read_text(encoding='utf-8')
    old = "  'supabase/migrations/202608070022_admin_contributor_stats_and_link_integrity.sql',\n"
    new = old + "  'supabase/migrations/202608070023_relationship_edit_delete_requests.sql',\n"
    if '202608070023_relationship_edit_delete_requests.sql' not in text and old in text:
        text = text.replace(old, new, 1)
    sync.write_text(text, encoding='utf-8')
