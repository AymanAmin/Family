# Family Platform Implementation Instructions

Read `/AGENTS.md` and the files under `/docs` before making substantial changes.

Non-negotiable context:

- This is a platform for one geographic region containing multiple independent families, not one family tree.
- Visitors are read-only. Registered users submit content; nothing becomes public before moderation approval.
- A user account and a person record are separate entities. Google sign-in must not auto-claim a person.
- Google/Gmail through Supabase Auth is a primary sign-in method.
- Families remain separate; marriages connect them without merging them.
- Store basic verified relationships and derive compound kinship paths.
- Privacy for living people and children is a core requirement.
- Every exposed Supabase table requires RLS and explicit authorization predicates.
- Never expose service-role, database passwords, Google client secrets, or other secrets.

Design requirements:

- Mobile First from 320px.
- Arabic RTL first, with safe English LTR behavior.
- Responsive cards, forms, dashboards, moderation screens, and family-tree views.
- Use accessible semantics, visible focus, 44px touch targets, reduced-motion support, and complete loading/empty/error/success states.
- Do not ship generic desktop admin templates or squeezed tables.

Deployment requirements:

- Production deploys directly from the `main` branch through GitHub Actions to GitHub Pages.
- Support the `/Family/` base path.
- Supabase URL and publishable key are deploy-time public configuration.
- Do not require a developer machine to publish production.
