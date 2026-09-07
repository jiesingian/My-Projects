# Session hooks

## `session-start.sh`

Gets a fresh Claude Code **web** session to the point where it can check its
own work — `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run e2e` —
without spending the first ten minutes rediscovering the setup.

It installs npm dependencies, recreates the gitignored `kin/.env.local` from
the two public Supabase values, and pins graphify to the version that produced
the committed graph cache. It does nothing at all outside a remote session.

## Registering it

`.claude/settings.json` is **gitignored in this repo on purpose** — graphify
generates a machine-specific one (`graphify claude install`), so a committed
version would fight it. That means this hook is not wired up automatically.

To turn it on, merge this into your `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh"
          }
        ]
      }
    ]
  }
}
```

If you would rather this were automatic for every session and every machine,
drop `.claude/settings.json` from `.gitignore` and commit it — but check first
what `graphify claude install` wants to put there, so the two do not overwrite
each other.

## Keeping it honest

Two things in the script go stale if the repo moves and nothing will warn you:

- `GRAPHIFY_VERSION` must match `kin/graphify-out/cache/ast/`. A mismatch
  re-extracts every file and rewrites `graph.json` by thousands of lines.
- The Supabase URL and anon key must match the project. Both are public by
  design — the anon key is what every browser already carries, and RLS is what
  actually protects the data. The service role key is a real secret and is
  deliberately **not** here.
