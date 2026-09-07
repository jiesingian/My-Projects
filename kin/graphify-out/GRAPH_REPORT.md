# Graph Report - kin  (2026-09-07)

## Corpus Check
- 184 files · ~122,885 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1093 nodes · 3380 edges · 55 communities (49 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 32 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `40294168`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- new-doc-form.tsx
- queries/wealth.ts
- wealth/page.tsx
- chat-thread.tsx
- devDependencies
- actions/household.ts
- compilerOptions
- requireCurrentMember
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
- createClient
- auth.ts
- lib/wealth.ts
- settings/page.tsx
- family-address-list.tsx
- form.tsx
- wealth-controls.tsx
- format.ts
- profile-fields.tsx
- members/[id]/page.tsx
- formatDate
- new-health-entry-form.tsx
- household-price-controls.tsx
- household/page.tsx
- money-actions.tsx
- profile.ts
- meals/new/page.tsx
- meal-day.tsx
- family-background-album.tsx
- react
- @playwright/test
- End-to-end tests
- dependencies
- login-form.tsx
- vercel.json
- reset-password-form.tsx
- scripts
- family-fork-form.tsx
- add-goal-form.tsx
- verify-form.tsx
- member-status-actions.tsx

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
- `Next.js Agent Rules Block (AGENTS.md)` --conceptually_related_to--> `Next.js 16 (App Router, TypeScript)`  [INFERRED]
  AGENTS.md → README.md
- `FamilyPage()` --calls--> `getCurrentMember`  [EXTRACTED]
  src/app/(app)/family/page.tsx → src/lib/session.ts
- `NewMealPage()` --indirect_call--> `addMealPlanAction()`  [INFERRED]
  src/app/(app)/household/meals/new/page.tsx → src/lib/actions/household.ts
- `HouseholdPage()` --calls--> `getCurrentMember`  [EXTRACTED]
  src/app/(app)/household/page.tsx → src/lib/session.ts
- `AssetForm()` --indirect_call--> `addAssetAction()`  [INFERRED]
  src/app/(app)/wealth/assets/new/add-holding-form.tsx → src/lib/actions/wealth.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kin Frontend/Backend Technology Stack** — readme_kin_family_os, readme_nextjs_16, readme_react_19, readme_tailwind_v4, readme_supabase [EXTRACTED 1.00]
- **Kin Privacy/Access Control Mechanisms** — readme_rls_policies, readme_managed_child_profiles, readme_supabase_auth_otp [INFERRED 0.85]

## Communities (55 total, 4 thin omitted)

### Community 0 - "new-doc-form.tsx"
Cohesion: 0.09
Nodes (27): NewDocForm(), onSubmit(), VISIBILITY, NewEntryForm(), onSubmit(), AvatarCropUpload(), cancel(), save() (+19 more)

### Community 1 - "queries/wealth.ts"
Cohesion: 0.24
Nodes (14): AddGoalPage(), AccountWithBalance, currentPeriod(), getAccountDetail(), getAccounts(), getNetWorth(), getWealthPane(), inScope() (+6 more)

### Community 2 - "wealth/page.tsx"
Cohesion: 0.11
Nodes (25): AccountPage(), AssetsPane(), BillsPane(), EntryRow(), FlowRow(), GoalsPane(), Hero(), HistoryPoint (+17 more)

### Community 3 - "chat-thread.tsx"
Cohesion: 0.11
Nodes (25): ChatPage(), dynamic, TodayPage(), ChatThread(), clockOf(), dayLabel(), REACTIONS, deleteMessageAction() (+17 more)

### Community 4 - "devDependencies"
Cohesion: 0.20
Nodes (10): devDependencies, eslint, eslint-config-next, @playwright/test, tailwindcss, @tailwindcss/postcss, @types/node, @types/react (+2 more)

### Community 5 - "actions/household.ts"
Cohesion: 0.13
Nodes (27): BuyGroup, BuyList(), EditItemRow(), save(), initialState, SOURCE_LABEL, GenerateGroceryButton(), ShoppingDayControl() (+19 more)

### Community 6 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 7 - "requireCurrentMember"
Cohesion: 0.20
Nodes (27): submit(), ClearCheckedPanel(), finish(), clearCheckedAction(), addBillAction(), applySettlement(), archiveAccountAction(), confirmTransactionAction() (+19 more)

### Community 8 - "getCurrentMember"
Cohesion: 0.08
Nodes (51): @supabase/supabase-js, GET(), GET(), GET(), GET(), DELETE(), GET(), POST() (+43 more)

### Community 9 - "planner/page.tsx"
Cohesion: 0.06
Nodes (64): AgendaRow(), CALENDAR_VIEWS, calendarBase(), calendarHref(), CalendarPane(), CalendarView, concerns(), EmptyCalendar() (+56 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "(app)/family/page.tsx"
Cohesion: 0.15
Nodes (17): NewDocPage(), DocumentsPane(), FamilyPage(), HealthPane(), ProfilePane(), Seg, SEGMENTS, NewJournalEntryPage() (+9 more)

### Community 12 - "@supabase/ssr"
Cohesion: 0.47
Nodes (4): @supabase/ssr, updateSession(), config, proxy()

### Community 13 - "next"
Cohesion: 0.22
Nodes (4): nextConfig, next, metadata, viewport

### Community 15 - "package.json"
Cohesion: 0.14
Nodes (13): license, name, private, version, eslint, eslint-config-next, react-dom, tailwindcss (+5 more)

### Community 17 - "lib/routines.ts"
Cohesion: 0.06
Nodes (64): RoutinesPane(), RoutinePage(), Account, EditRoutine, initialState, Member, REMINDERS, RoutineForm() (+56 more)

### Community 18 - "lib/recipes.ts"
Cohesion: 0.13
Nodes (20): PLATES, RECIPE_PHOTO_BUCKET, recipeRef(), getMealsForDay(), PlannedIngredient, PlannedMeal, toISO(), CategoryView (+12 more)

### Community 19 - "recipe-book.tsx"
Cohesion: 0.16
Nodes (16): AddIngredientsToBuyButton(), CategoryManager(), EditableRecipe, IngredientChip(), ORIGIN_LABEL, RecipeBook(), RecipeEditor(), useAct() (+8 more)

### Community 20 - "household-money.ts"
Cohesion: 0.16
Nodes (18): PriceBookSheet(), MARKET_SECTIONS, BY_KEY, normalizeKey(), PRICE_BOOK, PRICE_BOOK_SET_ON, pricebookEntry, PriceSource (+10 more)

### Community 21 - "subscribe-screen.tsx"
Cohesion: 0.17
Nodes (15): SubscribePage(), initialState, standing(), SubscribeScreen(), AccessSource, AccessStatus, HouseholdAccess, readAccess() (+7 more)

### Community 22 - "createClient"
Cohesion: 0.06
Nodes (60): @anthropic-ai/sdk, POST(), systemPrompt(), ActivityForm(), AddPlannerForm(), EditActivity, EditEvent, EditTrip (+52 more)

### Community 23 - "auth.ts"
Cohesion: 0.27
Nodes (8): ForgotPasswordForm(), initialState, initialState, SignupPage(), ActionState, getOrigin(), requestPasswordReset(), signUp()

### Community 24 - "lib/wealth.ts"
Cohesion: 0.11
Nodes (18): AccountEditForm(), initialState, AssetForm(), initialState, LiabilityForm(), addAssetAction(), addLiabilityAction(), ACCOUNT_TYPE_LABELS (+10 more)

### Community 25 - "settings/page.tsx"
Cohesion: 0.09
Nodes (33): CALENDAR_ERROR_MESSAGES, DRIVE_ERROR_MESSAGES, SettingsPage(), CopyInviteCode(), DeleteAccountButton(), DeleteHouseholdButton(), CalendarConnectedPanel(), DriveConnectedPanel() (+25 more)

### Community 26 - "family-address-list.tsx"
Cohesion: 0.15
Nodes (13): emptyFields, FamilyAddress, FamilyAddressList(), remove(), save(), startEdit(), fieldsFromAddress(), mapsUrl() (+5 more)

### Community 27 - "form.tsx"
Cohesion: 0.21
Nodes (12): initialState, NewMilestonePage(), initialState, ProfilePage(), AddChildForm(), initialState, ErrorText(), SubmitButton() (+4 more)

### Community 28 - "wealth-controls.tsx"
Cohesion: 0.11
Nodes (16): Mode, MODE_LABELS, MODES, todayLocal(), TransactForm(), AddAccountForm(), AddBillForm(), AllocationEditor() (+8 more)

### Community 29 - "format.ts"
Cohesion: 0.29
Nodes (5): MembersPage(), Blueprint(), Empty(), Tag(), formatAge()

### Community 30 - "profile-fields.tsx"
Cohesion: 0.19
Nodes (9): ProfileEditForm(), save(), displayValue(), FieldGroup, FieldSpec, PROFILE_FIELD_GROUPS, ProfileFieldsEditor(), ProfileFieldsView() (+1 more)

### Community 31 - "members/[id]/page.tsx"
Cohesion: 0.18
Nodes (9): Seg, SEGMENTS, AddHoldingForm(), NewHoldingPage(), DetailHeader(), RelationshipEditor(), ChipRow(), Segmented() (+1 more)

### Community 32 - "formatDate"
Cohesion: 0.23
Nodes (13): MemberDetailPage(), EntriesPane(), GalleryPane(), MilestonesPane(), Seg, SEGMENTS, HubHeader(), formatDate() (+5 more)

### Community 33 - "new-health-entry-form.tsx"
Cohesion: 0.22
Nodes (9): initialState, NewHealthEntryForm(), TYPES, VISIBILITY, NewHealthEntryPage(), OmronToggle(), createHealthEntryAction(), GROUPED_TYPES (+1 more)

### Community 34 - "household-price-controls.tsx"
Cohesion: 0.31
Nodes (12): AddPriceControl(), BuyItemPriceButton(), BuyItemPriceEditor(), PantryControls(), peso(), PriceRowControl(), useHouseholdAction(), removePantryItemAction() (+4 more)

### Community 35 - "household/page.tsx"
Cohesion: 0.17
Nodes (14): BuyPane(), DishCard(), HouseholdPage(), MealsPane(), Seg, SEGMENT_LABEL, SEGMENTS, RecipeRow() (+6 more)

### Community 36 - "money-actions.tsx"
Cohesion: 0.30
Nodes (12): AccountPrivacyToggle(), DeleteEntryButton(), DELETERS, GoalContributeControl(), LogSpendControl(), PayBillControl(), PendingEntryActions(), RemoveButton() (+4 more)

### Community 37 - "profile.ts"
Cohesion: 0.16
Nodes (14): AvatarAlbumViewer(), Avatar(), MemberProfileEditor(), save(), addAvatarToAlbumAction(), AlbumPhoto, deleteAvatarFromAlbumAction(), setActiveAvatarAction() (+6 more)

### Community 38 - "meals/new/page.tsx"
Cohesion: 0.21
Nodes (12): initialState, NewMealPage(), AddMealControl(), RemoveMealButton(), useMealAction(), addMealFromRecipeAction(), addMealPlanAction(), removeMealAction() (+4 more)

### Community 39 - "meal-day.tsx"
Cohesion: 0.29
Nodes (11): AddIngredientRow(), IngredientAmountRow(), MealPhotoControl(), onPick(), useAct(), addMealIngredientAction(), removeMealIngredientAction(), removeRecipePhotoAction() (+3 more)

### Community 40 - "family-background-album.tsx"
Cohesion: 0.28
Nodes (7): FamilyBackgroundAlbum(), AlbumPhotoLike, closeButtonStyle, navButtonStyle, overlayStyle, PhotoAlbumViewer(), setActiveFamilyBackgroundAction()

### Community 41 - "react"
Cohesion: 0.07
Nodes (32): react, DocFolderPage(), AppLayout(), AddToCalendar(), destinations(), AssistantConsole(), SUGGESTIONS, Turn (+24 more)

### Community 42 - "@playwright/test"
Cohesion: 0.22
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

### Community 48 - "reset-password-form.tsx"
Cohesion: 0.29
Nodes (7): PendingApprovalPage(), ResetPasswordPage(), initialState, ResetPasswordForm(), OnboardingShell(), Wordmark(), updatePasswordAction()

### Community 49 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, e2e, e2e:ui, lint, start

### Community 50 - "family-fork-form.tsx"
Cohesion: 0.43
Nodes (4): FamilyForkForm(), initialState, createFamilyAction(), joinFamilyAction()

### Community 51 - "add-goal-form.tsx"
Cohesion: 0.40
Nodes (4): AddGoalForm(), initialState, PickableAccount, createGoalAction()

### Community 54 - "member-status-actions.tsx"
Cohesion: 0.60
Nodes (4): ReinstateMemberButton(), RemoveMemberButton(), reinstateMemberAction(), removeMemberAction()

## Knowledge Gaps
- **213 isolated node(s):** `HUBS`, `WIDTHS`, `THEMES`, `eslintConfig`, `nextConfig` (+208 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 291 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `new-doc-form.tsx`, `queries/wealth.ts`, `wealth/page.tsx`, `chat-thread.tsx`, `actions/household.ts`, `requireCurrentMember`, `getCurrentMember`, `planner/page.tsx`, `(app)/family/page.tsx`, `lib/routines.ts`, `lib/recipes.ts`, `recipe-book.tsx`, `household-money.ts`, `subscribe-screen.tsx`, `auth.ts`, `lib/wealth.ts`, `settings/page.tsx`, `family-address-list.tsx`, `form.tsx`, `wealth-controls.tsx`, `format.ts`, `profile-fields.tsx`, `members/[id]/page.tsx`, `formatDate`, `new-health-entry-form.tsx`, `household-price-controls.tsx`, `household/page.tsx`, `money-actions.tsx`, `profile.ts`, `meals/new/page.tsx`, `meal-day.tsx`, `family-background-album.tsx`, `react`, `login-form.tsx`, `reset-password-form.tsx`, `family-fork-form.tsx`, `add-goal-form.tsx`, `verify-form.tsx`, `member-status-actions.tsx`?**
  _High betweenness centrality (0.216) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `new-doc-form.tsx`, `chat-thread.tsx`, `actions/household.ts`, `getCurrentMember`, `planner/page.tsx`, `(app)/family/page.tsx`, `package.json`, `lib/routines.ts`, `recipe-book.tsx`, `subscribe-screen.tsx`, `createClient`, `auth.ts`, `lib/wealth.ts`, `settings/page.tsx`, `family-address-list.tsx`, `form.tsx`, `wealth-controls.tsx`, `format.ts`, `profile-fields.tsx`, `members/[id]/page.tsx`, `new-health-entry-form.tsx`, `household-price-controls.tsx`, `money-actions.tsx`, `profile.ts`, `meals/new/page.tsx`, `meal-day.tsx`, `family-background-album.tsx`, `login-form.tsx`, `reset-password-form.tsx`, `family-fork-form.tsx`, `add-goal-form.tsx`, `verify-form.tsx`, `member-status-actions.tsx`?**
  _High betweenness centrality (0.151) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `getCurrentMember` to `formatDate`, `new-health-entry-form.tsx`, `wealth/page.tsx`, `chat-thread.tsx`, `household/page.tsx`, `queries/wealth.ts`, `requireCurrentMember`, `react`, `planner/page.tsx`, `(app)/family/page.tsx`, `reset-password-form.tsx`, `lib/routines.ts`, `subscribe-screen.tsx`, `createClient`, `settings/page.tsx`, `format.ts`, `members/[id]/page.tsx`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **What connects `HUBS`, `WIDTHS`, `THEMES` to the rest of the system?**
  _213 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `new-doc-form.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09080841638981174 - nodes in this community are weakly interconnected._
- **Should `wealth/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Should `chat-thread.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.11428571428571428 - nodes in this community are weakly interconnected._