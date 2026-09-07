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
# Both values below are public by design: the anon key is what the browser
# carries on every request, and RLS is what actually protects the data. The
# service role key is a real secret, is NOT here, and is only needed by the
# Drive OAuth routes -- add it by hand if you are working on those.
if [ ! -f .env.local ]; then
  cat > .env.local <<'ENV'
NEXT_PUBLIC_SUPABASE_URL=https://lffqluudphzviubygwjs.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmZnFsdXVkcGh6dml1Ynlnd2pzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyNTA1OTQsImV4cCI6MjEwMzgyNjU5NH0.FuU23Nrm8sBK1IiWq2zlIE7gzdp_Eysp7dx3o3_e6kI
ENV
fi

# ── graphify ─────────────────────────────────────────────────────────────
# Pinned to the version that produced the committed cache. A newer one
# re-extracts every file and rewrites graph.json by thousands of lines, which
# buries a real change in noise and collides with whoever else is working.
# Keep this in step with kin/graphify-out/cache/ast/.
GRAPHIFY_VERSION="0.9.55"
if ! command -v graphify >/dev/null 2>&1 || \
   [ "$(graphify --version 2>/dev/null | awk '{print $2}')" != "$GRAPHIFY_VERSION" ]; then
  pip install --quiet "graphifyy==${GRAPHIFY_VERSION}" || \
    echo "graphify $GRAPHIFY_VERSION could not be installed; 'graphify update .' will not work this session."
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
