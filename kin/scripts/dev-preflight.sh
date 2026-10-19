#!/usr/bin/env bash
# Is dev's Supabase answering, before a check spends its time on it?
#
# 19 October: dev (free plan) was overloaded for three hours and at 06:31 UTC
# its Auth stopped altogether. Every pull request's End-to-end and Schema
# check then failed at sign-in -- fifteen red PRs, none of them about their
# own code, each needing a re-run by hand once dev was restarted.
#
# This asks Auth's health endpoint first (well under a second when healthy),
# for up to about four minutes. If dev answers, the check carries on as
# before. If it does not, the run CANCELS ITSELF instead of failing:
# automerge.yml's sweep re-runs a cancelled End-to-end or Schema check by
# itself (at most three attempts per commit), so a sick dev means a PR that
# waits, not a PR that goes red and sits there.
#
# Usage: dev-preflight.sh <supabase url> <anon key>
# Needs GH_TOKEN with actions: write, and GITHUB_RUN_ID / GITHUB_REPOSITORY
# (both set by Actions), to cancel the run. Without them it fails instead.
set -uo pipefail

url="${1:?supabase url}"
key="${2:?anon key}"
tries=${PREFLIGHT_TRIES:-8}   # 8 tries, 30 seconds apart: about four minutes

for i in $(seq 1 "$tries"); do
  # curl prints 000 itself when it cannot connect; its exit code is not needed.
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 10 "$url/auth/v1/health" -H "apikey: $key")
  if [ "$code" = "200" ]; then
    echo "dev is answering (Auth health $code on try $i)."
    exit 0
  fi
  echo "dev's Auth answered $code (try $i of $tries)."
  [ "$i" -lt "$tries" ] && sleep 30
done

echo "::warning::dev's Supabase Auth is not answering ($code), so this check cannot tell anything about this PR. Cancelling rather than failing: automerge.yml re-runs it later. If it stays down, dev needs a restart (Supabase dashboard -> kin-dev -> Settings -> General -> Restart project)."
if [ -n "${GH_TOKEN:-}" ] && [ -n "${GITHUB_RUN_ID:-}" ]; then
  gh run cancel "$GITHUB_RUN_ID" --repo "$GITHUB_REPOSITORY" && sleep 120
fi
# Reached only if the cancel did not take: fail plainly, naming the cause.
echo "::error::dev's Supabase Auth is down -- not this PR's fault."
exit 1
