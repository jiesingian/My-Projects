# Kin — Family Operating System

A family app for one household: Today, Family, Chat, Journal, Planner,
Household and Wealth. Built with Next.js 16 (App Router, TypeScript, React 19,
Tailwind v4) and Supabase (Postgres, Auth, Storage, Realtime).

This file is the map. The detail lives here:

- **`CLAUDE.md`** (and `AGENTS.md`) — how to work in this project.
- **`docs/`** — the backlog (`BACKLOG.md`), known risks (`KNOWN_RISKS.md`),
  the QA households (`QA_HOUSEHOLDS.md`), page patterns, and the setup that
  needs Jonathan (`SETUP_FOR_JONATHAN.md`).
- **`supabase/migrations/`** — the schema. A new `.sql` file there reaches
  dev, then production, by itself when its pull request merges; see the README
  there and the `migrations` skill.
- **`e2e/`** — the end-to-end and logic tests; see the README there.

## Local setup

1. Copy `.env.example` to `.env.local` and fill in what you need. Each
   variable there says what it is for.
2. Point it at `kin-dev`, never production. Test only as the QA household
   (`docs/QA_HOUSEHOLDS.md`).
3. Install and run:

   ```bash
   npm install
   npm run dev
   ```

## Notes

- RLS policies enforce per-record privacy: personal wealth (accounts,
  goals, revenue targets) are visible only to their owner unless marked
  joint; health records and documents carry a "Visible to" field
  (family / parents / just me) enforced server-side, not just in the UI.
- Managed child profiles have no login of their own — they're rows a parent
  edits. A child can also have a login of their own (`child_self`).
