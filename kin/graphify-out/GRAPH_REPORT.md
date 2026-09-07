# Graph Report - kin  (2026-09-07)

## Corpus Check
- 175 files · ~119,070 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1073 nodes · 3269 edges · 49 communities (43 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 32 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a11a12f6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- new-entry-form.tsx
- getCurrentMember
- wealth/page.tsx
- icons.tsx
- devDependencies
- actions/household.ts
- compilerOptions
- profile.ts
- settings-controls.tsx
- planner/page.tsx
- Kin — Family Operating System
- hub-header.tsx
- proxy.ts
- app/layout.tsx
- eslint.config.mjs
- next.config.ts
- postcss.config.mjs
- lib/routines.ts
- lib/recipes.ts
- household/page.tsx
- household-money.ts
- subscribe-screen.tsx
- calendar-sync.ts
- onboarding-shell.tsx
- createClient
- settings/page.tsx
- actions/family.ts
- ActionState
- queries/wealth.ts
- ui.tsx
- member-profile-editor.tsx
- new-health-entry-form.tsx
- members/[id]/page.tsx
- (app)/family/page.tsx
- household-price-controls.tsx
- meals/new/page.tsx
- auth.ts
- FamilyBackgroundCropUpload
- journal/page.tsx
- meal-day.tsx
- database.types.ts
- documents.ts
- avatar-crop-upload.tsx
- family-background-album.tsx
- family-fork-form.tsx
- reset-password-form.tsx
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
- `Next.js Agent Rules Block (AGENTS.md)` --conceptually_related_to--> `Next.js 16 (App Router, TypeScript)`  [INFERRED]
  AGENTS.md → README.md
- `FamilyPage()` --calls--> `getCurrentMember`  [EXTRACTED]
  src/app/(app)/family/page.tsx → src/lib/session.ts
- `NewMealPage()` --indirect_call--> `addMealPlanAction()`  [INFERRED]
  src/app/(app)/household/meals/new/page.tsx → src/lib/actions/household.ts
- `HouseholdPage()` --calls--> `getCurrentMember`  [EXTRACTED]
  src/app/(app)/household/page.tsx → src/lib/session.ts
- `AddGoalForm()` --indirect_call--> `createGoalAction()`  [INFERRED]
  src/app/(app)/wealth/add/add-goal-form.tsx → src/lib/actions/wealth.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kin Frontend/Backend Technology Stack** — readme_kin_family_os, readme_nextjs_16, readme_react_19, readme_tailwind_v4, readme_supabase [EXTRACTED 1.00]
- **Kin Privacy/Access Control Mechanisms** — readme_rls_policies, readme_managed_child_profiles, readme_supabase_auth_otp [INFERRED 0.85]

## Communities (49 total, 4 thin omitted)

### Community 0 - "new-entry-form.tsx"
Cohesion: 0.30
Nodes (9): NewEntryForm(), onSubmit(), GalleryUpload(), onUpload(), attachJournalMediaAction(), createJournalEntryAction(), rollbackUpload(), UploadedFile (+1 more)

### Community 1 - "getCurrentMember"
Cohesion: 0.22
Nodes (12): GET(), GET(), NewDocPage(), NewJournalEntryPage(), AddPlannerPage(), WealthPage(), RootPage(), Tables (+4 more)

### Community 2 - "wealth/page.tsx"
Cohesion: 0.13
Nodes (22): AssetsPane(), BillsPane(), EntryRow(), FlowRow(), GoalsPane(), Hero(), HistoryPoint, HistoryStrip() (+14 more)

### Community 3 - "icons.tsx"
Cohesion: 0.06
Nodes (39): ChatPage(), dynamic, AppLayout(), AssistantConsole(), SUGGESTIONS, Turn, AssistantFab(), ChatThread() (+31 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (39): @anthropic-ai/sdk, eslint, eslint-config-next, next, dependencies, @anthropic-ai/sdk, next, react (+31 more)

### Community 5 - "actions/household.ts"
Cohesion: 0.13
Nodes (27): BuyGroup, BuyList(), EditItemRow(), save(), initialState, SOURCE_LABEL, GenerateGroceryButton(), ShoppingDayControl() (+19 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 7 - "profile.ts"
Cohesion: 0.31
Nodes (7): DeleteAccountButton(), TransferOrganizerRole(), deleteAvatarFromAlbumAction(), deleteOwnAccountAction(), setActiveAvatarAction(), transferOrganiserRoleAction(), resolvePhotoUrl()

### Community 8 - "settings-controls.tsx"
Cohesion: 0.06
Nodes (57): GET(), DELETE(), GET(), POST(), SessionRequest, CopyInviteCode(), Failure, GalleryGrid() (+49 more)

### Community 9 - "planner/page.tsx"
Cohesion: 0.06
Nodes (64): AgendaRow(), CALENDAR_VIEWS, calendarBase(), calendarHref(), CalendarPane(), CalendarView, concerns(), EmptyCalendar() (+56 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "hub-header.tsx"
Cohesion: 0.20
Nodes (10): TravelPane(), RoutinePage(), AddGoalPage(), NewHoldingPage(), TransactPage(), DetailHeader(), HubHeader(), ChipRow() (+2 more)

### Community 12 - "proxy.ts"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

### Community 17 - "lib/routines.ts"
Cohesion: 0.06
Nodes (66): BuyPane(), RoutinesPane(), Account, EditRoutine, initialState, Member, REMINDERS, RoutineForm() (+58 more)

### Community 18 - "lib/recipes.ts"
Cohesion: 0.11
Nodes (26): MealsPane(), MarketSection, sectionOrder(), PLATES, RECIPE_PHOTO_BUCKET, recipeRef(), getBuyItems(), getMealsForDay() (+18 more)

### Community 19 - "household/page.tsx"
Cohesion: 0.13
Nodes (21): DishCard(), HouseholdPage(), Seg, SEGMENT_LABEL, SEGMENTS, AddIngredientsToBuyButton(), EditableRecipe, IngredientChip() (+13 more)

### Community 20 - "household-money.ts"
Cohesion: 0.16
Nodes (18): PriceBookSheet(), saveRecipeIngredients(), MARKET_SECTIONS, BY_KEY, normalizeKey(), PRICE_BOOK, PRICE_BOOK_SET_ON, pricebookEntry (+10 more)

### Community 21 - "subscribe-screen.tsx"
Cohesion: 0.17
Nodes (15): SubscribePage(), initialState, standing(), SubscribeScreen(), AccessSource, AccessStatus, HouseholdAccess, readAccess() (+7 more)

### Community 22 - "calendar-sync.ts"
Cohesion: 0.06
Nodes (57): POST(), systemPrompt(), GET(), ActivityForm(), AddPlannerForm(), EditActivity, EditEvent, EditTrip (+49 more)

### Community 23 - "onboarding-shell.tsx"
Cohesion: 0.17
Nodes (10): ForgotPasswordForm(), initialState, CALLBACK_ERROR_MESSAGES, initialState, LoginForm(), PendingApprovalPage(), OnboardingShell(), Wordmark() (+2 more)

### Community 24 - "createClient"
Cohesion: 0.06
Nodes (82): AddHoldingForm(), AssetForm(), initialState, LiabilityForm(), Mode, MODE_LABELS, MODES, todayLocal() (+74 more)

### Community 25 - "settings/page.tsx"
Cohesion: 0.24
Nodes (11): CALENDAR_ERROR_MESSAGES, DRIVE_ERROR_MESSAGES, SettingsPage(), TodayPage(), initials(), BriefItem, getHubCards(), getTodayBriefing() (+3 more)

### Community 26 - "actions/family.ts"
Cohesion: 0.09
Nodes (27): DeleteHouseholdButton(), FamilyAboutEditor(), emptyFields, FamilyAddress, FamilyAddressList(), remove(), save(), startEdit() (+19 more)

### Community 27 - "ActionState"
Cohesion: 0.12
Nodes (20): initialState, NewMilestonePage(), AccountEditForm(), initialState, AddGoalForm(), initialState, initialState, ProfilePage() (+12 more)

### Community 28 - "queries/wealth.ts"
Cohesion: 0.29
Nodes (12): AccountWithBalance, currentPeriod(), getAccountDetail(), getNetWorth(), getWealthPane(), inScope(), loadAccounts(), RawLedgerRow (+4 more)

### Community 29 - "ui.tsx"
Cohesion: 0.22
Nodes (7): DocFolderPage(), AccountPage(), MembersPage(), Blueprint(), Empty(), Tag(), formatAge()

### Community 30 - "member-profile-editor.tsx"
Cohesion: 0.13
Nodes (15): AvatarAlbumViewer(), MemberProfileEditor(), save(), ProfileEditForm(), save(), displayValue(), FieldGroup, FieldSpec (+7 more)

### Community 31 - "new-health-entry-form.tsx"
Cohesion: 0.22
Nodes (9): initialState, NewHealthEntryForm(), TYPES, VISIBILITY, NewHealthEntryPage(), OmronToggle(), createHealthEntryAction(), GROUPED_TYPES (+1 more)

### Community 32 - "members/[id]/page.tsx"
Cohesion: 0.27
Nodes (8): MemberDetailPage(), Seg, SEGMENTS, formatDate(), memberToProfileFields(), PROFILE_FIELD_KEYS, buildBarSeries(), getMemberDetail()

### Community 33 - "(app)/family/page.tsx"
Cohesion: 0.21
Nodes (10): DocumentsPane(), FamilyPage(), HealthPane(), ProfilePane(), Seg, SEGMENTS, Avatar(), getDocFolders() (+2 more)

### Community 34 - "household-price-controls.tsx"
Cohesion: 0.31
Nodes (12): AddPriceControl(), BuyItemPriceButton(), BuyItemPriceEditor(), PantryControls(), peso(), PriceRowControl(), useHouseholdAction(), removePantryItemAction() (+4 more)

### Community 35 - "meals/new/page.tsx"
Cohesion: 0.26
Nodes (10): initialState, NewMealPage(), AddMealControl(), RemoveMealButton(), useMealAction(), addMealFromRecipeAction(), addMealPlanAction(), removeMealAction() (+2 more)

### Community 36 - "auth.ts"
Cohesion: 0.29
Nodes (7): initialState, SignupPage(), VerifyForm(), getOrigin(), requestPasswordReset(), resendConfirmation(), signUp()

### Community 37 - "FamilyBackgroundCropUpload"
Cohesion: 0.20
Nodes (7): clampAxis(), drawCrop(), FamilyBackgroundCropUpload(), cancel(), onPointerMove(), onZoomChange(), save()

### Community 38 - "journal/page.tsx"
Cohesion: 0.27
Nodes (9): EntriesPane(), GalleryPane(), JournalPage(), MilestonesPane(), Seg, SEGMENTS, getEntries(), getGallery() (+1 more)

### Community 39 - "meal-day.tsx"
Cohesion: 0.36
Nodes (8): AddIngredientRow(), IngredientAmountRow(), MealPhotoControl(), onPick(), useAct(), addMealIngredientAction(), removeMealIngredientAction(), setMealIngredientAction()

### Community 40 - "database.types.ts"
Cohesion: 0.22
Nodes (8): CompositeTypes, Constants, DatabaseWithoutInternals, DefaultSchema, Enums, Json, TablesInsert, TablesUpdate

### Community 41 - "documents.ts"
Cohesion: 0.39
Nodes (6): NewDocForm(), onSubmit(), VISIBILITY, attachDocFileAction(), createDocEntryAction(), UploadedFile

### Community 42 - "avatar-crop-upload.tsx"
Cohesion: 0.36
Nodes (5): AvatarCropUpload(), cancel(), save(), drawCrop(), addAvatarToAlbumAction()

### Community 43 - "family-background-album.tsx"
Cohesion: 0.32
Nodes (6): FamilyBackgroundAlbum(), AlbumPhotoLike, closeButtonStyle, navButtonStyle, overlayStyle, PhotoAlbumViewer()

### Community 44 - "family-fork-form.tsx"
Cohesion: 0.43
Nodes (4): FamilyForkForm(), initialState, createFamilyAction(), joinFamilyAction()

### Community 45 - "reset-password-form.tsx"
Cohesion: 0.47
Nodes (4): ResetPasswordPage(), initialState, ResetPasswordForm(), updatePasswordAction()

### Community 46 - "vercel.json"
Cohesion: 0.50
Nodes (3): sin1, regions, $schema

## Knowledge Gaps
- **201 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+196 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 271 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `new-entry-form.tsx`, `getCurrentMember`, `wealth/page.tsx`, `icons.tsx`, `actions/household.ts`, `profile.ts`, `settings-controls.tsx`, `planner/page.tsx`, `hub-header.tsx`, `lib/routines.ts`, `lib/recipes.ts`, `household/page.tsx`, `household-money.ts`, `subscribe-screen.tsx`, `calendar-sync.ts`, `onboarding-shell.tsx`, `settings/page.tsx`, `actions/family.ts`, `ActionState`, `queries/wealth.ts`, `ui.tsx`, `member-profile-editor.tsx`, `new-health-entry-form.tsx`, `members/[id]/page.tsx`, `(app)/family/page.tsx`, `household-price-controls.tsx`, `meals/new/page.tsx`, `auth.ts`, `journal/page.tsx`, `meal-day.tsx`, `documents.ts`, `avatar-crop-upload.tsx`, `family-fork-form.tsx`, `reset-password-form.tsx`?**
  _High betweenness centrality (0.245) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `getCurrentMember` to `members/[id]/page.tsx`, `(app)/family/page.tsx`, `wealth/page.tsx`, `icons.tsx`, `journal/page.tsx`, `settings-controls.tsx`, `planner/page.tsx`, `hub-header.tsx`, `household/page.tsx`, `subscribe-screen.tsx`, `calendar-sync.ts`, `onboarding-shell.tsx`, `createClient`, `settings/page.tsx`, `ui.tsx`, `new-health-entry-form.tsx`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Why does `requireCurrentMember()` connect `createClient` to `new-entry-form.tsx`, `getCurrentMember`, `icons.tsx`, `actions/household.ts`, `profile.ts`, `settings-controls.tsx`, `planner/page.tsx`, `lib/routines.ts`, `household/page.tsx`, `subscribe-screen.tsx`, `calendar-sync.ts`, `actions/family.ts`, `ActionState`, `member-profile-editor.tsx`, `new-health-entry-form.tsx`, `household-price-controls.tsx`, `meals/new/page.tsx`, `meal-day.tsx`, `documents.ts`, `avatar-crop-upload.tsx`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _201 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `wealth/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._
- **Should `icons.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.061952074810052604 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._