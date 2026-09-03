# Graph Report - kin  (2026-09-03)

## Corpus Check
- 93 files · ~31,158 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 422 nodes · 1126 edges · 22 communities (13 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `820df804`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [folderId]/page.tsx
- [id]/page.tsx
- getCurrentMember
- auth.ts
- devDependencies
- createClient
- compilerOptions
- server.ts
- household/page.tsx
- database.types.ts
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
6. `ErrorText()` - 16 edges
7. `Icon()` - 16 edges
8. `compilerOptions` - 16 edges
9. `SubmitButton()` - 13 edges
10. `getValidDriveAccessToken()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `ActivityForm()` --indirect_call--> `createActivityAction()`  [INFERRED]
  src/app/(app)/planner/add/add-planner-form.tsx → src/lib/actions/planner.ts
- `EventForm()` --indirect_call--> `createEventAction()`  [INFERRED]
  src/app/(app)/planner/add/add-planner-form.tsx → src/lib/actions/planner.ts
- `GoalForm()` --indirect_call--> `createGoalAction()`  [INFERRED]
  src/app/(app)/planner/add/add-planner-form.tsx → src/lib/actions/planner.ts
- `TripForm()` --indirect_call--> `createTripAction()`  [INFERRED]
  src/app/(app)/planner/add/add-planner-form.tsx → src/lib/actions/planner.ts
- `Next.js Agent Rules Block (AGENTS.md)` --conceptually_related_to--> `Next.js 16 (App Router, TypeScript)`  [INFERRED]
  AGENTS.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kin Frontend/Backend Technology Stack** — readme_kin_family_os, readme_nextjs_16, readme_react_19, readme_tailwind_v4, readme_supabase [EXTRACTED 1.00]
- **Kin Privacy/Access Control Mechanisms** — readme_rls_policies, readme_managed_child_profiles, readme_supabase_auth_otp [INFERRED 0.85]

## Communities (22 total, 9 thin omitted)

### Community 0 - "[folderId]/page.tsx"
Cohesion: 0.15
Nodes (16): DocFolderPage(), AppLayout(), TodayPage(), DeleteButton(), DownloadLink(), Icon(), IconName, iconPaths (+8 more)

### Community 1 - "[id]/page.tsx"
Cohesion: 0.10
Nodes (25): OmronToggle(), MemberDetailPage(), Seg, SEGMENTS, DocumentsPane(), FamilyPage(), HealthPane(), MembersPane() (+17 more)

### Community 2 - "getCurrentMember"
Cohesion: 0.12
Nodes (20): GET(), NewDocPage(), NewHealthEntryPage(), NewJournalEntryPage(), ActivityForm(), AddPlannerForm(), EventForm(), GoalForm() (+12 more)

### Community 3 - "auth.ts"
Cohesion: 0.07
Nodes (41): initialState, NewHealthEntryForm(), TYPES, VISIBILITY, initialState, initialState, CALLBACK_ERROR_MESSAGES, initialState (+33 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (36): eslint, eslint-config-next, next, dependencies, next, react, react-dom, @supabase/ssr (+28 more)

### Community 5 - "createClient"
Cohesion: 0.12
Nodes (32): NewMealPage(), NewMilestonePage(), DRIVE_ERROR_MESSAGES, SettingsPage(), GET(), AddToJournalButton(), DriveConnectedPanel(), HouseholdNameForm() (+24 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 7 - "server.ts"
Cohesion: 0.13
Nodes (20): CalendarPane(), EventsPane(), GoalsPane(), PlannerPage(), Seg, SEGMENTS, TravelPane(), JointPane() (+12 more)

### Community 8 - "household/page.tsx"
Cohesion: 0.13
Nodes (21): BillsPane(), BuyPane(), HouseholdPage(), MealsPane(), Seg, SEGMENTS, AddBillForm(), BuyGroup (+13 more)

### Community 9 - "database.types.ts"
Cohesion: 0.11
Nodes (25): NewDocForm(), onSubmit(), VISIBILITY, NewEntryForm(), onSubmit(), GalleryUpload(), onUpload(), attachDocFileAction() (+17 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "journal/page.tsx"
Cohesion: 0.14
Nodes (29): GET(), DELETE(), GET(), POST(), SessionRequest, EntriesPane(), GalleryPane(), JournalPage() (+21 more)

### Community 12 - "proxy.ts"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

## Knowledge Gaps
- **114 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+109 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 132 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `[folderId]/page.tsx`, `[id]/page.tsx`, `getCurrentMember`, `auth.ts`, `server.ts`, `household/page.tsx`, `database.types.ts`, `journal/page.tsx`?**
  _High betweenness centrality (0.194) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `getCurrentMember` to `[folderId]/page.tsx`, `[id]/page.tsx`, `createClient`, `server.ts`, `household/page.tsx`, `journal/page.tsx`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Why does `requireCurrentMember()` connect `createClient` to `[folderId]/page.tsx`, `getCurrentMember`, `auth.ts`, `household/page.tsx`, `database.types.ts`, `journal/page.tsx`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _114 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `[id]/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.10128205128205128 - nodes in this community are weakly interconnected._
- **Should `getCurrentMember` be split into smaller, more focused modules?**
  _Cohesion score 0.11954022988505747 - nodes in this community are weakly interconnected._
- **Should `auth.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07291666666666667 - nodes in this community are weakly interconnected._