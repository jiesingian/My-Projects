---
name: ship
description: Take finished work in this repository to a pull request that merges itself -- local checks, rebase, migration timestamp, WATCHED line, PR body -- and then follow it until it merges. Use whenever a change is ready to open as a PR.
---

# Ship a change

The gate is CI plus `automerge.yml`; nobody approves anything. Your job ends
when the PR has merged -- not when it is opened (Jonathan, 19 October).

1. **Branch.** Never commit to `main`. `git fetch origin main && git rebase origin/main`.
2. **Checks, from the project folder** (e.g. `kin/`): `npx tsc --noEmit`, `npm run lint`, `npm run build`. Run `npm run e2e` if QA credentials exist; if not, say so in the PR body. Database changes: `npm run test:rls` (PGlite, no credentials needed).
3. **Migrations.** A new `.sql` in `<project>/supabase/migrations/` must be named later than main's newest:
   `git ls-tree --name-only origin/main <project>/supabase/migrations/ | tail -2`.
   Automerge holds a PR whose migration is older and comments the exact `git mv`.
4. **Commit message.** What changed and why, in plain words. If the diff touches a watched path (root `CLAUDE.md` lists them) or >~400 lines, add `WATCHED: <area> -- <what>`. End with the attribution lines the session gives you.
5. **Push** `git push -u origin <branch>` and open the PR, following `.github/pull_request_template.md` (What / Why / Unsure / Checked). Say plainly what was not verified.
6. **Follow it to merge.** Subscribe the session to the PR's activity (`subscribe_pr_activity`), and set one safety-net check-in (`send_later`, ~50 minutes) for a lost event. Then end the turn: CI results, reviews and the merge wake the session; don't poll. On each wake look at the whole PR (CI on the head, conflicts, review threads, automerge's comments):
   - **Red, and the PR's doing:** reproduce locally, fix, run step 2's checks, push.
   - **Red, not the PR's** (dev slow, red on `main` too, the runner died): one comment on the PR saying which check and why, then one re-run. A second failure is real.
   - **Conflict or an automerge hold:** fix it as automerge's comment says (merge `main` in, `git mv` the migration) and push.
   - **Can't be fixed from the session** (a secret, a setting, money): one comment on the PR naming the blocker and the exact steps for a person (`ask-a-person` skill), and tell the user.
   - **Merged:** cancel the check-in; done. `migrate.yml` applies migrations to dev then production on its own.

Stacked PRs: squash-merging the upper PR carries the lower one's commits; the lower PR then has nothing left. `close-absorbed.yml` closes it with a note (after every merge, and hourly) -- nothing to do by hand. Better still, let a docs-only PR merge before building on its branch. Rebase the next branch with `git rebase --onto origin/main <old-base>`.
