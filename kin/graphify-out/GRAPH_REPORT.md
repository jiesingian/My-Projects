# Graph Report - kin  (2026-09-03)

## Corpus Check
- 93 files · ~31,439 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 423 nodes · 1127 edges · 23 communities (14 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d217208d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [folderId]/page.tsx
- [id]/page.tsx
- createClient
- auth.ts
- devDependencies
- settings/page.tsx
- compilerOptions
- wealth/page.tsx
- household/page.tsx
- requireCurrentMember
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
- add-planner-form.tsx

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 97 edges
2. `getCurrentMember` - 44 edges
3. `requireCurrentMember()` - 31 edges
4. `formatDate()` - 19 edges
5. `ActionState` - 18 edges
6. `ErrorText()` - 16 edges
7. `Icon()` - 16 edges
8. `compilerOptions` - 16 edges
9. `SubmitButton()` - 13 edges
10. `getValidDriveAccessToken()` - 13 edges

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

### Community 0 - "[folderId]/page.tsx"
Cohesion: 0.17
Nodes (14): DocFolderPage(), AppLayout(), DeleteButton(), DownloadLink(), GalleryTile(), Icon(), IconName, iconPaths (+6 more)

### Community 1 - "[id]/page.tsx"
Cohesion: 0.09
Nodes (30): OmronToggle(), MemberDetailPage(), Seg, SEGMENTS, FamilyPage(), HealthPane(), Seg, SEGMENTS (+22 more)

### Community 2 - "createClient"
Cohesion: 0.10
Nodes (35): GET(), NewDocPage(), NewHealthEntryPage(), DocumentsPane(), MembersPane(), NewJournalEntryPage(), AddPlannerPage(), CalendarPane() (+27 more)

### Community 3 - "auth.ts"
Cohesion: 0.07
Nodes (44): initialState, NewHealthEntryForm(), TYPES, VISIBILITY, initialState, NewMealPage(), initialState, CALLBACK_ERROR_MESSAGES (+36 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (36): eslint, eslint-config-next, next, dependencies, next, react, react-dom, @supabase/ssr (+28 more)

### Community 5 - "settings/page.tsx"
Cohesion: 0.18
Nodes (17): DRIVE_ERROR_MESSAGES, DriveConnectedPanel(), HouseholdNameForm(), HouseholdPrefsForm(), InviteCodeCard(), NOTIF_DEFS, NotificationToggles(), TextSizeControl() (+9 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 7 - "wealth/page.tsx"
Cohesion: 0.33
Nodes (8): JointPane(), MinePane(), Seg, SEGMENTS, WealthPage(), currentPeriod(), getJointWealth(), getMyWealth()

### Community 8 - "household/page.tsx"
Cohesion: 0.13
Nodes (22): BillsPane(), BuyPane(), HouseholdPage(), MealsPane(), Seg, SEGMENTS, AddBillForm(), BuyGroup (+14 more)

### Community 9 - "requireCurrentMember"
Cohesion: 0.11
Nodes (28): NewDocForm(), onSubmit(), VISIBILITY, NewMilestonePage(), NewEntryForm(), onSubmit(), GalleryUpload(), onUpload() (+20 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "google-drive.ts"
Cohesion: 0.23
Nodes (18): GET(), DELETE(), GET(), POST(), SessionRequest, createFolder(), createResumableUploadSession(), deleteDriveFile() (+10 more)

### Community 12 - "proxy.ts"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

### Community 22 - "add-planner-form.tsx"
Cohesion: 0.18
Nodes (14): ActivityForm(), AddPlannerForm(), EventForm(), GoalForm(), initialState, PlannerType, TripForm(), TYPES (+6 more)

## Knowledge Gaps
- **115 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+110 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 133 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `[folderId]/page.tsx`, `[id]/page.tsx`, `auth.ts`, `settings/page.tsx`, `wealth/page.tsx`, `household/page.tsx`, `requireCurrentMember`, `google-drive.ts`, `add-planner-form.tsx`?**
  _High betweenness centrality (0.194) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `createClient` to `[folderId]/page.tsx`, `[id]/page.tsx`, `settings/page.tsx`, `wealth/page.tsx`, `household/page.tsx`, `requireCurrentMember`, `google-drive.ts`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Why does `requireCurrentMember()` connect `requireCurrentMember` to `[folderId]/page.tsx`, `createClient`, `auth.ts`, `settings/page.tsx`, `household/page.tsx`, `add-planner-form.tsx`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _115 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `[id]/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09082125603864734 - nodes in this community are weakly interconnected._
- **Should `createClient` be split into smaller, more focused modules?**
  _Cohesion score 0.09879336349924585 - nodes in this community are weakly interconnected._
- **Should `auth.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06919945725915876 - nodes in this community are weakly interconnected._