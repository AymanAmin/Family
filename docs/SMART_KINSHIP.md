# Smart kinship

The person profile now uses an intelligent kinship network.

- Direct parent/child relationships are normalized from the selected person's perspective.
- Siblings are inferred from shared approved parents.
- Two shared parents are labelled as sharing father and mother.
- One shared parent is treated as a half-sibling relationship.
- Grandparents and grandchildren are inferred from approved parent edges.
- Explicit relationships remain preferred when an explicit sibling link exists.
- Mobile screens use the compact app scale from `src/mobile-v2.css`.

Apply the latest `supabase/SETUP.sql` to enable `get_person_kinship(uuid)`.
