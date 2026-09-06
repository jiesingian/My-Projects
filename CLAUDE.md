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
the diff rather than from anything the author says about it. A change merges on
its own once CI is green **unless** it touches auth, session handling, server
actions, API routes, the paywall, the database types, or the toolchain — or
runs past ~150 changed lines. Those wait for Jonathan.

Do not try to make a change look small to get it merged: splitting one risky
change across several pull requests, or moving code out of a watched path to
dodge the classifier, defeats the only safeguard there is. If you think
something is being held that shouldn't be, say so in the pull request and let
him decide.

CI must be green either way — `npx tsc --noEmit`, `npm run lint` and
`npm run build`, all from `kin/`. Run them before you open the pull request
rather than finding out from the robot.

## graphify

This is a monorepo. Each project folder (e.g. `kin/`) has its own knowledge graph at `<project>/graphify-out/` — god nodes, community structure, cross-file relationships. `graphify-out/graph.json` at this root is an *aggregate* of every project's graph, rebuilt automatically by `.github/workflows/graphify-deploy.yml` on every push (via `graphify merge-graphs`) — don't hand-edit it.

Rules:
- For questions scoped to one project, `cd` into it first and run `graphify query "<question>"` against `<project>/graphify-out/graph.json`. Use `graphify path "<A>" "<B>"` and `graphify explain "<concept>"` the same way.
- For cross-project questions (shared patterns, duplicated logic across projects), query the root `graphify-out/graph.json` instead.
- Read a project's `GRAPH_REPORT.md` only for broad architecture review or when query/path/explain don't surface enough context.
- After modifying code in a project, run `graphify update <project>` there to keep its graph current (AST-only, no API cost). The root aggregate refreshes itself in CI on push — no manual step needed.
- Adding a new project folder needs no setup here: the CI workflow auto-discovers any top-level folder with a `package.json`/`pyproject.toml`/`go.mod`/`Cargo.toml`/`requirements.txt` and builds its graph on the next push.
