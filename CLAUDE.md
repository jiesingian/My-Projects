## How a change reaches main

**Branch, pull request, automatic checks, automatic merge.** Nobody approves
anything by hand.

This is the ordinary industry path, and it is the one we use — both people,
and every Claude session on either machine:

1. **Work on a branch.** Never commit directly to `main`.
2. **Open a pull request** when the work is ready. Say what you did in the
   body; it is the record.
3. **The checks run themselves** — `ci.yml` (typecheck, lint, build),
   `e2e.yml` (the full suite), `schema-check.yml` (does the database have what
   the code believes in), `secret-scan.yml`, and Vercel's deployment.
4. **`automerge.yml` merges it** once every check is green and there is no
   conflict. Nobody presses a button. A red check or a conflict simply means
   it does not merge.

**No manual approval, ever.** Neither person reviews the other's pull request
as a gate, and no Claude session waits for one. The pull request is not here
to buy a second opinion — it is here so the checks finish *before* the change
is live, which a direct push cannot guarantee and a hand-merge actively
defeats.

That distinction is not theoretical. On 10 September `automerge.yml` had been
failing silently for days: its `permissions:` block never listed `statuses`,
so reading Vercel's deployment 403'd one line after it announced the checks
were green. Pull requests then got merged by hand, a hand merge waits for
nothing, and a stale test reached `main` while its own suite was still
running. The machinery was right. It was broken, and the failure looked like
something else.

### Before you open the pull request

Run the checks locally first, from `kin/`: `npx tsc --noEmit`, `npm run lint`,
`npm run build`, `npm run e2e`. CI runs them again — that is the actual gate —
but a failure found on your own machine costs a minute and the same failure
found in CI costs ten.

If you genuinely cannot run the suite — no working QA credentials, or the
shared household is busy — **open the pull request anyway and say so in the
body.** That is precisely what the automatic gate is for. It is the right
call, not a corner cut.

Rebase onto `main` before opening, and again if it falls behind:
`git pull --rebase origin main`. Never force-push `main` itself, for any
reason.

### One check a day, not constant watching

Neither person is expected to watch the other's work or follow every push.
The automatic checks are the gate. The human-facing check is a **single daily
run of the whole setup, at 17:00 Manila, on Jonathan's account** — one result
to read, once a day.

### When you ask a person to do something by hand

Some things cannot be automated away — a repository secret, a dashboard toggle,
a password only one person can reset. When a session needs one of those, it
**asks with a link on every step that has one**: the exact project page, the
exact settings tab, the exact form. Not "go to Settings → Secrets"; the URL
that lands on the form.

This is not politeness. Jonathan has had to ask for the links three times in
one morning, which is three round trips that the first answer should have
made unnecessary, and a walkthrough that names a menu path is also the kind
that goes stale silently when the interface moves. A link either works or
visibly does not.

Say what the step is for and what it is safe to do — "resetting this password
breaks nothing, the app connects with API keys" — because the reason someone
hesitates over a manual step is usually not the clicking.

And before asking at all, check whether it can be done without a person. It
often can: half the work in this file exists because something that looked
like a manual step was not one.

### The watched list, and the flag it needs

Most of the app is revertible. A bad component ships, somebody notices, it is
reverted, and the cost was an afternoon. Some of it is not: the way into the
app, session handling, who may see whose data, money, anything that runs code
on our machines, and anything touching the database itself. A leak is leaked
and a dropped column is gone.

Those changes still merge themselves like anything else — no extra approval,
nothing to wait for — but they do not go quietly. **If your diff touches any
path below, or changes more than ~400 lines, put a line in the commit message
saying so:**

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

### Neither session gates the other

No Claude session approves another's work, waits for one, or is waited on.
Janine's branch and Janine's pull requests go through on the checks alone, and
so do Jonathan's. If a session finds a problem in the other's pull request, it
says so — to its own person, or as a comment — and that is the end of its
authority. It does not hold anything.

**Either session may fix anything that is broken, including the other's.** A
workflow, a script, a test, a check, a migration, a component — whoever finds
it wrong may correct it, on a branch, through the ordinary path, without asking
the other's session first. Most of the machinery in `.github/` was written by
one session and has been wrong in ways only the other was positioned to notice;
a rule that said "ask the author" would mean the person who spotted a broken
check has to wait on the session that broke it.

The one thing that is never a session's to do is the short list in the table
below — applying a migration to production, repository settings and secrets,
spending money. Those are Jonathan's, and they are his because of what they
are, not because of who noticed.

**A check is not a gate in this sense.** Requiring that CI, the secret scan and
the schema check have actually *run* before something merges is the opposite of
an approval: it is what makes merging without a person safe. The thing to
refuse is a human in the path, not a test.

### Two people, one branch

Both sessions run in their own container against their own clone. Nothing
collides while you are working; `main` is the only shared thing, which is what
the rebase rule above is for. Beyond that, the practical courtesy is to say
what you are working on before you start on it — two people rewriting the same
component in parallel is not a merge conflict git can help with.

If a rebase conflict is a real disagreement about how the app should behave,
rather than two edits landing on the same line, do not settle it by picking a
side in a rebase. Leave both, say so, and let the two of you decide.

## Who does what

Two people build Kin: **Jonathan** (`jiesingian`) and **Janine**
(`jnnarenassingian-star`). Both hold write access to this repository, both
land work the same way — branch, pull request, automatic merge — and neither
needs the other's approval for anything. Claude sessions run on both machines
and work under these same rules.

**Symmetry is the default, and every exception has to earn itself.** Exactly
one does:

| | Both | Jonathan only |
|---|---|---|
| Open a pull request that merges itself on green | ✅ | |
| Merge without anyone's approval | ✅ | |
| Revert anything, including each other's work | ✅ | |
| Write migrations | ✅ | |
| Read production data when a question needs it | ✅ | |
| Supabase dashboard, dev and production | ✅ | |
| **Run the production migration button** | | ✅ |
| Repository settings and secrets | | ✅ |
| Anything that spends money | | ✅ |

Production migrations are the one asymmetry, and it is not about trust: the
schema moves the instant the file is *run*, no review catches it afterwards,
so one hand on that lever means one story about what the live schema is.

Nobody pastes SQL any more, though. A migration goes in
`kin/supabase/migrations/`, **dev applies it by itself** the moment the pull
request merges, and production is one button — Actions → *Migrate* → Run
workflow → `production` — which only Jonathan presses. Thirteen migrations were
typed into the SQL editor by hand between the 7th and the 10th, and the record
of what had actually run was a comment at the top of each file that somebody
had to remember to change. Twice nobody did. The ledger the pipeline writes is
in the same transaction as the migration itself, so it cannot disagree.

Nothing else here is a gate. `watched-change.yml` reads every push to `main`
and opens an issue from the actual diff, whoever pushed and whatever the
commit message claimed — so nobody grades their own homework and nobody has
to police anybody.

## Real data is never a test target

Jonathan's and Janine's own records are real: their money, their health,
their documents, their children's birthdays. Today there is **one** Supabase
project and it holds all of it, and every session points at it — including
yours. A dev project is being stood up to end that; until it lands, these
rules stand in for one, and most of them outlive it.

- **Never write, edit or delete anything in a real household.** Not a test
  row, not a "temporary" one you mean to clean up, not while proving a fix
  works.
- **Test against a sample family** — an invented household with invented
  figures, named by `E2E_EMAIL`. It exists to be written to and holds nothing
  anybody needs. Row-level security keeps households apart, so work done as
  that account cannot reach a real one.
- **Reading real data is fine** when a question genuinely needs it — a
  reconciliation query, a check that a fix landed. Writing is not, ever.
- **Never copy production data into dev.** Not a dump, not "just one
  household so there's something to look at", not anonymised by eye. Dev gets
  the **schema** and a **synthetic seed**, nothing else. A copy of a real
  household in a second database is a second place it can leak from, and
  every safeguard here assumes there is only one.
- **Never use the service-role key** to get around any of the above. It
  bypasses row-level security, which is the thing keeping one household's
  data out of another's.
- **Never run a migration against production yourself**, by any route — the
  button, the SQL editor, the connector, a connection string. It takes effect
  when it is run, not when it merges, so nobody can catch a bad one
  afterwards. Put the `.sql` in `kin/supabase/migrations/`, say plainly that
  production is still waiting for it, and stop; Jonathan presses the button.
  Dev is different and needs no permission: it applies itself on merge, and
  running the same pipeline at it by hand is fair game for either of you.

Which sample household your machine uses is set by `E2E_EMAIL` and described
in `kin/docs/QA_HOUSEHOLDS.md`. Do not repoint it at another machine's, and
never at a real account.

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
