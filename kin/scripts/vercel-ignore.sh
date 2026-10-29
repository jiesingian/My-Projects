#!/usr/bin/env bash
# Vercel's Ignored Build Step (vercel.json "ignoreCommand"): exit 0 skips the
# build, exit 1 builds. Vercel runs it from kin/, before installing anything.
#
# Only main deploys on its own (vercel.json git.deploymentEnabled, 20
# October): the Hobby plan allows 100 deployments a day, and a preview for
# every push to every pull request -- skipped ones count too -- ran it out on
# 19 and 20 October, when automerge.yml held every pull request behind a
# rate-limited Vercel. Nobody tests a preview: CI and e2e build the app
# themselves. A pull request's preview is now made only when somebody asks
# for one (kin/docs/SETUP_FOR_JONATHAN.md, "A preview on request").
#
# So this script sees two kinds of deployment:
#   - a preview somebody asked for: always built, that is what they asked;
#   - main: skipped when nothing the app is built from changed since main's
#     last deployment -- kin/docs, kin/e2e, kin/supabase (migrations reach
#     the database through migrate.yml, not the build), any .md, the
#     Playwright config, this script, and everything outside kin/.
#
# Whenever it can't tell, it builds: a wrong build costs a deployment, a
# wrong skip would hide a broken one.
set -uo pipefail

APP_SKIP='^kin/(docs|e2e|supabase|graphify-out)/|\.md$|^kin/playwright\.config\.ts$|^kin/scripts/vercel-ignore\.sh$'

build() { echo "Building: $1"; exit 1; }

if [ "${VERCEL_GIT_COMMIT_REF:-}" != "main" ]; then
  build "a preview of ${VERCEL_GIT_COMMIT_REF:-this commit}, asked for by hand."
fi

BASE="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$BASE" ] || ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then
  build "main with no earlier deployment to compare with."
fi

# The same commit again is a redeploy somebody asked for by hand, almost
# always to pick up a new or changed environment variable (SETUP_FOR_JONATHAN.md
# says "then redeploy" after every secret). Comparing the commit with itself
# finds nothing, so it was skipped and the new secret never reached the app
# (29 October, FCM_SERVICE_ACCOUNT_JSON). A push to main is always a new
# commit, so this never builds one the rules below would skip.
[ "$(git rev-parse HEAD)" != "$(git rev-parse "$BASE^{commit}")" ] || build "a redeploy of ${BASE:0:7}, asked for by hand (a new environment variable)."

CHANGED=$(git diff --name-only "$BASE" HEAD) || build "can't compare with $BASE."
APP=$(printf '%s\n' "$CHANGED" | grep '^kin/' | grep -Ev "$APP_SKIP" || true)
[ -z "$APP" ] || build "app files changed since ${BASE:0:7}: $(printf '%s\n' "$APP" | head -3 | tr '\n' ' ')"

echo "Skipping: nothing the app is built from changed since ${BASE:0:7}."
exit 0
