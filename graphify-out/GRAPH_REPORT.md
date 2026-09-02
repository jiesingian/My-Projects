# Graph Report - kin  (2026-09-02)

## Corpus Check
- Corpus is ~27,085 words - fits in a single context window. You may not need a graph.

## Summary
- 390 nodes · 1001 edges · 22 communities (13 shown, 9 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.85)
- Token cost: 340,168 input · 0 output

## Community Hubs (Navigation)
- Health & Planner Entry Forms
- Member Detail & Health Tracking
- Family Overview & Documents
- New-Entry Forms (Docs/Meals/Milestones)
- Package Dependencies
- Household Forking & Signup
- TypeScript/Next Build Config
- Household Settings & Drive Integration
- Bills/Buy/Meals Dashboard Panes
- Supabase Database Types
- Project Docs & Design Rationale
- Wealth & Budget Controls
- Auth Middleware & Session Proxy
- Root Layout & Metadata
- ESLint Config
- Next.js Config
- PostCSS Config
- File Icon Asset
- Globe Icon Asset
- Next.js Logo Asset
- Vercel Logo Asset
- Window Icon Asset

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 92 edges
2. `getCurrentMember` - 39 edges
3. `requireCurrentMember()` - 28 edges
4. `ActionState` - 23 edges
5. `formatDate()` - 19 edges
6. `SubmitButton()` - 16 edges
7. `ErrorText()` - 16 edges
8. `compilerOptions` - 16 edges
9. `Icon()` - 14 edges
10. `Blueprint()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Next.js Agent Rules Block (AGENTS.md)` --conceptually_related_to--> `Next.js 16 (App Router, TypeScript)`  [INFERRED]
  AGENTS.md → README.md
- `NewMealPage()` --indirect_call--> `addMealPlanAction()`  [INFERRED]
  src/app/(app)/household/meals/new/page.tsx → src/lib/actions/household.ts
- `NewMilestonePage()` --calls--> `createMilestoneAction()`  [EXTRACTED]
  src/app/(app)/journal/milestones/new/page.tsx → src/lib/actions/journal.ts
- `NewEntryForm()` --indirect_call--> `createJournalEntryAction()`  [INFERRED]
  src/app/(app)/journal/new/new-entry-form.tsx → src/lib/actions/journal.ts
- `JournalPage()` --calls--> `getCurrentMember`  [EXTRACTED]
  src/app/(app)/journal/page.tsx → src/lib/session.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kin Frontend/Backend Technology Stack** — readme_kin_family_os, readme_nextjs_16, readme_react_19, readme_tailwind_v4, readme_supabase [EXTRACTED 1.00]
- **Kin Privacy/Access Control Mechanisms** — readme_rls_policies, readme_managed_child_profiles, readme_supabase_auth_otp [INFERRED 0.85]

## Communities (22 total, 9 thin omitted)

### Community 0 - "Health & Planner Entry Forms"
Cohesion: 0.10
Nodes (33): initialState, NewHealthEntryForm(), TYPES, VISIBILITY, NewHealthEntryPage(), ActivityForm(), EventForm(), GoalForm() (+25 more)

### Community 1 - "Member Detail & Health Tracking"
Cohesion: 0.09
Nodes (32): OmronToggle(), MemberDetailPage(), Seg, SEGMENTS, EntriesPane(), GalleryPane(), JournalPage(), MilestonesPane() (+24 more)

### Community 2 - "Family Overview & Documents"
Cohesion: 0.09
Nodes (32): GET(), NewDocPage(), DocumentsPane(), FamilyPage(), HealthPane(), MembersPane(), Seg, SEGMENTS (+24 more)

### Community 3 - "New-Entry Forms (Docs/Meals/Milestones)"
Cohesion: 0.11
Nodes (27): initialState, NewDocForm(), VISIBILITY, initialState, NewMealPage(), initialState, NewMilestonePage(), initialState (+19 more)

### Community 4 - "Package Dependencies"
Cohesion: 0.05
Nodes (36): eslint, eslint-config-next, next, dependencies, next, react, react-dom, @supabase/ssr (+28 more)

### Community 5 - "Household Forking & Signup"
Cohesion: 0.12
Nodes (19): DocFolderPage(), FamilyForkForm(), initialState, initialState, SignupPage(), VerifyForm(), DownloadLink(), Icon() (+11 more)

### Community 6 - "TypeScript/Next Build Config"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 7 - "Household Settings & Drive Integration"
Cohesion: 0.15
Nodes (19): DRIVE_ERROR_MESSAGES, CopyInviteCode(), DriveConnectedPanel(), HouseholdNameForm(), HouseholdPrefsForm(), InviteCodeCard(), NOTIF_DEFS, NotificationToggles() (+11 more)

### Community 8 - "Bills/Buy/Meals Dashboard Panes"
Cohesion: 0.14
Nodes (20): BillsPane(), BuyPane(), MealsPane(), Seg, SEGMENTS, AddBillForm(), BuyGroup, BuyList() (+12 more)

### Community 9 - "Supabase Database Types"
Cohesion: 0.16
Nodes (11): GET(), CompositeTypes, Constants, Database, DatabaseWithoutInternals, DefaultSchema, Enums, Json (+3 more)

### Community 10 - "Project Docs & Design Rationale"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "Wealth & Budget Controls"
Cohesion: 0.26
Nodes (11): JointPane(), MinePane(), Seg, SEGMENTS, AddAccountForm(), SetBudgetControl(), SetTargetControl(), formatCurrency() (+3 more)

### Community 12 - "Auth Middleware & Session Proxy"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

## Knowledge Gaps
- **113 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+108 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 130 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `Health & Planner Entry Forms` to `Member Detail & Health Tracking`, `Family Overview & Documents`, `New-Entry Forms (Docs/Meals/Milestones)`, `Household Forking & Signup`, `Household Settings & Drive Integration`, `Bills/Buy/Meals Dashboard Panes`, `Wealth & Budget Controls`?**
  _High betweenness centrality (0.182) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `Family Overview & Documents` to `Health & Planner Entry Forms`, `Member Detail & Health Tracking`, `Household Forking & Signup`, `Household Settings & Drive Integration`, `Bills/Buy/Meals Dashboard Panes`, `Supabase Database Types`, `Wealth & Budget Controls`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `ActionState` connect `New-Entry Forms (Docs/Meals/Milestones)` to `Health & Planner Entry Forms`, `Bills/Buy/Meals Dashboard Panes`, `Household Forking & Signup`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _113 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Health & Planner Entry Forms` be split into smaller, more focused modules?**
  _Cohesion score 0.10083256244218317 - nodes in this community are weakly interconnected._
- **Should `Member Detail & Health Tracking` be split into smaller, more focused modules?**
  _Cohesion score 0.08787878787878788 - nodes in this community are weakly interconnected._
- **Should `Family Overview & Documents` be split into smaller, more focused modules?**
  _Cohesion score 0.08748615725359911 - nodes in this community are weakly interconnected._