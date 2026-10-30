# Session hooks

## `session-start.sh`

Gets a fresh Claude Code **web** session to the point where it can check its
own work — `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run test:logic` —
without spending the first ten minutes rediscovering the setup.

It installs npm dependencies, recreates the gitignored `kin/.env.local` from
the two public Supabase values, pins graphify to one version, and builds the
graph (`graphify update .`) when `graph.json` is missing. It does nothing at all outside a remote session.

## Registering it

Already registered. `.claude/settings.json` is committed and points
`SessionStart` at this script, so every fresh container runs it without anyone
remembering to.

It used to be gitignored, on the belief that graphify generated a
machine-specific one that a committed version would fight. That turned out not
to be true — the file `graphify claude install` leaves behind contains nothing
but this same hook registration — and the cost of the belief was real: a fresh
container had no hook at all, so each new session re-did `npm install`,
rebuilt `.env.local` by hand, and in one case had to reset the QA account's
password because the old one died with the container.

Anything genuinely specific to one machine belongs in
`.claude/settings.local.json`, which is still ignored.

## Keeping it honest

Two things in the script go stale if the repo moves and nothing will warn you:

- `GRAPHIFY_VERSION` keeps the extractor compatible with the committed
  semantic layer (`.graphify_labels.json`, `cache/semantic/`), which came from
  a paid pass. `graph.json` and `cache/ast/` are gitignored (root
  `.gitignore`) and rebuilt locally, so they are no longer what it matches.
- The Supabase URL and anon key must match the project. Both are public by
  design — the anon key is what every browser already carries, and RLS is what
  actually protects the data. The service role key is a real secret and is
  deliberately **not** here.
