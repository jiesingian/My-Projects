# Graph Report - kin  (2026-09-03)

## Corpus Check
- 107 files · ~36,516 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 481 nodes · 1300 edges · 24 communities (15 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ee2de404`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- icons.tsx
- wealth/page.tsx
- [id]/page.tsx
- auth.ts
- devDependencies
- createClient
- compilerOptions
- requireCurrentMember
- household/page.tsx
- database.types.ts
- Kin — Family Operating System
- actions/journal.ts
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
- getCurrentMember
- actions/family.ts

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 109 edges
2. `getCurrentMember` - 46 edges
3. `requireCurrentMember()` - 41 edges
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
- `JournalPage()` --calls--> `getCurrentMember`  [EXTRACTED]
  src/app/(app)/journal/page.tsx → src/lib/session.ts
- `ActivityForm()` --indirect_call--> `createActivityAction()`  [INFERRED]
  src/app/(app)/planner/add/add-planner-form.tsx → src/lib/actions/planner.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kin Frontend/Backend Technology Stack** — readme_kin_family_os, readme_nextjs_16, readme_react_19, readme_tailwind_v4, readme_supabase [EXTRACTED 1.00]
- **Kin Privacy/Access Control Mechanisms** — readme_rls_policies, readme_managed_child_profiles, readme_supabase_auth_otp [INFERRED 0.85]

## Communities (24 total, 9 thin omitted)

### Community 0 - "icons.tsx"
Cohesion: 0.15
Nodes (16): DeleteButton(), DocFileRow(), DownloadLink(), Icon(), IconName, iconPaths, TABS, deleteDocFileAction() (+8 more)

### Community 1 - "wealth/page.tsx"
Cohesion: 0.19
Nodes (16): JointPane(), MinePane(), Seg, SEGMENTS, WealthPage(), AddAccountForm(), initialState, SetBudgetControl() (+8 more)

### Community 2 - "[id]/page.tsx"
Cohesion: 0.14
Nodes (14): OmronToggle(), MemberDetailPage(), Seg, SEGMENTS, Avatar(), AvatarUpload(), onFileChange(), DetailHeader() (+6 more)

### Community 3 - "auth.ts"
Cohesion: 0.07
Nodes (40): initialState, NewHealthEntryForm(), TYPES, VISIBILITY, initialState, NewMealPage(), initialState, NewMilestonePage() (+32 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (36): eslint, eslint-config-next, next, dependencies, next, react, react-dom, @supabase/ssr (+28 more)

### Community 5 - "createClient"
Cohesion: 0.12
Nodes (30): DocFolderPage(), EntriesPane(), GalleryPane(), JournalPage(), MilestonesPane(), Seg, SEGMENTS, CalendarPane() (+22 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 7 - "requireCurrentMember"
Cohesion: 0.07
Nodes (42): ActivityForm(), AddPlannerForm(), EventForm(), GoalForm(), initialState, PlannerType, TripForm(), TYPES (+34 more)

### Community 8 - "household/page.tsx"
Cohesion: 0.14
Nodes (19): BillsPane(), BuyPane(), HouseholdPage(), MealsPane(), Seg, SEGMENTS, AddBillForm(), BuyList() (+11 more)

### Community 9 - "database.types.ts"
Cohesion: 0.11
Nodes (25): NewDocForm(), onSubmit(), VISIBILITY, NewEntryForm(), onSubmit(), GalleryUpload(), onUpload(), attachDocFileAction() (+17 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "actions/journal.ts"
Cohesion: 0.14
Nodes (23): GET(), DELETE(), GET(), POST(), SessionRequest, Failure, GalleryGrid(), deleteSelected() (+15 more)

### Community 12 - "proxy.ts"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

### Community 22 - "getCurrentMember"
Cohesion: 0.10
Nodes (29): GET(), NewDocPage(), NewHealthEntryPage(), DocumentsPane(), FamilyPage(), HealthPane(), MembersPane(), Seg (+21 more)

### Community 23 - "actions/family.ts"
Cohesion: 0.17
Nodes (13): FamilyForkForm(), ReinstateMemberButton(), RemoveMemberButton(), PendingMemberActions(), run(), RelationshipEditor(), approveMemberAction(), createFamilyAction() (+5 more)

## Knowledge Gaps
- **120 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+115 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 145 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `icons.tsx`, `wealth/page.tsx`, `[id]/page.tsx`, `auth.ts`, `requireCurrentMember`, `household/page.tsx`, `database.types.ts`, `actions/journal.ts`, `getCurrentMember`, `actions/family.ts`?**
  _High betweenness centrality (0.207) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `getCurrentMember` to `icons.tsx`, `wealth/page.tsx`, `[id]/page.tsx`, `auth.ts`, `createClient`, `requireCurrentMember`, `household/page.tsx`, `actions/journal.ts`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Why does `requireCurrentMember()` connect `requireCurrentMember` to `icons.tsx`, `wealth/page.tsx`, `[id]/page.tsx`, `auth.ts`, `createClient`, `household/page.tsx`, `database.types.ts`, `actions/journal.ts`, `getCurrentMember`, `actions/family.ts`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _120 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `[id]/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.14130434782608695 - nodes in this community are weakly interconnected._
- **Should `auth.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07373271889400922 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05405405405405406 - nodes in this community are weakly interconnected._