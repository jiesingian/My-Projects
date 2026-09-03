# Graph Report - kin  (2026-09-03)

## Corpus Check
- 92 files · ~29,934 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 414 nodes · 1067 edges · 23 communities (14 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `12074422`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- add-planner-form.tsx
- [id]/page.tsx
- getCurrentMember
- auth.ts
- devDependencies
- requireCurrentMember
- compilerOptions
- createClient
- household/page.tsx
- database.types.ts
- Kin — Family Operating System
- google-drive.ts
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
- new-health-entry-form.tsx

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 95 edges
2. `getCurrentMember` - 43 edges
3. `requireCurrentMember()` - 29 edges
4. `formatDate()` - 19 edges
5. `ActionState` - 18 edges
6. `ErrorText()` - 16 edges
7. `compilerOptions` - 16 edges
8. `Icon()` - 15 edges
9. `SubmitButton()` - 13 edges
10. `Blueprint()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Next.js Agent Rules Block (AGENTS.md)` --conceptually_related_to--> `Next.js 16 (App Router, TypeScript)`  [INFERRED]
  AGENTS.md → README.md
- `NewMealPage()` --indirect_call--> `addMealPlanAction()`  [INFERRED]
  src/app/(app)/household/meals/new/page.tsx → src/lib/actions/household.ts
- `HouseholdPage()` --calls--> `getCurrentMember`  [EXTRACTED]
  src/app/(app)/household/page.tsx → src/lib/session.ts
- `JournalPage()` --calls--> `getCurrentMember`  [EXTRACTED]
  src/app/(app)/journal/page.tsx → src/lib/session.ts
- `ActivityForm()` --indirect_call--> `createActivityAction()`  [INFERRED]
  src/app/(app)/planner/add/add-planner-form.tsx → src/lib/actions/planner.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kin Frontend/Backend Technology Stack** — readme_kin_family_os, readme_nextjs_16, readme_react_19, readme_tailwind_v4, readme_supabase [EXTRACTED 1.00]
- **Kin Privacy/Access Control Mechanisms** — readme_rls_policies, readme_managed_child_profiles, readme_supabase_auth_otp [INFERRED 0.85]

## Communities (23 total, 9 thin omitted)

### Community 0 - "add-planner-form.tsx"
Cohesion: 0.18
Nodes (14): ActivityForm(), EventForm(), GoalForm(), initialState, PlannerType, TripForm(), TYPES, AddToJournalButton() (+6 more)

### Community 1 - "[id]/page.tsx"
Cohesion: 0.08
Nodes (35): DocFolderPage(), MemberDetailPage(), Seg, SEGMENTS, MembersPane(), EntriesPane(), GalleryPane(), JournalPage() (+27 more)

### Community 2 - "getCurrentMember"
Cohesion: 0.14
Nodes (20): GET(), NewDocPage(), DocumentsPane(), FamilyPage(), HealthPane(), Seg, SEGMENTS, NewJournalEntryPage() (+12 more)

### Community 3 - "auth.ts"
Cohesion: 0.09
Nodes (34): initialState, NewMealPage(), initialState, NewMilestonePage(), CALLBACK_ERROR_MESSAGES, initialState, LoginForm(), FamilyForkForm() (+26 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (36): eslint, eslint-config-next, next, dependencies, next, react, react-dom, @supabase/ssr (+28 more)

### Community 5 - "requireCurrentMember"
Cohesion: 0.21
Nodes (17): DRIVE_ERROR_MESSAGES, DriveConnectedPanel(), HouseholdNameForm(), HouseholdPrefsForm(), InviteCodeCard(), NOTIF_DEFS, NotificationToggles(), TextSizeControl() (+9 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 7 - "createClient"
Cohesion: 0.11
Nodes (32): CalendarPane(), EventsPane(), GoalsPane(), PlannerPage(), Seg, SEGMENTS, TravelPane(), JointPane() (+24 more)

### Community 8 - "household/page.tsx"
Cohesion: 0.13
Nodes (22): BillsPane(), BuyPane(), HouseholdPage(), MealsPane(), Seg, SEGMENTS, AddBillForm(), BuyGroup (+14 more)

### Community 9 - "database.types.ts"
Cohesion: 0.09
Nodes (26): NewDocForm(), onSubmit(), VISIBILITY, NewEntryForm(), onSubmit(), GalleryUpload(), onUpload(), attachDocFileAction() (+18 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "google-drive.ts"
Cohesion: 0.29
Nodes (13): GET(), GET(), POST(), SessionRequest, createFolder(), createResumableUploadSession(), driveFetch(), DriveFile (+5 more)

### Community 12 - "proxy.ts"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

### Community 22 - "new-health-entry-form.tsx"
Cohesion: 0.22
Nodes (9): initialState, NewHealthEntryForm(), TYPES, VISIBILITY, NewHealthEntryPage(), OmronToggle(), createHealthEntryAction(), GROUPED_TYPES (+1 more)

## Knowledge Gaps
- **115 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+110 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 133 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `add-planner-form.tsx`, `[id]/page.tsx`, `getCurrentMember`, `auth.ts`, `requireCurrentMember`, `household/page.tsx`, `database.types.ts`, `google-drive.ts`, `new-health-entry-form.tsx`?**
  _High betweenness centrality (0.191) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `getCurrentMember` to `[id]/page.tsx`, `requireCurrentMember`, `createClient`, `household/page.tsx`, `google-drive.ts`, `new-health-entry-form.tsx`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Why does `requireCurrentMember()` connect `requireCurrentMember` to `add-planner-form.tsx`, `getCurrentMember`, `auth.ts`, `createClient`, `household/page.tsx`, `database.types.ts`, `new-health-entry-form.tsx`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _115 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `[id]/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.08215488215488216 - nodes in this community are weakly interconnected._
- **Should `getCurrentMember` be split into smaller, more focused modules?**
  _Cohesion score 0.135632183908046 - nodes in this community are weakly interconnected._
- **Should `auth.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08635703918722787 - nodes in this community are weakly interconnected._