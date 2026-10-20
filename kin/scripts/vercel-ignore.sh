#!/usr/bin/env bash
# Vercel's Ignored Build Step (vercel.json "ignoreCommand"): exit 0 skips the
# build, exit 1 builds. Vercel runs it from kin/, before installing anything.
#
# Why (19 October): the Hobby plan creates at most 100 deployments a day and
# keeps 10 GB of them. Every push to every pull request built a preview, docs
# and workflow changes included, and both ran out the same day: Vercel then
# refused every build ("Deployment rate limited -- retry in 24 hours", API
# code api-deployments-free-per-day), and automerge.yml, which needs Vercel
# green, merged nothing. CI and e2e build the app themselves and never test a
# preview, so a change the app isn't built from has nothing to show there.
#
# Not built from: kin/docs, kin/e2e, kin/supabase (migrations reach the
# database through migrate.yml, not the build), any .md, the Playwright
# config, and everything outside kin/ (.github, root docs).
#
# Whenever it can't tell, it builds: a wrong build costs a deployment, a
# wrong skip would hide a broken one.
set -uo pipefail

APP_SKIP='^kin/(docs|e2e|supabase|graphify-out)/|\.md$|^kin/playwright\.config\.ts$|^kin/scripts/vercel-ignore\.sh$'

build() { echo "Building: $1"; exit 1; }

# main, from origin or -- when Vercel's clone has no origin it can fetch
# from, as on #720's first deployment (19 October: "no earlier commit to
# compare with" on a BACKLOG-only branch) -- from the public repository
# Vercel names. The repository is public, so no credential is needed.
fetch_main() {
  git fetch -q --depth=200 origin main 2>/dev/null && return 0
  echo "origin has no main to fetch; trying the public repository."
  [ -n "${VERCEL_GIT_REPO_OWNER:-}" ] && [ -n "${VERCEL_GIT_REPO_SLUG:-}" ] || return 1
  git fetch -q --depth=200 "https://github.com/$VERCEL_GIT_REPO_OWNER/$VERCEL_GIT_REPO_SLUG.git" main 2>/dev/null
}

# main: the last commit it deployed. A pull request branch: where it left
# main, so only its own changes count. Comparing a branch with its last
# deployment counted everything a merge of main brought in (20 October: each
# SQL-only fix, brought up to date with main to settle its migration list,
# built a preview of main's app changes, spent the day's 100 deployments, and
# automerge held all of them on a rate-limited Vercel). What main brings is
# built and tested when it lands on main.
BASE=""
if [ "${VERCEL_GIT_COMMIT_REF:-}" = "main" ]; then
  BASE="${VERCEL_GIT_PREVIOUS_SHA:-}"
fi
if [ -z "$BASE" ] || ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then
  BASE=""
  if [ "${VERCEL_GIT_COMMIT_REF:-}" = "main" ]; then
    build "main with no earlier deployment to compare with."
  fi
  fetch_main || build "couldn't fetch main to find where this branch left it."
  BASE=$(git merge-base FETCH_HEAD HEAD 2>/dev/null || true)
  [ -n "$BASE" ] || build "main and this branch share no commit in the fetched history."
fi

CHANGED=$(git diff --name-only "$BASE" HEAD) || build "can't compare with $BASE."
APP=$(printf '%s\n' "$CHANGED" | grep '^kin/' | grep -Ev "$APP_SKIP" || true)
[ -z "$APP" ] || build "app files changed since ${BASE:0:7}: $(printf '%s\n' "$APP" | head -3 | tr '\n' ' ')"

echo "Skipping: nothing the app is built from changed since ${BASE:0:7}."
exit 0
