# Graph Report - kin  (2026-09-03)

## Corpus Check
- 122 files · ~47,863 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 592 nodes · 1646 edges · 22 communities (13 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4562ed67`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- database.types.ts
- getCurrentMember
- requireCurrentMember
- settings/page.tsx
- devDependencies
- wealth/page.tsx
- compilerOptions
- [id]/page.tsx
- createClient
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

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 126 edges
2. `requireCurrentMember()` - 55 edges
3. `getCurrentMember` - 50 edges
4. `ActionState` - 22 edges
5. `formatDate()` - 21 edges
6. `createAdminClient()` - 20 edges
7. `getValidDriveAccessToken()` - 19 edges
8. `Icon()` - 18 edges
9. `ErrorText()` - 16 edges
10. `ensureDriveFolderStructure()` - 16 edges

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

### Community 0 - "database.types.ts"
Cohesion: 0.07
Nodes (36): NewDocForm(), onSubmit(), VISIBILITY, NewEntryForm(), onSubmit(), AvatarCropUpload(), cancel(), save() (+28 more)

### Community 1 - "getCurrentMember"
Cohesion: 0.11
Nodes (22): GET(), GET(), GET(), NewDocPage(), NewHealthEntryForm(), NewHealthEntryPage(), OmronToggle(), NewJournalEntryPage() (+14 more)

### Community 2 - "requireCurrentMember"
Cohesion: 0.07
Nodes (50): NewMilestonePage(), ActivityForm(), EventForm(), GoalForm(), initialState, PlannerType, TripForm(), TYPES (+42 more)

### Community 3 - "settings/page.tsx"
Cohesion: 0.05
Nodes (57): initialState, TYPES, VISIBILITY, initialState, initialState, CALENDAR_ERROR_MESSAGES, DRIVE_ERROR_MESSAGES, SettingsPage() (+49 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (36): eslint, eslint-config-next, next, dependencies, next, react, react-dom, @supabase/ssr (+28 more)

### Community 5 - "wealth/page.tsx"
Cohesion: 0.19
Nodes (16): JointPane(), MinePane(), Seg, SEGMENTS, WealthPage(), AddAccountForm(), initialState, SetBudgetControl() (+8 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 7 - "[id]/page.tsx"
Cohesion: 0.08
Nodes (34): MemberDetailPage(), Seg, SEGMENTS, MembersPage(), AvatarAlbumViewer(), Avatar(), DeleteAccountButton(), MemberProfileEditor() (+26 more)

### Community 8 - "createClient"
Cohesion: 0.07
Nodes (50): DocFolderPage(), NewMealPage(), BillsPane(), BuyPane(), HouseholdPage(), MealsPane(), Seg, SEGMENTS (+42 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "google-drive.ts"
Cohesion: 0.10
Nodes (37): GET(), DELETE(), GET(), POST(), SessionRequest, Failure, GalleryGrid(), deleteSelected() (+29 more)

### Community 12 - "proxy.ts"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

### Community 22 - "actions/family.ts"
Cohesion: 0.05
Nodes (48): DocumentsPane(), FamilyPage(), HealthPane(), ProfilePane(), Seg, SEGMENTS, FamilyForkForm(), DeleteHouseholdButton() (+40 more)

## Knowledge Gaps
- **131 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+126 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 169 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `database.types.ts`, `getCurrentMember`, `requireCurrentMember`, `settings/page.tsx`, `wealth/page.tsx`, `[id]/page.tsx`, `google-drive.ts`, `actions/family.ts`?**
  _High betweenness centrality (0.208) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `getCurrentMember` to `requireCurrentMember`, `settings/page.tsx`, `wealth/page.tsx`, `[id]/page.tsx`, `createClient`, `google-drive.ts`, `actions/family.ts`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Why does `requireCurrentMember()` connect `requireCurrentMember` to `database.types.ts`, `getCurrentMember`, `wealth/page.tsx`, `[id]/page.tsx`, `createClient`, `google-drive.ts`, `actions/family.ts`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _131 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `database.types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06966618287373004 - nodes in this community are weakly interconnected._
- **Should `getCurrentMember` be split into smaller, more focused modules?**
  _Cohesion score 0.10952380952380952 - nodes in this community are weakly interconnected._
- **Should `requireCurrentMember` be split into smaller, more focused modules?**
  _Cohesion score 0.07320024198427103 - nodes in this community are weakly interconnected._