# Graph Report - kin  (2026-09-07)

## Corpus Check
- 184 files · ~122,885 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1101 nodes · 3386 edges · 52 communities (46 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 32 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3027c67c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- database.types.ts
- queries/wealth.ts
- wealth/page.tsx
- chat-thread.tsx
- devDependencies
- actions/household.ts
- compilerOptions
- (app)/layout.tsx
- google-drive.ts
- planner/page.tsx
- Kin — Family Operating System
- (app)/family/page.tsx
- @supabase/ssr
- next
- eslint.config.mjs
- package.json
- postcss.config.mjs
- lib/routines.ts
- lib/recipes.ts
- recipe-book.tsx
- household-money.ts
- subscribe-screen.tsx
- calendar-sync.ts
- auth.ts
- lib/wealth.ts
- createClient
- actions/family.ts
- react
- transact-form.tsx
- ui.tsx
- profile-fields.tsx
- members/[id]/page.tsx
- server.ts
- actions/health.ts
- household-price-controls.tsx
- household/page.tsx
- accounts/[id]/page.tsx
- profile.ts
- queries/household.ts
- meal-day.tsx
- wealth-controls.tsx
- icons.tsx
- @playwright/test
- End-to-end tests
- dependencies
- Kin — Family Operating System
- vercel.json
- getCurrentMember
- scripts
- AGENTS.md

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 228 edges
2. `requireCurrentMember()` - 121 edges
3. `react` - 67 edges
4. `getCurrentMember` - 67 edges
5. `Icon()` - 37 edges
6. `ActionState` - 30 edges
7. `syncRowToCalendars()` - 28 edges
8. `formatCurrency()` - 28 edges
9. `formatDate()` - 27 edges
10. `revalidateWealth()` - 25 edges

## Surprising Connections (you probably didn't know these)
- `AssetForm()` --indirect_call--> `addAssetAction()`  [INFERRED]
  kin/src/app/(app)/wealth/assets/new/add-holding-form.tsx → kin/src/lib/actions/wealth.ts
- `LiabilityForm()` --indirect_call--> `addLiabilityAction()`  [INFERRED]
  kin/src/app/(app)/wealth/assets/new/add-holding-form.tsx → kin/src/lib/actions/wealth.ts
- `Next.js Agent Rules Block (AGENTS.md)` --conceptually_related_to--> `Next.js 16 (App Router, TypeScript)`  [INFERRED]
  AGENTS.md → README.md
- `NewHealthEntryForm()` --indirect_call--> `createHealthEntryAction()`  [INFERRED]
  kin/src/app/(app)/family/members/[id]/health/new/new-health-entry-form.tsx → kin/src/lib/actions/health.ts
- `FamilyPage()` --calls--> `getCurrentMember`  [EXTRACTED]
  kin/src/app/(app)/family/page.tsx → kin/src/lib/session.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kin Frontend/Backend Technology Stack** — readme_kin_family_os, readme_nextjs_16, readme_react_19, readme_tailwind_v4, readme_supabase [EXTRACTED 1.00]
- **Kin Privacy/Access Control Mechanisms** — readme_rls_policies, readme_managed_child_profiles, readme_supabase_auth_otp [INFERRED 0.85]

## Communities (52 total, 4 thin omitted)

### Community 0 - "database.types.ts"
Cohesion: 0.06
Nodes (41): NewDocForm(), onSubmit(), VISIBILITY, NewEntryForm(), onSubmit(), AvatarCropUpload(), cancel(), save() (+33 more)

### Community 1 - "queries/wealth.ts"
Cohesion: 0.21
Nodes (15): AccountPage(), AssetsPane(), AccountWithBalance, currentPeriod(), getAccountDetail(), getNetWorth(), getWealthPane(), inScope() (+7 more)

### Community 2 - "wealth/page.tsx"
Cohesion: 0.13
Nodes (21): BillsPane(), EntryRow(), FlowRow(), GoalsPane(), Hero(), HistoryPoint, HistoryStrip(), Meter() (+13 more)

### Community 3 - "chat-thread.tsx"
Cohesion: 0.15
Nodes (20): ChatPage(), dynamic, ChatThread(), clockOf(), dayLabel(), REACTIONS, deleteMessageAction(), editMessageAction() (+12 more)

### Community 4 - "devDependencies"
Cohesion: 0.20
Nodes (10): devDependencies, eslint, eslint-config-next, @playwright/test, tailwindcss, @tailwindcss/postcss, @types/node, @types/react (+2 more)

### Community 5 - "actions/household.ts"
Cohesion: 0.12
Nodes (27): NewMealPage(), BuyGroup, BuyList(), initialState, SOURCE_LABEL, ShoppingDayControl(), addBuyItemAction(), addMealIngredientsToBuyAction() (+19 more)

### Community 6 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 7 - "(app)/layout.tsx"
Cohesion: 0.21
Nodes (10): AppLayout(), SubscribePage(), AssistantFab(), TabBar(), TABS, AccessSource, AccessStatus, HouseholdAccess (+2 more)

### Community 8 - "google-drive.ts"
Cohesion: 0.08
Nodes (46): GET(), DELETE(), GET(), POST(), SessionRequest, EntriesPane(), GalleryPane(), JournalPage() (+38 more)

### Community 9 - "planner/page.tsx"
Cohesion: 0.06
Nodes (64): AgendaRow(), CALENDAR_VIEWS, calendarBase(), calendarHref(), CalendarPane(), CalendarView, concerns(), EmptyCalendar() (+56 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.15
Nodes (13): Next.js Agent Rules Block (AGENTS.md), graphify, Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript) (+5 more)

### Community 11 - "(app)/family/page.tsx"
Cohesion: 0.17
Nodes (12): DocumentsPane(), FamilyPage(), HealthPane(), ProfilePane(), Seg, SEGMENTS, ChipRow(), Segmented() (+4 more)

### Community 12 - "@supabase/ssr"
Cohesion: 0.47
Nodes (4): @supabase/ssr, updateSession(), config, proxy()

### Community 13 - "next"
Cohesion: 0.22
Nodes (4): nextConfig, next, metadata, viewport

### Community 15 - "package.json"
Cohesion: 0.13
Nodes (14): license, name, private, version, eslint, eslint-config-next, react-dom, @supabase/supabase-js (+6 more)

### Community 17 - "lib/routines.ts"
Cohesion: 0.06
Nodes (63): RoutinesPane(), Account, EditRoutine, initialState, Member, REMINDERS, RoutineForm(), Template (+55 more)

### Community 18 - "lib/recipes.ts"
Cohesion: 0.13
Nodes (19): AddMealControl(), RemoveMealButton(), useMealAction(), addMealFromRecipeAction(), removeMealAction(), CategoryView, getRecipeBook(), RecipeView (+11 more)

### Community 19 - "recipe-book.tsx"
Cohesion: 0.16
Nodes (15): IconName, AddIngredientsToBuyButton(), CategoryManager(), EditableRecipe, IngredientChip(), ORIGIN_LABEL, RecipeBook(), RecipeEditor() (+7 more)

### Community 20 - "household-money.ts"
Cohesion: 0.18
Nodes (16): BuyPane(), BY_KEY, normalizeKey(), PRICE_BOOK, pricebookEntry, PriceSource, resolveUnitPrice(), sortForShopping() (+8 more)

### Community 21 - "subscribe-screen.tsx"
Cohesion: 0.31
Nodes (9): initialState, standing(), SubscribeScreen(), perMonth(), pesos(), Plan, PLAN_LIST, PlanId (+1 more)

### Community 22 - "calendar-sync.ts"
Cohesion: 0.06
Nodes (62): @anthropic-ai/sdk, POST(), systemPrompt(), GET(), ActivityForm(), AddPlannerForm(), EditActivity, EditEvent (+54 more)

### Community 23 - "auth.ts"
Cohesion: 0.12
Nodes (19): ForgotPasswordForm(), initialState, CALLBACK_ERROR_MESSAGES, initialState, LoginForm(), initialState, ResetPasswordForm(), initialState (+11 more)

### Community 24 - "lib/wealth.ts"
Cohesion: 0.17
Nodes (11): AssetForm(), initialState, LiabilityForm(), ASSET_KIND_LABELS, ASSET_KINDS, AssetKind, GOAL_CATEGORY, LIABILITY_KIND_LABELS (+3 more)

### Community 25 - "createClient"
Cohesion: 0.05
Nodes (91): NewMilestonePage(), CALENDAR_ERROR_MESSAGES, DRIVE_ERROR_MESSAGES, submit(), GET(), safeNext(), ResetPasswordPage(), ClearCheckedPanel() (+83 more)

### Community 26 - "actions/family.ts"
Cohesion: 0.08
Nodes (27): FamilyForkForm(), FamilyAboutEditor(), emptyFields, FamilyAddress, FamilyAddressList(), remove(), save(), startEdit() (+19 more)

### Community 27 - "react"
Cohesion: 0.18
Nodes (16): react, initialState, TYPES, VISIBILITY, initialState, initialState, AddGoalForm(), initialState (+8 more)

### Community 28 - "transact-form.tsx"
Cohesion: 0.16
Nodes (11): AddGoalPage(), TransactPage(), Mode, MODE_LABELS, MODES, todayLocal(), TransactForm(), PickableAccount (+3 more)

### Community 29 - "ui.tsx"
Cohesion: 0.17
Nodes (8): AddChildForm(), initialState, AssistantConsole(), SUGGESTIONS, Turn, CopyInviteCode(), Blueprint(), addManagedChildAction()

### Community 30 - "profile-fields.tsx"
Cohesion: 0.28
Nodes (7): MembersPage(), displayValue(), FieldGroup, FieldSpec, PROFILE_FIELD_GROUPS, ProfileFieldsView(), formatAge()

### Community 31 - "members/[id]/page.tsx"
Cohesion: 0.21
Nodes (10): DocFolderPage(), MemberDetailPage(), Seg, SEGMENTS, Avatar(), formatDate(), memberToProfileFields(), PROFILE_FIELD_KEYS (+2 more)

### Community 32 - "server.ts"
Cohesion: 0.38
Nodes (6): TodayPage(), initials(), BriefItem, getHubCards(), getTodayBriefing(), HubCard

### Community 33 - "actions/health.ts"
Cohesion: 0.60
Nodes (3): OmronToggle(), GROUPED_TYPES, toggleOmronAction()

### Community 34 - "household-price-controls.tsx"
Cohesion: 0.31
Nodes (12): AddPriceControl(), BuyItemPriceButton(), BuyItemPriceEditor(), PantryControls(), peso(), PriceRowControl(), useHouseholdAction(), removePantryItemAction() (+4 more)

### Community 35 - "household/page.tsx"
Cohesion: 0.18
Nodes (13): DishCard(), MealsPane(), PriceBookSheet(), Seg, SEGMENT_LABEL, SEGMENTS, GenerateGroceryButton(), RecipeRow() (+5 more)

### Community 36 - "accounts/[id]/page.tsx"
Cohesion: 0.28
Nodes (5): AccountEditForm(), initialState, Empty(), ACCOUNT_TYPE_LABELS, AccountType

### Community 37 - "profile.ts"
Cohesion: 0.16
Nodes (14): AvatarAlbumViewer(), MemberProfileEditor(), save(), ProfileEditForm(), save(), ProfileFieldsEditor(), addAvatarToAlbumAction(), AlbumPhoto (+6 more)

### Community 38 - "queries/household.ts"
Cohesion: 0.17
Nodes (14): MealPhotoControl(), onPick(), sectionOrder(), PLATES, RECIPE_PHOTO_BUCKET, recipeRef(), getBuyItems(), getMealsForDay() (+6 more)

### Community 39 - "meal-day.tsx"
Cohesion: 0.52
Nodes (6): AddIngredientRow(), IngredientAmountRow(), useAct(), addMealIngredientAction(), removeMealIngredientAction(), setMealIngredientAction()

### Community 40 - "wealth-controls.tsx"
Cohesion: 0.22
Nodes (7): AddAccountForm(), AddBillForm(), AllocationEditor(), initialState, SetBudgetControl(), SetTargetControl(), ACCOUNT_TYPES

### Community 41 - "icons.tsx"
Cohesion: 0.15
Nodes (15): DeleteButton(), DocFileRow(), DownloadLink(), Icon(), iconPaths, PickOption, deleteDocFileAction(), getDocFileUrl() (+7 more)

### Community 42 - "@playwright/test"
Cohesion: 0.22
Nodes (4): HUBS, THEMES, WIDTHS, @playwright/test

### Community 43 - "End-to-end tests"
Cohesion: 0.29
Nodes (6): Adding to it, End-to-end tests, Running, What is covered, What is not covered, and why, What you need

### Community 44 - "dependencies"
Cohesion: 0.29
Nodes (7): dependencies, @anthropic-ai/sdk, next, react, react-dom, @supabase/ssr, @supabase/supabase-js

### Community 45 - "Kin — Family Operating System"
Cohesion: 0.40
Nodes (4): Kin — Family Operating System, Local setup, Notes on this build, Stack

### Community 48 - "getCurrentMember"
Cohesion: 0.14
Nodes (18): GET(), GET(), NewDocPage(), NewHealthEntryForm(), NewHealthEntryPage(), HouseholdPage(), NewJournalEntryPage(), AddPlannerPage() (+10 more)

### Community 49 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, e2e, e2e:ui, lint, start

## Knowledge Gaps
- **218 isolated node(s):** `HUBS`, `WIDTHS`, `THEMES`, `eslintConfig`, `nextConfig` (+213 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 297 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `database.types.ts`, `queries/wealth.ts`, `wealth/page.tsx`, `chat-thread.tsx`, `actions/household.ts`, `(app)/layout.tsx`, `google-drive.ts`, `planner/page.tsx`, `(app)/family/page.tsx`, `lib/routines.ts`, `lib/recipes.ts`, `recipe-book.tsx`, `household-money.ts`, `calendar-sync.ts`, `auth.ts`, `actions/family.ts`, `ui.tsx`, `profile-fields.tsx`, `members/[id]/page.tsx`, `server.ts`, `actions/health.ts`, `household-price-controls.tsx`, `household/page.tsx`, `profile.ts`, `queries/household.ts`, `meal-day.tsx`, `icons.tsx`, `getCurrentMember`?**
  _High betweenness centrality (0.203) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `database.types.ts`, `chat-thread.tsx`, `actions/household.ts`, `google-drive.ts`, `planner/page.tsx`, `package.json`, `lib/routines.ts`, `lib/recipes.ts`, `recipe-book.tsx`, `subscribe-screen.tsx`, `calendar-sync.ts`, `auth.ts`, `lib/wealth.ts`, `createClient`, `actions/family.ts`, `transact-form.tsx`, `ui.tsx`, `actions/health.ts`, `household-price-controls.tsx`, `household/page.tsx`, `accounts/[id]/page.tsx`, `profile.ts`, `meal-day.tsx`, `wealth-controls.tsx`, `icons.tsx`, `getCurrentMember`?**
  _High betweenness centrality (0.149) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `getCurrentMember` to `queries/wealth.ts`, `wealth/page.tsx`, `chat-thread.tsx`, `(app)/layout.tsx`, `google-drive.ts`, `planner/page.tsx`, `(app)/family/page.tsx`, `calendar-sync.ts`, `auth.ts`, `createClient`, `react`, `transact-form.tsx`, `ui.tsx`, `profile-fields.tsx`, `members/[id]/page.tsx`, `server.ts`, `household/page.tsx`, `accounts/[id]/page.tsx`, `icons.tsx`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **What connects `HUBS`, `WIDTHS`, `THEMES` to the rest of the system?**
  _218 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `database.types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.059322033898305086 - nodes in this community are weakly interconnected._
- **Should `wealth/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.13405797101449277 - nodes in this community are weakly interconnected._
- **Should `chat-thread.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.1455026455026455 - nodes in this community are weakly interconnected._