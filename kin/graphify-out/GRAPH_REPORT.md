# Graph Report - kin  (2026-09-04)

## Corpus Check
- 133 files · ~65,572 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 745 nodes · 2162 edges · 30 communities (21 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 25 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ed02a689`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- database.types.ts
- getCurrentMember
- wealth/page.tsx
- auth.ts
- devDependencies
- settings/page.tsx
- compilerOptions
- members/[id]/page.tsx
- google-drive.ts
- planner/page.tsx
- Kin — Family Operating System
- ui.tsx
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
- wealth-controls.tsx
- createClient
- lib/wealth.ts
- actions/family.ts
- accounts/[id]/page.tsx
- queries/wealth.ts
- transact-form.tsx

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 157 edges
2. `requireCurrentMember()` - 77 edges
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
- `NewHealthEntryForm()` --indirect_call--> `createHealthEntryAction()`  [INFERRED]
  src/app/(app)/family/members/[id]/health/new/new-health-entry-form.tsx → src/lib/actions/health.ts
- `FamilyPage()` --calls--> `getCurrentMember`  [EXTRACTED]
  src/app/(app)/family/page.tsx → src/lib/session.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kin Frontend/Backend Technology Stack** — readme_kin_family_os, readme_nextjs_16, readme_react_19, readme_tailwind_v4, readme_supabase [EXTRACTED 1.00]
- **Kin Privacy/Access Control Mechanisms** — readme_rls_policies, readme_managed_child_profiles, readme_supabase_auth_otp [INFERRED 0.85]

## Communities (30 total, 9 thin omitted)

### Community 0 - "database.types.ts"
Cohesion: 0.06
Nodes (43): VISIBILITY, initialState, TYPES, VISIBILITY, initialState, NewMilestonePage(), NewEntryForm(), onSubmit() (+35 more)

### Community 1 - "getCurrentMember"
Cohesion: 0.08
Nodes (28): POST(), systemPrompt(), GET(), GET(), NewDocForm(), NewDocPage(), NewHealthEntryForm(), NewHealthEntryPage() (+20 more)

### Community 2 - "wealth/page.tsx"
Cohesion: 0.14
Nodes (24): TravelPane(), AssetsPane(), BillsPane(), EntryRow(), FlowRow(), GoalsPane(), Hero(), HistoryPoint (+16 more)

### Community 3 - "auth.ts"
Cohesion: 0.07
Nodes (39): initialState, NewMealPage(), BuyPane(), HouseholdPage(), MealsPane(), Seg, SEGMENTS, CALLBACK_ERROR_MESSAGES (+31 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (38): @anthropic-ai/sdk, eslint, eslint-config-next, next, dependencies, @anthropic-ai/sdk, next, react (+30 more)

### Community 5 - "settings/page.tsx"
Cohesion: 0.13
Nodes (20): CALENDAR_ERROR_MESSAGES, DRIVE_ERROR_MESSAGES, SettingsPage(), DeleteAccountButton(), DeleteHouseholdButton(), CalendarConnectedPanel(), DriveConnectedPanel(), HouseholdNameForm() (+12 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 7 - "members/[id]/page.tsx"
Cohesion: 0.05
Nodes (53): MemberDetailPage(), Seg, SEGMENTS, DocumentsPane(), FamilyPage(), HealthPane(), ProfilePane(), Seg (+45 more)

### Community 8 - "google-drive.ts"
Cohesion: 0.11
Nodes (33): GET(), DELETE(), GET(), POST(), SessionRequest, Failure, GalleryGrid(), deleteSelected() (+25 more)

### Community 9 - "planner/page.tsx"
Cohesion: 0.08
Nodes (38): EntriesPane(), GalleryPane(), JournalPage(), MilestonesPane(), Seg, SEGMENTS, CALENDAR_VIEWS, calendarHref() (+30 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "ui.tsx"
Cohesion: 0.07
Nodes (34): DocFolderPage(), onSubmit(), TodayPage(), FamilyForkForm(), initialState, MembersPage(), AssistantConsole(), SUGGESTIONS (+26 more)

### Community 12 - "proxy.ts"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

### Community 22 - "calendar-sync.ts"
Cohesion: 0.09
Nodes (41): GET(), ActivityForm(), EditActivity, EditEvent, EventForm(), initialState, PlannerType, TripForm() (+33 more)

### Community 23 - "wealth-controls.tsx"
Cohesion: 0.22
Nodes (7): AddAccountForm(), AddBillForm(), AllocationEditor(), initialState, SetBudgetControl(), SetTargetControl(), ACCOUNT_TYPES

### Community 24 - "createClient"
Cohesion: 0.10
Nodes (55): OmronToggle(), submit(), GET(), DeleteEntryButton(), DELETERS, GoalContributeControl(), LogSpendControl(), PayBillControl() (+47 more)

### Community 25 - "lib/wealth.ts"
Cohesion: 0.19
Nodes (10): AssetForm(), initialState, LiabilityForm(), ASSET_KIND_LABELS, ASSET_KINDS, AssetKind, GOAL_CATEGORY, LIABILITY_KIND_LABELS (+2 more)

### Community 26 - "actions/family.ts"
Cohesion: 0.10
Nodes (23): AddChildForm(), initialState, FamilyAboutEditor(), emptyFields, FamilyAddress, FamilyAddressList(), remove(), save() (+15 more)

### Community 27 - "accounts/[id]/page.tsx"
Cohesion: 0.32
Nodes (4): AccountEditForm(), initialState, ACCOUNT_TYPE_LABELS, AccountType

### Community 28 - "queries/wealth.ts"
Cohesion: 0.21
Nodes (15): AccountPage(), ScopePane(), AccountWithBalance, currentPeriod(), getAccountDetail(), getWealthPane(), inScope(), LedgerEntry (+7 more)

### Community 31 - "transact-form.tsx"
Cohesion: 0.22
Nodes (7): Mode, MODE_LABELS, MODES, todayLocal(), TransactForm(), PickableAccount, EXPENSE_CATEGORIES

## Knowledge Gaps
- **154 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+149 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 208 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `database.types.ts`, `getCurrentMember`, `wealth/page.tsx`, `auth.ts`, `settings/page.tsx`, `members/[id]/page.tsx`, `google-drive.ts`, `planner/page.tsx`, `ui.tsx`, `calendar-sync.ts`, `actions/family.ts`, `queries/wealth.ts`?**
  _High betweenness centrality (0.222) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `getCurrentMember` to `database.types.ts`, `wealth/page.tsx`, `auth.ts`, `settings/page.tsx`, `members/[id]/page.tsx`, `google-drive.ts`, `planner/page.tsx`, `ui.tsx`, `calendar-sync.ts`, `createClient`, `accounts/[id]/page.tsx`, `queries/wealth.ts`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Why does `requireCurrentMember()` connect `createClient` to `database.types.ts`, `getCurrentMember`, `auth.ts`, `settings/page.tsx`, `members/[id]/page.tsx`, `google-drive.ts`, `planner/page.tsx`, `ui.tsx`, `calendar-sync.ts`, `actions/family.ts`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _154 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `database.types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05834464043419267 - nodes in this community are weakly interconnected._
- **Should `getCurrentMember` be split into smaller, more focused modules?**
  _Cohesion score 0.0824524312896406 - nodes in this community are weakly interconnected._
- **Should `wealth/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.14245014245014245 - nodes in this community are weakly interconnected._