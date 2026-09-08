#!/bin/bash
# Gets a fresh session to the point where it can actually check its work:
# lint, typecheck, build and the end-to-end suite, without ten minutes of
# rediscovering the same setup every time.
set -euo pipefail

# Only for Claude Code on the web. A laptop already has all of this.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}/kin"

# ── the app ──────────────────────────────────────────────────────────────
# Playwright's browsers are preinstalled in this image and downloading
# another is blocked, so the install must not try.
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
npm install --no-audit --no-fund

# ── the environment the app needs to boot ────────────────────────────────
# .env.local is gitignored and never committed, so a fresh clone has none and
# `next dev` cannot start.
#
# Both values below are public by design: this key is what the browser carries
# on every request, and RLS is what actually protects the data. The service
# role key is a real secret, is NOT here, and is only needed by the Drive OAuth
# routes -- add it by hand if you are working on those.
#
# Deliberately the sb_publishable_ key rather than the older anon JWT. Both
# work and both are public, but the JWT is shaped like a real secret, so
# committing it makes the secret scan cry wolf -- and a scan you have learned
# to ignore is worse than no scan.
if [ ! -f .env.local ]; then
  cat > .env.local <<'ENV'
NEXT_PUBLIC_SUPABASE_URL=https://lffqluudphzviubygwjs.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_brdc3PF1jA2tCSEIBhBEYA_VGL4D-mG
ENV
fi

# ── graphify ─────────────────────────────────────────────────────────────
# Pinned so the AST extractor stays compatible with the committed semantic
# layer (.graphify_labels.json and cache/semantic/, which came from a paid LLM
# pass and cannot be rebuilt for free).
GRAPHIFY_VERSION="0.9.55"
if ! command -v graphify >/dev/null 2>&1 || \
   [ "$(graphify --version 2>/dev/null | awk '{print $2}')" != "$GRAPHIFY_VERSION" ]; then
  pip install --quiet "graphifyy==${GRAPHIFY_VERSION}" || \
    echo "graphify $GRAPHIFY_VERSION could not be installed; 'graphify update .' will not work this session."
fi

# graph.json is no longer committed -- it regenerates from source and its diffs
# were burying real changes -- so a fresh clone has no graph at all until this
# runs. AST-only, no API key, no cost, about half a minute. Failure is not
# fatal: the graph is a convenience, and grep still works without it.
if command -v graphify >/dev/null 2>&1 && [ ! -f graphify-out/graph.json ]; then
  graphify update . >/dev/null 2>&1 || echo "graphify update failed; queries will not work this session."
fi

# ── the end-to-end suite ─────────────────────────────────────────────────
# It refuses to run without these, which is deliberate: without them it would
# quietly test a logged-out shell. They name a throwaway household that exists
# only to be tested against. The password is not stored here -- set
# E2E_PASSWORD yourself when you want to run the suite.
{
  echo 'export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1'
  echo 'export PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium'
  echo 'export E2E_EMAIL=kin-e2e-qa@example.com'
  echo 'export E2E_BASE_URL=http://localhost:3000'
} >> "${CLAUDE_ENV_FILE:-/dev/null}"

echo "kin is ready: npm run lint · npx tsc --noEmit · npm run build · npm run e2e"
