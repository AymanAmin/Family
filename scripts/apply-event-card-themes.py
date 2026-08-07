from pathlib import Path

app_path = Path('src/App.tsx')
text = app_path.read_text(encoding='utf-8')
original = text

if "import './event-card-themes.css'" not in text:
    marker = "import './nasab-inspired.css'\n"
    if marker not in text:
        raise SystemExit('Could not find App CSS import marker')
    text = text.replace(marker, marker + "import './event-card-themes.css'\n", 1)

text = text.replace("general: 'مناسبة عامة',", "general: 'خبر عائلي',", 1)

old_card = '<article className="event-card" key={item.id}>'
new_card = '<article className={`event-card event-type-${item.event_type}`} key={item.id}>'
if old_card in text:
    text = text.replace(old_card, new_card, 1)
elif new_card not in text:
    raise SystemExit('Could not find home event-card markup')

if text == original:
    print('App event theming already applied.')
else:
    app_path.write_text(text, encoding='utf-8')
    print('Applied event-specific in-app card themes.')
