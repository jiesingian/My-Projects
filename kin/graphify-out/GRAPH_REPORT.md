# Graph Report - kin  (2026-09-03)

## Corpus Check
- 118 files · ~44,549 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 563 nodes · 1547 edges · 23 communities (14 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7446ec01`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- new-entry-form.tsx
- [id]/page.tsx
- createClient
- auth.ts
- devDependencies
- planner/page.tsx
- compilerOptions
- profile.ts
- household/page.tsx
- icons.tsx
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
- actions/family.ts

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 123 edges
2. `requireCurrentMember()` - 52 edges
3. `getCurrentMember` - 46 edges
4. `ActionState` - 21 edges
5. `formatDate()` - 21 edges
6. `getValidDriveAccessToken()` - 19 edges
7. `Icon()` - 17 edges
8. `ErrorText()` - 16 edges
9. `ensureDriveFolderStructure()` - 16 edges
10. `compilerOptions` - 16 edges

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

## Communities (23 total, 9 thin omitted)

### Community 0 - "new-entry-form.tsx"
Cohesion: 0.11
Nodes (21): NewEntryForm(), onSubmit(), AvatarCropUpload(), cancel(), save(), drawCrop(), clampAxis(), drawCrop() (+13 more)

### Community 1 - "[id]/page.tsx"
Cohesion: 0.08
Nodes (39): MemberDetailPage(), Seg, SEGMENTS, DocumentsPane(), HealthPane(), ProfilePane(), Seg, SEGMENTS (+31 more)

### Community 2 - "createClient"
Cohesion: 0.07
Nodes (55): NewDocForm(), onSubmit(), VISIBILITY, NewDocPage(), NewHealthEntryForm(), NewHealthEntryPage(), OmronToggle(), ActivityForm() (+47 more)

### Community 3 - "auth.ts"
Cohesion: 0.06
Nodes (47): initialState, TYPES, VISIBILITY, initialState, NewMealPage(), initialState, NewMilestonePage(), CALLBACK_ERROR_MESSAGES (+39 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (36): eslint, eslint-config-next, next, dependencies, next, react, react-dom, @supabase/ssr (+28 more)

### Community 5 - "planner/page.tsx"
Cohesion: 0.12
Nodes (21): CalendarPane(), EventsPane(), GoalsPane(), PlannerPage(), Seg, SEGMENTS, TravelPane(), JointPane() (+13 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 7 - "profile.ts"
Cohesion: 0.07
Nodes (36): AvatarAlbumViewer(), FamilyBackgroundAlbum(), MemberProfileEditor(), save(), AlbumPhotoLike, closeButtonStyle, navButtonStyle, overlayStyle (+28 more)

### Community 8 - "household/page.tsx"
Cohesion: 0.12
Nodes (23): BillsPane(), BuyPane(), HouseholdPage(), MealsPane(), Seg, SEGMENTS, AddBillForm(), initialState (+15 more)

### Community 9 - "icons.tsx"
Cohesion: 0.12
Nodes (20): AppLayout(), TodayPage(), DeleteButton(), DocFileRow(), DownloadLink(), Icon(), IconName, iconPaths (+12 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "getCurrentMember"
Cohesion: 0.09
Nodes (43): GET(), GET(), DELETE(), GET(), POST(), SessionRequest, DocFolderPage(), FamilyPage() (+35 more)

### Community 12 - "proxy.ts"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

### Community 22 - "actions/family.ts"
Cohesion: 0.11
Nodes (20): FamilyAboutEditor(), emptyFields, FamilyAddress, FamilyAddressList(), remove(), save(), startEdit(), fieldsFromAddress() (+12 more)

## Knowledge Gaps
- **129 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+124 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 167 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `new-entry-form.tsx`, `[id]/page.tsx`, `auth.ts`, `planner/page.tsx`, `profile.ts`, `household/page.tsx`, `icons.tsx`, `getCurrentMember`, `actions/family.ts`?**
  _High betweenness centrality (0.209) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `getCurrentMember` to `[id]/page.tsx`, `createClient`, `auth.ts`, `planner/page.tsx`, `household/page.tsx`, `icons.tsx`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Why does `requireCurrentMember()` connect `createClient` to `new-entry-form.tsx`, `[id]/page.tsx`, `auth.ts`, `profile.ts`, `household/page.tsx`, `icons.tsx`, `getCurrentMember`, `actions/family.ts`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _129 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `new-entry-form.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.10634920634920635 - nodes in this community are weakly interconnected._
- **Should `[id]/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.08080808080808081 - nodes in this community are weakly interconnected._
- **Should `createClient` be split into smaller, more focused modules?**
  _Cohesion score 0.06702702702702702 - nodes in this community are weakly interconnected._