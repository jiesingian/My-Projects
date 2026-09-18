@AGENTS.md

## graphify

This project has a knowledge graph at `graphify-out/`. `graph.json` is **not
committed** — it regenerates from source, and its diffs buried every real
change — so the session hook builds it on a fresh clone, for free, with no
Actions cost. CI also rebuilds it, weekly and on demand (not on every push,
since 18 September -- see the root `CLAUDE.md`'s graphify section), and keeps
it as the `projects-graph` workflow artifact. The semantic layer that a paid
LLM pass produced (`.graphify_labels.json`, `cache/semantic/`) *is*
committed, because nothing can recreate it for free.

Use it for what it is actually good at, which was measured on this codebase
rather than assumed:

- **Relationship and breadth questions** — what reaches the billing code, which
  hubs a change would touch, what a concept spans. `graphify query "<question>"`,
  `graphify path "<A>" "<B>"`, `graphify explain "<concept>"`.
- **Not for locating a known symbol.** Asked where authentication lives, a
  query returned 11 nodes, every one of them from README.md, naming no source
  file, for ~620 tokens. `grep -rl` answered the same question exactly, in 16
  file paths, for ~110. At 183 files this codebase is small enough that grep
  wins on both cost and precision; reach for the graph when grep returns more
  hits than you can triage, not before.
- Read `GRAPH_REPORT.md` only for a broad architecture review.
- After modifying code, run `graphify update .` to keep the graph current
  (AST-only, no API cost). It writes only ignored files now, so it will not
  dirty the tree.
- Never run `graphify label`. It is a paid LLM pass and Jonathan's call.
