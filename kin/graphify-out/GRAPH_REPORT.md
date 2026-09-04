# Graph Report - kin  (2026-09-04)

## Corpus Check
- 124 files · ~51,107 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 626 nodes · 1748 edges · 24 communities (15 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `44d4f9e9`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- database.types.ts
- getCurrentMember
- wealth/page.tsx
- auth.ts
- devDependencies
- settings/page.tsx
- compilerOptions
- [id]/page.tsx
- google-drive.ts
- planner/page.tsx
- Kin — Family Operating System
- hub-header.tsx
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
- createClient
- household/page.tsx

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 134 edges
2. `requireCurrentMember()` - 59 edges
3. `getCurrentMember` - 50 edges
4. `ActionState` - 23 edges
5. `syncRowToCalendars()` - 21 edges
6. `formatDate()` - 21 edges
7. `getValidDriveAccessToken()` - 19 edges
8. `createAdminClient()` - 19 edges
9. `ErrorText()` - 17 edges
10. `Icon()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `NewMealPage()` --indirect_call--> `addMealPlanAction()`  [INFERRED]
  src/app/(app)/household/meals/new/page.tsx → src/lib/actions/household.ts
- `Next.js Agent Rules Block (AGENTS.md)` --conceptually_related_to--> `Next.js 16 (App Router, TypeScript)`  [INFERRED]
  AGENTS.md → README.md
- `HouseholdPage()` --calls--> `getCurrentMember`  [EXTRACTED]
  src/app/(app)/household/page.tsx → src/lib/session.ts
- `JournalPage()` --calls--> `getCurrentMember`  [EXTRACTED]
  src/app/(app)/journal/page.tsx → src/lib/session.ts
- `AppLayout()` --calls--> `getCurrentMember`  [EXTRACTED]
  src/app/(app)/layout.tsx → src/lib/session.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kin Frontend/Backend Technology Stack** — readme_kin_family_os, readme_nextjs_16, readme_react_19, readme_tailwind_v4, readme_supabase [EXTRACTED 1.00]
- **Kin Privacy/Access Control Mechanisms** — readme_rls_policies, readme_managed_child_profiles, readme_supabase_auth_otp [INFERRED 0.85]

## Communities (24 total, 9 thin omitted)

### Community 0 - "database.types.ts"
Cohesion: 0.06
Nodes (41): NewDocForm(), onSubmit(), VISIBILITY, NewEntryForm(), onSubmit(), AvatarCropUpload(), cancel(), save() (+33 more)

### Community 1 - "getCurrentMember"
Cohesion: 0.07
Nodes (49): GET(), GET(), GET(), GET(), NewDocPage(), NewHealthEntryPage(), DocumentsPane(), FamilyPage() (+41 more)

### Community 2 - "wealth/page.tsx"
Cohesion: 0.09
Nodes (28): TodayPage(), GoalsPane(), JointPane(), MinePane(), Seg, SEGMENT_LABELS, SEGMENTS, WealthPage() (+20 more)

### Community 3 - "auth.ts"
Cohesion: 0.07
Nodes (38): initialState, NewHealthEntryForm(), TYPES, VISIBILITY, OmronToggle(), initialState, NewMealPage(), initialState (+30 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (36): eslint, eslint-config-next, next, dependencies, next, react, react-dom, @supabase/ssr (+28 more)

### Community 5 - "settings/page.tsx"
Cohesion: 0.14
Nodes (19): CALENDAR_ERROR_MESSAGES, DRIVE_ERROR_MESSAGES, SettingsPage(), DeleteAccountButton(), CalendarConnectedPanel(), DriveConnectedPanel(), HouseholdNameForm(), HouseholdPrefsForm() (+11 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 7 - "[id]/page.tsx"
Cohesion: 0.09
Nodes (30): DocFolderPage(), MemberDetailPage(), Seg, SEGMENTS, AvatarAlbumViewer(), Avatar(), MemberProfileEditor(), save() (+22 more)

### Community 8 - "google-drive.ts"
Cohesion: 0.09
Nodes (41): DELETE(), GET(), POST(), SessionRequest, EntriesPane(), GalleryPane(), JournalPage(), MilestonesPane() (+33 more)

### Community 9 - "planner/page.tsx"
Cohesion: 0.13
Nodes (25): CALENDAR_VIEWS, calendarHref(), CalendarPane(), CalendarView, EventsPane(), MonthView(), Seg, SEGMENTS (+17 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "hub-header.tsx"
Cohesion: 0.13
Nodes (18): AppLayout(), DeleteButton(), DocFileRow(), DownloadLink(), Icon(), IconName, iconPaths, TabBar() (+10 more)

### Community 12 - "proxy.ts"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

### Community 22 - "createClient"
Cohesion: 0.05
Nodes (70): ActivityForm(), AddPlannerForm(), EditActivity, EditEvent, EventForm(), initialState, PlannerType, TripForm() (+62 more)

### Community 23 - "household/page.tsx"
Cohesion: 0.13
Nodes (21): BillsPane(), BuyPane(), HouseholdPage(), MealsPane(), Seg, SEGMENTS, AddBillForm(), BuyGroup (+13 more)

## Knowledge Gaps
- **141 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+136 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 181 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `database.types.ts`, `getCurrentMember`, `wealth/page.tsx`, `auth.ts`, `settings/page.tsx`, `[id]/page.tsx`, `google-drive.ts`, `planner/page.tsx`, `hub-header.tsx`, `household/page.tsx`?**
  _High betweenness centrality (0.218) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `getCurrentMember` to `wealth/page.tsx`, `auth.ts`, `settings/page.tsx`, `[id]/page.tsx`, `google-drive.ts`, `planner/page.tsx`, `hub-header.tsx`, `createClient`, `household/page.tsx`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Why does `requireCurrentMember()` connect `createClient` to `database.types.ts`, `getCurrentMember`, `auth.ts`, `settings/page.tsx`, `[id]/page.tsx`, `google-drive.ts`, `hub-header.tsx`, `household/page.tsx`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _141 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `database.types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.059322033898305086 - nodes in this community are weakly interconnected._
- **Should `getCurrentMember` be split into smaller, more focused modules?**
  _Cohesion score 0.06965174129353234 - nodes in this community are weakly interconnected._
- **Should `wealth/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09446693657219973 - nodes in this community are weakly interconnected._