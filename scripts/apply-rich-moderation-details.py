from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if new in text:
        return
    if old not in text:
        raise SystemExit(f'Expected integration point not found in {path}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


app = 'src/App.tsx'
replace_once(
    app,
    "import EventShareButton from './components/EventShareButton'\n",
    "import EventShareButton from './components/EventShareButton'\nimport ModerationRequestDetails from './components/ModerationRequestDetails'\n",
)

old_pending = "{pending.length ? <div className=\"review-list\">{pending.map((record) => <article className=\"review-row\" key={`${record.table}-${record.id}`}><div><span className=\"status pending\">معلق</span><h3>{record.title}</h3><p>{record.subtitle} · {formatDate(record.created_at)}</p></div><div className=\"review-actions\"><button className=\"approve\" onClick={() => moderate(record, 'approved')} disabled={busy}>اعتماد</button><button className=\"reject\" onClick={() => moderate(record, 'rejected')} disabled={busy}>رفض</button></div></article>)}</div> : <div className=\"empty-state\"><strong>لا توجد طلبات معلقة</strong><span>جميع الطلبات الأساسية تمت مراجعتها.</span></div>}"
new_pending = """{pending.length ? <div className=\"review-list\">{pending.map((record) => <article className=\"review-row moderation-rich-row\" key={`${record.table}-${record.id}`}>
                    <div><span className=\"status pending\">معلق</span><h3>{record.title}</h3><p>{record.subtitle} · {formatDate(record.created_at)}</p></div>
                    <ModerationRequestDetails requestType={record.table} requestId={record.id} />
                    <div className=\"review-actions\"><button className=\"approve\" onClick={() => moderate(record, 'approved')} disabled={busy}>اعتماد</button><button className=\"reject\" onClick={() => moderate(record, 'rejected')} disabled={busy}>رفض</button></div>
                  </article>)}</div> : <div className=\"empty-state\"><strong>لا توجد طلبات معلقة</strong><span>جميع الطلبات الأساسية تمت مراجعتها.</span></div>}"""
replace_once(app, old_pending, new_pending)

phase = 'src/components/Phase3AdminQueue.tsx'
replace_once(
    phase,
    "import EditRequestDiff from './EditRequestDiff'\n",
    "import EditRequestDiff from './EditRequestDiff'\nimport ModerationRequestDetails from './ModerationRequestDetails'\n",
)
replace_once(
    phase,
    "                <div className=\"review-actions secondary-review-actions\">\n",
    "                <ModerationRequestDetails requestType={item.request_type} requestId={item.id} />\n                <div className=\"review-actions secondary-review-actions\">\n",
)

relationship = 'src/components/RelationshipChangeQueue.tsx'
replace_once(
    relationship,
    "import { supabase } from '../lib/supabase'\n",
    "import { supabase } from '../lib/supabase'\nimport ModerationRequestDetails from './ModerationRequestDetails'\n",
)
old_relationship_row = "{rows.map((item) => <article className=\"review-row\" key={item.id}><div><span className={`status ${item.action === 'delete' ? 'danger-status' : 'pending'}`}>{item.action === 'delete' ? 'حذف' : 'تعديل'}</span><h3>{item.title}</h3><p>{item.subtitle}</p></div><div className=\"review-actions\"><button className=\"approve\" disabled={busyId===item.id} onClick={() => void review(item,'approved')}>اعتماد</button><button className=\"reject\" disabled={busyId===item.id} onClick={() => void review(item,'rejected')}>رفض</button></div></article>)}"
new_relationship_row = """{rows.map((item) => <article className=\"review-row moderation-rich-row\" key={item.id}>
          <div><span className={`status ${item.action === 'delete' ? 'danger-status' : 'pending'}`}>{item.action === 'delete' ? 'حذف' : 'تعديل'}</span><h3>{item.title}</h3><p>{item.subtitle}</p></div>
          <ModerationRequestDetails requestType=\"relationship_change\" requestId={item.id} />
          <div className=\"review-actions\"><button className=\"approve\" disabled={busyId===item.id} onClick={() => void review(item,'approved')}>اعتماد</button><button className=\"reject\" disabled={busyId===item.id} onClick={() => void review(item,'rejected')}>رفض</button></div>
        </article>)}"""
replace_once(relationship, old_relationship_row, new_relationship_row)
