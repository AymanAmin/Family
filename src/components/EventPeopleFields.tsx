import PeoplePicker from './PeoplePicker'

type Props = {
  eventType: string
  primaryPersonId: string
  secondaryPersonId: string
  onPrimaryChange: (id: string) => void
  onSecondaryChange: (id: string) => void
}

export function eventParticipantPayload(eventType: string, primaryPersonId: string, secondaryPersonId: string) {
  const rows: { person_id: string; role: string }[] = []
  if (eventType === 'wedding') {
    if (primaryPersonId) rows.push({ person_id: primaryPersonId, role: 'spouse_1' })
    if (secondaryPersonId) rows.push({ person_id: secondaryPersonId, role: 'spouse_2' })
  } else if (eventType === 'death') {
    if (primaryPersonId) rows.push({ person_id: primaryPersonId, role: 'deceased' })
  } else if (eventType === 'graduation') {
    if (primaryPersonId) rows.push({ person_id: primaryPersonId, role: 'graduate' })
  } else if (eventType === 'birth') {
    if (primaryPersonId) rows.push({ person_id: primaryPersonId, role: 'newborn' })
  } else if (eventType === 'naming') {
    if (primaryPersonId) rows.push({ person_id: primaryPersonId, role: 'child' })
  } else {
    if (primaryPersonId) rows.push({ person_id: primaryPersonId, role: 'mentioned' })
    if (secondaryPersonId) rows.push({ person_id: secondaryPersonId, role: 'mentioned' })
  }
  return rows
}

export function eventParticipantsRequired(eventType: string) {
  return ['wedding', 'death', 'graduation', 'birth', 'naming'].includes(eventType)
}

export default function EventPeopleFields({ eventType, primaryPersonId, secondaryPersonId, onPrimaryChange, onSecondaryChange }: Props) {
  const knownSingle = ['death', 'graduation', 'birth', 'naming'].includes(eventType)
  const primaryLabel = eventType === 'wedding' ? 'الطرف الأول' : eventType === 'death' ? 'الشخص المتوفى' : eventType === 'graduation' ? 'الخريج / الخريجة' : eventType === 'birth' ? 'المولود' : eventType === 'naming' ? 'الطفل' : 'الإشارة إلى شخص'
  const primaryRequired = eventParticipantsRequired(eventType)

  return (
    <section className="event-people-fields full">
      <div className="event-people-heading"><span>الإشارة إلى أفراد من المنصة</span><small>{eventType === 'wedding' ? 'اختر الشخصين المرتبطين بالمناسبة.' : knownSingle ? 'سيظهر الشخص داخل المناسبة كرابط مباشر إلى ملفه.' : 'اختياري — يمكنك الإشارة إلى شخص أو شخصين.'}</small></div>
      <div className="event-people-grid">
        <PeoplePicker label={primaryLabel} value={primaryPersonId} onChange={onPrimaryChange} excludeId={secondaryPersonId || undefined} required={primaryRequired} />
        {(eventType === 'wedding' || !knownSingle) && <PeoplePicker label={eventType === 'wedding' ? 'الطرف الثاني' : 'شخص آخر'} value={secondaryPersonId} onChange={onSecondaryChange} excludeId={primaryPersonId || undefined} required={eventType === 'wedding'} />}
      </div>
    </section>
  )
}
