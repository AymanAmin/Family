from pathlib import Path

path = Path('src/App.tsx')
text = path.read_text(encoding='utf-8')


def replace_once(source: str, before: str, after: str, label: str) -> str:
    if before not in source:
        if after in source:
            return source
        raise RuntimeError(f'Marker not found: {label}')
    return source.replace(before, after, 1)

text = replace_once(
    text,
    '''type CommunityEvent = {
  id: string
  event_type: string
  title: string
  description: string | null
  event_date: string | null
  location_name: string | null
  status: RecordStatus
  family_id: string | null
  families?: RelatedFamily
  created_by: string
  created_at: string
}''',
    '''type EventPersonMention = {
  event_id: string
  participant_role: string
  people?: RelatedPerson
}

type CommunityEvent = {
  id: string
  event_type: string
  title: string
  description: string | null
  event_date: string | null
  location_name: string | null
  status: RecordStatus
  family_id: string | null
  families?: RelatedFamily
  mentions?: EventPersonMention[]
  created_by: string
  created_at: string
}''',
    'event mention type',
)

text = replace_once(
    text,
    '''    setSchemaReady(true)
    setFamilies((familyResult.data ?? []) as Family[])
    setPeople((peopleResult.data ?? []) as Person[])
    setEvents((eventResult.data ?? []) as CommunityEvent[])''',
    '''    setSchemaReady(true)
    setFamilies((familyResult.data ?? []) as Family[])
    setPeople((peopleResult.data ?? []) as Person[])

    const baseEvents = (eventResult.data ?? []) as CommunityEvent[]
    let hydratedEvents = baseEvents
    const eventIds = baseEvents.map((item) => item.id)
    if (eventIds.length) {
      const mentionResult = await supabase
        .from('event_people')
        .select('event_id,participant_role,people(id,full_name)')
        .in('event_id', eventIds)
        .order('sort_order')
      if (!mentionResult.error) {
        const byEvent = new Map<string, EventPersonMention[]>()
        for (const row of (mentionResult.data ?? []) as EventPersonMention[]) {
          const bucket = byEvent.get(row.event_id) ?? []
          bucket.push(row)
          byEvent.set(row.event_id, bucket)
        }
        hydratedEvents = baseEvents.map((item) => ({ ...item, mentions: byEvent.get(item.id) ?? [] }))
      }
    }
    setEvents(hydratedEvents)''',
    'hydrate event mentions',
)

text = replace_once(
    text,
    '''              onOpenPerson={(item) => void openPerson(item as Person)}''',
    '''              onOpenPerson={(item) => void openPersonById(item.id)}''',
    'directory person full fetch',
)

text = replace_once(
    text,
    '''                      <p>{item.description || 'لا توجد تفاصيل إضافية.'}</p>
                      <small>{item.location_name || familyName(item.families) || 'المكان غير محدد'}</small>''',
    '''                      <p>{item.description || 'لا توجد تفاصيل إضافية.'}</p>
                      {item.mentions?.length ? <div className="event-mention-chips">{item.mentions.map((mention) => {
                        const id = personId(mention.people)
                        const name = personName(mention.people)
                        return name ? <button className="event-mention-chip" type="button" key={`${item.id}-${id}-${mention.participant_role}`} onClick={() => id && void openPersonById(id)}>@ {name}</button> : null
                      })}</div> : null}
                      <small>{item.location_name || familyName(item.families) || 'المكان غير محدد'}</small>''',
    'event card mention chips',
)

path.write_text(text, encoding='utf-8')
print('Integrated published event people mentions.')
