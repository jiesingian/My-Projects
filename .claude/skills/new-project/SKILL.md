---
name: new-project
description: Start a new project folder in this monorepo so it inherits the shared workflow (branch, PR, automerge, skills) while keeping its own instructions small. Use when adding a project beside kin/.
---

# A new project in this monorepo

Shared rules stay in the root `CLAUDE.md` and root `.claude/skills/`; every
project inherits them. Each project adds only what is its own.

1. `mkdir <project>` at the root.
2. `<project>/CLAUDE.md` -- under ~60 lines: what the project is, its commands (install/lint/typecheck/build/test), its stack, anything Claude would get wrong. Loaded only when Claude works in that folder.
3. Project-only procedures -> `<project>/.claude/skills/<name>/SKILL.md`. Rules for a subtree -> root `.claude/rules/<name>.md` with `paths:` frontmatter.
4. CI: add the project's checks to `.github/workflows/ci.yml` (path-filtered to `<project>/**`) and list any new check workflow in `automerge.yml`'s `workflow_run` list, or it will never trigger a merge.
5. Databases: follow the `migrations` skill; one Supabase project per app, never shared with real data.
6. Work in one session per task per project; end each session at "PR open, checks started".
