## Who may push to main

**Everyone here pushes straight to `main`.** Jonathan (`jiesingian`) and
Janine both, on the same terms, with no pull request in between and nobody
waiting on anybody to press a button.

There is one set of rules and it is this section. Nothing anywhere says "if
you are working for X" — who you are working for does not change what you may
do, which is the only version of this that cannot be got wrong by a session
that guessed which half applied to it. The one thing only Jonathan does is
**run a migration**, and that is about who touches the live database, not
about who is trusted; it is stated once, below.

A pull request is now a thing you *may* open when you want a second opinion
before something lands, not a thing you *must* open. `triage.yml` and
`automerge.yml` still work exactly as they did if you open one.

### Before every push, without exception

Nothing stands between your push and the live app. Branch protection is a paid
feature on private repositories, so GitHub will not stop a broken commit
reaching `main` — the checks below are the whole of the safety net, and they
only work if they are actually run.

1. **Run the checks, from `kin/`:** `npx tsc --noEmit`, `npm run lint`,
   `npm run build`, and `npm run e2e`. All four, green, before you push. CI
   re-runs them afterwards, but afterwards is after it is already live.
2. **Rebase, never merge, and never force:**
   `git pull --rebase origin main` immediately before pushing. If the push is
   rejected, somebody landed something while you were working — rebase again
   and re-run the checks, because their change and yours have never been
   tested together. **Never force-push `main`**, for any reason.
3. **Say what you did.** A commit message on `main` is the only record; there
   is no pull request body to put it in any more.

If your session cannot push to `main` — some sandboxes block it, and one of
Jonathan's already does — push your branch instead, say so plainly, and let
`main` be fast-forwarded from it. That is not a workaround to feel bad about;
it is the same commits arriving by a different road.

### The watched list, and the flag it needs

Most of the app is revertible. A bad component ships, somebody notices, it is
reverted, and the cost was an afternoon. Some of it is not: the way into the
app, session handling, who may see whose data, money, anything that runs code
on our machines, and anything touching the database itself. A leak is leaked
and a dropped column is gone.

Those changes still go straight to `main` — nothing blocks them — but they do
not go quietly. **If your diff touches any path below, or changes more than
~400 lines, put a line in the commit message saying so** and tell Jonathan it
landed:

    WATCHED: auth — tightened the email bound on the reset form

The paths, which are the same list `triage.yml` classifies from:

- `kin/src/lib/actions/{auth,family,billing,wealth,drive}.ts`
- `kin/src/lib/supabase/`, `kin/src/lib/session.ts`, `kin/src/lib/access.ts`
- `kin/src/lib/billing/`, `kin/src/proxy.ts`
- `kin/src/app/api/`, `kin/src/app/auth/`, and the account screens:
  `login/`, `signup/`, `verify/`, `forgot-password/`, `reset-password/`,
  `subscribe/`
- `kin/next.config.*`, `kin/package{,-lock}.json`, `kin/eslint.config.*`
- `.github/`, `.claude/`, `.gitignore`, `CLAUDE.md`, any `AGENTS.md`, `LICENSE`
- any `.sql` file

You are not being asked to grade your own homework. `.github/workflows/`
`watched-change.yml` reads every push to `main` and opens an issue when it
sees one of these, whoever pushed it and whatever the commit message claimed —
so the flag is a courtesy that saves Jonathan finding out from a robot, not
the thing being relied on. Do not move code out of a watched path to keep it
quiet; the list exists because those files are where a mistake is expensive,
and a change is not made safer by being harder to see.

### Migrations are Jonathan's to run

They take effect when they are **run**, not when they are merged, so by the
time anybody reads the change the schema has already moved and no review can
catch it after the fact. Write the `.sql` file, commit it, say plainly in the
commit message that it needs running — and stop. He runs it himself.

### Two people, one branch

Both sessions run in their own container against their own clone. Nothing
collides while you are working; `main` is the only shared thing, which is what
the rebase rule above is for. Beyond that, the practical courtesy is to say
what you are working on before you start on it — two people rewriting the same
component in parallel is not a merge conflict git can help with.

If a rebase conflict is a real disagreement about how the app should behave,
rather than two edits landing on the same line, do not settle it by picking a
side in a rebase. Leave both, say so, and let the two of you decide.

## Never test against the real household

There is one Supabase project and it holds the Singian family's actual
records — their money, their health, their documents, their photos. Every
session points at it, including yours. There is no separate development
database to fall back on, so this is the rule that stands in for one:

- **Never write, edit or delete anything in the Singian household.** Not a
  test row, not a "temporary" one you mean to clean up, not while proving a
  fix works.
- **Test against the throwaway QA household instead** — the account in
  `E2E_EMAIL`. It exists to be written to and holds nothing anybody needs.
  Row-level security keeps the two households apart, so work done as the QA
  account cannot reach the real one.
- **Reading the real data is fine** when a question genuinely needs it — a
  reconciliation query, a check that a fix landed. Writing is not.
- **Never run a migration.** They take effect when they are run, not when a
  pull request merges, so nobody can catch a bad one by reviewing it
  afterwards. Write the `.sql` file, say in the pull request that it needs
  running, and stop. Jonathan runs it himself.
- **Never use the service-role key** to get around any of the above. It
  bypasses row-level security, which is the thing keeping one household's
  data out of another's.

If a change cannot be verified without touching real data, say so and leave it
unverified rather than touching it. An unverified fix is a known unknown; a
corrupted record is somebody's actual life.

## graphify

This is a monorepo. Each project folder (e.g. `kin/`) has its own knowledge
graph at `<project>/graphify-out/`, and `graphify-out/graph.json` at this root
is an aggregate of all of them, rebuilt by
`.github/workflows/graphify-deploy.yml` on every push to main and kept as the
`projects-graph` workflow artifact — download it from the run and open
`index.html`. It used to deploy to GitHub Pages, which failed silently on
every push: Pages needs a paid plan on a private repository, and a public site
would have put every file path, module and function name in these projects on
a page anyone could find.

**The generated graphs are no longer committed.** They rebuild from source, and
committing them added 101,531 lines and removed 45,119 across nine commits, in
files nobody opens — which made every real diff unreadable. What *is* committed
is the semantic layer (`.graphify_labels.json`, `cache/semantic/`): that came
from a paid LLM pass, and CI's `--code-only` rebuild cannot recreate it. A
fresh clone gets its graph from the session hook, which builds it for free.

When to reach for it, measured rather than assumed:

- **Relationship and breadth questions**, where the answer is a shape rather
  than a location: what transitively reaches a module, which parts a change
  would touch, what a concept spans. `cd` into the project and run
  `graphify query`, `graphify path`, or `graphify explain`; use the root graph
  for genuinely cross-project questions.
- **Not for finding a known symbol.** On `kin/`, "how does authentication
  work" returned 11 nodes all sourced from README.md, naming no code, for ~620
  tokens; `grep -rl` gave the 16 exact files for ~110. Grep wins until a
  codebase is large enough that its hits stop being triageable.
- After modifying code, run `graphify update <project>` there. It writes only
  ignored files, so it will not dirty the tree.
- Never run `graphify label` — a paid LLM pass, and Jonathan's decision.
