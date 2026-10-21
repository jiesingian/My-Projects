#!/usr/bin/env bash
# Shows a pull request what changed on the phone, as pictures.
#
# Reads visual-out/report.json from visual.spec.ts. When a screen differs from
# main's by more than the threshold, the before (main), after (this branch)
# and diff images are pushed to the `ci-screenshots` branch -- an orphan
# branch that holds nothing but these pictures, one folder per pull request,
# overwritten on every run -- and one comment on the pull request shows them
# side by side, edited in place on later pushes. No change: no pictures
# pushed, and the comment (if an earlier push made one) is edited to say so.
#
# Why a branch: the GitHub API cannot attach an image to a comment, and the
# repository is public, so raw.githubusercontent.com serves a committed PNG
# to anyone reading the pull request. Pushing to that branch starts no
# workflow (every push trigger here is scoped to main). Everything is
# `|| true`: a picture that could not be posted must never fail the suite.
#
# Needs: gh (GH_TOKEN with contents and pull-requests write), git, jq, and
# REPO=owner/name, PR=<number>, HEAD_SHA=<the commit tested>.
set -uo pipefail
REPO="${REPO:-${GITHUB_REPOSITORY:-}}"
MARK="<!-- visual-phone -->"
REPORT="visual-out/report.json"
BRANCH="ci-screenshots"

[ -n "${REPO:-}" ] && [ -n "${PR:-}" ] || { echo "REPO and PR are needed."; exit 0; }
if [ ! -f "$REPORT" ]; then echo "No $REPORT: the screenshots did not run."; exit 0; fi

EXISTING=$(gh api "repos/$REPO/issues/$PR/comments?per_page=100" --jq ".[] | select(.body | startswith(\"$MARK\")) | .id" 2>/dev/null | head -1 || true)
CHANGED=$(jq -r '[.screens[] | select(.status == "changed" or .status == "accepted")] | length' "$REPORT")
NOBASE=$(jq -r '[.screens[] | select(.status == "no-baseline")] | length' "$REPORT")
TOTAL=$(jq -r '.screens | length' "$REPORT")
WARN=$(jq -r '.warnOnly' "$REPORT")
THRESH=$(jq -r '.maxDiffRatio' "$REPORT")

post() {
  local body="$1"
  if [ -n "$EXISTING" ]; then
    gh api -X PATCH "repos/$REPO/issues/comments/$EXISTING" -f body="$body" >/dev/null && echo "Updated the comment." || echo "Could not update the comment (not fatal)."
  else
    gh api -X POST "repos/$REPO/issues/$PR/comments" -f body="$body" >/dev/null && echo "Posted the comment." || echo "Could not post the comment (not fatal)."
  fi
}

if [ "$CHANGED" = "0" ]; then
  if [ -n "$EXISTING" ]; then
    post "$(printf '%s\n### Phone screenshots: back to main\n\nThe latest push shows no screen differing from main by more than %s of its pixels (%s screens, %s with no baseline yet).\n' "$MARK" "$THRESH" "$TOTAL" "$NOBASE")"
  else
    echo "No screen changed; no comment."
  fi
  exit 0
fi

# ── Push the pictures ───────────────────────────────────────────────────────
WORK=$(mktemp -d)
DIR="pr-$PR"
URL_BASE=""
(
  set -e
  cd "$WORK"
  git init -q
  git config user.name "github-actions[bot]"
  git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
  git remote add origin "https://x-access-token:${GH_TOKEN}@github.com/$REPO.git"
  if git fetch -q --depth=1 origin "$BRANCH" 2>/dev/null; then
    git checkout -q -b "$BRANCH" FETCH_HEAD
  else
    git checkout -q --orphan "$BRANCH"
    printf '# CI screenshots\n\nPhone-width before/after pictures posted on pull requests by e2e.yml (kin/scripts/visual-comment.sh). One folder per pull request, overwritten on each run. Nothing here is source.\n' > README.md
  fi
  rm -rf "$DIR" && mkdir -p "$DIR"
) || { echo "Could not prepare the $BRANCH branch (not fatal)."; }
if [ -d "$WORK/$DIR" ]; then
  for slug in $(jq -r '.screens[] | select(.status == "changed" or .status == "accepted") | .slug' "$REPORT"); do
    cp "visual-out/$slug.png" "$WORK/$DIR/$slug-after.png" 2>/dev/null || true
    cp "e2e/visual-baseline/$slug.png" "$WORK/$DIR/$slug-before.png" 2>/dev/null || true
    cp "visual-out/$slug-diff.png" "$WORK/$DIR/$slug-diff.png" 2>/dev/null || true
  done
  SHA=$(cd "$WORK" && git add -A && git commit -q -m "Screenshots for #$PR at ${HEAD_SHA:-unknown}" && git push -q origin "$BRANCH" 2>/dev/null && git rev-parse HEAD) || SHA=""
  if [ -z "$SHA" ]; then
    # Somebody else's run pushed first; take theirs and try once more.
    SHA=$(cd "$WORK" && git fetch -q origin "$BRANCH" && git reset -q --soft FETCH_HEAD && git commit -q -m "Screenshots for #$PR at ${HEAD_SHA:-unknown}" && git push -q origin "$BRANCH" 2>/dev/null && git rev-parse HEAD) || SHA=""
  fi
  [ -n "$SHA" ] && URL_BASE="https://raw.githubusercontent.com/$REPO/$SHA/$DIR"
fi

# ── The comment ─────────────────────────────────────────────────────────────
{
  echo "$MARK"
  if [ "$WARN" = "true" ]; then echo "### Phone screenshots: $CHANGED of $TOTAL differ from main (warn-only, nothing fails yet)"; else echo "### Phone screenshots: $CHANGED of $TOTAL differ from main"; fi
  if [ "$WARN" != "true" ]; then echo; echo "A difference not accepted fails the e2e job. Intended? Add the line its failure prints (\`<slug> #$PR\`) to \`kin/e2e/visual-accept.txt\` in this pull request; main's pictures refresh themselves once it merges."; fi
  echo
  echo "390px, light, as the sample household. A screen counts as changed above $THRESH of its pixels; the clock is frozen, so the date and time of day match main's. Look at each pair: is it the change this pull request meant to make?"
  echo
  jq -r '.screens[] | select(.status == "changed" or .status == "accepted") | "\(.name) · Simple Kin \(.mode)\(if .status == "accepted" then " (accepted for this pull request)" else "" end)|\(.slug)|\(.ratio // "size changed")"' "$REPORT" | while IFS='|' read -r title slug ratio; do
    echo "<details><summary><b>$title</b> — differing pixels: $ratio</summary>"
    echo
    if [ -n "$URL_BASE" ]; then
      echo "| main | this branch | difference |"
      echo "|---|---|---|"
      echo "| <img src=\"$URL_BASE/$slug-before.png\" width=\"250\"> | <img src=\"$URL_BASE/$slug-after.png\" width=\"250\"> | <img src=\"$URL_BASE/$slug-diff.png\" width=\"250\"> |"
    else
      echo "_The pictures could not be pushed to the \`$BRANCH\` branch; they are in this run's \`visual-screenshots\` artifact._"
    fi
    echo
    echo "</details>"
  done
  if [ "$NOBASE" != "0" ]; then echo; echo "_${NOBASE} screen(s) had no baseline from main yet and were only recorded._"; fi
  echo
  echo "Full set, diffs included: this run's \`visual-screenshots\` artifact. The spec: \`kin/e2e/visual.spec.ts\`."
} > "$WORK/comment.md"
post "$(cat "$WORK/comment.md")"
rm -rf "$WORK"
