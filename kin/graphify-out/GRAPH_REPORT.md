# Graph Report - kin  (2026-09-03)

## Corpus Check
- 93 files · ~30,852 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 420 nodes · 1111 edges · 21 communities (12 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `922a92a1`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [folderId]/page.tsx
- planner/page.tsx
- auth.ts
- devDependencies
- createClient
- compilerOptions
- wealth/page.tsx
- household/page.tsx
- getCurrentMember
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

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 96 edges
2. `getCurrentMember` - 44 edges
3. `requireCurrentMember()` - 31 edges
4. `formatDate()` - 19 edges
5. `ActionState` - 18 edges
6. `ErrorText()` - 16 edges
7. `Icon()` - 16 edges
8. `compilerOptions` - 16 edges
9. `SubmitButton()` - 13 edges
10. `Blueprint()` - 12 edges

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

### Community 0 - "[folderId]/page.tsx"
Cohesion: 0.21
Nodes (12): DocFolderPage(), DeleteButton(), DownloadLink(), GalleryTile(), Icon(), IconName, iconPaths, TABS (+4 more)

### Community 1 - "planner/page.tsx"
Cohesion: 0.06
Nodes (47): MemberDetailPage(), Seg, SEGMENTS, DocumentsPane(), FamilyPage(), HealthPane(), MembersPane(), Seg (+39 more)

### Community 3 - "auth.ts"
Cohesion: 0.07
Nodes (41): initialState, NewHealthEntryForm(), TYPES, VISIBILITY, OmronToggle(), initialState, NewMealPage(), initialState (+33 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (36): eslint, eslint-config-next, next, dependencies, next, react, react-dom, @supabase/ssr (+28 more)

### Community 5 - "createClient"
Cohesion: 0.11
Nodes (35): ActivityForm(), AddPlannerForm(), EventForm(), GoalForm(), initialState, PlannerType, TripForm(), TYPES (+27 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 7 - "wealth/page.tsx"
Cohesion: 0.19
Nodes (16): JointPane(), MinePane(), Seg, SEGMENTS, WealthPage(), AddAccountForm(), initialState, SetBudgetControl() (+8 more)

### Community 8 - "household/page.tsx"
Cohesion: 0.13
Nodes (22): BillsPane(), BuyPane(), HouseholdPage(), MealsPane(), Seg, SEGMENTS, AddBillForm(), BuyGroup (+14 more)

### Community 9 - "getCurrentMember"
Cohesion: 0.08
Nodes (39): GET(), NewDocForm(), onSubmit(), VISIBILITY, NewDocPage(), NewHealthEntryPage(), NewEntryForm(), onSubmit() (+31 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "google-drive.ts"
Cohesion: 0.27
Nodes (15): GET(), DELETE(), GET(), POST(), SessionRequest, createFolder(), createResumableUploadSession(), deleteDriveFile() (+7 more)

### Community 12 - "proxy.ts"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

## Knowledge Gaps
- **114 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+109 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 132 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `[folderId]/page.tsx`, `planner/page.tsx`, `auth.ts`, `wealth/page.tsx`, `household/page.tsx`, `getCurrentMember`, `google-drive.ts`?**
  _High betweenness centrality (0.189) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `getCurrentMember` to `[folderId]/page.tsx`, `planner/page.tsx`, `createClient`, `wealth/page.tsx`, `household/page.tsx`, `google-drive.ts`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `requireCurrentMember()` connect `createClient` to `[folderId]/page.tsx`, `auth.ts`, `wealth/page.tsx`, `household/page.tsx`, `getCurrentMember`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _114 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `planner/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.0639386189258312 - nodes in this community are weakly interconnected._
- **Should `auth.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07168458781362007 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05405405405405406 - nodes in this community are weakly interconnected._