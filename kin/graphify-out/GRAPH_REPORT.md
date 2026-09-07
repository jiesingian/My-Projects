# Graph Report - kin  (2026-09-07)

## Corpus Check
- 186 files · ~124,240 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1096 nodes · 3383 edges · 52 communities (46 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 32 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2d0897a2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- profile.ts
- queries/wealth.ts
- wealth/page.tsx
- chat-thread.tsx
- devDependencies
- actions/household.ts
- compilerOptions
- createClient
- getCurrentMember
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
- settings/page.tsx
- actions/family.ts
- ActionState
- transact-form.tsx
- ui.tsx
- member-profile-editor.tsx
- members/[id]/page.tsx
- (app)/layout.tsx
- actions/health.ts
- household-price-controls.tsx
- household/page.tsx
- wealth-controls.tsx
- MemberProfileEditor
- meal-controls.tsx
- meal-day.tsx
- today/page.tsx
- react
- @playwright/test
- End-to-end tests
- dependencies
- login-form.tsx
- vercel.json
- scripts
- family-fork-form.tsx
- getAccounts

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

## Communities (52 total, 4 thin omitted)

### Community 0 - "profile.ts"
Cohesion: 0.05
Nodes (51): NewDocForm(), onSubmit(), VISIBILITY, NewEntryForm(), onSubmit(), AvatarCropUpload(), cancel(), save() (+43 more)

### Community 1 - "queries/wealth.ts"
Cohesion: 0.29
Nodes (12): AccountWithBalance, currentPeriod(), getAccountDetail(), getNetWorth(), getWealthPane(), inScope(), loadAccounts(), RawLedgerRow (+4 more)

### Community 2 - "wealth/page.tsx"
Cohesion: 0.11
Nodes (25): AccountPage(), AssetsPane(), BillsPane(), EntryRow(), FlowRow(), GoalsPane(), Hero(), HistoryPoint (+17 more)

### Community 3 - "chat-thread.tsx"
Cohesion: 0.13
Nodes (22): ChatPage(), dynamic, ChatThread(), clockOf(), dayLabel(), REACTIONS, deleteMessageAction(), editMessageAction() (+14 more)

### Community 4 - "devDependencies"
Cohesion: 0.20
Nodes (10): devDependencies, eslint, eslint-config-next, @playwright/test, tailwindcss, @tailwindcss/postcss, @types/node, @types/react (+2 more)

### Community 5 - "actions/household.ts"
Cohesion: 0.15
Nodes (23): BuyGroup, BuyList(), initialState, SOURCE_LABEL, GenerateGroceryButton(), ShoppingDayControl(), addBuyItemAction(), addMealIngredientsToBuyAction() (+15 more)

### Community 6 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 7 - "createClient"
Cohesion: 0.09
Nodes (64): submit(), GET(), safeNext(), ClearCheckedPanel(), finish(), EditItemRow(), save(), AccountPrivacyToggle() (+56 more)

### Community 8 - "getCurrentMember"
Cohesion: 0.06
Nodes (60): @supabase/supabase-js, POST(), systemPrompt(), GET(), GET(), GET(), GET(), DELETE() (+52 more)

### Community 9 - "planner/page.tsx"
Cohesion: 0.06
Nodes (62): AgendaRow(), CALENDAR_VIEWS, calendarBase(), calendarHref(), CalendarPane(), CalendarView, concerns(), EmptyCalendar() (+54 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "(app)/family/page.tsx"
Cohesion: 0.13
Nodes (19): DocumentsPane(), FamilyPage(), HealthPane(), ProfilePane(), Seg, SEGMENTS, MembersPage(), AddChildForm() (+11 more)

### Community 12 - "@supabase/ssr"
Cohesion: 0.47
Nodes (4): @supabase/ssr, updateSession(), config, proxy()

### Community 13 - "next"
Cohesion: 0.22
Nodes (4): nextConfig, next, metadata, viewport

### Community 15 - "package.json"
Cohesion: 0.13
Nodes (14): license, name, private, version, @anthropic-ai/sdk, eslint, eslint-config-next, react-dom (+6 more)

### Community 17 - "lib/routines.ts"
Cohesion: 0.06
Nodes (62): RoutinesPane(), Account, EditRoutine, initialState, Member, REMINDERS, RoutineForm(), Template (+54 more)

### Community 18 - "lib/recipes.ts"
Cohesion: 0.10
Nodes (26): IconName, MealPhotoControl(), onPick(), sectionOrder(), PLATES, RECIPE_PHOTO_BUCKET, recipeRef(), getBuyItems() (+18 more)

### Community 19 - "recipe-book.tsx"
Cohesion: 0.16
Nodes (15): DishCard(), AddIngredientsToBuyButton(), EditableRecipe, IngredientChip(), ORIGIN_LABEL, RecipeBook(), RecipeEditor(), RecipeRow() (+7 more)

### Community 20 - "household-money.ts"
Cohesion: 0.19
Nodes (15): MARKET_SECTIONS, BY_KEY, normalizeKey(), PRICE_BOOK, PRICE_BOOK_SET_ON, pricebookEntry, PriceSource, resolveUnitPrice() (+7 more)

### Community 21 - "subscribe-screen.tsx"
Cohesion: 0.27
Nodes (10): initialState, standing(), SubscribeScreen(), redeemCodeForHouseholdAction(), perMonth(), pesos(), Plan, PLAN_LIST (+2 more)

### Community 22 - "calendar-sync.ts"
Cohesion: 0.06
Nodes (61): NewMealPage(), ActivityForm(), AddPlannerForm(), EditActivity, EditEvent, EditTrip, EventForm(), initialState (+53 more)

### Community 23 - "auth.ts"
Cohesion: 0.14
Nodes (16): ForgotPasswordForm(), initialState, ResetPasswordPage(), initialState, ResetPasswordForm(), initialState, SignupPage(), VerifyForm() (+8 more)

### Community 24 - "lib/wealth.ts"
Cohesion: 0.16
Nodes (12): AssetForm(), initialState, LiabilityForm(), AccountType, ASSET_KIND_LABELS, ASSET_KINDS, AssetKind, GOAL_CATEGORY (+4 more)

### Community 25 - "settings/page.tsx"
Cohesion: 0.13
Nodes (25): CALENDAR_ERROR_MESSAGES, DRIVE_ERROR_MESSAGES, DeleteAccountButton(), CalendarConnectedPanel(), DriveConnectedPanel(), HouseholdNameForm(), HouseholdPrefsForm(), InviteCodeCard() (+17 more)

### Community 26 - "actions/family.ts"
Cohesion: 0.10
Nodes (23): DeleteHouseholdButton(), FamilyAboutEditor(), emptyFields, FamilyAddress, FamilyAddressList(), remove(), save(), startEdit() (+15 more)

### Community 27 - "ActionState"
Cohesion: 0.14
Nodes (16): initialState, TYPES, VISIBILITY, initialState, initialState, NewMilestonePage(), initialState, initialState (+8 more)

### Community 28 - "transact-form.tsx"
Cohesion: 0.20
Nodes (8): Mode, MODE_LABELS, MODES, todayLocal(), TransactForm(), PickableAccount, EXPENSE_CATEGORIES, INCOME_SOURCES

### Community 29 - "ui.tsx"
Cohesion: 0.14
Nodes (12): MilestonesPane(), Seg, SEGMENTS, AccountEditForm(), AssistantConsole(), SUGGESTIONS, Turn, CopyInviteCode() (+4 more)

### Community 30 - "member-profile-editor.tsx"
Cohesion: 0.18
Nodes (10): AvatarAlbumViewer(), Avatar(), ProfileEditForm(), displayValue(), FieldGroup, FieldSpec, PROFILE_FIELD_GROUPS, ProfileFieldsEditor() (+2 more)

### Community 31 - "members/[id]/page.tsx"
Cohesion: 0.22
Nodes (11): DocFolderPage(), MemberDetailPage(), Seg, SEGMENTS, EntriesPane(), GalleryPane(), DetailHeader(), Segmented() (+3 more)

### Community 32 - "(app)/layout.tsx"
Cohesion: 0.21
Nodes (10): AppLayout(), SubscribePage(), AssistantFab(), TabBar(), TABS, AccessSource, AccessStatus, HouseholdAccess (+2 more)

### Community 33 - "actions/health.ts"
Cohesion: 0.60
Nodes (3): OmronToggle(), GROUPED_TYPES, toggleOmronAction()

### Community 34 - "household-price-controls.tsx"
Cohesion: 0.31
Nodes (12): AddPriceControl(), BuyItemPriceButton(), BuyItemPriceEditor(), PantryControls(), peso(), PriceRowControl(), useHouseholdAction(), removePantryItemAction() (+4 more)

### Community 35 - "household/page.tsx"
Cohesion: 0.23
Nodes (12): BuyPane(), MealsPane(), PriceBookSheet(), Seg, SEGMENT_LABEL, SEGMENTS, Collapsible(), SheetButton() (+4 more)

### Community 36 - "wealth-controls.tsx"
Cohesion: 0.20
Nodes (8): AddAccountForm(), AddBillForm(), AllocationEditor(), initialState, SetBudgetControl(), SetTargetControl(), ACCOUNT_TYPE_LABELS, ACCOUNT_TYPES

### Community 38 - "meal-controls.tsx"
Cohesion: 0.39
Nodes (7): AddMealControl(), RemoveMealButton(), useMealAction(), addMealFromRecipeAction(), removeMealAction(), MEAL_SLOTS, RECIPES

### Community 39 - "meal-day.tsx"
Cohesion: 0.46
Nodes (7): AddIngredientRow(), IngredientAmountRow(), useAct(), addMealIngredientAction(), removeMealIngredientAction(), setMealIngredientAction(), toggleIngredientAtHomeAction()

### Community 40 - "today/page.tsx"
Cohesion: 0.53
Nodes (5): SettingsPage(), TodayPage(), initials(), getHubCards(), getTodayBriefing()

### Community 41 - "react"
Cohesion: 0.15
Nodes (15): react, DeleteButton(), DocFileRow(), DownloadLink(), Icon(), iconPaths, PickOption, deleteDocFileAction() (+7 more)

### Community 42 - "@playwright/test"
Cohesion: 0.17
Nodes (4): HUBS, THEMES, WIDTHS, @playwright/test

### Community 43 - "End-to-end tests"
Cohesion: 0.29
Nodes (6): Adding to it, End-to-end tests, Running, What is covered, What is not covered, and why, What you need

### Community 44 - "dependencies"
Cohesion: 0.29
Nodes (7): dependencies, @anthropic-ai/sdk, next, react, react-dom, @supabase/ssr, @supabase/supabase-js

### Community 45 - "login-form.tsx"
Cohesion: 0.38
Nodes (4): CALLBACK_ERROR_MESSAGES, initialState, LoginForm(), signIn()

### Community 49 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, e2e, e2e:ui, lint, start

### Community 50 - "family-fork-form.tsx"
Cohesion: 0.43
Nodes (4): FamilyForkForm(), initialState, createFamilyAction(), joinFamilyAction()

### Community 51 - "getAccounts"
Cohesion: 0.47
Nodes (4): AddGoalForm(), AddGoalPage(), TransactPage(), getAccounts()

## Knowledge Gaps
- **213 isolated node(s):** `HUBS`, `WIDTHS`, `THEMES`, `eslintConfig`, `nextConfig` (+208 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 293 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `profile.ts`, `queries/wealth.ts`, `wealth/page.tsx`, `chat-thread.tsx`, `actions/household.ts`, `getCurrentMember`, `planner/page.tsx`, `(app)/family/page.tsx`, `lib/routines.ts`, `lib/recipes.ts`, `recipe-book.tsx`, `household-money.ts`, `subscribe-screen.tsx`, `calendar-sync.ts`, `auth.ts`, `settings/page.tsx`, `actions/family.ts`, `ActionState`, `ui.tsx`, `members/[id]/page.tsx`, `(app)/layout.tsx`, `actions/health.ts`, `household-price-controls.tsx`, `household/page.tsx`, `meal-controls.tsx`, `meal-day.tsx`, `today/page.tsx`, `react`, `login-form.tsx`, `family-fork-form.tsx`?**
  _High betweenness centrality (0.231) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `profile.ts`, `chat-thread.tsx`, `actions/household.ts`, `createClient`, `getCurrentMember`, `planner/page.tsx`, `(app)/family/page.tsx`, `package.json`, `lib/routines.ts`, `recipe-book.tsx`, `subscribe-screen.tsx`, `calendar-sync.ts`, `auth.ts`, `lib/wealth.ts`, `settings/page.tsx`, `actions/family.ts`, `ActionState`, `transact-form.tsx`, `ui.tsx`, `member-profile-editor.tsx`, `actions/health.ts`, `household-price-controls.tsx`, `household/page.tsx`, `wealth-controls.tsx`, `meal-controls.tsx`, `meal-day.tsx`, `login-form.tsx`, `family-fork-form.tsx`?**
  _High betweenness centrality (0.167) - this node is a cross-community bridge._
- **Why does `requireCurrentMember()` connect `createClient` to `profile.ts`, `actions/health.ts`, `household-price-controls.tsx`, `chat-thread.tsx`, `actions/household.ts`, `meal-controls.tsx`, `meal-day.tsx`, `getCurrentMember`, `react`, `(app)/family/page.tsx`, `lib/routines.ts`, `recipe-book.tsx`, `subscribe-screen.tsx`, `calendar-sync.ts`, `settings/page.tsx`, `actions/family.ts`, `ActionState`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **What connects `HUBS`, `WIDTHS`, `THEMES` to the rest of the system?**
  _213 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `profile.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05017543859649123 - nodes in this community are weakly interconnected._
- **Should `wealth/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Should `chat-thread.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.12903225806451613 - nodes in this community are weakly interconnected._