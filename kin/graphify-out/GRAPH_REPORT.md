# Graph Report - kin  (2026-09-04)

## Corpus Check
- 135 files · ~67,993 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 767 nodes · 2234 edges · 30 communities (21 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 25 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `43d3791b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- database.types.ts
- getCurrentMember
- wealth/page.tsx
- auth.ts
- devDependencies
- buy-list.tsx
- compilerOptions
- settings/page.tsx
- server.ts
- planner/page.tsx
- Kin — Family Operating System
- formatDate
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
- calendar-sync.ts
- createClient
- lib/wealth.ts
- actions/family.ts
- accounts/[id]/page.tsx
- queries/wealth.ts
- members/[id]/page.tsx
- transact-form.tsx

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 159 edges
2. `requireCurrentMember()` - 79 edges
3. `getCurrentMember` - 60 edges
4. `formatDate()` - 27 edges
5. `formatCurrency()` - 26 edges
6. `ActionState` - 24 edges
7. `revalidateWealth()` - 24 edges
8. `syncRowToCalendars()` - 23 edges
9. `ErrorText()` - 19 edges
10. `getValidDriveAccessToken()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `AssetForm()` --indirect_call--> `addAssetAction()`  [INFERRED]
  src/app/(app)/wealth/assets/new/add-holding-form.tsx → src/lib/actions/wealth.ts
- `LiabilityForm()` --indirect_call--> `addLiabilityAction()`  [INFERRED]
  src/app/(app)/wealth/assets/new/add-holding-form.tsx → src/lib/actions/wealth.ts
- `Next.js Agent Rules Block (AGENTS.md)` --conceptually_related_to--> `Next.js 16 (App Router, TypeScript)`  [INFERRED]
  AGENTS.md → README.md
- `NewMealPage()` --indirect_call--> `addMealPlanAction()`  [INFERRED]
  src/app/(app)/household/meals/new/page.tsx → src/lib/actions/household.ts
- `HouseholdPage()` --calls--> `getCurrentMember`  [EXTRACTED]
  src/app/(app)/household/page.tsx → src/lib/session.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kin Frontend/Backend Technology Stack** — readme_kin_family_os, readme_nextjs_16, readme_react_19, readme_tailwind_v4, readme_supabase [EXTRACTED 1.00]
- **Kin Privacy/Access Control Mechanisms** — readme_rls_policies, readme_managed_child_profiles, readme_supabase_auth_otp [INFERRED 0.85]

## Communities (30 total, 9 thin omitted)

### Community 0 - "database.types.ts"
Cohesion: 0.05
Nodes (48): NewDocForm(), onSubmit(), VISIBILITY, initialState, NewHealthEntryForm(), TYPES, VISIBILITY, OmronToggle() (+40 more)

### Community 1 - "getCurrentMember"
Cohesion: 0.08
Nodes (35): GET(), GET(), NewDocPage(), NewHealthEntryPage(), DocumentsPane(), FamilyPage(), HealthPane(), ProfilePane() (+27 more)

### Community 2 - "wealth/page.tsx"
Cohesion: 0.14
Nodes (16): BillsPane(), GoalsPane(), HistoryPoint, Seg, SEGMENT_LABELS, SEGMENTS, toPickable(), AddAccountForm() (+8 more)

### Community 3 - "auth.ts"
Cohesion: 0.06
Nodes (38): DocFolderPage(), CALLBACK_ERROR_MESSAGES, initialState, LoginForm(), FamilyForkForm(), initialState, PendingApprovalPage(), initialState (+30 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (38): @anthropic-ai/sdk, eslint, eslint-config-next, next, dependencies, @anthropic-ai/sdk, next, react (+30 more)

### Community 5 - "buy-list.tsx"
Cohesion: 0.07
Nodes (45): POST(), systemPrompt(), initialState, NewMealPage(), BuyPane(), HouseholdPage(), MealsPane(), Seg (+37 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 7 - "settings/page.tsx"
Cohesion: 0.14
Nodes (22): CALENDAR_ERROR_MESSAGES, DRIVE_ERROR_MESSAGES, DeleteAccountButton(), CalendarConnectedPanel(), DriveConnectedPanel(), HouseholdNameForm(), HouseholdPrefsForm(), InviteCodeCard() (+14 more)

### Community 8 - "server.ts"
Cohesion: 0.08
Nodes (47): GET(), DELETE(), GET(), POST(), SessionRequest, EntriesPane(), GalleryPane(), JournalPage() (+39 more)

### Community 9 - "planner/page.tsx"
Cohesion: 0.11
Nodes (31): AgendaRow(), CALENDAR_VIEWS, calendarHref(), CalendarPane(), CalendarView, EventsPane(), MonthView(), PlannerPage() (+23 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "formatDate"
Cohesion: 0.21
Nodes (12): TravelPane(), AssetsPane(), EntryRow(), FlowRow(), Hero(), HistoryStrip(), Meter(), PendingBlock() (+4 more)

### Community 12 - "proxy.ts"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

### Community 22 - "calendar-sync.ts"
Cohesion: 0.09
Nodes (42): GET(), ActivityForm(), EditActivity, EditEvent, EventForm(), initialState, PlannerType, TripForm() (+34 more)

### Community 24 - "createClient"
Cohesion: 0.13
Nodes (45): submit(), GET(), DeleteEntryButton(), DELETERS, GoalContributeControl(), LogSpendControl(), PayBillControl(), PendingEntryActions() (+37 more)

### Community 25 - "lib/wealth.ts"
Cohesion: 0.17
Nodes (11): AssetForm(), initialState, LiabilityForm(), ASSET_KIND_LABELS, ASSET_KINDS, AssetKind, GOAL_CATEGORY, LIABILITY_KIND_LABELS (+3 more)

### Community 26 - "actions/family.ts"
Cohesion: 0.07
Nodes (29): AddChildForm(), initialState, DeleteHouseholdButton(), emptyFields, FamilyAddress, FamilyAddressList(), remove(), save() (+21 more)

### Community 27 - "accounts/[id]/page.tsx"
Cohesion: 0.25
Nodes (5): AccountEditForm(), initialState, AccountPage(), ACCOUNT_TYPES, AccountType

### Community 28 - "queries/wealth.ts"
Cohesion: 0.20
Nodes (16): AddGoalPage(), ScopePane(), AccountWithBalance, currentPeriod(), getAccountDetail(), getAccounts(), getNetWorth(), getWealthPane() (+8 more)

### Community 30 - "members/[id]/page.tsx"
Cohesion: 0.06
Nodes (40): MemberDetailPage(), Seg, SEGMENTS, SettingsPage(), TodayPage(), MembersPage(), AssistantConsole(), SUGGESTIONS (+32 more)

### Community 31 - "transact-form.tsx"
Cohesion: 0.14
Nodes (10): AddGoalForm(), initialState, Mode, MODE_LABELS, MODES, todayLocal(), TransactForm(), PickableAccount (+2 more)

## Knowledge Gaps
- **159 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+154 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 215 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `database.types.ts`, `getCurrentMember`, `wealth/page.tsx`, `auth.ts`, `buy-list.tsx`, `settings/page.tsx`, `server.ts`, `planner/page.tsx`, `calendar-sync.ts`, `actions/family.ts`, `queries/wealth.ts`, `members/[id]/page.tsx`?**
  _High betweenness centrality (0.219) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `getCurrentMember` to `wealth/page.tsx`, `auth.ts`, `buy-list.tsx`, `settings/page.tsx`, `server.ts`, `planner/page.tsx`, `calendar-sync.ts`, `createClient`, `accounts/[id]/page.tsx`, `queries/wealth.ts`, `members/[id]/page.tsx`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `requireCurrentMember()` connect `createClient` to `database.types.ts`, `getCurrentMember`, `auth.ts`, `buy-list.tsx`, `settings/page.tsx`, `server.ts`, `planner/page.tsx`, `calendar-sync.ts`, `actions/family.ts`, `members/[id]/page.tsx`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _159 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `database.types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05341614906832298 - nodes in this community are weakly interconnected._
- **Should `getCurrentMember` be split into smaller, more focused modules?**
  _Cohesion score 0.07547169811320754 - nodes in this community are weakly interconnected._
- **Should `wealth/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._