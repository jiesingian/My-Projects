# Graph Report - kin  (2026-09-02)

## Corpus Check
- 89 files · ~28,771 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 402 nodes · 1049 edges · 21 communities (12 shown, 9 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f0380571`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- requireCurrentMember
- [id]/page.tsx
- getCurrentMember
- auth.ts
- devDependencies
- compilerOptions
- createClient
- household/page.tsx
- actions/journal.ts
- Kin — Family Operating System
- wealth/page.tsx
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
1. `createClient()` - 92 edges
2. `getCurrentMember` - 39 edges
3. `requireCurrentMember()` - 28 edges
4. `ActionState` - 23 edges
5. `formatDate()` - 19 edges
6. `SubmitButton()` - 16 edges
7. `ErrorText()` - 16 edges
8. `compilerOptions` - 16 edges
9. `Icon()` - 15 edges
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
- `NewEntryForm()` --indirect_call--> `createJournalEntryAction()`  [INFERRED]
  src/app/(app)/journal/new/new-entry-form.tsx → src/lib/actions/journal.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kin Frontend/Backend Technology Stack** — readme_kin_family_os, readme_nextjs_16, readme_react_19, readme_tailwind_v4, readme_supabase [EXTRACTED 1.00]
- **Kin Privacy/Access Control Mechanisms** — readme_rls_policies, readme_managed_child_profiles, readme_supabase_auth_otp [INFERRED 0.85]

## Communities (21 total, 9 thin omitted)

### Community 0 - "requireCurrentMember"
Cohesion: 0.21
Nodes (14): ActivityForm(), EventForm(), GoalForm(), initialState, PlannerType, TripForm(), TYPES, AddToJournalButton() (+6 more)

### Community 1 - "[id]/page.tsx"
Cohesion: 0.07
Nodes (44): DocFolderPage(), MemberDetailPage(), Seg, SEGMENTS, DocumentsPane(), FamilyPage(), HealthPane(), MembersPane() (+36 more)

### Community 2 - "getCurrentMember"
Cohesion: 0.11
Nodes (23): GET(), NewDocPage(), initialState, NewHealthEntryForm(), TYPES, VISIBILITY, NewHealthEntryPage(), OmronToggle() (+15 more)

### Community 3 - "auth.ts"
Cohesion: 0.09
Nodes (35): initialState, NewMealPage(), initialState, NewMilestonePage(), initialState, CALLBACK_ERROR_MESSAGES, initialState, LoginForm() (+27 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (36): eslint, eslint-config-next, next, dependencies, next, react, react-dom, @supabase/ssr (+28 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 7 - "createClient"
Cohesion: 0.11
Nodes (31): CalendarPane(), EventsPane(), GoalsPane(), PlannerPage(), Seg, SEGMENTS, DRIVE_ERROR_MESSAGES, GET() (+23 more)

### Community 8 - "household/page.tsx"
Cohesion: 0.13
Nodes (22): BillsPane(), BuyPane(), HouseholdPage(), MealsPane(), Seg, SEGMENTS, AddBillForm(), BuyGroup (+14 more)

### Community 9 - "actions/journal.ts"
Cohesion: 0.10
Nodes (29): GET(), initialState, NewDocForm(), VISIBILITY, createDocEntryAction(), deleteDocFileAction(), disconnectDriveAction(), createJournalEntryAction() (+21 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "wealth/page.tsx"
Cohesion: 0.19
Nodes (16): JointPane(), MinePane(), Seg, SEGMENTS, WealthPage(), AddAccountForm(), initialState, SetBudgetControl() (+8 more)

### Community 12 - "proxy.ts"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

## Knowledge Gaps
- **113 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+108 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 130 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `requireCurrentMember`, `[id]/page.tsx`, `getCurrentMember`, `auth.ts`, `household/page.tsx`, `actions/journal.ts`, `wealth/page.tsx`?**
  _High betweenness centrality (0.182) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `getCurrentMember` to `requireCurrentMember`, `[id]/page.tsx`, `createClient`, `household/page.tsx`, `actions/journal.ts`, `wealth/page.tsx`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Why does `ActionState` connect `auth.ts` to `requireCurrentMember`, `getCurrentMember`, `household/page.tsx`, `actions/journal.ts`, `wealth/page.tsx`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _113 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `[id]/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06806526806526807 - nodes in this community are weakly interconnected._
- **Should `getCurrentMember` be split into smaller, more focused modules?**
  _Cohesion score 0.10756302521008404 - nodes in this community are weakly interconnected._
- **Should `auth.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08506493506493507 - nodes in this community are weakly interconnected._