# Graph Report - kin  (2026-09-04)

## Corpus Check
- 130 files · ~61,073 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 726 nodes · 2115 edges · 36 communities (27 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 25 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ced39020`
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
- documents.ts
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
- household/page.tsx
- createClient
- lib/wealth.ts
- actions/family.ts
- profile.ts
- queries/wealth.ts
- getValidDriveAccessToken
- getAccounts
- transact-form.tsx
- family-background-album.tsx
- actions/health.ts
- member-status-actions.tsx
- pending-member-actions.tsx

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 153 edges
2. `requireCurrentMember()` - 77 edges
3. `getCurrentMember` - 58 edges
4. `formatDate()` - 27 edges
5. `formatCurrency()` - 26 edges
6. `ActionState` - 24 edges
7. `revalidateWealth()` - 24 edges
8. `syncRowToCalendars()` - 21 edges
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
- `NewMealPage()` --indirect_call--> `addMealPlanAction()`  [INFERRED]
  src/app/(app)/household/meals/new/page.tsx → src/lib/actions/household.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kin Frontend/Backend Technology Stack** — readme_kin_family_os, readme_nextjs_16, readme_react_19, readme_tailwind_v4, readme_supabase [EXTRACTED 1.00]
- **Kin Privacy/Access Control Mechanisms** — readme_rls_policies, readme_managed_child_profiles, readme_supabase_auth_otp [INFERRED 0.85]

## Communities (36 total, 9 thin omitted)

### Community 0 - "database.types.ts"
Cohesion: 0.07
Nodes (35): NewDocForm(), onSubmit(), VISIBILITY, NewEntryForm(), onSubmit(), AvatarCropUpload(), cancel(), save() (+27 more)

### Community 1 - "getCurrentMember"
Cohesion: 0.08
Nodes (34): GET(), GET(), DocFolderPage(), NewDocPage(), NewHealthEntryForm(), NewHealthEntryPage(), DocumentsPane(), FamilyPage() (+26 more)

### Community 2 - "wealth/page.tsx"
Cohesion: 0.15
Nodes (21): AssetsPane(), BillsPane(), EntryRow(), FlowRow(), GoalsPane(), Hero(), HistoryPoint, HistoryStrip() (+13 more)

### Community 3 - "auth.ts"
Cohesion: 0.06
Nodes (52): initialState, TYPES, VISIBILITY, initialState, NewMealPage(), initialState, NewMilestonePage(), initialState (+44 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (36): eslint, eslint-config-next, next, dependencies, next, react, react-dom, @supabase/ssr (+28 more)

### Community 5 - "settings/page.tsx"
Cohesion: 0.14
Nodes (20): CALENDAR_ERROR_MESSAGES, DRIVE_ERROR_MESSAGES, DeleteAccountButton(), DeleteHouseholdButton(), CalendarConnectedPanel(), DriveConnectedPanel(), HouseholdNameForm(), HouseholdPrefsForm() (+12 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 7 - "members/[id]/page.tsx"
Cohesion: 0.13
Nodes (12): MemberDetailPage(), Seg, SEGMENTS, Avatar(), MemberProfileEditor(), save(), ProfileEditForm(), RelationshipEditor() (+4 more)

### Community 8 - "google-drive.ts"
Cohesion: 0.08
Nodes (40): GET(), POST(), SessionRequest, EntriesPane(), GalleryPane(), JournalPage(), MilestonesPane(), Seg (+32 more)

### Community 9 - "planner/page.tsx"
Cohesion: 0.11
Nodes (28): CALENDAR_VIEWS, calendarHref(), CalendarPane(), CalendarView, EventsPane(), MonthView(), PlannerPage(), Seg (+20 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "documents.ts"
Cohesion: 0.20
Nodes (11): DocFileRow(), DownloadLink(), deleteDocFileAction(), getDocFileUrl(), UploadedFile, Ctx, DocSelectionProvider(), deleteSelected() (+3 more)

### Community 12 - "proxy.ts"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

### Community 22 - "calendar-sync.ts"
Cohesion: 0.09
Nodes (43): GET(), ActivityForm(), AddPlannerForm(), EditActivity, EditEvent, EventForm(), initialState, PlannerType (+35 more)

### Community 23 - "household/page.tsx"
Cohesion: 0.26
Nodes (9): BuyPane(), HouseholdPage(), MealsPane(), Seg, SEGMENTS, GenerateGroceryButton(), generateGroceryListAction(), getBuyItems() (+1 more)

### Community 24 - "createClient"
Cohesion: 0.09
Nodes (58): submit(), GET(), DeleteEntryButton(), DELETERS, GoalContributeControl(), LogSpendControl(), PayBillControl(), PendingEntryActions() (+50 more)

### Community 25 - "lib/wealth.ts"
Cohesion: 0.12
Nodes (16): AccountEditForm(), initialState, AssetForm(), initialState, LiabilityForm(), ACCOUNT_TYPE_LABELS, ACCOUNT_TYPES, AccountType (+8 more)

### Community 26 - "actions/family.ts"
Cohesion: 0.15
Nodes (14): FamilyAboutEditor(), emptyFields, FamilyAddress, FamilyAddressList(), remove(), save(), startEdit(), fieldsFromAddress() (+6 more)

### Community 27 - "profile.ts"
Cohesion: 0.22
Nodes (12): AvatarAlbumViewer(), chunk(), displayValue(), FieldGroup, FieldSpec, PROFILE_FIELD_GROUPS, ProfileFieldsEditor(), ProfileFieldsView() (+4 more)

### Community 28 - "queries/wealth.ts"
Cohesion: 0.21
Nodes (15): AccountPage(), ScopePane(), AccountWithBalance, currentPeriod(), getAccountDetail(), getWealthPane(), inScope(), LedgerEntry (+7 more)

### Community 29 - "getValidDriveAccessToken"
Cohesion: 0.26
Nodes (10): DELETE(), GET(), addFamilyBackgroundAction(), deleteFamilyBackgroundAction(), addAvatarToAlbumAction(), deleteAvatarFromAlbumAction(), setActiveAvatarAction(), deleteDriveFile() (+2 more)

### Community 30 - "getAccounts"
Cohesion: 0.24
Nodes (8): TravelPane(), AddGoalForm(), AddGoalPage(), AddHoldingForm(), NewHoldingPage(), TransactPage(), DetailHeader(), getAccounts()

### Community 31 - "transact-form.tsx"
Cohesion: 0.20
Nodes (8): Mode, MODE_LABELS, MODES, todayLocal(), TransactForm(), PickableAccount, EXPENSE_CATEGORIES, INCOME_SOURCES

### Community 32 - "family-background-album.tsx"
Cohesion: 0.28
Nodes (7): FamilyBackgroundAlbum(), AlbumPhotoLike, closeButtonStyle, navButtonStyle, overlayStyle, PhotoAlbumViewer(), setActiveFamilyBackgroundAction()

### Community 33 - "actions/health.ts"
Cohesion: 0.60
Nodes (3): OmronToggle(), GROUPED_TYPES, toggleOmronAction()

### Community 34 - "member-status-actions.tsx"
Cohesion: 0.60
Nodes (4): ReinstateMemberButton(), RemoveMemberButton(), reinstateMemberAction(), removeMemberAction()

### Community 35 - "pending-member-actions.tsx"
Cohesion: 0.60
Nodes (4): PendingMemberActions(), run(), approveMemberAction(), rejectMemberAction()

## Knowledge Gaps
- **151 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+146 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 201 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `database.types.ts`, `getCurrentMember`, `wealth/page.tsx`, `auth.ts`, `settings/page.tsx`, `members/[id]/page.tsx`, `google-drive.ts`, `planner/page.tsx`, `documents.ts`, `calendar-sync.ts`, `household/page.tsx`, `actions/family.ts`, `profile.ts`, `queries/wealth.ts`, `getValidDriveAccessToken`, `family-background-album.tsx`, `actions/health.ts`, `member-status-actions.tsx`, `pending-member-actions.tsx`?**
  _High betweenness centrality (0.215) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `getCurrentMember` to `wealth/page.tsx`, `auth.ts`, `settings/page.tsx`, `members/[id]/page.tsx`, `google-drive.ts`, `planner/page.tsx`, `calendar-sync.ts`, `household/page.tsx`, `createClient`, `lib/wealth.ts`, `queries/wealth.ts`, `getValidDriveAccessToken`, `getAccounts`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Why does `requireCurrentMember()` connect `createClient` to `database.types.ts`, `family-background-album.tsx`, `member-status-actions.tsx`, `actions/health.ts`, `auth.ts`, `settings/page.tsx`, `getCurrentMember`, `google-drive.ts`, `planner/page.tsx`, `documents.ts`, `calendar-sync.ts`, `actions/family.ts`, `profile.ts`, `getValidDriveAccessToken`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _151 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `database.types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07111756168359942 - nodes in this community are weakly interconnected._
- **Should `getCurrentMember` be split into smaller, more focused modules?**
  _Cohesion score 0.08392156862745098 - nodes in this community are weakly interconnected._
- **Should `auth.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05802469135802469 - nodes in this community are weakly interconnected._