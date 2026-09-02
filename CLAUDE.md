## graphify

This is a monorepo. Each project folder (e.g. `kin/`) has its own knowledge graph at `<project>/graphify-out/` — god nodes, community structure, cross-file relationships. `graphify-out/graph.json` at this root is an *aggregate* of every project's graph, rebuilt automatically by `.github/workflows/graphify-deploy.yml` on every push (via `graphify merge-graphs`) — don't hand-edit it.

Rules:
- For questions scoped to one project, `cd` into it first and run `graphify query "<question>"` against `<project>/graphify-out/graph.json`. Use `graphify path "<A>" "<B>"` and `graphify explain "<concept>"` the same way.
- For cross-project questions (shared patterns, duplicated logic across projects), query the root `graphify-out/graph.json` instead.
- Read a project's `GRAPH_REPORT.md` only for broad architecture review or when query/path/explain don't surface enough context.
- After modifying code in a project, run `graphify update <project>` there to keep its graph current (AST-only, no API cost). The root aggregate refreshes itself in CI on push — no manual step needed.
- Adding a new project folder needs no setup here: the CI workflow auto-discovers any top-level folder with a `package.json`/`pyproject.toml`/`go.mod`/`Cargo.toml`/`requirements.txt` and builds its graph on the next push.
