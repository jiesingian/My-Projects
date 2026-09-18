## How a change reaches main

**Branch, pull request, automatic checks, automatic merge.** Nobody approves
anything by hand.

This is the ordinary industry path, and it is the one we use — both people,
and every Claude session on either machine:

1. **Work on a branch.** Never commit directly to `main`.
2. **Open a pull request** when the work is ready. Say what you did in the
   body; it is the record.
3. **The checks run themselves** — `ci.yml` (typecheck, lint, build),
   `e2e.yml` (a fast, read-only smoke tier — every hub's pages plus the pure
   function specs; the comprehensive write-heavy suite moved to
   `weekly-check.yml`, see below, on 18 September so a merge gate would not
   cost minutes it could not afford), `schema-check.yml` (does the database
   have what the code believes in), `secret-scan.yml`, and Vercel's
   deployment.
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

### One check a week, not constant watching

Neither person is expected to watch the other's work or follow every push.
The automatic checks are the gate. The human-facing check is a **weekly run
of the whole setup, on Jonathan's account, in `weekly-check.yml`** — one
result to read, once a week, and silent unless something broke.

Weekly rather than daily since 18 September, and for a reason beyond cost:
this is now the only place the comprehensive end-to-end suite runs at all.
`e2e.yml`'s own merge gate narrowed that same day to a fast, read-only smoke
tier so it could run on every single push without either slowing a merge by
ten-plus minutes or spending the whole month's Actions budget on it — which
means a write-path bug no longer gets caught before merge, only within the
week. `weekly-check.yml` is where that week's clock resets.

It asks for 17:00 Manila on Fridays and, on past form, will not get it
exactly. The daily version of this check asked for 09:00 UTC (17:00 Manila)
every day and never once fired then: measured across 11, 12 and 13 September
it landed between 20:34 and 21:35 Manila, three and a half to four and a half
hours late, varying by an hour between days. GitHub's scheduled workflows are
best-effort on shared runners; there is no setting that fixes this, and
moving the cron earlier only aims at a moving target. Expect Friday evening
rather than exactly 5pm. If a dependable hour is ever wanted, it has to be
triggered by something that keeps time rather than by GitHub's cron.

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

## What a session costs

Measured on 14 September from this repository's own session transcript: 6,132
assistant turns, a mean of 421,534 tokens of context carried per turn, and 2.55
billion tokens of cache reads. Weighted at Opus rates, **79% of the bill was
spent re-reading one conversation** — against 13% writing the cache and 8% on
output.

Nothing was misconfigured. Of 2.58 billion input tokens, 12,216 missed the
cache, a hit rate of 99.9995%. Tool output was not it either: all 3,000 tool
results together came to about a million tokens — 0.04% of the total — and only
seventeen were over 20,000 characters.

The cost is arithmetic. Every turn re-reads the whole conversation before it can
add to it, so the bill is **turns × the context at that turn**, and context only
grows. Cost therefore rises with roughly the *square* of session length.

    6,132 turns x 421,534 mean context = 2,584,845,288
    measured cache reads               = 2,550,881,257

So:

- **One session per job, not per day.** That session covered auto-merge, the
  migration pipeline, journal images, the Drive banner, self-healing and the
  daily check — six unrelated jobs sharing a context that reached 783,766
  tokens, where every turn of the sixth paid to re-read the first. End a session
  when its job is done. Nothing else on this list is worth as much.
- **Spend turns deliberately.** A turn is billed the full context as it stands,
  so a one-line command late in a long session costs as much to issue as a hard
  one. Independent calls go in one block; waiting goes in a background monitor,
  never a poll loop.
- **Do not re-verify what is already settled.** Re-reading a file after editing
  it, re-checking a state already established, re-deriving a conclusion already
  reached. The harness reports a failed edit, so a successful one needs no
  confirming read. This never looks like waste in the moment; it looks like
  being careful.
- **Match the model to the work.** Diagnosis earns Opus — the three auto-merge
  bugs on the 14th each hid behind the one in front of it. Running the suite,
  reading a log and checking whether something merged do not. Fast mode is Opus
  with faster output rather than a cheaper model, so it saves nothing here.

And one thing deliberately *not* done. The heavy comment blocks in
`.github/workflows/` and the length of this file are the most expensive reads in
the repository, and both stay. Those comments found the third 403 on the 14th by
making it recognisable as the same block failing the same way as the first. They
are not to be trimmed for cost.

## graphify

This is a monorepo. Each project folder (e.g. `kin/`) has its own knowledge
graph at `<project>/graphify-out/`, and `graphify-out/graph.json` at this root
is an aggregate of all of them, rebuilt by
`.github/workflows/graphify-deploy.yml` (weekly, and on demand via
`workflow_dispatch` — it ran on every push to main until 18 September, which
on a repo merging several pull requests a day made it one of the larger
recurring costs on a metered Actions budget for an artifact nobody needs
current to the last commit) and kept as the `projects-graph` workflow
artifact — download it from the run and open `index.html`. It used to deploy
to GitHub Pages, which failed silently on
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
