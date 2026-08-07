from pathlib import Path

path = Path('supabase/migrations/202608070017_full_role_scopes_and_moderation.sql')
text = path.read_text(encoding='utf-8')
text = text.replace("if private.active_role(auth.uid()) not in ('admin', 'super_admin') then", "if coalesce(private.active_role(auth.uid()), '') not in ('admin', 'super_admin') then")
text = text.replace("if v_role not in ('family_moderator', 'content_moderator', 'admin', 'super_admin') then", "if coalesce(v_role, '') not in ('family_moderator', 'content_moderator', 'admin', 'super_admin') then")
text = text.replace("if v_role not in ('family_moderator','content_moderator','admin','super_admin') then", "if coalesce(v_role, '') not in ('family_moderator','content_moderator','admin','super_admin') then")
path.write_text(text, encoding='utf-8')
print('Hardened phase 13 role authorization against NULL roles.')
