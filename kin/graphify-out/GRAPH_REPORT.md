# Graph Report - kin  (2026-09-07)

## Corpus Check
- 178 files · ~120,035 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1080 nodes · 3288 edges · 49 communities (41 shown, 6 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 32 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `388d3b3b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- database.types.ts
- getCurrentMember
- wealth/page.tsx
- chat-thread.tsx
- devDependencies
- actions/household.ts
- compilerOptions
- deleteOwnAccountAction
- google-drive.ts
- planner/page.tsx
- Kin — Family Operating System
- lib/wealth.ts
- proxy.ts
- app/layout.tsx
- eslint.config.mjs
- next.config.ts
- postcss.config.mjs
- lib/routines.ts
- lib/recipes.ts
- recipe-book.tsx
- grocery.ts
- subscribe-screen.tsx
- calendar-sync.ts
- auth.ts
- createClient
- settings/page.tsx
- actions/family.ts
- ActionState
- queries/wealth.ts
- ui.tsx
- members/[id]/page.tsx
- actions/health.ts
- wealth-controls.tsx
- queries/household.ts
- household-price-controls.tsx
- household/page.tsx
- icons.tsx
- family-address-list.tsx
- journal/page.tsx
- meal-day.tsx
- money-actions.tsx
- documents.ts
- gallery-grid.tsx
- server.ts
- postHubExpenseAction
- auth/callback/route.ts
- vercel.json

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 228 edges
2. `requireCurrentMember()` - 121 edges
3. `getCurrentMember` - 67 edges
4. `Icon()` - 37 edges
5. `ActionState` - 30 edges
6. `syncRowToCalendars()` - 28 edges
7. `formatCurrency()` - 28 edges
8. `formatDate()` - 27 edges
9. `revalidateWealth()` - 25 edges
10. `ErrorText()` - 22 edges

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

## Communities (49 total, 6 thin omitted)

### Community 0 - "database.types.ts"
Cohesion: 0.07
Nodes (34): NewDocForm(), onSubmit(), VISIBILITY, NewDocPage(), NewEntryForm(), onSubmit(), AvatarCropUpload(), cancel() (+26 more)

### Community 1 - "getCurrentMember"
Cohesion: 0.13
Nodes (16): GET(), GET(), DocFolderPage(), NewHealthEntryForm(), NewHealthEntryPage(), FamilyPage(), HouseholdPage(), AddPlannerForm() (+8 more)

### Community 2 - "wealth/page.tsx"
Cohesion: 0.14
Nodes (20): AccountPage(), AssetsPane(), BillsPane(), EntryRow(), FlowRow(), GoalsPane(), Hero(), HistoryPoint (+12 more)

### Community 3 - "chat-thread.tsx"
Cohesion: 0.11
Nodes (25): ChatPage(), dynamic, TodayPage(), ChatThread(), clockOf(), dayLabel(), REACTIONS, deleteMessageAction() (+17 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (39): @anthropic-ai/sdk, eslint, eslint-config-next, next, dependencies, @anthropic-ai/sdk, next, react (+31 more)

### Community 5 - "actions/household.ts"
Cohesion: 0.16
Nodes (21): BuyGroup, BuyList(), EditItemRow(), save(), initialState, SOURCE_LABEL, GenerateGroceryButton(), ShoppingDayControl() (+13 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 8 - "google-drive.ts"
Cohesion: 0.22
Nodes (21): DELETE(), GET(), POST(), SessionRequest, deleteJournalMediaAction(), UploadedFile, createFolder(), createResumableUploadSession() (+13 more)

### Community 9 - "planner/page.tsx"
Cohesion: 0.06
Nodes (59): AgendaRow(), CALENDAR_VIEWS, calendarBase(), calendarHref(), CalendarPane(), CalendarView, concerns(), EmptyCalendar() (+51 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "lib/wealth.ts"
Cohesion: 0.12
Nodes (16): AccountEditForm(), initialState, AssetForm(), initialState, LiabilityForm(), Tables, ACCOUNT_TYPE_LABELS, AccountType (+8 more)

### Community 12 - "proxy.ts"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

### Community 17 - "lib/routines.ts"
Cohesion: 0.05
Nodes (77): BuyPane(), PriceBookSheet(), RoutinesPane(), RoutinePage(), Account, EditRoutine, initialState, Member (+69 more)

### Community 18 - "lib/recipes.ts"
Cohesion: 0.15
Nodes (16): MealsPane(), IconName, CategoryView, getRecipeBook(), getRecipeCategories(), RecipeView, guessCategories(), Recipe (+8 more)

### Community 19 - "recipe-book.tsx"
Cohesion: 0.16
Nodes (17): DishCard(), AddIngredientsToBuyButton(), CategoryManager(), EditableRecipe, IngredientChip(), ORIGIN_LABEL, RecipeBook(), RecipeEditor() (+9 more)

### Community 20 - "grocery.ts"
Cohesion: 0.18
Nodes (10): MARKET_SECTIONS, MarketSection, SECTION_KEYWORDS, SECTION_PATTERNS, Unit, UNITS, BY_KEY, PRICE_BOOK (+2 more)

### Community 21 - "subscribe-screen.tsx"
Cohesion: 0.17
Nodes (15): SubscribePage(), initialState, standing(), SubscribeScreen(), AccessSource, AccessStatus, HouseholdAccess, readAccess() (+7 more)

### Community 22 - "calendar-sync.ts"
Cohesion: 0.05
Nodes (68): POST(), systemPrompt(), GET(), GET(), NewMealPage(), ActivityForm(), EditActivity, EditEvent (+60 more)

### Community 23 - "auth.ts"
Cohesion: 0.13
Nodes (18): ForgotPasswordForm(), initialState, CALLBACK_ERROR_MESSAGES, initialState, LoginForm(), ResetPasswordPage(), initialState, ResetPasswordForm() (+10 more)

### Community 24 - "createClient"
Cohesion: 0.18
Nodes (35): submit(), disconnectDriveAction(), removeBuyItemAction(), removeRecipePhotoAction(), setRecipePhotoAction(), addAccountAction(), addAssetAction(), addBillAction() (+27 more)

### Community 25 - "settings/page.tsx"
Cohesion: 0.12
Nodes (27): CALENDAR_ERROR_MESSAGES, DRIVE_ERROR_MESSAGES, SettingsPage(), CalendarConnectedPanel(), DriveConnectedPanel(), HouseholdNameForm(), HouseholdPrefsForm(), InviteCodeCard() (+19 more)

### Community 26 - "actions/family.ts"
Cohesion: 0.11
Nodes (23): FamilyForkForm(), DeleteHouseholdButton(), FamilyAboutEditor(), save(), PendingMemberActions(), run(), RelationshipEditor(), addChildWithLoginAction() (+15 more)

### Community 27 - "ActionState"
Cohesion: 0.14
Nodes (16): initialState, TYPES, VISIBILITY, initialState, initialState, NewMilestonePage(), initialState, initialState (+8 more)

### Community 28 - "queries/wealth.ts"
Cohesion: 0.20
Nodes (16): AddGoalForm(), AddGoalPage(), AccountWithBalance, currentPeriod(), getAccountDetail(), getAccounts(), getNetWorth(), getWealthPane() (+8 more)

### Community 29 - "ui.tsx"
Cohesion: 0.17
Nodes (8): AddChildForm(), initialState, AssistantConsole(), SUGGESTIONS, Turn, CopyInviteCode(), Blueprint(), addManagedChildAction()

### Community 30 - "members/[id]/page.tsx"
Cohesion: 0.05
Nodes (59): MemberDetailPage(), Seg, SEGMENTS, DocumentsPane(), HealthPane(), ProfilePane(), Seg, SEGMENTS (+51 more)

### Community 31 - "actions/health.ts"
Cohesion: 0.47
Nodes (4): OmronToggle(), createHealthEntryAction(), GROUPED_TYPES, toggleOmronAction()

### Community 32 - "wealth-controls.tsx"
Cohesion: 0.11
Nodes (15): Mode, MODE_LABELS, MODES, todayLocal(), TransactForm(), PickableAccount, AddAccountForm(), AddBillForm() (+7 more)

### Community 33 - "queries/household.ts"
Cohesion: 0.16
Nodes (16): MealPhotoControl(), onPick(), saveRecipeIngredients(), sectionOrder(), PLATES, RECIPE_PHOTO_BUCKET, recipeRef(), normalizeKey() (+8 more)

### Community 34 - "household-price-controls.tsx"
Cohesion: 0.31
Nodes (12): AddPriceControl(), BuyItemPriceButton(), BuyItemPriceEditor(), PantryControls(), peso(), PriceRowControl(), useHouseholdAction(), removePantryItemAction() (+4 more)

### Community 35 - "household/page.tsx"
Cohesion: 0.23
Nodes (12): Seg, SEGMENT_LABEL, SEGMENTS, AddMealControl(), RemoveMealButton(), useMealAction(), Collapsible(), SheetButton() (+4 more)

### Community 36 - "icons.tsx"
Cohesion: 0.20
Nodes (9): AppLayout(), VerifyForm(), AssistantFab(), Icon(), iconPaths, TabBar(), TABS, resendConfirmation() (+1 more)

### Community 37 - "family-address-list.tsx"
Cohesion: 0.18
Nodes (9): emptyFields, FamilyAddress, FamilyAddressList(), remove(), startEdit(), fieldsFromAddress(), mapsUrl(), FamilyAddressFields (+1 more)

### Community 38 - "journal/page.tsx"
Cohesion: 0.21
Nodes (11): EntriesPane(), GalleryPane(), JournalPage(), MilestonesPane(), Seg, SEGMENTS, HubHeader(), Empty() (+3 more)

### Community 39 - "meal-day.tsx"
Cohesion: 0.52
Nodes (6): AddIngredientRow(), IngredientAmountRow(), useAct(), addMealIngredientAction(), removeMealIngredientAction(), setMealIngredientAction()

### Community 40 - "money-actions.tsx"
Cohesion: 0.32
Nodes (11): AccountPrivacyToggle(), DeleteEntryButton(), DELETERS, GoalContributeControl(), LogSpendControl(), PayBillControl(), PendingEntryActions(), RemoveButton() (+3 more)

### Community 41 - "documents.ts"
Cohesion: 0.20
Nodes (11): DocFileRow(), DownloadLink(), deleteDocFileAction(), getDocFileUrl(), UploadedFile, Ctx, DocSelectionProvider(), deleteSelected() (+3 more)

### Community 42 - "gallery-grid.tsx"
Cohesion: 0.20
Nodes (6): DeleteButton(), Failure, GalleryGrid(), deleteSelected(), MediaItem, GalleryTile()

### Community 43 - "server.ts"
Cohesion: 0.47
Nodes (4): migrateOneFile(), MigrateResult, Database, uploadFileToDrive()

### Community 44 - "postHubExpenseAction"
Cohesion: 0.83
Nodes (4): ClearCheckedPanel(), finish(), clearCheckedAction(), postHubExpenseAction()

### Community 46 - "vercel.json"
Cohesion: 0.50
Nodes (3): sin1, regions, $schema

## Knowledge Gaps
- **201 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+196 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 272 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `database.types.ts`, `getCurrentMember`, `wealth/page.tsx`, `chat-thread.tsx`, `actions/household.ts`, `deleteOwnAccountAction`, `google-drive.ts`, `planner/page.tsx`, `lib/routines.ts`, `lib/recipes.ts`, `recipe-book.tsx`, `subscribe-screen.tsx`, `calendar-sync.ts`, `auth.ts`, `settings/page.tsx`, `actions/family.ts`, `ActionState`, `queries/wealth.ts`, `ui.tsx`, `members/[id]/page.tsx`, `actions/health.ts`, `queries/household.ts`, `household-price-controls.tsx`, `household/page.tsx`, `icons.tsx`, `family-address-list.tsx`, `journal/page.tsx`, `meal-day.tsx`, `documents.ts`, `server.ts`, `postHubExpenseAction`, `auth/callback/route.ts`?**
  _High betweenness centrality (0.231) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `getCurrentMember` to `database.types.ts`, `wealth/page.tsx`, `chat-thread.tsx`, `google-drive.ts`, `planner/page.tsx`, `lib/wealth.ts`, `lib/routines.ts`, `subscribe-screen.tsx`, `calendar-sync.ts`, `auth.ts`, `createClient`, `settings/page.tsx`, `queries/wealth.ts`, `ui.tsx`, `members/[id]/page.tsx`, `household/page.tsx`, `icons.tsx`, `journal/page.tsx`, `documents.ts`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Why does `requireCurrentMember()` connect `createClient` to `database.types.ts`, `getCurrentMember`, `chat-thread.tsx`, `actions/household.ts`, `deleteOwnAccountAction`, `google-drive.ts`, `lib/routines.ts`, `recipe-book.tsx`, `subscribe-screen.tsx`, `calendar-sync.ts`, `settings/page.tsx`, `actions/family.ts`, `ActionState`, `members/[id]/page.tsx`, `actions/health.ts`, `household-price-controls.tsx`, `household/page.tsx`, `family-address-list.tsx`, `meal-day.tsx`, `documents.ts`, `server.ts`, `postHubExpenseAction`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _201 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `database.types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07013574660633484 - nodes in this community are weakly interconnected._
- **Should `getCurrentMember` be split into smaller, more focused modules?**
  _Cohesion score 0.13405797101449277 - nodes in this community are weakly interconnected._
- **Should `wealth/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.1383399209486166 - nodes in this community are weakly interconnected._