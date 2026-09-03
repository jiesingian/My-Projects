# Graph Report - kin  (2026-09-03)

## Corpus Check
- 109 files · ~38,412 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 498 nodes · 1346 edges · 24 communities (15 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4d935601`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- hub-header.tsx
- wealth/page.tsx
- new-health-entry-form.tsx
- auth.ts
- devDependencies
- planner/page.tsx
- compilerOptions
- requireCurrentMember
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
- createClient
- add-planner-form.tsx

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 113 edges
2. `getCurrentMember` - 46 edges
3. `requireCurrentMember()` - 43 edges
4. `formatDate()` - 23 edges
5. `ActionState` - 20 edges
6. `Icon()` - 17 edges
7. `ErrorText()` - 16 edges
8. `compilerOptions` - 16 edges
9. `SubmitButton()` - 13 edges
10. `Blueprint()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `Next.js Agent Rules Block (AGENTS.md)` --conceptually_related_to--> `Next.js 16 (App Router, TypeScript)`  [INFERRED]
  AGENTS.md → README.md
- `NewMealPage()` --indirect_call--> `addMealPlanAction()`  [INFERRED]
  src/app/(app)/household/meals/new/page.tsx → src/lib/actions/household.ts
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

### Community 0 - "hub-header.tsx"
Cohesion: 0.12
Nodes (19): AppLayout(), DeleteButton(), DocFileRow(), DownloadLink(), DetailHeader(), Icon(), IconName, iconPaths (+11 more)

### Community 1 - "wealth/page.tsx"
Cohesion: 0.19
Nodes (16): JointPane(), MinePane(), Seg, SEGMENTS, WealthPage(), AddAccountForm(), initialState, SetBudgetControl() (+8 more)

### Community 2 - "new-health-entry-form.tsx"
Cohesion: 0.23
Nodes (9): initialState, NewHealthEntryForm(), TYPES, VISIBILITY, OmronToggle(), Blueprint(), createHealthEntryAction(), GROUPED_TYPES (+1 more)

### Community 3 - "auth.ts"
Cohesion: 0.07
Nodes (35): initialState, NewMealPage(), CALLBACK_ERROR_MESSAGES, initialState, LoginForm(), FamilyForkForm(), initialState, PendingApprovalPage() (+27 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (36): eslint, eslint-config-next, next, dependencies, next, react, react-dom, @supabase/ssr (+28 more)

### Community 5 - "planner/page.tsx"
Cohesion: 0.13
Nodes (25): EntriesPane(), GalleryPane(), JournalPage(), MilestonesPane(), Seg, SEGMENTS, CalendarPane(), EventsPane() (+17 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 7 - "requireCurrentMember"
Cohesion: 0.07
Nodes (43): DRIVE_ERROR_MESSAGES, AvatarAlbumViewer(), closeButtonStyle, navButtonStyle, overlayStyle, AvatarCropUpload(), cancel(), save() (+35 more)

### Community 8 - "household/page.tsx"
Cohesion: 0.11
Nodes (24): BillsPane(), BuyPane(), HouseholdPage(), MealsPane(), Seg, SEGMENTS, AddBillForm(), initialState (+16 more)

### Community 9 - "database.types.ts"
Cohesion: 0.10
Nodes (30): NewDocForm(), onSubmit(), VISIBILITY, initialState, NewMilestonePage(), NewEntryForm(), onSubmit(), ErrorText() (+22 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "google-drive.ts"
Cohesion: 0.14
Nodes (22): GET(), DELETE(), GET(), POST(), SessionRequest, Failure, GalleryGrid(), deleteSelected() (+14 more)

### Community 12 - "proxy.ts"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

### Community 22 - "createClient"
Cohesion: 0.09
Nodes (41): GET(), DocFolderPage(), NewDocPage(), NewHealthEntryPage(), MemberDetailPage(), Seg, SEGMENTS, DocumentsPane() (+33 more)

### Community 23 - "add-planner-form.tsx"
Cohesion: 0.18
Nodes (14): ActivityForm(), AddPlannerForm(), EventForm(), GoalForm(), initialState, PlannerType, TripForm(), TYPES (+6 more)

## Knowledge Gaps
- **123 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+118 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 152 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `hub-header.tsx`, `wealth/page.tsx`, `new-health-entry-form.tsx`, `auth.ts`, `planner/page.tsx`, `requireCurrentMember`, `household/page.tsx`, `database.types.ts`, `google-drive.ts`, `add-planner-form.tsx`?**
  _High betweenness centrality (0.217) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `createClient` to `hub-header.tsx`, `wealth/page.tsx`, `auth.ts`, `planner/page.tsx`, `requireCurrentMember`, `household/page.tsx`, `google-drive.ts`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Why does `requireCurrentMember()` connect `requireCurrentMember` to `hub-header.tsx`, `wealth/page.tsx`, `new-health-entry-form.tsx`, `auth.ts`, `household/page.tsx`, `database.types.ts`, `google-drive.ts`, `createClient`, `add-planner-form.tsx`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _123 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `hub-header.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._
- **Should `auth.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05405405405405406 - nodes in this community are weakly interconnected._