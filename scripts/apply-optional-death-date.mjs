import fs from 'node:fs'

function patchFile(path, operations) {
  let source = fs.readFileSync(path, 'utf8')
  let changed = false

  for (const { from, to, label } of operations) {
    if (source.includes(to)) continue
    if (!source.includes(from)) {
      throw new Error(`Could not find expected snippet for ${label} in ${path}`)
    }
    source = source.replace(from, to)
    changed = true
  }

  if (changed) fs.writeFileSync(path, source)
}

patchFile('src/App.tsx', [
  {
    label: 'remove add-person death-date validation',
    from: "    if (personForm.is_deceased && !personForm.death_date) return showMessage('حدد تاريخ الوفاة.', 'error')\n",
    to: '',
  },
  {
    label: 'send null for an unknown death date',
    from: "      death_date: personForm.is_deceased ? personForm.death_date : null,",
    to: "      death_date: personForm.is_deceased && personForm.death_date ? personForm.death_date : null,",
  },
  {
    label: 'add-person optional death-date helper text',
    from: "<small>{personForm.is_deceased ? 'حدد تاريخ الوفاة لإكمال السجل' : 'فعّل الخيار فقط إذا كان الشخص متوفى'}</small>",
    to: "<small>{personForm.is_deceased ? 'تاريخ الوفاة اختياري ويمكن استكماله لاحقًا' : 'فعّل الخيار فقط إذا كان الشخص متوفى'}</small>",
  },
  {
    label: 'make add-person death-date input optional',
    from: "{personForm.is_deceased && <label className=\"full death-date-field\"><span>تاريخ الوفاة *</span><input type=\"date\" required value={personForm.death_date} onChange={(e) => setPersonForm({ ...personForm, death_date: e.target.value })} /></label>}",
    to: "{personForm.is_deceased && <label className=\"full death-date-field\"><span>تاريخ الوفاة <small>اختياري</small></span><input type=\"date\" value={personForm.death_date} onChange={(e) => setPersonForm({ ...personForm, death_date: e.target.value })} /></label>}",
  },
])

patchFile('src/components/RecordEditButton.tsx', [
  {
    label: 'remove edit-person death-date validation',
    from: "    if (entityType === 'people' && Boolean(form.is_deceased) && !String(form.death_date ?? '').trim()) {\n      setMessage('حدد تاريخ الوفاة أولًا.')\n      return\n    }\n\n",
    to: '',
  },
  {
    label: 'edit-person optional death-date helper text',
    from: "<div><strong>{Boolean(form.is_deceased) ? 'متوفى' : 'على قيد الحياة'}</strong><small>{Boolean(form.is_deceased) ? 'يجب تحديد تاريخ الوفاة' : 'يمكن تغيير الحالة عند الحاجة'}</small></div>",
    to: "<div><strong>{Boolean(form.is_deceased) ? 'متوفى' : 'على قيد الحياة'}</strong><small>{Boolean(form.is_deceased) ? 'تاريخ الوفاة اختياري ويمكن استكماله لاحقًا' : 'يمكن تغيير الحالة عند الحاجة'}</small></div>",
  },
  {
    label: 'make edit-person death-date input optional',
    from: "<label className=\"death-date-field\"><span>تاريخ الوفاة *</span><input type=\"date\" required value={String(form.death_date ?? '')} onChange={(e) => setValue('death_date', e.target.value)} /></label>",
    to: "<label className=\"death-date-field\"><span>تاريخ الوفاة <small>اختياري</small></span><input type=\"date\" value={String(form.death_date ?? '')} onChange={(e) => setValue('death_date', e.target.value)} /></label>",
  },
])

const setupPath = 'supabase/SETUP.sql'
const setupMarker = '-- INCLUDED MIGRATION: 20260808115125_make_death_date_optional_for_deceased_people.sql'
let setup = fs.readFileSync(setupPath, 'utf8')
if (!setup.includes(setupMarker)) {
  setup = `${setup.trimEnd()}\n\n${setupMarker}\n\nbegin;\n\nalter table public.people\n  drop constraint if exists people_deceased_requires_death_date;\n\ncomment on column public.people.death_date is\n  'Optional death date. A person may be marked deceased even when the historical death date is unknown.';\n\ncommit;\n`
  fs.writeFileSync(setupPath, setup)
}

console.log('Optional death-date behavior integrated.')
