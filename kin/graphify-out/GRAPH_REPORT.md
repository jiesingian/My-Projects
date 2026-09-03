# Graph Report - kin  (2026-09-03)

## Corpus Check
- 122 files · ~50,112 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 615 nodes · 1714 edges · 23 communities (14 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `69e722a3`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- actions/journal.ts
- createClient
- requireCurrentMember
- auth.ts
- devDependencies
- settings/page.tsx
- compilerOptions
- [id]/page.tsx
- google-drive.ts
- household/page.tsx
- Kin — Family Operating System
- icons.tsx
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
1. `createClient()` - 136 edges
2. `requireCurrentMember()` - 59 edges
3. `getCurrentMember` - 50 edges
4. `ActionState` - 22 edges
5. `formatDate()` - 21 edges
6. `getValidDriveAccessToken()` - 19 edges
7. `createAdminClient()` - 19 edges
8. `Icon()` - 17 edges
9. `ErrorText()` - 16 edges
10. `ensureDriveFolderStructure()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `Next.js Agent Rules Block (AGENTS.md)` --conceptually_related_to--> `Next.js 16 (App Router, TypeScript)`  [INFERRED]
  AGENTS.md → README.md
- `NewMealPage()` --indirect_call--> `addMealPlanAction()`  [INFERRED]
  src/app/(app)/household/meals/new/page.tsx → src/lib/actions/household.ts
- `HouseholdPage()` --calls--> `getCurrentMember`  [EXTRACTED]
  src/app/(app)/household/page.tsx → src/lib/session.ts
- `GoalForm()` --indirect_call--> `createGoalAction()`  [INFERRED]
  src/app/(app)/planner/add/add-planner-form.tsx → src/lib/actions/planner.ts
- `TripForm()` --indirect_call--> `createTripAction()`  [INFERRED]
  src/app/(app)/planner/add/add-planner-form.tsx → src/lib/actions/planner.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kin Frontend/Backend Technology Stack** — readme_kin_family_os, readme_nextjs_16, readme_react_19, readme_tailwind_v4, readme_supabase [EXTRACTED 1.00]
- **Kin Privacy/Access Control Mechanisms** — readme_rls_policies, readme_managed_child_profiles, readme_supabase_auth_otp [INFERRED 0.85]

## Communities (23 total, 9 thin omitted)

### Community 0 - "actions/journal.ts"
Cohesion: 0.09
Nodes (28): NewDocForm(), onSubmit(), VISIBILITY, NewEntryForm(), onSubmit(), AvatarCropUpload(), cancel(), save() (+20 more)

### Community 1 - "createClient"
Cohesion: 0.05
Nodes (78): GET(), GET(), DocFolderPage(), NewDocPage(), NewHealthEntryPage(), DocumentsPane(), FamilyPage(), HealthPane() (+70 more)

### Community 2 - "requireCurrentMember"
Cohesion: 0.08
Nodes (50): GET(), ActivityForm(), AddPlannerForm(), EditActivity, EditEvent, EventForm(), GoalForm(), initialState (+42 more)

### Community 3 - "auth.ts"
Cohesion: 0.06
Nodes (48): initialState, NewHealthEntryForm(), TYPES, VISIBILITY, initialState, NewMealPage(), initialState, NewMilestonePage() (+40 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (36): eslint, eslint-config-next, next, dependencies, next, react, react-dom, @supabase/ssr (+28 more)

### Community 5 - "settings/page.tsx"
Cohesion: 0.12
Nodes (25): CALENDAR_ERROR_MESSAGES, DRIVE_ERROR_MESSAGES, SettingsPage(), DeleteAccountButton(), DeleteHouseholdButton(), CalendarConnectedPanel(), DriveConnectedPanel(), HouseholdNameForm() (+17 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 7 - "[id]/page.tsx"
Cohesion: 0.05
Nodes (48): OmronToggle(), MemberDetailPage(), Seg, SEGMENTS, AvatarAlbumViewer(), Avatar(), FamilyBackgroundAlbum(), MemberProfileEditor() (+40 more)

### Community 8 - "google-drive.ts"
Cohesion: 0.14
Nodes (30): GET(), DELETE(), GET(), POST(), SessionRequest, MigratePhotosButton(), deleteDocFileAction(), disconnectDriveAction() (+22 more)

### Community 9 - "household/page.tsx"
Cohesion: 0.13
Nodes (22): BillsPane(), BuyPane(), HouseholdPage(), MealsPane(), Seg, SEGMENTS, AddBillForm(), BuyGroup (+14 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "icons.tsx"
Cohesion: 0.09
Nodes (21): DeleteButton(), DocFileRow(), DownloadLink(), Failure, GalleryGrid(), deleteSelected(), MediaItem, GalleryTile() (+13 more)

### Community 12 - "proxy.ts"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

### Community 22 - "actions/family.ts"
Cohesion: 0.10
Nodes (23): FamilyAboutEditor(), emptyFields, FamilyAddress, FamilyAddressList(), remove(), save(), startEdit(), fieldsFromAddress() (+15 more)

## Knowledge Gaps
- **138 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+133 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 176 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `actions/journal.ts`, `requireCurrentMember`, `auth.ts`, `settings/page.tsx`, `[id]/page.tsx`, `google-drive.ts`, `household/page.tsx`, `icons.tsx`, `actions/family.ts`?**
  _High betweenness centrality (0.220) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `createClient` to `requireCurrentMember`, `auth.ts`, `settings/page.tsx`, `[id]/page.tsx`, `google-drive.ts`, `household/page.tsx`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Why does `requireCurrentMember()` connect `requireCurrentMember` to `actions/journal.ts`, `createClient`, `auth.ts`, `settings/page.tsx`, `[id]/page.tsx`, `google-drive.ts`, `household/page.tsx`, `icons.tsx`, `actions/family.ts`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _138 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `actions/journal.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08787878787878788 - nodes in this community are weakly interconnected._
- **Should `createClient` be split into smaller, more focused modules?**
  _Cohesion score 0.05225225225225225 - nodes in this community are weakly interconnected._
- **Should `requireCurrentMember` be split into smaller, more focused modules?**
  _Cohesion score 0.07769423558897243 - nodes in this community are weakly interconnected._