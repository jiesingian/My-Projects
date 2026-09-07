# Graph Report - kin  (2026-09-07)

## Corpus Check
- 188 files · ~126,112 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1102 nodes · 3425 edges · 52 communities (47 shown, 3 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 32 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1a5f326b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- actions/journal.ts
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
- familyDay
- transact-form.tsx
- ui.tsx
- profile.ts
- formatDate
- react
- tools.ts
- household-price-controls.tsx
- household/page.tsx
- members/[id]/page.tsx
- FamilyBackgroundCropUpload
- family-background-album.tsx
- meal-day.tsx
- format.ts
- documents.ts
- @playwright/test
- End-to-end tests
- dependencies
- edits.spec.ts
- vercel.json
- member-status-actions.tsx
- scripts
- hub-header.tsx

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
- `NewMealPage()` --indirect_call--> `addMealPlanAction()`  [INFERRED]
  src/app/(app)/household/meals/new/page.tsx → src/lib/actions/household.ts
- `AddGoalForm()` --indirect_call--> `createGoalAction()`  [INFERRED]
  src/app/(app)/wealth/add/add-goal-form.tsx → src/lib/actions/wealth.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kin Frontend/Backend Technology Stack** — readme_kin_family_os, readme_nextjs_16, readme_react_19, readme_tailwind_v4, readme_supabase [EXTRACTED 1.00]
- **Kin Privacy/Access Control Mechanisms** — readme_rls_policies, readme_managed_child_profiles, readme_supabase_auth_otp [INFERRED 0.85]

## Communities (52 total, 3 thin omitted)

### Community 0 - "actions/journal.ts"
Cohesion: 0.14
Nodes (20): NewDocForm(), onSubmit(), VISIBILITY, NewEntryForm(), onSubmit(), AvatarCropUpload(), cancel(), save() (+12 more)

### Community 1 - "queries/wealth.ts"
Cohesion: 0.29
Nodes (12): AccountWithBalance, currentPeriod(), getAccountDetail(), getNetWorth(), getWealthPane(), inScope(), loadAccounts(), RawLedgerRow (+4 more)

### Community 2 - "wealth/page.tsx"
Cohesion: 0.11
Nodes (25): AccountPage(), AssetsPane(), BillsPane(), EntryRow(), FlowRow(), GoalsPane(), Hero(), HistoryPoint (+17 more)

### Community 3 - "chat-thread.tsx"
Cohesion: 0.12
Nodes (23): ChatPage(), dynamic, AppLayout(), AssistantFab(), ChatThread(), clockOf(), dayLabel(), REACTIONS (+15 more)

### Community 4 - "devDependencies"
Cohesion: 0.20
Nodes (10): devDependencies, eslint, eslint-config-next, @playwright/test, tailwindcss, @tailwindcss/postcss, @types/node, @types/react (+2 more)

### Community 5 - "actions/household.ts"
Cohesion: 0.12
Nodes (29): NewMealPage(), BuyGroup, BuyList(), initialState, SOURCE_LABEL, GenerateGroceryButton(), ShoppingDayControl(), addBuyItemAction() (+21 more)

### Community 6 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 7 - "createClient"
Cohesion: 0.08
Nodes (67): submit(), GET(), safeNext(), ResetPasswordPage(), ClearCheckedPanel(), finish(), EditItemRow(), save() (+59 more)

### Community 8 - "getCurrentMember"
Cohesion: 0.05
Nodes (64): GET(), GET(), GET(), GET(), DELETE(), GET(), POST(), SessionRequest (+56 more)

### Community 9 - "planner/page.tsx"
Cohesion: 0.06
Nodes (64): AgendaRow(), CALENDAR_VIEWS, calendarBase(), calendarHref(), CalendarPane(), CalendarView, concerns(), EmptyCalendar() (+56 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "(app)/family/page.tsx"
Cohesion: 0.20
Nodes (13): DocumentsPane(), HealthPane(), ProfilePane(), Seg, SEGMENTS, NewJournalEntryPage(), resolvePhotoUrl(), DocFolderRow (+5 more)

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
Nodes (60): RoutinesPane(), Account, initialState, Member, REMINDERS, Template, TEMPLATES, WEEKDAYS (+52 more)

### Community 18 - "lib/recipes.ts"
Cohesion: 0.10
Nodes (27): MealPhotoControl(), onPick(), MarketSection, sectionOrder(), PLATES, RECIPE_PHOTO_BUCKET, recipeRef(), getBuyItems() (+19 more)

### Community 19 - "recipe-book.tsx"
Cohesion: 0.14
Nodes (18): DishCard(), IconName, AddIngredientsToBuyButton(), CategoryManager(), EditableRecipe, IngredientChip(), ORIGIN_LABEL, RecipeBook() (+10 more)

### Community 20 - "household-money.ts"
Cohesion: 0.18
Nodes (16): PriceBookSheet(), BY_KEY, normalizeKey(), PRICE_BOOK, PRICE_BOOK_SET_ON, pricebookEntry, PriceSource, resolveUnitPrice() (+8 more)

### Community 21 - "subscribe-screen.tsx"
Cohesion: 0.31
Nodes (9): initialState, standing(), SubscribeScreen(), perMonth(), pesos(), Plan, PLAN_LIST, PlanId (+1 more)

### Community 22 - "calendar-sync.ts"
Cohesion: 0.07
Nodes (51): ActivityForm(), AddPlannerForm(), EditActivity, EditEvent, EditTrip, EventForm(), initialState, PlannerType (+43 more)

### Community 23 - "auth.ts"
Cohesion: 0.11
Nodes (27): initialState, initialState, ForgotPasswordForm(), initialState, CALLBACK_ERROR_MESSAGES, initialState, LoginForm(), initialState (+19 more)

### Community 24 - "lib/wealth.ts"
Cohesion: 0.15
Nodes (13): AssetForm(), initialState, LiabilityForm(), ACCOUNT_TYPE_LABELS, AccountType, ASSET_KIND_LABELS, ASSET_KINDS, AssetKind (+5 more)

### Community 25 - "settings/page.tsx"
Cohesion: 0.11
Nodes (28): CALENDAR_ERROR_MESSAGES, DRIVE_ERROR_MESSAGES, SettingsPage(), DeleteAccountButton(), CalendarConnectedPanel(), DriveConnectedPanel(), HouseholdNameForm(), HouseholdPrefsForm() (+20 more)

### Community 26 - "actions/family.ts"
Cohesion: 0.08
Nodes (26): FamilyForkForm(), DeleteHouseholdButton(), FamilyAboutEditor(), emptyFields, FamilyAddress, FamilyAddressList(), remove(), save() (+18 more)

### Community 27 - "familyDay"
Cohesion: 0.17
Nodes (13): initialState, NewHealthEntryForm(), TYPES, VISIBILITY, OmronToggle(), initialState, NewMilestonePage(), createHealthEntryAction() (+5 more)

### Community 28 - "transact-form.tsx"
Cohesion: 0.20
Nodes (8): Mode, MODE_LABELS, MODES, todayLocal(), TransactForm(), PickableAccount, EXPENSE_CATEGORIES, INCOME_SOURCES

### Community 29 - "ui.tsx"
Cohesion: 0.14
Nodes (12): AccountEditForm(), MembersPage(), AddChildForm(), AssistantConsole(), SUGGESTIONS, Turn, CopyInviteCode(), Blueprint() (+4 more)

### Community 30 - "profile.ts"
Cohesion: 0.14
Nodes (16): AvatarAlbumViewer(), MemberProfileEditor(), save(), ProfileEditForm(), save(), displayValue(), FieldGroup, FieldSpec (+8 more)

### Community 31 - "formatDate"
Cohesion: 0.21
Nodes (14): MemberDetailPage(), EntriesPane(), GalleryPane(), JournalPage(), MilestonesPane(), Seg, SEGMENTS, HubHeader() (+6 more)

### Community 32 - "react"
Cohesion: 0.18
Nodes (10): react, VerifyForm(), DeleteButton(), Failure, MediaItem, GalleryTile(), Icon(), iconPaths (+2 more)

### Community 33 - "tools.ts"
Cohesion: 0.22
Nodes (9): @anthropic-ai/sdk, POST(), systemPrompt(), ASSISTANT_TOOLS, Json, matchMembers(), num(), runAssistantTool() (+1 more)

### Community 34 - "household-price-controls.tsx"
Cohesion: 0.31
Nodes (12): AddPriceControl(), BuyItemPriceButton(), BuyItemPriceEditor(), PantryControls(), peso(), PriceRowControl(), useHouseholdAction(), removePantryItemAction() (+4 more)

### Community 35 - "household/page.tsx"
Cohesion: 0.21
Nodes (15): BuyPane(), MealsPane(), Seg, SEGMENT_LABEL, SEGMENTS, AddMealControl(), RemoveMealButton(), useMealAction() (+7 more)

### Community 36 - "members/[id]/page.tsx"
Cohesion: 0.19
Nodes (7): Seg, SEGMENTS, Avatar(), ChipRow(), Segmented(), memberToProfileFields(), PROFILE_FIELD_KEYS

### Community 37 - "FamilyBackgroundCropUpload"
Cohesion: 0.20
Nodes (7): clampAxis(), drawCrop(), FamilyBackgroundCropUpload(), cancel(), onPointerMove(), onZoomChange(), save()

### Community 38 - "family-background-album.tsx"
Cohesion: 0.32
Nodes (6): FamilyBackgroundAlbum(), AlbumPhotoLike, closeButtonStyle, navButtonStyle, overlayStyle, PhotoAlbumViewer()

### Community 39 - "meal-day.tsx"
Cohesion: 0.52
Nodes (6): AddIngredientRow(), IngredientAmountRow(), useAct(), addMealIngredientAction(), removeMealIngredientAction(), setMealIngredientAction()

### Community 40 - "format.ts"
Cohesion: 0.36
Nodes (7): TodayPage(), initials(), BriefItem, getHubCards(), getTodayBriefing(), HubCard, familyTime()

### Community 41 - "documents.ts"
Cohesion: 0.19
Nodes (12): DocFolderPage(), DocFileRow(), DownloadLink(), deleteDocFileAction(), getDocFileUrl(), UploadedFile, Ctx, DocSelectionProvider() (+4 more)

### Community 42 - "@playwright/test"
Cohesion: 0.17
Nodes (4): HUBS, THEMES, WIDTHS, @playwright/test

### Community 43 - "End-to-end tests"
Cohesion: 0.29
Nodes (6): Adding to it, End-to-end tests, Running, What is covered, What is not covered, and why, What you need

### Community 44 - "dependencies"
Cohesion: 0.29
Nodes (7): dependencies, @anthropic-ai/sdk, next, react, react-dom, @supabase/ssr, @supabase/supabase-js

### Community 45 - "edits.spec.ts"
Cohesion: 0.53
Nodes (4): createRichActivity(), dayUrl(), fill(), rowFor()

### Community 48 - "member-status-actions.tsx"
Cohesion: 0.60
Nodes (4): ReinstateMemberButton(), RemoveMemberButton(), reinstateMemberAction(), removeMemberAction()

### Community 49 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, e2e, e2e:ui, lint, start

### Community 51 - "hub-header.tsx"
Cohesion: 0.38
Nodes (3): AddGoalForm(), initialState, DetailHeader()

## Knowledge Gaps
- **213 isolated node(s):** `HUBS`, `WIDTHS`, `THEMES`, `eslintConfig`, `nextConfig` (+208 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 294 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `actions/journal.ts`, `queries/wealth.ts`, `wealth/page.tsx`, `chat-thread.tsx`, `actions/household.ts`, `getCurrentMember`, `planner/page.tsx`, `(app)/family/page.tsx`, `lib/routines.ts`, `lib/recipes.ts`, `recipe-book.tsx`, `household-money.ts`, `calendar-sync.ts`, `auth.ts`, `settings/page.tsx`, `actions/family.ts`, `familyDay`, `ui.tsx`, `profile.ts`, `formatDate`, `react`, `tools.ts`, `household-price-controls.tsx`, `household/page.tsx`, `members/[id]/page.tsx`, `meal-day.tsx`, `format.ts`, `documents.ts`, `member-status-actions.tsx`?**
  _High betweenness centrality (0.201) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `actions/journal.ts`, `chat-thread.tsx`, `actions/household.ts`, `createClient`, `getCurrentMember`, `planner/page.tsx`, `package.json`, `lib/routines.ts`, `recipe-book.tsx`, `subscribe-screen.tsx`, `calendar-sync.ts`, `auth.ts`, `lib/wealth.ts`, `settings/page.tsx`, `actions/family.ts`, `familyDay`, `transact-form.tsx`, `ui.tsx`, `profile.ts`, `household-price-controls.tsx`, `household/page.tsx`, `family-background-album.tsx`, `meal-day.tsx`, `documents.ts`, `member-status-actions.tsx`, `hub-header.tsx`?**
  _High betweenness centrality (0.196) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `getCurrentMember` to `tools.ts`, `wealth/page.tsx`, `chat-thread.tsx`, `members/[id]/page.tsx`, `household/page.tsx`, `createClient`, `format.ts`, `documents.ts`, `planner/page.tsx`, `(app)/family/page.tsx`, `hub-header.tsx`, `auth.ts`, `settings/page.tsx`, `ui.tsx`, `formatDate`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **What connects `HUBS`, `WIDTHS`, `THEMES` to the rest of the system?**
  _213 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `actions/journal.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13978494623655913 - nodes in this community are weakly interconnected._
- **Should `wealth/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Should `chat-thread.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.12473118279569892 - nodes in this community are weakly interconnected._