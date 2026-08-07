# Contextual Family UX — 2026-08-07

This delivery borrows the *simplicity* of compact genealogy/profile experiences while keeping the existing Sila visual identity, multi-family domain model, moderation rules, and canonical-person architecture.

## Task 1 — Simplify the person profile
- Add a primary “family at a glance” section before the advanced genealogy tools.
- Show parents, spouse(s), children, siblings, and family affiliations as compact clickable records.
- Keep advanced relationship management and inferred kinship available below rather than replacing domain capabilities.

## Task 2 — Add relatives in the correct place
- Inline actions: father, mother, husband/wife, son, daughter, brother, sister.
- The selected slot determines gender and relationship automatically.
- New-person mode asks for the name first; family is inferred when it is safe to do so.
- Existing-person mode links a canonical approved record instead of creating a duplicate.
- Normal members create pending records; admins publish directly.

## Task 3 — Add people directly from a family profile
- Add a compact “Add member to this family” action in the family profile.
- Family context is prefilled automatically.
- Supports either a new minimal person record or linking an existing approved person to the family.

## Task 4 — Make relationship paths easier on mobile
- Keep the existing kinship path engine.
- Present result steps vertically on phones for easier scanning and less horizontal dragging.
- Keep the richer desktop path presentation.

## Task 5 — Professional event image sharing
- Add branded 1080×1350 PNG generation in the browser.
- Use Sila colors and brand mark; templates adapt automatically by event type (wedding, death, birth/naming, achievement/general).
- Include title, date, location, family, related people, and a concise description.
- Use the Web Share API with an actual PNG file on supported mobile browsers so WhatsApp can receive the image through the native share sheet.
- Fallback: save the PNG and open WhatsApp with event text/link when file sharing is not supported.
- Expose sharing from the news feed and home event cards.

## Task 6 — Data integrity and atomic contextual writes
- Migration `202608070035_contextual_family_profile_additions.sql` adds protected RPCs for contextual person creation, contextual relationship linking, and family membership linking.
- Functions preserve authentication, admin direct approval, member moderation, approved anchor/family validation, gender-slot validation, and duplicate relationship checks.

## Verification
- The integration workflow runs TypeScript checking and the full production build before committing source integration.
- Production deployment is then performed by the existing GitHub Pages workflow from `main`.
