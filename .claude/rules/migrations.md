---
paths:
  - "**/supabase/migrations/**"
  - "**/supabase/tests/**"
---

# Migration files

- Name later than main's newest migration; no `begin/commit`; write it re-runnable.
- Test RLS with `npm run test:rls` (PGlite) before the PR, negative cases included.
- A file that already ran is never edited; fix forward in a new one. Full procedure: the `migrations` skill.
