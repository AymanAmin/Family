import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import '../admin-backup.css'

type BackupFormat = 'json' | 'sql' | 'xlsx' | 'csv'
type BackupRow = Record<string, unknown>
type BackupSnapshot = {
  backup_version: number
  generated_at: string
  project_ref: string
  scope: string
  table_order: string[]
  row_counts: Record<string, number>
  total_rows: number
  tables: Record<string, BackupRow[]>
}

const LAST_BACKUP_KEY = 'family:last-full-backup-at'

const formatLabels: Record<BackupFormat, { title: string; extension: string; hint: string }> = {
  json: { title: 'JSON', extension: 'json', hint: 'الأفضل لحفظ نسخة كاملة قابلة للقراءة والمعالجة.' },
  sql: { title: 'SQL', extension: 'sql', hint: 'نسخة بيانات INSERT يمكن استخدامها عند الاسترجاع الفني.' },
  xlsx: { title: 'Excel', extension: 'xlsx', hint: 'ملف Excel؛ كل جدول في ورقة مستقلة مع Manifest.' },
  csv: { title: 'CSV ZIP', extension: 'zip', hint: 'ملف ZIP يحتوي CSV مستقلًا لكل جدول.' },
}

function safeDateForFile(value: string) {
  return value.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

function sqlIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'object') {
    const json = JSON.stringify(value).replace(/'/g, "''")
    return `'${json}'::jsonb`
  }
  return `'${String(value).replace(/'/g, "''")}'`
}

function buildSql(snapshot: BackupSnapshot) {
  const output = [
    '-- Family platform full application-data backup',
    `-- Generated: ${snapshot.generated_at}`,
    `-- Project: ${snapshot.project_ref}`,
    `-- Tables: ${snapshot.table_order.length}; Rows: ${snapshot.total_rows}`,
    '-- Restore note: this is a data-only backup. Supabase Auth users/passwords and Storage file bytes are not recreated by this file.',
    '-- Run restore only from Supabase SQL Editor / a privileged PostgreSQL session after reviewing the target database.',
    '',
    'BEGIN;',
    'SET LOCAL session_replication_role = replica;',
    '',
  ]

  for (const table of snapshot.table_order) {
    const rows = snapshot.tables[table] || []
    output.push(`-- ${table}: ${rows.length} rows`)
    if (!rows.length) {
      output.push('')
      continue
    }

    for (const row of rows) {
      const columns = Object.keys(row)
      const values = columns.map((column) => sqlLiteral(row[column]))
      output.push(`INSERT INTO public.${sqlIdentifier(table)} (${columns.map(sqlIdentifier).join(', ')}) VALUES (${values.join(', ')});`)
    }
    output.push('')
  }

  output.push('SET LOCAL session_replication_role = origin;', 'COMMIT;', '')
  return output.join('\n')
}

function csvValue(value: unknown) {
  let normalized = ''
  if (value === null || value === undefined) normalized = ''
  else if (typeof value === 'object') normalized = JSON.stringify(value)
  else normalized = String(value)
  return `"${normalized.replace(/"/g, '""')}"`
}

function buildCsv(rows: BackupRow[]) {
  if (!rows.length) return '\uFEFF'
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))]
  const lines = [columns.map(csvValue).join(',')]
  for (const row of rows) lines.push(columns.map((column) => csvValue(row[column])).join(','))
  return `\uFEFF${lines.join('\r\n')}`
}

function spreadsheetValue(value: unknown) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return value
}

function formatLocalDate(value: string | null) {
  if (!value) return 'لم يتم تسجيل نسخة من هذا الجهاز بعد'
  return new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export default function AdminBackup() {
  const [format, setFormat] = useState<BackupFormat>('json')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(() => localStorage.getItem(LAST_BACKUP_KEY))
  const [lastSummary, setLastSummary] = useState<{ tables: number; rows: number } | null>(null)

  const backupAgeDays = useMemo(() => {
    if (!lastBackupAt) return null
    return Math.floor((Date.now() - new Date(lastBackupAt).getTime()) / 86_400_000)
  }, [lastBackupAt])

  async function exportBackup() {
    if (!supabase || busy) return
    setBusy(true)
    setMessage('جارٍ جمع جميع جداول المنصة والتحقق من النسخة…')

    const { data, error } = await supabase.functions.invoke('admin-backup', { body: {} })
    if (error || !data) {
      setBusy(false)
      setMessage(error?.message || 'تعذر إنشاء النسخة الاحتياطية.')
      return
    }

    if (data.error) {
      setBusy(false)
      setMessage(String(data.error))
      return
    }

    const snapshot = data as BackupSnapshot
    const stamp = safeDateForFile(snapshot.generated_at)
    const baseName = `family-full-backup_${stamp}`

    try {
      if (format === 'json') {
        const json = JSON.stringify(snapshot, null, 2)
        downloadBlob(new Blob([json], { type: 'application/json;charset=utf-8' }), `${baseName}.json`)
      } else if (format === 'sql') {
        downloadBlob(new Blob([buildSql(snapshot)], { type: 'application/sql;charset=utf-8' }), `${baseName}.sql`)
      } else if (format === 'xlsx') {
        const XLSX = await import('xlsx')
        const workbook = XLSX.utils.book_new()
        const manifest = snapshot.table_order.map((table) => ({ table_name: table, row_count: snapshot.row_counts[table] || 0 }))
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(manifest), '_manifest')

        for (const table of snapshot.table_order) {
          const rows = snapshot.tables[table] || []
          const normalized = rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, spreadsheetValue(value)])))
          const sheet = normalized.length ? XLSX.utils.json_to_sheet(normalized) : XLSX.utils.aoa_to_sheet([['لا توجد بيانات']])
          XLSX.utils.book_append_sheet(workbook, sheet, table.slice(0, 31))
        }

        const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
        downloadBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${baseName}.xlsx`)
      } else {
        const { strToU8, zipSync } = await import('fflate')
        const files: Record<string, Uint8Array> = {}
        const manifestRows = snapshot.table_order.map((table) => ({ table_name: table, row_count: snapshot.row_counts[table] || 0 }))
        files['_manifest.csv'] = strToU8(buildCsv(manifestRows))
        for (const table of snapshot.table_order) files[`${table}.csv`] = strToU8(buildCsv(snapshot.tables[table] || []))
        const zipped = zipSync(files, { level: 6 })
        downloadBlob(new Blob([toArrayBuffer(zipped)], { type: 'application/zip' }), `${baseName}_csv.zip`)
      }

      localStorage.setItem(LAST_BACKUP_KEY, snapshot.generated_at)
      setLastBackupAt(snapshot.generated_at)
      setLastSummary({ tables: snapshot.table_order.length, rows: snapshot.total_rows })
      setMessage(`تم إنشاء النسخة: ${snapshot.table_order.length} جدولًا و${snapshot.total_rows.toLocaleString('ar-SA')} صفًا.`)
    } catch (exportError) {
      console.error('backup export failed', exportError)
      setMessage('تم جمع البيانات لكن تعذر إنشاء الملف المختار. جرّب JSON أو SQL.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="admin-backup-panel" aria-labelledby="admin-backup-title">
      <header className="admin-backup-heading">
        <div>
          <span className="eyebrow">حماية البيانات</span>
          <h2 id="admin-backup-title">نسخة احتياطية كاملة</h2>
          <p>تنشئ Snapshot لجميع بيانات المنصة الأساسية، بما فيها الأشخاص والعائلات وصلات القرابة والمناسبات والانتماءات والأنساب وطلبات الإدارة.</p>
        </div>
        <div className={`backup-freshness ${backupAgeDays !== null && backupAgeDays >= 7 ? 'stale' : ''}`}>
          <span>آخر نسخة من هذا الجهاز</span>
          <strong>{formatLocalDate(lastBackupAt)}</strong>
          {backupAgeDays !== null && <small>{backupAgeDays === 0 ? 'اليوم' : `منذ ${backupAgeDays.toLocaleString('ar-SA')} يوم`}</small>}
        </div>
      </header>

      <div className="backup-format-grid" role="radiogroup" aria-label="صيغة النسخة الاحتياطية">
        {(Object.keys(formatLabels) as BackupFormat[]).map((value) => {
          const item = formatLabels[value]
          return (
            <button key={value} type="button" role="radio" aria-checked={format === value} className={format === value ? 'active' : ''} onClick={() => setFormat(value)}>
              <strong>{item.title}</strong>
              <span>{item.hint}</span>
              <small>.{item.extension}</small>
            </button>
          )
        })}
      </div>

      <div className="backup-security-note">
        <strong>نسخة حساسة</strong>
        <span>قد تحتوي على بريد المستخدمين وبيانات إدارية ومفاتيح اشتراكات الإشعارات. احفظ الملف في مكان خاص وآمن ولا تشاركه علنًا.</span>
      </div>

      <div className="backup-actions">
        <button type="button" className="primary backup-download-button" disabled={busy} onClick={() => void exportBackup()}>
          {busy ? 'جارٍ إنشاء النسخة…' : `تنزيل نسخة ${formatLabels[format].title}`}
        </button>
        <div className="backup-result" aria-live="polite">
          {message || 'يوصى بحفظ نسخة خارجية دورية، وJSON أو SQL هما الأنسب للاسترجاع الكامل.'}
          {lastSummary && <small>آخر ملف: {lastSummary.tables} جدولًا · {lastSummary.rows.toLocaleString('ar-SA')} صفًا</small>}
        </div>
      </div>
    </section>
  )
}
