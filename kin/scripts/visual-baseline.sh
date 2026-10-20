#!/usr/bin/env bash
# Fetches main's phone-width screenshots (the `visual-baseline` artifact of
# the latest successful End-to-end run on main) into e2e/visual-baseline/, so
# visual.spec.ts can compare this branch's screens with main's. Used by
# e2e.yml on pull requests; harmless to run by hand with GH_TOKEN set.
#
# Exits 0 whether or not a baseline was found: with none, the spec records
# "no baseline" for every screen and compares nothing. That is the state for
# the first run after this lands, and for a week after any screen is added.
# Needs: gh (GH_TOKEN), unzip, and REPO=owner/name.
set -uo pipefail
REPO="${REPO:-${GITHUB_REPOSITORY:-}}"
DEST="e2e/visual-baseline"
[ -n "$REPO" ] || { echo "REPO is not set."; exit 0; }
mkdir -p "$DEST"

# Newest first, successful runs on main only: a run that failed may have
# stopped before its screenshots, and an older good set beats none.
RUNS=$(gh api "repos/$REPO/actions/workflows/e2e.yml/runs?branch=main&status=success&per_page=15" --jq '.workflow_runs[].id' 2>/dev/null || true)
for run in $RUNS; do
  ART=$(gh api "repos/$REPO/actions/runs/$run/artifacts" --jq '.artifacts[] | select(.name == "visual-baseline" and .expired == false) | .id' 2>/dev/null | head -1 || true)
  [ -n "$ART" ] || continue
  if gh api "repos/$REPO/actions/artifacts/$ART/zip" > "$RUNNER_TEMP/visual-baseline.zip" 2>/dev/null \
     && unzip -o -q "$RUNNER_TEMP/visual-baseline.zip" -d "$DEST"; then
    echo "Baseline: $(ls "$DEST"/*.png 2>/dev/null | wc -l) screenshots from main's run $run."
    exit 0
  fi
done
echo "::notice::No visual-baseline artifact from a successful End-to-end run on main yet; the screenshots will be taken but compared with nothing."
exit 0
