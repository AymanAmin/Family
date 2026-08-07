from pathlib import Path

app_path = Path('src/App.tsx')
css_path = Path('src/nasab-inspired.css')

text = app_path.read_text(encoding='utf-8')

home_grid_start = text.find('            <section className="home-content-grid">')
if home_grid_start == -1:
    if 'home-content-grid home-tree-only' in text and '>كل الأخبار</button>' in text:
        print('Home news layout is already applied.')
        raise SystemExit(0)
    raise SystemExit('Could not find the current home content grid.')

hero_start = text.find('            <section className="hero-panel">', home_grid_start)
if hero_start == -1:
    raise SystemExit('Could not find the hero panel after the home content grid.')

home_grid_block = text[home_grid_start:hero_start]
tree_start = home_grid_block.find('              <article className="family-tree-preview">')
section_close = home_grid_block.rfind('            </section>')
if tree_start == -1 or section_close == -1:
    raise SystemExit('Could not isolate the family tree preview.')

tree_article = home_grid_block[tree_start:section_close].rstrip() + '\n'
new_tree_block = (
    '            <section className="home-content-grid home-tree-only">\n'
    + tree_article
    + '            </section>\n'
)

lower_news_start = text.find('            <section className="section-block soft">', hero_start)
if lower_news_start == -1:
    raise SystemExit('Could not find the lower approved-events news section.')

home_fragment_end = text.find('\n          </>\n        )}', lower_news_start)
if home_fragment_end == -1:
    raise SystemExit('Could not find the end of the home view.')

lower_news_block = text[lower_news_start:home_fragment_end].rstrip() + '\n'
old_heading = '<div className="section-title"><div><span className="eyebrow">آخر الأخبار</span><h2>المناسبات المعتمدة</h2></div></div>'
new_heading = '<div className="section-title"><div><span className="eyebrow">آخر الأخبار</span><h2>المناسبات المعتمدة</h2></div><button className="text-link" type="button" onClick={() => setView(\'news\')}>كل الأخبار</button></div>'
if old_heading not in lower_news_block:
    raise SystemExit('Could not find the lower news heading.')

promoted_news_block = lower_news_block.replace(old_heading, new_heading, 1)

# Remove the old lower copy first, then replace the old compact upper feed with
# the promoted card-based news section and keep the tree preview below it.
text = text[:lower_news_start] + text[home_fragment_end:]
text = text.replace(home_grid_block, promoted_news_block + '\n' + new_tree_block + '\n', 1)

app_path.write_text(text, encoding='utf-8')

css = css_path.read_text(encoding='utf-8')
if '.home-content-grid.home-tree-only' not in css:
    anchor = '''.home-content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(280px, .7fr);
  gap: 18px;
  padding: 0 18px 50px;
}
'''
    addition = anchor + '''\n.home-content-grid.home-tree-only {
  grid-template-columns: minmax(0, 1fr);
}
'''
    if anchor not in css:
        raise SystemExit('Could not find the home-content-grid CSS rule.')
    css = css.replace(anchor, addition, 1)
    css_path.write_text(css, encoding='utf-8')

print('Promoted the approved-events news cards to the top of the home page, added the all-news button, and removed the old compact news feed.')
