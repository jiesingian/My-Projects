---
name: migrations
description: How database changes reach dev and production in this repository -- writing a Supabase migration, testing its row-level security in PGlite, and what to do when the Migrate workflow fails. Use before writing or fixing any .sql migration.
---

# Migrations

- **Only route to a live schema:** a `.sql` file in `<project>/supabase/migrations/`, merged. `migrate.yml` applies it to dev, then to production only if dev took it. Never the SQL editor, a connection string, the connector, or the service-role key.
- **Name:** `YYYYMMDDHHMMSS_what_it_does.sql`, later than main's newest (see the `ship` skill). No `begin/commit` -- `migrate.mjs` wraps each file and its ledger row in one transaction.
- **Write it re-runnable:** `create ... if not exists`, `drop policy if exists` before `create policy`, `create or replace function`.
- **RLS rules that bit before:**
  - a policy that selects from its own table recurses -- use a `security definer` helper;
  - definer functions: `set search_path = ''`, fully qualified names, `revoke ... from public, anon`, grant only what's needed;
  - names across households travel on the row (set by a trigger from the caller), never by reading another household's `members`.
- **Test before opening the PR:** add probes to `kin/supabase/tests/pglite/` and run `npm run test:rls` from `kin/`. Cover the negative cases (another household, a stranger, a child, forged author).
- **Migrate failed after merge:** read the job log. Transient (deadlock, timeout): re-run Actions → Migrate (target `both`). Real error: nothing from that file was kept -- fix forward in a *new* migration; never edit a file that has already run.
- Real data is never a test target; test as `E2E_EMAIL`'s sample household on dev.
