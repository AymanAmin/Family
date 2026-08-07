from pathlib import Path
import re

path = Path('src/App.tsx')
s = path.read_text(encoding='utf-8')

# Imports for the server-paginated directory and remote person picker.
if "./components/DirectoryScreen" not in s:
    s = s.replace(
        "import KinshipNetwork from './components/KinshipNetwork'\n",
        "import KinshipNetwork from './components/KinshipNetwork'\nimport DirectoryScreen from './components/DirectoryScreen'\nimport PeoplePicker from './components/PeoplePicker'\n"
    )

# Home data should only be a lightweight sample, never the full people directory.
s = s.replace(
    "supabase.from('families').select('id,name,description,origin_place,status,created_by,created_at').order('name').limit(100),",
    "supabase.from('families').select('id,name,description,origin_place,status,created_by,created_at').order('created_at', { ascending: false }).limit(16),"
)
s = s.replace(
    "supabase.from('people').select('id,full_name,gender,birth_year,is_deceased,description,status,family_id,created_by,created_at,families(name)').order('full_name').limit(100),",
    "supabase.from('people').select('id,full_name,gender,birth_year,is_deceased,description,status,family_id,created_by,created_at,families(name)').order('created_at', { ascending: false }).limit(12),"
)

# Search view no longer preloads 50 people/families. DirectoryScreen queries Supabase in pages of 8.
start = s.find('  async function runSearch(')
end = s.find('  function requireAccount()', start)
if start != -1 and end != -1:
    s = s[:start] + """  async function runSearch(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (!schemaReady) return
    setView('search')
  }

""" + s[end:]

# Fetch any person by ID on demand. Kinship results may refer to people not in the 12-person home sample.
if 'async function openPersonById' not in s:
    marker = '  async function submitRelationship(event: FormEvent<HTMLFormElement>) {'
    helper = """  async function openPersonById(id: string) {
    const cached = people.find((item) => item.id === id)
    if (cached) {
      await openPerson(cached)
      return
    }
    if (!supabase) return

    const { data, error } = await supabase
      .from('people')
      .select('id,full_name,gender,birth_year,is_deceased,description,status,family_id,created_by,created_at,families(name)')
      .eq('id', id)
      .maybeSingle()

    if (error) return showMessage(friendlyError(error.message), 'error')
    if (data) await openPerson(data as Person)
  }

"""
    s = s.replace(marker, helper + marker, 1)

# Replace the whole old search screen with the polished paginated directory.
search_start = s.find("        {schemaReady && view === 'search' && (")
family_start = s.find("        {schemaReady && view === 'family' && selectedFamily && (", search_start)
if search_start != -1 and family_start != -1:
    search_block = """        {schemaReady && view === 'search' && (
          <DirectoryScreen
            initialTerm={searchTerm}
            onOpenPerson={(item) => void openPerson(item as Person)}
            onOpenFamily={(item) => openFamily(item as Family)}
          />
        )}

"""
    s = s[:search_start] + search_block + s[family_start:]

# Kinship and family panels must open remote records on demand.
s = s.replace(
    "onOpenPerson={(id) => { const person = people.find((item) => item.id === id); if (person) void openPerson(person) }}",
    "onOpenPerson={(id) => void openPersonById(id)}"
)
s = re.sub(
    r"onOpenPerson=\{\(id\) => \{\s*const person = people\.find\(\(item\) => item\.id === id\)\s*if \(person\) void openPerson\(person\)\s*\}\}",
    "onOpenPerson={(id) => void openPersonById(id)}",
    s
)

# Relationship form must not render every person into a select.
source_pattern = re.compile(
    r'<label><span>الشخص الأول \*</span><select value=\{relationshipForm\.source_person_id\}.*?</select></label>',
    re.S
)
source_replacement = '<PeoplePicker label="الشخص الأول" value={relationshipForm.source_person_id} onChange={(selectedId) => setRelationshipForm({ ...relationshipForm, source_person_id: selectedId })} excludeId={relationshipForm.target_person_id || undefined} required />'
s = source_pattern.sub(source_replacement, s, count=1)

target_pattern = re.compile(
    r'<label><span>الشخص الثاني \*</span><select value=\{relationshipForm\.target_person_id\}.*?</select></label>',
    re.S
)
target_replacement = '<PeoplePicker label="الشخص الثاني" value={relationshipForm.target_person_id} onChange={(selectedId) => setRelationshipForm({ ...relationshipForm, target_person_id: selectedId })} excludeId={relationshipForm.source_person_id || undefined} required />'
s = target_pattern.sub(target_replacement, s, count=1)

# Old search-result states are now obsolete. Keep searchTerm because it can seed DirectoryScreen.
s = s.replace("  const [searchFamilies, setSearchFamilies] = useState<Family[]>([])\n", '')
s = s.replace("  const [searchPeople, setSearchPeople] = useState<Person[]>([])\n", '')
s = s.replace("  const [searching, setSearching] = useState(false)\n", '')

path.write_text(s, encoding='utf-8')

# Merge extended kinship into the one-shot setup file.
setup = Path('supabase/SETUP.sql')
migration = Path('supabase/migrations/202608070008_extended_kinship_rules.sql')
if setup.exists() and migration.exists():
    setup_text = setup.read_text(encoding='utf-8')
    migration_text = migration.read_text(encoding='utf-8')
    if 'PHASE 5: EXTENDED KINSHIP INFERENCE' not in setup_text:
        setup.write_text(setup_text.rstrip() + '\n\n' + migration_text + '\n', encoding='utf-8')
