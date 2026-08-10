import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import '../admin-person-attribution.css'

type Props = {
  active: boolean
  personId: string
}

type Attribution = {
  user_id: string | null
  display_name: string
  email: string | null
  role: string
  created_at: string
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium' }).format(new Date(value))
}

export default function AdminPersonAttribution({ active, personId }: Props) {
  const [row, setRow] = useState<Attribution | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!active || !supabase || !personId) {
      setRow(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setRow(null)

    void supabase
      .rpc('get_admin_person_creator_attribution', { p_person_id: personId })
      .then(({ data, error }) => {
        if (cancelled) return
        setLoading(false)
        if (error) {
          setRow(null)
          return
        }
        const first = Array.isArray(data) ? data[0] : null
        setRow((first as Attribution | undefined) ?? null)
      })

    return () => {
      cancelled = true
    }
  }, [active, personId])

  if (!active) return null

  return (
    <aside className="admin-person-attribution" aria-label="معلومة إدارية عن إضافة الشخص">
      <span className="admin-person-attribution-icon" aria-hidden="true">✓</span>
      <div className="admin-person-attribution-copy">
        <span>للمدراء فقط</span>
        {loading ? (
          <strong>جارٍ قراءة سجل الإضافة…</strong>
        ) : row ? (
          <strong>أضيف بواسطة <b>{row.display_name}</b></strong>
        ) : (
          <strong>تعذر تحديد مُضيف السجل</strong>
        )}
      </div>
      {row && <time dateTime={row.created_at}>{formatDate(row.created_at)}</time>}
    </aside>
  )
}
