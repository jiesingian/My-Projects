# Graph Report - kin  (2026-09-03)

## Corpus Check
- 96 files · ~32,644 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 442 nodes · 1164 edges · 21 communities (12 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2a92de56`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- icons.tsx
- [id]/page.tsx
- getCurrentMember
- auth.ts
- devDependencies
- settings/page.tsx
- compilerOptions
- createClient
- requireCurrentMember
- Kin — Family Operating System
- journal/page.tsx
- proxy.ts
- app/layout.tsx
- eslint.config.mjs
- next.config.ts
- postcss.config.mjs
- File Icon (public/file.svg)
- Globe Icon
- Next.js Logo (public/next.svg)
- Vercel Logo (UI Icon Asset)
- Window Icon

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 97 edges
2. `getCurrentMember` - 44 edges
3. `requireCurrentMember()` - 31 edges
4. `formatDate()` - 19 edges
5. `ActionState` - 18 edges
6. `Icon()` - 17 edges
7. `ErrorText()` - 16 edges
8. `compilerOptions` - 16 edges
9. `SubmitButton()` - 13 edges
10. `getValidDriveAccessToken()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `Next.js Agent Rules Block (AGENTS.md)` --conceptually_related_to--> `Next.js 16 (App Router, TypeScript)`  [INFERRED]
  AGENTS.md → README.md
- `FamilyPage()` --calls--> `getCurrentMember`  [EXTRACTED]
  src/app/(app)/family/page.tsx → src/lib/session.ts
- `NewMealPage()` --indirect_call--> `addMealPlanAction()`  [INFERRED]
  src/app/(app)/household/meals/new/page.tsx → src/lib/actions/household.ts
- `HouseholdPage()` --calls--> `getCurrentMember`  [EXTRACTED]
  src/app/(app)/household/page.tsx → src/lib/session.ts
- `JournalPage()` --calls--> `getCurrentMember`  [EXTRACTED]
  src/app/(app)/journal/page.tsx → src/lib/session.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kin Frontend/Backend Technology Stack** — readme_kin_family_os, readme_nextjs_16, readme_react_19, readme_tailwind_v4, readme_supabase [EXTRACTED 1.00]
- **Kin Privacy/Access Control Mechanisms** — readme_rls_policies, readme_managed_child_profiles, readme_supabase_auth_otp [INFERRED 0.85]

## Communities (21 total, 9 thin omitted)

### Community 0 - "icons.tsx"
Cohesion: 0.12
Nodes (19): DocFolderPage(), TodayPage(), DeleteButton(), DocFileRow(), DownloadLink(), Icon(), IconName, iconPaths (+11 more)

### Community 1 - "[id]/page.tsx"
Cohesion: 0.13
Nodes (21): MemberDetailPage(), Seg, SEGMENTS, DocumentsPane(), FamilyPage(), HealthPane(), MembersPane(), Seg (+13 more)

### Community 2 - "getCurrentMember"
Cohesion: 0.08
Nodes (29): GET(), NewDocPage(), NewHealthEntryForm(), NewHealthEntryPage(), OmronToggle(), NewJournalEntryPage(), AppLayout(), AddPlannerForm() (+21 more)

### Community 3 - "auth.ts"
Cohesion: 0.07
Nodes (44): initialState, TYPES, VISIBILITY, initialState, initialState, NewMilestonePage(), CALLBACK_ERROR_MESSAGES, initialState (+36 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (36): eslint, eslint-config-next, next, dependencies, next, react, react-dom, @supabase/ssr (+28 more)

### Community 5 - "settings/page.tsx"
Cohesion: 0.17
Nodes (17): DRIVE_ERROR_MESSAGES, CopyInviteCode(), DriveConnectedPanel(), HouseholdNameForm(), HouseholdPrefsForm(), InviteCodeCard(), NOTIF_DEFS, NotificationToggles() (+9 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 8 - "createClient"
Cohesion: 0.07
Nodes (46): NewMealPage(), BillsPane(), BuyPane(), HouseholdPage(), MealsPane(), Seg, SEGMENTS, CalendarPane() (+38 more)

### Community 9 - "requireCurrentMember"
Cohesion: 0.10
Nodes (30): NewDocForm(), onSubmit(), VISIBILITY, NewEntryForm(), onSubmit(), ActivityForm(), EventForm(), GoalForm() (+22 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "journal/page.tsx"
Cohesion: 0.10
Nodes (35): GET(), DELETE(), GET(), POST(), SessionRequest, EntriesPane(), GalleryPane(), JournalPage() (+27 more)

### Community 12 - "proxy.ts"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

## Knowledge Gaps
- **120 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+115 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 143 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `icons.tsx`, `[id]/page.tsx`, `getCurrentMember`, `auth.ts`, `settings/page.tsx`, `requireCurrentMember`, `journal/page.tsx`?**
  _High betweenness centrality (0.196) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `getCurrentMember` to `icons.tsx`, `[id]/page.tsx`, `auth.ts`, `settings/page.tsx`, `createClient`, `requireCurrentMember`, `journal/page.tsx`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Why does `requireCurrentMember()` connect `requireCurrentMember` to `icons.tsx`, `getCurrentMember`, `auth.ts`, `settings/page.tsx`, `createClient`, `journal/page.tsx`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _120 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `icons.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.12473118279569892 - nodes in this community are weakly interconnected._
- **Should `[id]/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.12873563218390804 - nodes in this community are weakly interconnected._
- **Should `getCurrentMember` be split into smaller, more focused modules?**
  _Cohesion score 0.08456659619450317 - nodes in this community are weakly interconnected._