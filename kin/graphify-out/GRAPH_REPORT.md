# Graph Report - kin  (2026-09-03)

## Corpus Check
- 112 files · ~40,281 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 516 nodes · 1395 edges · 24 communities (15 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `df76defb`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [folderId]/page.tsx
- wealth/page.tsx
- requireCurrentMember
- auth.ts
- devDependencies
- createClient
- compilerOptions
- [id]/page.tsx
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
- (app)/family/page.tsx
- actions/health.ts

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
- `ActivityForm()` --indirect_call--> `createActivityAction()`  [INFERRED]
  src/app/(app)/planner/add/add-planner-form.tsx → src/lib/actions/planner.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kin Frontend/Backend Technology Stack** — readme_kin_family_os, readme_nextjs_16, readme_react_19, readme_tailwind_v4, readme_supabase [EXTRACTED 1.00]
- **Kin Privacy/Access Control Mechanisms** — readme_rls_policies, readme_managed_child_profiles, readme_supabase_auth_otp [INFERRED 0.85]

## Communities (24 total, 9 thin omitted)

### Community 0 - "[folderId]/page.tsx"
Cohesion: 0.21
Nodes (10): DocFileRow(), DownloadLink(), deleteDocFileAction(), getDocFileUrl(), Ctx, DocSelectionProvider(), deleteSelected(), Failure (+2 more)

### Community 1 - "wealth/page.tsx"
Cohesion: 0.14
Nodes (21): SettingsPage(), TodayPage(), JointPane(), MinePane(), Seg, SEGMENTS, WealthPage(), AddAccountForm() (+13 more)

### Community 2 - "requireCurrentMember"
Cohesion: 0.17
Nodes (21): DRIVE_ERROR_MESSAGES, DeleteAccountButton(), DeleteHouseholdButton(), DriveConnectedPanel(), HouseholdNameForm(), HouseholdPrefsForm(), InviteCodeCard(), NOTIF_DEFS (+13 more)

### Community 3 - "auth.ts"
Cohesion: 0.06
Nodes (54): initialState, TYPES, VISIBILITY, initialState, NewMealPage(), initialState, NewMilestonePage(), initialState (+46 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (36): eslint, eslint-config-next, next, dependencies, next, react, react-dom, @supabase/ssr (+28 more)

### Community 5 - "createClient"
Cohesion: 0.09
Nodes (39): DocFolderPage(), MemberDetailPage(), EntriesPane(), GalleryPane(), MilestonesPane(), Seg, SEGMENTS, ActivityForm() (+31 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 7 - "[id]/page.tsx"
Cohesion: 0.11
Nodes (17): Seg, SEGMENTS, AvatarAlbumViewer(), Avatar(), MemberProfileEditor(), save(), ProfileEditForm(), save() (+9 more)

### Community 8 - "household/page.tsx"
Cohesion: 0.19
Nodes (13): BillsPane(), BuyPane(), HouseholdPage(), MealsPane(), Seg, SEGMENTS, GenerateGroceryButton(), MarkPaidButton() (+5 more)

### Community 9 - "database.types.ts"
Cohesion: 0.09
Nodes (30): NewDocForm(), onSubmit(), VISIBILITY, NewEntryForm(), onSubmit(), AvatarCropUpload(), cancel(), save() (+22 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "getCurrentMember"
Cohesion: 0.09
Nodes (35): GET(), GET(), DELETE(), GET(), POST(), SessionRequest, NewHealthEntryPage(), JournalPage() (+27 more)

### Community 12 - "proxy.ts"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

### Community 22 - "(app)/family/page.tsx"
Cohesion: 0.05
Nodes (48): NewDocPage(), DocumentsPane(), FamilyPage(), HealthPane(), ProfilePane(), Seg, SEGMENTS, NewJournalEntryPage() (+40 more)

### Community 23 - "actions/health.ts"
Cohesion: 0.38
Nodes (5): NewHealthEntryForm(), OmronToggle(), createHealthEntryAction(), GROUPED_TYPES, toggleOmronAction()

## Knowledge Gaps
- **124 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+119 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 153 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `[folderId]/page.tsx`, `wealth/page.tsx`, `requireCurrentMember`, `auth.ts`, `[id]/page.tsx`, `household/page.tsx`, `database.types.ts`, `getCurrentMember`, `(app)/family/page.tsx`, `actions/health.ts`?**
  _High betweenness centrality (0.222) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `getCurrentMember` to `[folderId]/page.tsx`, `wealth/page.tsx`, `requireCurrentMember`, `auth.ts`, `createClient`, `[id]/page.tsx`, `household/page.tsx`, `(app)/family/page.tsx`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Why does `requireCurrentMember()` connect `requireCurrentMember` to `[folderId]/page.tsx`, `wealth/page.tsx`, `auth.ts`, `createClient`, `[id]/page.tsx`, `database.types.ts`, `getCurrentMember`, `(app)/family/page.tsx`, `actions/health.ts`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _124 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `wealth/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.13756613756613756 - nodes in this community are weakly interconnected._
- **Should `auth.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06139240506329114 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05405405405405406 - nodes in this community are weakly interconnected._