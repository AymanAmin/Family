import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type Person = {
  id: string
  full_name: string
  birth_year: number | null
  is_deceased: boolean
}

type Props = {
  familyId: string
  people: Person[]
  onOpenPerson: (personId: string) => void
}

const labels: Record<string, string> = {
  birth: 'بالنسب / عائلة الأصل',
  marriage: 'بالزواج',
  paternal: 'من جهة الأب',
  maternal: 'من جهة الأم',
  guardian: 'وصاية أو كفالة',
  other: 'انتماء آخر',
}

type Membership = {
  id: string
  person_id: string
  membership_type: string
  is_primary: boolean
}

export default function FamilyMembersPanel({ familyId, people, onOpenPerson }: Props) {
  const [memberships, setMemberships] = useState<Membership[]>([])

  useEffect(() => {
    if (!supabase) return
    void supabase
      .from('person_family_memberships')
      .select('id,person_id,membership_type,is_primary')
      .eq('family_id', familyId)
      .eq('status', 'approved')
      .then(({ data }) => setMemberships((data ?? []) as Membership[]))
  }, [familyId])

  const rows = useMemo(() => {
    const personMap = new Map(people.map((person) => [person.id, person]))
    return memberships.flatMap((membership) => {
      const person = personMap.get(membership.person_id)
      return person ? [{ person, membership }] : []
    })
  }, [memberships, people])

  return (
    <div className="detail-section">
      <div className="section-title"><div><span className="eyebrow">كل المنتمين للعائلة</span><h2>الأفراد حسب النسب والزواج والفروع</h2></div></div>
      <div className="detail-list">
        {rows.length ? rows.map(({ person, membership }) => (
          <button className="list-row interactive-row" type="button" key={membership.id} onClick={() => onOpenPerson(person.id)}>
            <span className="avatar-letter">{person.full_name[0]}</span>
            <div><strong>{person.full_name}</strong><small>{labels[membership.membership_type] || membership.membership_type}{membership.is_primary ? ' · أساسية' : ''}{person.is_deceased ? ' · متوفى' : ''}</small></div>
            <span>‹</span>
          </button>
        )) : <div className="empty-state compact">لا توجد عضويات عائلية معتمدة لهذه العائلة بعد.</div>}
      </div>
    </div>
  )
}
