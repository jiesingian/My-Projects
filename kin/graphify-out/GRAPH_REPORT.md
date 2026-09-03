# Graph Report - kin  (2026-09-03)

## Corpus Check
- 113 files · ~41,517 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 531 nodes · 1417 edges · 23 communities (14 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ce774013`
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
- profile.ts
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
- requireCurrentMember

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 119 edges
2. `requireCurrentMember()` - 48 edges
3. `getCurrentMember` - 46 edges
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

## Communities (23 total, 9 thin omitted)

### Community 0 - "icons.tsx"
Cohesion: 0.10
Nodes (23): DocFolderPage(), AppLayout(), SettingsPage(), TodayPage(), DeleteButton(), DocFileRow(), DownloadLink(), Icon() (+15 more)

### Community 1 - "[id]/page.tsx"
Cohesion: 0.10
Nodes (22): MemberDetailPage(), Seg, SEGMENTS, EntriesPane(), GalleryPane(), JournalPage(), MilestonesPane(), Seg (+14 more)

### Community 2 - "(app)/family/page.tsx"
Cohesion: 0.13
Nodes (19): NewDocForm(), NewDocPage(), DocumentsPane(), FamilyPage(), HealthPane(), ProfilePane(), Seg, SEGMENTS (+11 more)

### Community 3 - "auth.ts"
Cohesion: 0.05
Nodes (58): initialState, NewHealthEntryForm(), TYPES, VISIBILITY, OmronToggle(), initialState, NewMealPage(), initialState (+50 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (36): eslint, eslint-config-next, next, dependencies, next, react, react-dom, @supabase/ssr (+28 more)

### Community 5 - "createClient"
Cohesion: 0.10
Nodes (31): ActivityForm(), EventForm(), GoalForm(), initialState, PlannerType, TripForm(), TYPES, CalendarPane() (+23 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 7 - "profile.ts"
Cohesion: 0.12
Nodes (18): AvatarAlbumViewer(), AvatarCropUpload(), cancel(), save(), drawCrop(), MemberProfileEditor(), save(), save() (+10 more)

### Community 8 - "household/page.tsx"
Cohesion: 0.12
Nodes (22): BillsPane(), BuyPane(), HouseholdPage(), MealsPane(), Seg, SEGMENTS, JointPane(), MinePane() (+14 more)

### Community 9 - "database.types.ts"
Cohesion: 0.12
Nodes (23): onSubmit(), VISIBILITY, NewEntryForm(), onSubmit(), GalleryUpload(), onUpload(), DetailHeader(), attachDocFileAction() (+15 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "getCurrentMember"
Cohesion: 0.10
Nodes (31): GET(), GET(), DELETE(), GET(), POST(), SessionRequest, NewHealthEntryPage(), PendingApprovalPage() (+23 more)

### Community 12 - "proxy.ts"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

### Community 22 - "requireCurrentMember"
Cohesion: 0.05
Nodes (54): DRIVE_ERROR_MESSAGES, Avatar(), DeleteAccountButton(), DeleteHouseholdButton(), emptyFields, FamilyAddress, FamilyAddressList(), add() (+46 more)

## Knowledge Gaps
- **125 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+120 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 160 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `icons.tsx`, `[id]/page.tsx`, `(app)/family/page.tsx`, `auth.ts`, `profile.ts`, `household/page.tsx`, `database.types.ts`, `getCurrentMember`, `requireCurrentMember`?**
  _High betweenness centrality (0.221) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `getCurrentMember` to `icons.tsx`, `[id]/page.tsx`, `(app)/family/page.tsx`, `auth.ts`, `createClient`, `household/page.tsx`, `requireCurrentMember`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Why does `requireCurrentMember()` connect `requireCurrentMember` to `icons.tsx`, `auth.ts`, `createClient`, `profile.ts`, `database.types.ts`, `getCurrentMember`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _125 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `icons.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.10317460317460317 - nodes in this community are weakly interconnected._
- **Should `[id]/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.10256410256410256 - nodes in this community are weakly interconnected._
- **Should `(app)/family/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._