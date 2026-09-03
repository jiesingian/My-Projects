# Graph Report - kin  (2026-09-03)

## Corpus Check
- 117 files · ~43,740 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 557 nodes · 1519 edges · 24 communities (15 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3126de76`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- form.tsx
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
- requireCurrentMember
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
- add-planner-form.tsx

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 121 edges
2. `requireCurrentMember()` - 50 edges
3. `getCurrentMember` - 46 edges
4. `formatDate()` - 21 edges
5. `ActionState` - 20 edges
6. `Icon()` - 17 edges
7. `getValidDriveAccessToken()` - 17 edges
8. `ErrorText()` - 16 edges
9. `compilerOptions` - 16 edges
10. `ensureDriveFolderStructure()` - 14 edges

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

## Communities (24 total, 9 thin omitted)

### Community 0 - "form.tsx"
Cohesion: 0.06
Nodes (38): VISIBILITY, initialState, NewMealPage(), initialState, NewMilestonePage(), NewEntryForm(), onSubmit(), AvatarCropUpload() (+30 more)

### Community 1 - "[id]/page.tsx"
Cohesion: 0.09
Nodes (36): MemberDetailPage(), Seg, SEGMENTS, DocumentsPane(), FamilyPage(), HealthPane(), ProfilePane(), Seg (+28 more)

### Community 2 - "createClient"
Cohesion: 0.11
Nodes (33): GET(), DocFolderPage(), NewDocPage(), NewHealthEntryPage(), DRIVE_ERROR_MESSAGES, SettingsPage(), TodayPage(), GET() (+25 more)

### Community 3 - "auth.ts"
Cohesion: 0.07
Nodes (39): initialState, NewHealthEntryForm(), TYPES, VISIBILITY, OmronToggle(), CALLBACK_ERROR_MESSAGES, initialState, LoginForm() (+31 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (36): eslint, eslint-config-next, next, dependencies, next, react, react-dom, @supabase/ssr (+28 more)

### Community 5 - "planner/page.tsx"
Cohesion: 0.11
Nodes (22): CalendarPane(), EventsPane(), GoalsPane(), PlannerPage(), Seg, SEGMENTS, TravelPane(), JointPane() (+14 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 7 - "profile.ts"
Cohesion: 0.07
Nodes (33): AvatarAlbumViewer(), Avatar(), DeleteAccountButton(), MemberProfileEditor(), save(), ProfileEditForm(), save(), chunk() (+25 more)

### Community 8 - "household/page.tsx"
Cohesion: 0.12
Nodes (23): BillsPane(), BuyPane(), HouseholdPage(), MealsPane(), Seg, SEGMENTS, AddBillForm(), initialState (+15 more)

### Community 9 - "icons.tsx"
Cohesion: 0.13
Nodes (16): AppLayout(), DeleteButton(), DocFileRow(), DownloadLink(), Icon(), IconName, iconPaths, TabBar() (+8 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "requireCurrentMember"
Cohesion: 0.10
Nodes (39): GET(), DELETE(), GET(), POST(), SessionRequest, NewDocForm(), onSubmit(), EntriesPane() (+31 more)

### Community 12 - "proxy.ts"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

### Community 22 - "actions/family.ts"
Cohesion: 0.09
Nodes (26): AddChildForm(), initialState, DeleteHouseholdButton(), FamilyAboutEditor(), emptyFields, FamilyAddress, FamilyAddressList(), remove() (+18 more)

### Community 23 - "add-planner-form.tsx"
Cohesion: 0.16
Nodes (15): ActivityForm(), AddPlannerForm(), EventForm(), GoalForm(), initialState, PlannerType, TripForm(), TYPES (+7 more)

## Knowledge Gaps
- **128 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+123 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 166 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `form.tsx`, `[id]/page.tsx`, `auth.ts`, `planner/page.tsx`, `profile.ts`, `household/page.tsx`, `icons.tsx`, `requireCurrentMember`, `actions/family.ts`, `add-planner-form.tsx`?**
  _High betweenness centrality (0.207) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `createClient` to `[id]/page.tsx`, `auth.ts`, `planner/page.tsx`, `household/page.tsx`, `icons.tsx`, `requireCurrentMember`, `add-planner-form.tsx`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `requireCurrentMember()` connect `requireCurrentMember` to `form.tsx`, `[id]/page.tsx`, `createClient`, `auth.ts`, `profile.ts`, `household/page.tsx`, `actions/family.ts`, `add-planner-form.tsx`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _128 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `form.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.0647307924984876 - nodes in this community are weakly interconnected._
- **Should `[id]/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.08843537414965986 - nodes in this community are weakly interconnected._
- **Should `createClient` be split into smaller, more focused modules?**
  _Cohesion score 0.1096938775510204 - nodes in this community are weakly interconnected._