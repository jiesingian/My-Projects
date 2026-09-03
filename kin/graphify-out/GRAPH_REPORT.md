# Graph Report - kin  (2026-09-03)

## Corpus Check
- 107 files · ~36,354 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 480 nodes · 1296 edges · 22 communities (13 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `cf0df211`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- icons.tsx
- [id]/page.tsx
- (app)/family/page.tsx
- auth.ts
- devDependencies
- createClient
- compilerOptions
- requireCurrentMember
- household/page.tsx
- database.types.ts
- Kin — Family Operating System
- getCurrentMember
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
1. `createClient()` - 109 edges
2. `getCurrentMember` - 46 edges
3. `requireCurrentMember()` - 41 edges
4. `ActionState` - 20 edges
5. `formatDate()` - 19 edges
6. `Icon()` - 17 edges
7. `ErrorText()` - 16 edges
8. `compilerOptions` - 16 edges
9. `SubmitButton()` - 13 edges
10. `Blueprint()` - 13 edges

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

## Communities (22 total, 9 thin omitted)

### Community 0 - "icons.tsx"
Cohesion: 0.09
Nodes (23): AppLayout(), DeleteButton(), DocFileRow(), DownloadLink(), Failure, GalleryGrid(), deleteSelected(), MediaItem (+15 more)

### Community 1 - "[id]/page.tsx"
Cohesion: 0.12
Nodes (23): MemberDetailPage(), Seg, SEGMENTS, MembersPane(), TodayPage(), JointPane(), MinePane(), Seg (+15 more)

### Community 2 - "(app)/family/page.tsx"
Cohesion: 0.14
Nodes (18): DocumentsPane(), FamilyPage(), HealthPane(), Seg, SEGMENTS, ReinstateMemberButton(), RemoveMemberButton(), PendingMemberActions() (+10 more)

### Community 3 - "auth.ts"
Cohesion: 0.05
Nodes (51): initialState, NewHealthEntryForm(), TYPES, VISIBILITY, OmronToggle(), initialState, NewMealPage(), initialState (+43 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (36): eslint, eslint-config-next, next, dependencies, next, react, react-dom, @supabase/ssr (+28 more)

### Community 5 - "createClient"
Cohesion: 0.12
Nodes (29): DocFolderPage(), EntriesPane(), GalleryPane(), JournalPage(), MilestonesPane(), Seg, SEGMENTS, CalendarPane() (+21 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 7 - "requireCurrentMember"
Cohesion: 0.07
Nodes (44): ActivityForm(), AddPlannerForm(), EventForm(), GoalForm(), initialState, PlannerType, TripForm(), TYPES (+36 more)

### Community 8 - "household/page.tsx"
Cohesion: 0.12
Nodes (23): BillsPane(), BuyPane(), HouseholdPage(), MealsPane(), Seg, SEGMENTS, AddBillForm(), initialState (+15 more)

### Community 9 - "database.types.ts"
Cohesion: 0.11
Nodes (25): NewDocForm(), onSubmit(), VISIBILITY, NewEntryForm(), onSubmit(), GalleryUpload(), onUpload(), attachDocFileAction() (+17 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "getCurrentMember"
Cohesion: 0.12
Nodes (31): GET(), GET(), DELETE(), GET(), POST(), SessionRequest, NewDocPage(), NewHealthEntryPage() (+23 more)

### Community 12 - "proxy.ts"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

## Knowledge Gaps
- **120 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+115 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 144 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `icons.tsx`, `[id]/page.tsx`, `(app)/family/page.tsx`, `auth.ts`, `requireCurrentMember`, `household/page.tsx`, `database.types.ts`, `getCurrentMember`?**
  _High betweenness centrality (0.208) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `getCurrentMember` to `icons.tsx`, `[id]/page.tsx`, `(app)/family/page.tsx`, `auth.ts`, `createClient`, `requireCurrentMember`, `household/page.tsx`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Why does `requireCurrentMember()` connect `requireCurrentMember` to `icons.tsx`, `(app)/family/page.tsx`, `auth.ts`, `createClient`, `household/page.tsx`, `database.types.ts`, `getCurrentMember`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _120 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `icons.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09041835357624832 - nodes in this community are weakly interconnected._
- **Should `[id]/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.11586452762923351 - nodes in this community are weakly interconnected._
- **Should `(app)/family/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.14130434782608695 - nodes in this community are weakly interconnected._