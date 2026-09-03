# Graph Report - kin  (2026-09-03)

## Corpus Check
- 116 files · ~42,987 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 552 nodes · 1465 edges · 23 communities (14 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3c1486ec`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- FamilyBackgroundCropUpload
- getCurrentMember
- requireCurrentMember
- auth.ts
- devDependencies
- createClient
- compilerOptions
- profile.ts
- household/page.tsx
- actions/journal.ts
- Kin — Family Operating System
- database.types.ts
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
- actions/family.ts

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 121 edges
2. `requireCurrentMember()` - 50 edges
3. `getCurrentMember` - 46 edges
4. `formatDate()` - 21 edges
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
- `ActivityForm()` --indirect_call--> `createActivityAction()`  [INFERRED]
  src/app/(app)/planner/add/add-planner-form.tsx → src/lib/actions/planner.ts
- `EventForm()` --indirect_call--> `createEventAction()`  [INFERRED]
  src/app/(app)/planner/add/add-planner-form.tsx → src/lib/actions/planner.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kin Frontend/Backend Technology Stack** — readme_kin_family_os, readme_nextjs_16, readme_react_19, readme_tailwind_v4, readme_supabase [EXTRACTED 1.00]
- **Kin Privacy/Access Control Mechanisms** — readme_rls_policies, readme_managed_child_profiles, readme_supabase_auth_otp [INFERRED 0.85]

## Communities (23 total, 9 thin omitted)

### Community 0 - "FamilyBackgroundCropUpload"
Cohesion: 0.11
Nodes (17): FamilyBackgroundAlbum(), clampAxis(), drawCrop(), FamilyBackgroundCropUpload(), cancel(), onPointerMove(), onZoomChange(), save() (+9 more)

### Community 1 - "getCurrentMember"
Cohesion: 0.06
Nodes (57): GET(), DocFolderPage(), NewDocPage(), NewHealthEntryPage(), MemberDetailPage(), Seg, SEGMENTS, DocumentsPane() (+49 more)

### Community 2 - "requireCurrentMember"
Cohesion: 0.11
Nodes (30): ActivityForm(), AddPlannerForm(), EventForm(), GoalForm(), initialState, PlannerType, TripForm(), TYPES (+22 more)

### Community 3 - "auth.ts"
Cohesion: 0.06
Nodes (49): initialState, NewHealthEntryForm(), TYPES, VISIBILITY, OmronToggle(), initialState, NewMealPage(), initialState (+41 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (36): eslint, eslint-config-next, next, dependencies, next, react, react-dom, @supabase/ssr (+28 more)

### Community 5 - "createClient"
Cohesion: 0.13
Nodes (25): CalendarPane(), EventsPane(), GoalsPane(), PlannerPage(), Seg, SEGMENTS, JointPane(), MinePane() (+17 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 7 - "profile.ts"
Cohesion: 0.09
Nodes (27): AvatarAlbumViewer(), AvatarCropUpload(), cancel(), save(), drawCrop(), DeleteAccountButton(), MemberProfileEditor(), save() (+19 more)

### Community 8 - "household/page.tsx"
Cohesion: 0.13
Nodes (22): BillsPane(), BuyPane(), HouseholdPage(), MealsPane(), Seg, SEGMENTS, AddBillForm(), BuyGroup (+14 more)

### Community 9 - "actions/journal.ts"
Cohesion: 0.09
Nodes (29): NewDocForm(), onSubmit(), VISIBILITY, NewEntryForm(), onSubmit(), DocFileRow(), DownloadLink(), GalleryUpload() (+21 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "database.types.ts"
Cohesion: 0.09
Nodes (33): GET(), DELETE(), GET(), POST(), SessionRequest, DeleteButton(), Failure, GalleryGrid() (+25 more)

### Community 12 - "proxy.ts"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

### Community 22 - "actions/family.ts"
Cohesion: 0.09
Nodes (27): DeleteHouseholdButton(), FamilyAboutEditor(), emptyFields, FamilyAddress, FamilyAddressList(), remove(), save(), startEdit() (+19 more)

## Knowledge Gaps
- **129 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+124 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 167 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `FamilyBackgroundCropUpload`, `getCurrentMember`, `requireCurrentMember`, `auth.ts`, `profile.ts`, `household/page.tsx`, `actions/journal.ts`, `database.types.ts`, `actions/family.ts`?**
  _High betweenness centrality (0.220) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `getCurrentMember` to `requireCurrentMember`, `auth.ts`, `createClient`, `household/page.tsx`, `database.types.ts`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `requireCurrentMember()` connect `requireCurrentMember` to `FamilyBackgroundCropUpload`, `getCurrentMember`, `auth.ts`, `profile.ts`, `household/page.tsx`, `actions/journal.ts`, `database.types.ts`, `actions/family.ts`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _129 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `FamilyBackgroundCropUpload` be split into smaller, more focused modules?**
  _Cohesion score 0.1076923076923077 - nodes in this community are weakly interconnected._
- **Should `getCurrentMember` be split into smaller, more focused modules?**
  _Cohesion score 0.061128526645768025 - nodes in this community are weakly interconnected._
- **Should `requireCurrentMember` be split into smaller, more focused modules?**
  _Cohesion score 0.1066066066066066 - nodes in this community are weakly interconnected._