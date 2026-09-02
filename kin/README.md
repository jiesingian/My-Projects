# Kin — Family Operating System

A family management app: one household, five hubs (Family, Journal, Planner,
Household, Wealth). Built with Next.js 16 (App Router, TypeScript) and
Supabase (Postgres, Auth, Storage). Implements the `Kin - Family App`
design from the Claude Design handoff bundle, carrying over its "Industry"
blueprint design system (steel-blue, Barlow Condensed, hairline borders).

## Stack

- **Frontend**: Next.js 16, React 19, Tailwind v4 (CSS-first config) layered
  with the Industry design tokens in `src/app/globals.css`.
- **Backend**: Supabase project `kin-family-app` (`lffqluudphzviubygwjs`,
  ap-southeast-1) — full schema, row-level security, and storage buckets are
  already applied as migrations. See `supabase/` conventions or the
  project dashboard for the schema; there's no local `supabase/` folder
  checked in here since the migrations were applied directly via the
  Supabase MCP tooling during the build.
- **Auth**: email + password with a 6-digit email verification code
  (Supabase's OTP-in-the-confirmation-email pattern — see setup below).

## Local setup

1. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from the
     Supabase project's API settings.
   - `SUPABASE_SERVICE_ROLE_KEY` — only needed for the Google Drive OAuth
     route handlers (`/api/drive/*`), which read/write the `drive_tokens`
     table that RLS deliberately hides from every other role.
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` —
     only needed if you want Settings → Connected storage → Google Drive to
     actually work. Without them the button explains it isn't configured
     instead of erroring.

2. **Supabase Auth email template** — the onboarding "Verify email" screen
   expects a 6-digit code, not a magic link. In the Supabase dashboard under
   Authentication → Email Templates → "Confirm signup", add `{{ .Token }}`
   to the template body (e.g. `Your code: {{ .Token }}`). Without this,
   Supabase sends a confirmation link instead and the code field won't work.

3. **Google Cloud OAuth client** (optional, for Drive linking) — create an
   OAuth 2.0 Client ID in Google Cloud Console, add
   `https://www.googleapis.com/auth/drive.file` as a scope, and set the
   redirect URI to match `GOOGLE_REDIRECT_URI`.

4. Install and run:

   ```bash
   npm install
   npm run dev
   ```

## Notes on this build

- This app was built and verified (type-checked, linted, `next build`)
  inside a sandboxed session whose network egress policy blocks
  `*.supabase.co`, so the signup → Supabase Auth flow could not be
  exercised end-to-end from inside that sandbox — only from a normal
  deployment (Vercel, or any host with unrestricted outbound HTTPS) or a
  developer's own machine. Test the auth flow there before shipping.
- RLS policies enforce per-record privacy: personal wealth (accounts,
  goals, revenue targets) are visible only to their owner unless marked
  joint; health records and documents carry a "Visible to" field
  (family / parents / just me) enforced server-side, not just in the UI.
- Managed child profiles (pre-literate children) have no `auth_user_id` and
  no login — they're rows a parent edits, matching the design's decision
  that there's no kid login in v1.
