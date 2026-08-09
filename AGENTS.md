# AGENTS.md — Mandatory Project Context

This file is the primary implementation contract for every developer or AI agent working in this repository.

## 1. Product Mission

Build a community and family-history platform for one geographic region containing multiple independent families. Families may be related through ancestry or marriage, or may have no recorded kinship.

The platform must document families, branches, people, parent/child relationships, marriages, deaths, condolences, weddings, newborn naming celebrations, births, achievements, community events, news, and historical memories.

Never redesign the product as a single-family tree. The domain is a region with many families and potentially many disconnected trees.

## 2. Core Domain Rules

1. A person record is not the same as an authentication account.
2. A person may exist without a user account.
3. A user may request to claim/link their account to an existing person record; approval is required.
4. A person must have one canonical record, even when connected to several families through father, mother, marriage, residence, or historical affiliation.
5. Families remain separate entities. Marriage connects two families but does not merge them.
6. Store verified base relationships: parent/child and marriage. Derive compound kinship such as uncle, aunt, cousin, grandparent, and in-law relationships.
7. When no relationship path is found, say “No recorded relationship was found” and never claim that no real-world relationship exists.
8. Prevent self-parenting, duplicate edges, impossible cycles, and obviously inconsistent dates. Flag uncertain cases for moderation instead of silently accepting them.
9. Deletion should normally be soft deletion or archival with an audit trail.

## 3. Access and Moderation

### Anonymous visitor

- Can search and view only approved, public content.
- Cannot add, edit, upload, or submit content.

### Registered user

- Can submit a person, relationship, family, event, news item, correction, media item, or account-link request.
- Their submission remains private/pending until approved.
- Can view the status and moderation notes for their own submissions.

### Verified regional member

- Has an approved link between their account and a person record.
- Can receive personalized relationship explanations for events and people, subject to privacy rules.

### Family/branch moderator

- Can review only the families or branches assigned to them.
- Cannot grant global roles or access unrelated private data.

### Administrator / super administrator

- Controls global moderation, permissions, audit, configuration, merging, exports, and sensitive operations.

No user may approve their own submission.

## 4. Required Main Features

- Region, family, branch, person, alias, affiliation, parent relationship, and marriage management.
- Arabic-name search tolerant of diacritics, hamza forms, alef maqsura/yaa, and common name variants.
- Person and family profile pages.
- Interactive family trees with pan, zoom, generation limits, and relationship-status styling.
- Relationship path between two people.
- Events: death/condolence, marriage, engagement, birth, naming celebration, graduation, success, honoring, community gathering, health visit, and general announcement.
- Event links to multiple people and multiple families.
- Personalized explanation of whom a verified user should congratulate or console and how they are related.
- News and historical memories.
- Submission and moderation workflow.
- Duplicate-person detection and controlled merge.
- Notifications.
- Full admin dashboard: visits, unique visitors, searches, failed searches, people, families, relationships, events, submissions, moderators, and data-quality warnings.
- Immutable or protected audit logs for important actions.

## 5. Privacy and Safety

Privacy is a product requirement, not a later enhancement.

- Do not publicly expose national IDs, private phone numbers, private email addresses, home addresses, health details, documents, or precise birth dates for living people by default.
- Children must use stricter defaults: hide exact birth dates, schools, precise locations, contact data, and public photos unless explicitly approved.
- Every person, field, media item, event, and news item must support a visibility level where appropriate.
- Recommended visibility scopes: public, authenticated, verified-region-members, selected families, selected branches, moderators, private.
- Provide correction, objection, media-removal, and privacy requests with an auditable moderation process.
- Never expose Supabase secret/service-role keys to the browser or repository.

## 6. Design and UX Contract

Every screen must be designed Mobile First and remain fully usable at 320px width and above.

Mandatory:

- Arabic RTL is first-class; English LTR must not break layout.
- Use a coherent design system with reusable tokens and components.
- Use modern UI/UX design practices, strong visual hierarchy, accessible typography, meaningful spacing, clear states, and restrained animation.
- Do not produce generic admin-template screens or desktop tables squeezed into mobile.
- Replace wide tables on small screens with cards, summaries, expandable rows, or horizontal views only when justified.
- Navigation, dialogs, forms, family trees, dashboards, charts, filters, and moderation comparison views must be responsive.
- Touch targets should be at least 44×44 CSS pixels where practical.
- Forms need labels, validation, help text, loading, success, empty, and error states.
- Use skeleton/loading states and avoid layout shifts.
- Meet WCAG 2.2 AA goals for contrast, keyboard access, focus visibility, semantics, and reduced motion.
- Test common widths: 320, 360, 390, 768, 1024, 1280, and 1440 pixels.
- Use CSS Grid/Flexbox, fluid sizing, `clamp()`, logical properties, and container-aware components.
- Family-tree visualizations must have an accessible list/text alternative.

Before accepting any UI implementation, verify mobile screenshots and responsive behavior, not only desktop appearance.

## 7. Technical Direction

Target stack unless a documented decision changes it:

- React, TypeScript, and Vite.
- Supabase PostgreSQL, Auth, Storage, Row Level Security, Edge Functions, and selective Realtime.
- PWA support.
- GitHub Actions for validation and deployment.
- GitHub Pages as the public static host.

Use feature-based modules and strict TypeScript. Keep domain logic separate from presentation.

## 8. Supabase Security Rules

- Enable RLS on every exposed table.
- Public users read approved public rows only.
- Authenticated users can create submissions and read only authorized records.
- Ownership checks must use `auth.uid()` and explicit row predicates, not only `TO authenticated`.
- Updates require both `USING` and `WITH CHECK` policies.
- Authorization roles belong in trusted app metadata or protected profile/role tables, never editable user metadata.
- Privileged actions must run through protected database functions or Edge Functions with explicit authorization.
- Views exposed to clients must respect RLS/security-invoker behavior.
- Storage buckets require matching object policies.
- Add indexes for foreign keys, normalized search columns, moderation status, event dates, and relationship traversal.

## 9. GitHub Deployment Contract

The application will be built and published directly from GitHub.

- The default deployment must work with GitHub Pages for repository `AymanAmin/Family`.
- Vite base-path handling must support `/Family/` and allow a future custom domain without rewriting the application.
- All routes must work after refresh on GitHub Pages using an appropriate SPA fallback strategy or a compatible routing mode.
- GitHub Actions must install locked dependencies, lint, type-check, test, build, upload the Pages artifact, and deploy only after validation succeeds.
- Commit lockfiles and pin dependencies.
- Use GitHub repository/environment secrets or variables for deploy-time public configuration.
- Only Supabase URL and publishable/anon client key may reach the browser. Secret/service-role values belong only in Supabase or protected CI tasks that never bake them into the frontend.
- Never rely on a developer’s local machine for production deployment.

## 10. Definition of Done

A feature is not complete until:

- It matches the regional multi-family product model.
- Permissions and RLS are tested for anonymous, member, moderator, and administrator roles.
- User content follows the approval workflow.
- Mobile, tablet, desktop, RTL, and LTR behavior are verified.
- Loading, empty, error, unauthorized, and success states exist.
- Accessibility basics are validated.
- Tests and builds pass in GitHub Actions.
- Documentation and migrations are updated.
- Any database change has also updated and verified the full backup/export and restore paths when the changed schema or data is part of application backup scope.
- No secrets or sensitive sample data are committed.

Read `docs/PRODUCT_REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN_GUIDELINES.md`, and `docs/DEPLOYMENT.md` before implementing a substantial feature.

## 11. Backup and Restore Contract

Backup and restore are mandatory parts of every database change, not optional maintenance work.

- Whenever a migration, table, column, relationship, constraint, enum/status value, trigger, function, view, or other persisted application-data structure is added, removed, renamed, or materially changed, review the backup/export and restore implementation in the same change.
- Any new application table or persisted dataset that belongs to recoverable Family data must be added to the full backup manifest/export list and to the restore allowlist/order before the database change is considered complete.
- If a column or table is renamed or its data shape changes, update restore validation/compatibility so older supported backup files fail safely with a clear message or are migrated deliberately; never silently drop unknown backup data.
- Preserve relationship integrity during restore. Parent tables must be restored before dependent tables, and restore must account for foreign keys, triggers, generated/derived data, and synchronization logic.
- Restore must remain a protected Primary Super Admin operation and must never expose service-role credentials to the browser.
- A restore must validate the backup version, project/scope metadata, expected tables, row structure, and counts before making destructive changes.
- Destructive restore must be atomic where practical: if any required step fails, do not leave the database partially restored.
- Restore must not unintentionally resend historical notifications or execute side effects merely because old rows are being replayed.
- After every database schema change, verify at minimum that a fresh JSON backup can be created and that the restore path recognizes the updated backup structure.
- Keep backup/export and restore code, documentation, and tests synchronized with the current production schema.
