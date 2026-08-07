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
    "const PENDING_PAGE_SIZE = 15",
    "const PENDING_PAGE_SIZE = 15\nconst DETAIL_CACHE_TTL = 60_000\nconst personDetailCache = new Map<string, { savedAt: number; row: Person }>()\nconst familyDetailCache = new Map<string, { savedAt: number; row: Family }>()",
    'detail caches',
)

old_family = '''  async function openFamilyById(id: string) {
    const cached = families.find((item) => item.id === id)
    if (cached) {
      openFamily(cached)
      return
    }
    if (!supabase) return

    const { data, error } = await supabase
      .from('families')
      .select('id,name,description,origin_place,status,created_by,created_at')
      .eq('id', id)
      .maybeSingle()

    if (error) return showMessage(friendlyError(error.message), 'error')
    if (data) openFamily(data as Family)
  }'''
new_family = '''  async function openFamilyById(id: string, force = false) {
    if (!force) {
      const sampled = families.find((item) => item.id === id)
      if (sampled) {
        openFamily(sampled)
        return
      }
      const cached = familyDetailCache.get(id)
      if (cached && Date.now() - cached.savedAt < DETAIL_CACHE_TTL) {
        openFamily(cached.row)
        return
      }
    }
    if (!supabase) return

    const { data, error } = await supabase
      .from('families')
      .select('id,name,description,origin_place,status,created_by,created_at')
      .eq('id', id)
      .maybeSingle()

    if (error) return showMessage(friendlyError(error.message), 'error')
    if (data) {
      const row = data as Family
      familyDetailCache.set(id, { savedAt: Date.now(), row })
      openFamily(row)
    }
  }'''
text = replace_once(text, old_family, new_family, 'family detail cache')

old_person = '''  async function openPerson(item: Person) {
    setSelectedPerson(item)
    setView('person')
    setRelationsLoading(true)
    setRelationships([])
    window.scrollTo({ top: 0, behavior: 'smooth' })
    if (!supabase) {
      setRelationsLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('person_relationships')
      .select('id,source_person_id,target_person_id,relation_type,notes,status,created_at,source:people!person_relationships_source_person_id_fkey(id,full_name),target:people!person_relationships_target_person_id_fkey(id,full_name)')
      .or(`source_person_id.eq.${item.id},target_person_id.eq.${item.id}`)
      .order('created_at')

    setRelationsLoading(false)
    if (error) return showMessage(friendlyError(error.message), 'error')
    setRelationships((data ?? []) as PersonRelationship[])
  }

  async function openPersonById(id: string) {
    const cached = people.find((item) => item.id === id)
    if (cached) {
      await openPerson(cached)
      return
    }
    if (!supabase) return

    const { data, error } = await supabase
      .from('people')
      .select('id,full_name,gender,birth_year,is_deceased,death_date,description,status,family_id,created_by,created_at,families(name)')
      .eq('id', id)
      .maybeSingle()

    if (error) return showMessage(friendlyError(error.message), 'error')
    if (data) await openPerson(data as Person)
  }'''
new_person = '''  async function openPerson(item: Person) {
    setSelectedPerson(item)
    setView('person')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function openPersonById(id: string, force = false) {
    if (!force) {
      const sampled = people.find((item) => item.id === id)
      if (sampled) {
        await openPerson(sampled)
        return
      }
      const cached = personDetailCache.get(id)
      if (cached && Date.now() - cached.savedAt < DETAIL_CACHE_TTL) {
        await openPerson(cached.row)
        return
      }
    }
    if (!supabase) return

    const { data, error } = await supabase
      .from('people')
      .select('id,full_name,gender,birth_year,is_deceased,death_date,description,status,family_id,created_by,created_at,families(name)')
      .eq('id', id)
      .maybeSingle()

    if (error) return showMessage(friendlyError(error.message), 'error')
    if (data) {
      const row = data as Person
      personDetailCache.set(id, { savedAt: Date.now(), row })
      await openPerson(row)
    }
  }'''
text = replace_once(text, old_person, new_person, 'remove duplicate relationship fetch and cache person')

text = text.replace(
    'onSaved={loadCommunityData} />\n            </div>\n            <div className="detail-facts">\n              <article><span>مكان الأصل</span>',
    'onSaved={async () => { familyDetailCache.delete(selectedFamily.id); await loadCommunityData(); await openFamilyById(selectedFamily.id, true) }} />\n            </div>\n            <div className="detail-facts">\n              <article><span>مكان الأصل</span>',
    1,
)
text = text.replace(
    'onSaved={loadCommunityData} />\n            </div>\n            <div className="detail-facts">\n              <article><span>العائلة الأساسية</span>',
    'onSaved={async () => { personDetailCache.delete(selectedPerson.id); await loadCommunityData(); await openPersonById(selectedPerson.id, true) }} />\n            </div>\n            <div className="detail-facts">\n              <article><span>العائلة الأساسية</span>',
    1,
)
text = text.replace(
    'await loadCommunityData(); await openPersonById(selectedPerson.id) }} />',
    'personDetailCache.delete(selectedPerson.id); await loadCommunityData(); await openPersonById(selectedPerson.id, true) }} />',
    1,
)

path.write_text(text, encoding='utf-8')
print('Applied detail cache and removed redundant person relationship query.')
