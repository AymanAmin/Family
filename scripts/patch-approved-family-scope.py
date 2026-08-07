from pathlib import Path

path = Path('src/components/AdminUserRoles.tsx')
text = path.read_text(encoding='utf-8')
before = '<FamilyPicker label="اختر عائلة لإضافتها إلى نطاقه" value={scopeFamilyId} onChange={setScopeFamilyId} required />'
after = '<FamilyPicker label="اختر عائلة لإضافتها إلى نطاقه" value={scopeFamilyId} onChange={setScopeFamilyId} required approvedOnly />'
if before in text:
    text = text.replace(before, after, 1)
elif after not in text:
    raise RuntimeError('Family scope picker marker not found')
path.write_text(text, encoding='utf-8')
print('Family moderator scope picker now uses approved families only.')
