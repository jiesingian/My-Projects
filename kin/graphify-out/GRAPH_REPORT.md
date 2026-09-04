# Graph Report - kin  (2026-09-04)

## Corpus Check
- 122 files · ~51,011 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 621 nodes · 1736 edges · 24 communities (15 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9122c3ec`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- new-doc-form.tsx
- createClient
- calendar-sync.ts
- auth.ts
- devDependencies
- requireCurrentMember
- compilerOptions
- [id]/page.tsx
- google-drive.ts
- planner/page.tsx
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
- database.types.ts

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 134 edges
2. `requireCurrentMember()` - 59 edges
3. `getCurrentMember` - 50 edges
4. `ActionState` - 22 edges
5. `syncRowToCalendars()` - 21 edges
6. `formatDate()` - 21 edges
7. `getValidDriveAccessToken()` - 19 edges
8. `createAdminClient()` - 19 edges
9. `Icon()` - 17 edges
10. `ErrorText()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `Next.js Agent Rules Block (AGENTS.md)` --conceptually_related_to--> `Next.js 16 (App Router, TypeScript)`  [INFERRED]
  AGENTS.md → README.md
- `NewMealPage()` --indirect_call--> `addMealPlanAction()`  [INFERRED]
  src/app/(app)/household/meals/new/page.tsx → src/lib/actions/household.ts
- `AppLayout()` --calls--> `getCurrentMember`  [EXTRACTED]
  src/app/(app)/layout.tsx → src/lib/session.ts
- `GoalForm()` --indirect_call--> `createGoalAction()`  [INFERRED]
  src/app/(app)/planner/add/add-planner-form.tsx → src/lib/actions/wealth.ts
- `TripForm()` --indirect_call--> `createTripAction()`  [INFERRED]
  src/app/(app)/planner/add/add-planner-form.tsx → src/lib/actions/planner.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kin Frontend/Backend Technology Stack** — readme_kin_family_os, readme_nextjs_16, readme_react_19, readme_tailwind_v4, readme_supabase [EXTRACTED 1.00]
- **Kin Privacy/Access Control Mechanisms** — readme_rls_policies, readme_managed_child_profiles, readme_supabase_auth_otp [INFERRED 0.85]

## Communities (24 total, 9 thin omitted)

### Community 0 - "new-doc-form.tsx"
Cohesion: 0.09
Nodes (27): NewDocForm(), onSubmit(), VISIBILITY, NewEntryForm(), onSubmit(), AvatarCropUpload(), cancel(), save() (+19 more)

### Community 1 - "createClient"
Cohesion: 0.06
Nodes (66): GET(), GET(), DocFolderPage(), NewDocPage(), NewHealthEntryPage(), DocumentsPane(), FamilyPage(), HealthPane() (+58 more)

### Community 2 - "calendar-sync.ts"
Cohesion: 0.08
Nodes (45): GET(), ActivityForm(), AddPlannerForm(), EditActivity, EditEvent, EventForm(), GoalForm(), initialState (+37 more)

### Community 3 - "auth.ts"
Cohesion: 0.06
Nodes (51): initialState, NewMealPage(), initialState, NewMilestonePage(), CALLBACK_ERROR_MESSAGES, initialState, LoginForm(), FamilyForkForm() (+43 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (36): eslint, eslint-config-next, next, dependencies, next, react, react-dom, @supabase/ssr (+28 more)

### Community 5 - "requireCurrentMember"
Cohesion: 0.13
Nodes (26): CALENDAR_ERROR_MESSAGES, DRIVE_ERROR_MESSAGES, DeleteAccountButton(), DeleteHouseholdButton(), CalendarConnectedPanel(), DriveConnectedPanel(), HouseholdNameForm(), HouseholdPrefsForm() (+18 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 7 - "[id]/page.tsx"
Cohesion: 0.09
Nodes (28): MemberDetailPage(), Seg, SEGMENTS, AvatarAlbumViewer(), Avatar(), MemberProfileEditor(), save(), ProfileEditForm() (+20 more)

### Community 8 - "google-drive.ts"
Cohesion: 0.10
Nodes (38): GET(), DELETE(), GET(), POST(), SessionRequest, Failure, GalleryGrid(), deleteSelected() (+30 more)

### Community 9 - "planner/page.tsx"
Cohesion: 0.11
Nodes (29): CALENDAR_VIEWS, calendarHref(), CalendarPane(), CalendarView, EventsPane(), MonthView(), PlannerPage(), Seg (+21 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "icons.tsx"
Cohesion: 0.11
Nodes (20): AppLayout(), CopyInviteCode(), DeleteButton(), DocFileRow(), DownloadLink(), Icon(), IconName, iconPaths (+12 more)

### Community 12 - "proxy.ts"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

### Community 22 - "actions/family.ts"
Cohesion: 0.07
Nodes (32): FamilyAboutEditor(), emptyFields, FamilyAddress, FamilyAddressList(), remove(), save(), startEdit(), fieldsFromAddress() (+24 more)

### Community 23 - "database.types.ts"
Cohesion: 0.12
Nodes (17): initialState, NewHealthEntryForm(), TYPES, VISIBILITY, OmronToggle(), createHealthEntryAction(), GROUPED_TYPES, toggleOmronAction() (+9 more)

## Knowledge Gaps
- **140 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+135 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 178 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `new-doc-form.tsx`, `calendar-sync.ts`, `auth.ts`, `requireCurrentMember`, `[id]/page.tsx`, `google-drive.ts`, `planner/page.tsx`, `icons.tsx`, `actions/family.ts`, `database.types.ts`?**
  _High betweenness centrality (0.219) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `createClient` to `calendar-sync.ts`, `auth.ts`, `requireCurrentMember`, `[id]/page.tsx`, `google-drive.ts`, `planner/page.tsx`, `icons.tsx`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Why does `requireCurrentMember()` connect `requireCurrentMember` to `new-doc-form.tsx`, `createClient`, `calendar-sync.ts`, `auth.ts`, `[id]/page.tsx`, `google-drive.ts`, `planner/page.tsx`, `icons.tsx`, `actions/family.ts`, `database.types.ts`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _140 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `new-doc-form.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09080841638981174 - nodes in this community are weakly interconnected._
- **Should `createClient` be split into smaller, more focused modules?**
  _Cohesion score 0.06108442004118051 - nodes in this community are weakly interconnected._
- **Should `calendar-sync.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08235294117647059 - nodes in this community are weakly interconnected._