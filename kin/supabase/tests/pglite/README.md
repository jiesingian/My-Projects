# Row-level security checks (PGlite)

`npm run test:rls` from `kin/`. Runs the chat and connection migrations
against a throwaway in-memory Postgres (PGlite) with five made-up
households, then checks who can and cannot read or write what -- the
negative cases above all. No database, credentials or real data involved.

- `base.sql` -- stand-ins for the schema these migrations depend on.
- `run.mjs` -- applies `base.sql` and the migrations listed in it (twice, to
  prove they re-run), then each `probes/*.mjs` on a fresh database.
- `probes/` -- one file per feature. `npm run test:rls -- groups` runs one.

A new migration touching RLS: add it to `MIGRATIONS` in `run.mjs` and add or
extend a probe, negative cases included. The older `../*.sql` files are
hand-run checks against dev and are unchanged.
