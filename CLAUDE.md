## Who may push to main

Jonathan (`jiesingian`) owns this repo and decides what lands. Everyone else
proposes; he disposes. That is not a formality — it is how two people can work
on the same app at once without either one's session pulling the ground out
from under the other.

**If you are working for Jonathan** — commit and push to `main` as normal.

**If you are working for anyone else**, including Janine:

- Never commit to `main`, and never push to `main`. Not even for a one-line
  change, and not even when `main` is what you happen to have checked out.
- Start from fresh main every time, on your own branch:
  `git fetch origin main && git checkout -B janine/<short-topic> origin/main`
- Push that branch and open a pull request. Say plainly in the body what you
  changed and why, and flag anything you were unsure about — the PR is where a
  decision gets made, so make the decision easy to make.
- If your branch conflicts with `main`, rebase onto `main` and resolve in
  `main`'s favour. Where the conflict is a real disagreement about how the app
  should behave rather than two edits to the same line, do not resolve it
  yourself: say so in the PR and leave it for Jonathan.
- Do not merge your own pull request, and do not ask to have it merged
  automatically.

Both people's sessions run in their own container against their own clone, so
work in parallel does not collide until a branch is merged. The one thing that
*does* collide is `main` — hence the rule above.

### Small changes merge themselves; large ones wait

A pull request is sorted automatically by `.github/workflows/triage.yml`, from
the diff rather than from anything the author says about it.

The test is not "does this look risky" but **"could we undo it in five
minutes"**. Code is revertible — a bad component ships, someone notices, it is
reverted. So most of the app merges on green CI and is fixed forward. What
waits for Jonathan is what cannot be undone: the way into the app, session
handling, who may see whose data, money, anything that runs code on our
machines, and anything touching the database itself. Or a change past ~400
lines.

Migrations are his alone. They apply when written, not when merged, so by the
time a pull request is read the schema has already moved — review cannot catch
them after the fact. If a change needs one, say so and stop; do not run it.

Do not try to make a change look small to get it merged: splitting one risky
change across several pull requests, or moving code out of a watched path to
dodge the classifier, defeats the only safeguard there is. If you think
something is being held that shouldn't be, say so in the pull request and let
him decide.

CI must be green either way — `npx tsc --noEmit`, `npm run lint` and
`npm run build`, all from `kin/`. Run them before you open the pull request
rather than finding out from the robot.

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
