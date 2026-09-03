# Graph Report - kin  (2026-09-03)

## Corpus Check
- 116 files · ~43,223 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 554 nodes · 1472 edges · 24 communities (15 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5c77ff76`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- FamilyBackgroundCropUpload
- [id]/page.tsx
- requireCurrentMember
- auth.ts
- devDependencies
- createClient
- compilerOptions
- profile.ts
- household/page.tsx
- new-doc-form.tsx
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
- actions/family.ts
- getCurrentMember

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 121 edges
2. `requireCurrentMember()` - 50 edges
3. `getCurrentMember` - 46 edges
4. `formatDate()` - 21 edges
5. `ActionState` - 20 edges
6. `Icon()` - 17 edges
7. `ErrorText()` - 16 edges
8. `compilerOptions` - 16 edges
9. `ensureDriveFolderStructure()` - 14 edges
10. `SubmitButton()` - 13 edges

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

### Community 0 - "FamilyBackgroundCropUpload"
Cohesion: 0.11
Nodes (17): FamilyBackgroundAlbum(), clampAxis(), drawCrop(), FamilyBackgroundCropUpload(), cancel(), onPointerMove(), onZoomChange(), save() (+9 more)

### Community 1 - "[id]/page.tsx"
Cohesion: 0.07
Nodes (40): DocFolderPage(), MemberDetailPage(), Seg, SEGMENTS, EntriesPane(), GalleryPane(), JournalPage(), MilestonesPane() (+32 more)

### Community 2 - "requireCurrentMember"
Cohesion: 0.09
Nodes (35): ActivityForm(), AddPlannerForm(), EventForm(), GoalForm(), initialState, PlannerType, TripForm(), TYPES (+27 more)

### Community 3 - "auth.ts"
Cohesion: 0.08
Nodes (41): initialState, NewHealthEntryForm(), TYPES, VISIBILITY, OmronToggle(), initialState, NewMealPage(), initialState (+33 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (36): eslint, eslint-config-next, next, dependencies, next, react, react-dom, @supabase/ssr (+28 more)

### Community 5 - "createClient"
Cohesion: 0.10
Nodes (33): CalendarPane(), EventsPane(), GoalsPane(), PlannerPage(), Seg, SEGMENTS, TravelPane(), JointPane() (+25 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 7 - "profile.ts"
Cohesion: 0.09
Nodes (27): AvatarAlbumViewer(), Avatar(), AvatarCropUpload(), cancel(), save(), drawCrop(), MemberProfileEditor(), save() (+19 more)

### Community 8 - "household/page.tsx"
Cohesion: 0.19
Nodes (13): BillsPane(), BuyPane(), HouseholdPage(), MealsPane(), Seg, SEGMENTS, GenerateGroceryButton(), MarkPaidButton() (+5 more)

### Community 9 - "new-doc-form.tsx"
Cohesion: 0.11
Nodes (25): NewDocForm(), onSubmit(), VISIBILITY, NewEntryForm(), onSubmit(), DocFileRow(), DownloadLink(), GalleryUpload() (+17 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "google-drive.ts"
Cohesion: 0.12
Nodes (27): GET(), DELETE(), GET(), POST(), SessionRequest, DeleteButton(), Failure, GalleryGrid() (+19 more)

### Community 12 - "proxy.ts"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

### Community 22 - "actions/family.ts"
Cohesion: 0.08
Nodes (29): FamilyForkForm(), initialState, FamilyAboutEditor(), emptyFields, FamilyAddress, FamilyAddressList(), remove(), save() (+21 more)

### Community 23 - "getCurrentMember"
Cohesion: 0.09
Nodes (31): GET(), NewDocPage(), NewHealthEntryPage(), DocumentsPane(), FamilyPage(), HealthPane(), ProfilePane(), Seg (+23 more)

## Knowledge Gaps
- **129 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+124 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 167 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `FamilyBackgroundCropUpload`, `[id]/page.tsx`, `requireCurrentMember`, `auth.ts`, `profile.ts`, `household/page.tsx`, `new-doc-form.tsx`, `google-drive.ts`, `actions/family.ts`, `getCurrentMember`?**
  _High betweenness centrality (0.220) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `getCurrentMember` to `[id]/page.tsx`, `requireCurrentMember`, `createClient`, `household/page.tsx`, `google-drive.ts`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `requireCurrentMember()` connect `requireCurrentMember` to `FamilyBackgroundCropUpload`, `auth.ts`, `createClient`, `profile.ts`, `new-doc-form.tsx`, `google-drive.ts`, `actions/family.ts`, `getCurrentMember`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _129 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `FamilyBackgroundCropUpload` be split into smaller, more focused modules?**
  _Cohesion score 0.1076923076923077 - nodes in this community are weakly interconnected._
- **Should `[id]/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06994047619047619 - nodes in this community are weakly interconnected._
- **Should `requireCurrentMember` be split into smaller, more focused modules?**
  _Cohesion score 0.09292929292929293 - nodes in this community are weakly interconnected._