#!/usr/bin/env bash
# Waits until no End-to-end run (e2e.yml) is queued or going, for at most 40
# minutes, so a weekly-check suite job can then take the e2e-dev slot without
# waiting on it -- a waiter in that group is cancelled by the next one to
# queue (weekly-check.yml's `turn` job says why that matters). Used by both
# `turn` jobs, before each half of the suite. Needs GH_TOKEN and REPO.
set -euo pipefail
deadline=$(( $(date +%s) + 40 * 60 ))
while :; do
  # in_progress AND queued: a pull request's run waiting on the
  # e2e-dev group reads "queued", and it would go before us.
  busy=$(for status in in_progress queued; do
      gh api "repos/$REPO/actions/workflows/e2e.yml/runs?status=$status&per_page=100" --jq '.workflow_runs[]'
    done | jq -s 'unique_by(.id) | length')
  if [ "$busy" -eq 0 ]; then
    echo "Dev is free: no End-to-end run queued or going."
    break
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "::warning::Waited 40 minutes for dev ($busy End-to-end runs still queued or going); taking the e2e-dev slot as it comes."
    break
  fi
  echo "$busy End-to-end run(s) on dev; waiting."
  sleep 30
done
