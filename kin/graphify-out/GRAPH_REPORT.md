# Graph Report - kin  (2026-09-03)

## Corpus Check
- 101 files · ~34,752 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 460 nodes · 1228 edges · 23 communities (14 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `04c549dd`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [folderId]/page.tsx
- [id]/page.tsx
- getCurrentMember
- auth.ts
- devDependencies
- new-health-entry-form.tsx
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
- wealth/page.tsx

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 103 edges
2. `getCurrentMember` - 46 edges
3. `requireCurrentMember()` - 36 edges
4. `ActionState` - 19 edges
5. `formatDate()` - 19 edges
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

## Communities (23 total, 9 thin omitted)

### Community 0 - "[folderId]/page.tsx"
Cohesion: 0.19
Nodes (11): DocFolderPage(), DocFileRow(), DownloadLink(), deleteDocFileAction(), getDocFileUrl(), Ctx, DocSelectionProvider(), deleteSelected() (+3 more)

### Community 1 - "[id]/page.tsx"
Cohesion: 0.11
Nodes (22): MemberDetailPage(), Seg, SEGMENTS, EntriesPane(), GalleryPane(), JournalPage(), MilestonesPane(), Seg (+14 more)

### Community 2 - "getCurrentMember"
Cohesion: 0.10
Nodes (30): GET(), NewDocPage(), DocumentsPane(), FamilyPage(), HealthPane(), MembersPane(), Seg, SEGMENTS (+22 more)

### Community 3 - "auth.ts"
Cohesion: 0.07
Nodes (41): initialState, NewMealPage(), initialState, CALLBACK_ERROR_MESSAGES, initialState, LoginForm(), FamilyForkForm(), initialState (+33 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (36): eslint, eslint-config-next, next, dependencies, next, react, react-dom, @supabase/ssr (+28 more)

### Community 5 - "new-health-entry-form.tsx"
Cohesion: 0.22
Nodes (9): initialState, NewHealthEntryForm(), TYPES, VISIBILITY, NewHealthEntryPage(), OmronToggle(), createHealthEntryAction(), GROUPED_TYPES (+1 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 7 - "createClient"
Cohesion: 0.07
Nodes (51): NewMilestonePage(), ActivityForm(), EventForm(), GoalForm(), initialState, PlannerType, TripForm(), TYPES (+43 more)

### Community 8 - "household/page.tsx"
Cohesion: 0.12
Nodes (22): BillsPane(), BuyPane(), HouseholdPage(), MealsPane(), Seg, SEGMENTS, AddBillForm(), BuyGroup (+14 more)

### Community 9 - "database.types.ts"
Cohesion: 0.10
Nodes (27): NewDocForm(), onSubmit(), VISIBILITY, NewEntryForm(), onSubmit(), GalleryUpload(), onUpload(), attachDocFileAction() (+19 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "google-drive.ts"
Cohesion: 0.12
Nodes (25): GET(), DELETE(), GET(), POST(), SessionRequest, DeleteButton(), Failure, GalleryGrid() (+17 more)

### Community 12 - "proxy.ts"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

### Community 22 - "wealth/page.tsx"
Cohesion: 0.19
Nodes (16): JointPane(), MinePane(), Seg, SEGMENTS, WealthPage(), AddAccountForm(), initialState, SetBudgetControl() (+8 more)

## Knowledge Gaps
- **120 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+115 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 143 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `[folderId]/page.tsx`, `[id]/page.tsx`, `getCurrentMember`, `auth.ts`, `new-health-entry-form.tsx`, `household/page.tsx`, `database.types.ts`, `google-drive.ts`, `wealth/page.tsx`?**
  _High betweenness centrality (0.201) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `getCurrentMember` to `[folderId]/page.tsx`, `[id]/page.tsx`, `auth.ts`, `new-health-entry-form.tsx`, `createClient`, `household/page.tsx`, `google-drive.ts`, `wealth/page.tsx`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Why does `requireCurrentMember()` connect `createClient` to `[folderId]/page.tsx`, `[id]/page.tsx`, `getCurrentMember`, `auth.ts`, `new-health-entry-form.tsx`, `household/page.tsx`, `database.types.ts`, `google-drive.ts`, `wealth/page.tsx`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _120 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `[id]/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.11397849462365592 - nodes in this community are weakly interconnected._
- **Should `getCurrentMember` be split into smaller, more focused modules?**
  _Cohesion score 0.09619450317124736 - nodes in this community are weakly interconnected._
- **Should `auth.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07355769230769231 - nodes in this community are weakly interconnected._