---
name: ship
description: Take finished work in this repository to a pull request that merges itself -- local checks, rebase, migration timestamp, WATCHED line, PR body -- and then stop. Use whenever a change is ready to open as a PR.
---

# Ship a change

The gate is CI plus `automerge.yml`; nobody approves anything. Your job ends
when the PR is open and its checks have started.

1. **Branch.** Never commit to `main`. `git fetch origin main && git rebase origin/main`.
2. **Checks, from the project folder** (e.g. `kin/`): `npx tsc --noEmit`, `npm run lint`, `npm run build`. Run `npm run e2e` if QA credentials exist; if not, say so in the PR body. Database changes: `npm run test:rls` (PGlite, no credentials needed).
3. **Migrations.** A new `.sql` in `<project>/supabase/migrations/` must be named later than main's newest:
   `git ls-tree --name-only origin/main <project>/supabase/migrations/ | tail -2`.
   Automerge holds a PR whose migration is older and comments the exact `git mv`.
4. **Commit message.** What changed and why, in plain words. If the diff touches a watched path (root `CLAUDE.md` lists them) or >~400 lines, add `WATCHED: <area> -- <what>`. End with the attribution lines the session gives you.
5. **Push** `git push -u origin <branch>` and open the PR, following `.github/pull_request_template.md` (What / Why / Unsure / Checked). Say plainly what was not verified.
6. **Stop.** Don't wait on CI in the session. `automerge.yml` merges on green; `migrate.yml` applies migrations to dev then production. Come back only if a check fails or automerge comments a hold.

Stacked PRs: squash-merging the upper PR carries the lower one's commits; the lower PR then has nothing left -- close it with a note naming the merge commit. Rebase the next branch with `git rebase --onto origin/main <old-base>`.
