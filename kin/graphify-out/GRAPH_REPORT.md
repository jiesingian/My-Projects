# Graph Report - kin  (2026-09-04)

## Corpus Check
- 134 files · ~67,047 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 760 nodes · 2211 edges · 30 communities (21 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 25 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `21cab792`
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
- profile.ts
- google-drive.ts
- planner/page.tsx
- Kin — Family Operating System
- members/[id]/page.tsx
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
- money-actions.tsx
- createClient
- lib/wealth.ts
- actions/family.ts
- accounts/[id]/page.tsx
- queries/wealth.ts
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
- `FamilyPage()` --calls--> `getCurrentMember`  [EXTRACTED]
  src/app/(app)/family/page.tsx → src/lib/session.ts
- `NewMealPage()` --indirect_call--> `addMealPlanAction()`  [INFERRED]
  src/app/(app)/household/meals/new/page.tsx → src/lib/actions/household.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kin Frontend/Backend Technology Stack** — readme_kin_family_os, readme_nextjs_16, readme_react_19, readme_tailwind_v4, readme_supabase [EXTRACTED 1.00]
- **Kin Privacy/Access Control Mechanisms** — readme_rls_policies, readme_managed_child_profiles, readme_supabase_auth_otp [INFERRED 0.85]

## Communities (30 total, 9 thin omitted)

### Community 0 - "database.types.ts"
Cohesion: 0.07
Nodes (35): NewDocForm(), onSubmit(), VISIBILITY, NewEntryForm(), onSubmit(), AvatarCropUpload(), cancel(), save() (+27 more)

### Community 1 - "getCurrentMember"
Cohesion: 0.13
Nodes (19): GET(), GET(), NewDocPage(), NewHealthEntryPage(), DocumentsPane(), NewJournalEntryPage(), AppLayout(), AddPlannerPage() (+11 more)

### Community 2 - "wealth/page.tsx"
Cohesion: 0.12
Nodes (25): DocFolderPage(), TravelPane(), AddGoalForm(), AssetsPane(), BillsPane(), EntryRow(), FlowRow(), GoalsPane() (+17 more)

### Community 3 - "auth.ts"
Cohesion: 0.07
Nodes (41): initialState, NewHealthEntryForm(), TYPES, VISIBILITY, OmronToggle(), initialState, NewMealPage(), initialState (+33 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (38): @anthropic-ai/sdk, eslint, eslint-config-next, next, dependencies, @anthropic-ai/sdk, next, react (+30 more)

### Community 5 - "buy-list.tsx"
Cohesion: 0.07
Nodes (42): POST(), systemPrompt(), BuyPane(), HouseholdPage(), MealsPane(), Seg, SEGMENTS, BuyGroup (+34 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 7 - "profile.ts"
Cohesion: 0.11
Nodes (22): AvatarAlbumViewer(), DeleteAccountButton(), MemberProfileEditor(), save(), ProfileEditForm(), save(), chunk(), displayValue() (+14 more)

### Community 8 - "google-drive.ts"
Cohesion: 0.09
Nodes (43): GET(), DELETE(), GET(), POST(), SessionRequest, EntriesPane(), GalleryPane(), JournalPage() (+35 more)

### Community 9 - "planner/page.tsx"
Cohesion: 0.12
Nodes (26): CALENDAR_VIEWS, calendarHref(), CalendarPane(), CalendarView, EventsPane(), MonthView(), PlannerPage(), Seg (+18 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "members/[id]/page.tsx"
Cohesion: 0.06
Nodes (41): MemberDetailPage(), Seg, SEGMENTS, CALENDAR_ERROR_MESSAGES, DRIVE_ERROR_MESSAGES, SettingsPage(), TodayPage(), MembersPage() (+33 more)

### Community 12 - "proxy.ts"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

### Community 22 - "calendar-sync.ts"
Cohesion: 0.09
Nodes (42): GET(), ActivityForm(), AddPlannerForm(), EditActivity, EditEvent, EventForm(), initialState, PlannerType (+34 more)

### Community 23 - "money-actions.tsx"
Cohesion: 0.33
Nodes (10): DeleteEntryButton(), DELETERS, GoalContributeControl(), LogSpendControl(), PayBillControl(), PendingEntryActions(), RemoveButton(), useMoneyAction() (+2 more)

### Community 24 - "createClient"
Cohesion: 0.09
Nodes (58): submit(), GET(), CalendarConnectedPanel(), DriveConnectedPanel(), HouseholdNameForm(), HouseholdPrefsForm(), InviteCodeCard(), MigratePhotosButton() (+50 more)

### Community 25 - "lib/wealth.ts"
Cohesion: 0.17
Nodes (11): AddHoldingForm(), AssetForm(), initialState, LiabilityForm(), ASSET_KIND_LABELS, ASSET_KINDS, GOAL_CATEGORY, LIABILITY_KIND_LABELS (+3 more)

### Community 26 - "actions/family.ts"
Cohesion: 0.06
Nodes (44): FamilyPage(), HealthPane(), ProfilePane(), Seg, SEGMENTS, DeleteHouseholdButton(), FamilyAboutEditor(), emptyFields (+36 more)

### Community 27 - "accounts/[id]/page.tsx"
Cohesion: 0.24
Nodes (6): AccountEditForm(), initialState, AccountPage(), ACCOUNT_TYPE_LABELS, ACCOUNT_TYPES, AccountType

### Community 28 - "queries/wealth.ts"
Cohesion: 0.22
Nodes (15): ScopePane(), AccountWithBalance, currentPeriod(), getAccountDetail(), getAccounts(), getNetWorth(), getWealthPane(), inScope() (+7 more)

### Community 31 - "transact-form.tsx"
Cohesion: 0.20
Nodes (8): Mode, MODE_LABELS, MODES, todayLocal(), TransactForm(), PickableAccount, EXPENSE_CATEGORIES, INCOME_SOURCES

## Knowledge Gaps
- **158 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+153 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 212 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `database.types.ts`, `getCurrentMember`, `wealth/page.tsx`, `auth.ts`, `buy-list.tsx`, `profile.ts`, `google-drive.ts`, `planner/page.tsx`, `members/[id]/page.tsx`, `calendar-sync.ts`, `actions/family.ts`, `queries/wealth.ts`?**
  _High betweenness centrality (0.224) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `getCurrentMember` to `wealth/page.tsx`, `auth.ts`, `buy-list.tsx`, `google-drive.ts`, `planner/page.tsx`, `members/[id]/page.tsx`, `calendar-sync.ts`, `createClient`, `actions/family.ts`, `accounts/[id]/page.tsx`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Why does `requireCurrentMember()` connect `createClient` to `database.types.ts`, `getCurrentMember`, `auth.ts`, `buy-list.tsx`, `profile.ts`, `google-drive.ts`, `planner/page.tsx`, `members/[id]/page.tsx`, `calendar-sync.ts`, `actions/family.ts`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _158 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `database.types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07088989441930618 - nodes in this community are weakly interconnected._
- **Should `getCurrentMember` be split into smaller, more focused modules?**
  _Cohesion score 0.12878787878787878 - nodes in this community are weakly interconnected._
- **Should `wealth/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.12433862433862433 - nodes in this community are weakly interconnected._