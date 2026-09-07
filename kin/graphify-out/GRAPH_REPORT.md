# Graph Report - kin  (2026-09-07)

## Corpus Check
- 178 files · ~120,035 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1069 nodes · 3357 edges · 53 communities (48 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 32 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3d3ea39f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- uploadFileDirect
- getCurrentMember
- wealth/page.tsx
- chat-thread.tsx
- devDependencies
- actions/household.ts
- compilerOptions
- calendar-sync.ts
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
- ActionState
- createClient
- auth.ts
- tools.ts
- settings/page.tsx
- actions/family.ts
- react
- FamilyBackgroundCropUpload
- ui.tsx
- profile-fields.tsx
- members/[id]/page.tsx
- database.types.ts
- new-health-entry-form.tsx
- household-price-controls.tsx
- household/page.tsx
- (app)/layout.tsx
- member-profile-editor.tsx
- profile.ts
- meal-day.tsx
- family-background-album.tsx
- documents.ts
- icons.tsx
- server.ts
- dependencies
- login-form.tsx
- vercel.json
- reset-password-form.tsx
- scripts
- add-child-form.tsx
- routines/new/page.tsx
- onSubmit

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
- `NewMealPage()` --indirect_call--> `addMealPlanAction()`  [INFERRED]
  src/app/(app)/household/meals/new/page.tsx → src/lib/actions/household.ts
- `AssetForm()` --indirect_call--> `addAssetAction()`  [INFERRED]
  src/app/(app)/wealth/assets/new/add-holding-form.tsx → src/lib/actions/wealth.ts
- `LiabilityForm()` --indirect_call--> `addLiabilityAction()`  [INFERRED]
  src/app/(app)/wealth/assets/new/add-holding-form.tsx → src/lib/actions/wealth.ts
- `Next.js Agent Rules Block (AGENTS.md)` --conceptually_related_to--> `Next.js 16 (App Router, TypeScript)`  [INFERRED]
  AGENTS.md → README.md
- `FamilyPage()` --calls--> `getCurrentMember`  [EXTRACTED]
  src/app/(app)/family/page.tsx → src/lib/session.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kin Frontend/Backend Technology Stack** — readme_kin_family_os, readme_nextjs_16, readme_react_19, readme_tailwind_v4, readme_supabase [EXTRACTED 1.00]
- **Kin Privacy/Access Control Mechanisms** — readme_rls_policies, readme_managed_child_profiles, readme_supabase_auth_otp [INFERRED 0.85]

## Communities (53 total, 4 thin omitted)

### Community 0 - "uploadFileDirect"
Cohesion: 0.17
Nodes (13): AvatarCropUpload(), cancel(), save(), drawCrop(), drawCrop(), cancel(), save(), GalleryUpload() (+5 more)

### Community 1 - "getCurrentMember"
Cohesion: 0.14
Nodes (15): GET(), GET(), NewHealthEntryPage(), HouseholdPage(), SettingsPage(), AddGoalPage(), AddHoldingForm(), NewHoldingPage() (+7 more)

### Community 2 - "wealth/page.tsx"
Cohesion: 0.05
Nodes (62): TravelPane(), AccountEditForm(), AccountPage(), AssetForm(), initialState, LiabilityForm(), AssetsPane(), BillsPane() (+54 more)

### Community 3 - "chat-thread.tsx"
Cohesion: 0.15
Nodes (20): ChatPage(), dynamic, ChatThread(), clockOf(), dayLabel(), REACTIONS, deleteMessageAction(), editMessageAction() (+12 more)

### Community 4 - "devDependencies"
Cohesion: 0.22
Nodes (9): devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node, @types/react, @types/react-dom (+1 more)

### Community 5 - "actions/household.ts"
Cohesion: 0.16
Nodes (18): BuyList(), GenerateGroceryButton(), addBuyItemAction(), addMealIngredientsToBuyAction(), addRecipeCategoryAction(), generateGroceryListAction(), RecipeIngredientInput, toggleBuyItemAction() (+10 more)

### Community 6 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 7 - "calendar-sync.ts"
Cohesion: 0.13
Nodes (26): GET(), ago(), CalendarSyncStatus(), RememberFilter(), SyncCalendarButton(), applyIncomingEvent(), BACKFILL_DESCRIPTORS, BackfillDescriptor (+18 more)

### Community 8 - "google-drive.ts"
Cohesion: 0.08
Nodes (45): GET(), DELETE(), GET(), POST(), SessionRequest, EntriesPane(), GalleryPane(), JournalPage() (+37 more)

### Community 9 - "planner/page.tsx"
Cohesion: 0.07
Nodes (58): AgendaRow(), CALENDAR_VIEWS, calendarBase(), calendarHref(), CalendarPane(), CalendarView, concerns(), EmptyCalendar() (+50 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "(app)/family/page.tsx"
Cohesion: 0.16
Nodes (16): NewDocForm(), NewDocPage(), DocumentsPane(), FamilyPage(), HealthPane(), ProfilePane(), Seg, SEGMENTS (+8 more)

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
Nodes (63): RoutinesPane(), Account, initialState, Member, REMINDERS, Template, TEMPLATES, WEEKDAYS (+55 more)

### Community 18 - "lib/recipes.ts"
Cohesion: 0.14
Nodes (21): MealsPane(), MarketSection, PLATES, RECIPE_PHOTO_BUCKET, recipeRef(), getMealsForDay(), PlannedIngredient, toISO() (+13 more)

### Community 19 - "recipe-book.tsx"
Cohesion: 0.14
Nodes (18): DishCard(), AddIngredientsToBuyButton(), CategoryManager(), EditableRecipe, IngredientChip(), ORIGIN_LABEL, RecipeBook(), RecipeEditor() (+10 more)

### Community 20 - "household-money.ts"
Cohesion: 0.18
Nodes (16): PriceBookSheet(), BY_KEY, normalizeKey(), PRICE_BOOK, PRICE_BOOK_SET_ON, pricebookEntry, PriceSource, resolveUnitPrice() (+8 more)

### Community 21 - "ActionState"
Cohesion: 0.25
Nodes (11): initialState, standing(), SubscribeScreen(), ActionState, redeemCodeForHouseholdAction(), perMonth(), pesos(), Plan (+3 more)

### Community 22 - "createClient"
Cohesion: 0.05
Nodes (102): onSubmit(), ActivityForm(), AddPlannerForm(), EditActivity, EditEvent, EditTrip, EventForm(), initialState (+94 more)

### Community 23 - "auth.ts"
Cohesion: 0.18
Nodes (10): ForgotPasswordForm(), initialState, initialState, SignupPage(), VerifyForm(), getOrigin(), requestPasswordReset(), resendConfirmation() (+2 more)

### Community 24 - "tools.ts"
Cohesion: 0.24
Nodes (8): @anthropic-ai/sdk, POST(), systemPrompt(), ASSISTANT_TOOLS, Json, matchMembers(), num(), runAssistantTool()

### Community 25 - "settings/page.tsx"
Cohesion: 0.12
Nodes (26): CALENDAR_ERROR_MESSAGES, DRIVE_ERROR_MESSAGES, DeleteAccountButton(), CalendarConnectedPanel(), DriveConnectedPanel(), HouseholdNameForm(), HouseholdPrefsForm(), InviteCodeCard() (+18 more)

### Community 26 - "actions/family.ts"
Cohesion: 0.08
Nodes (25): FamilyForkForm(), DeleteHouseholdButton(), FamilyAboutEditor(), emptyFields, FamilyAddress, FamilyAddressList(), remove(), startEdit() (+17 more)

### Community 27 - "react"
Cohesion: 0.12
Nodes (23): react, VISIBILITY, initialState, NewMealPage(), initialState, NewMilestonePage(), initialState, AddGoalForm() (+15 more)

### Community 28 - "FamilyBackgroundCropUpload"
Cohesion: 0.25
Nodes (4): clampAxis(), FamilyBackgroundCropUpload(), onPointerMove(), onZoomChange()

### Community 29 - "ui.tsx"
Cohesion: 0.25
Nodes (6): initialState, SUGGESTIONS, Turn, OnboardingShell(), Wordmark(), Blueprint()

### Community 30 - "profile-fields.tsx"
Cohesion: 0.16
Nodes (12): save(), ProfileEditForm(), save(), displayValue(), FieldGroup, FieldSpec, PROFILE_FIELD_GROUPS, ProfileFieldsEditor() (+4 more)

### Community 31 - "members/[id]/page.tsx"
Cohesion: 0.16
Nodes (12): OmronToggle(), MemberDetailPage(), Seg, SEGMENTS, ChipRow(), Segmented(), toggleOmronAction(), memberToProfileFields() (+4 more)

### Community 32 - "database.types.ts"
Cohesion: 0.22
Nodes (8): CompositeTypes, Constants, DatabaseWithoutInternals, DefaultSchema, Enums, Json, TablesInsert, TablesUpdate

### Community 33 - "new-health-entry-form.tsx"
Cohesion: 0.32
Nodes (6): initialState, NewHealthEntryForm(), TYPES, VISIBILITY, createHealthEntryAction(), GROUPED_TYPES

### Community 34 - "household-price-controls.tsx"
Cohesion: 0.31
Nodes (12): AddPriceControl(), BuyItemPriceButton(), BuyItemPriceEditor(), PantryControls(), peso(), PriceRowControl(), useHouseholdAction(), removePantryItemAction() (+4 more)

### Community 35 - "household/page.tsx"
Cohesion: 0.18
Nodes (15): BuyPane(), Seg, SEGMENT_LABEL, SEGMENTS, AddMealControl(), RemoveMealButton(), useMealAction(), addMealFromRecipeAction() (+7 more)

### Community 36 - "(app)/layout.tsx"
Cohesion: 0.19
Nodes (10): AppLayout(), SubscribePage(), AssistantConsole(), AssistantFab(), TabBar(), AccessSource, AccessStatus, HouseholdAccess (+2 more)

### Community 37 - "member-profile-editor.tsx"
Cohesion: 0.29
Nodes (4): AvatarAlbumViewer(), Avatar(), MemberProfileEditor(), Tag()

### Community 38 - "profile.ts"
Cohesion: 0.50
Nodes (5): addAvatarToAlbumAction(), AlbumPhoto, deleteAvatarFromAlbumAction(), setActiveAvatarAction(), resolvePhotoUrl()

### Community 39 - "meal-day.tsx"
Cohesion: 0.29
Nodes (11): AddIngredientRow(), IngredientAmountRow(), MealPhotoControl(), onPick(), useAct(), addMealIngredientAction(), removeMealIngredientAction(), removeRecipePhotoAction() (+3 more)

### Community 40 - "family-background-album.tsx"
Cohesion: 0.32
Nodes (6): FamilyBackgroundAlbum(), AlbumPhotoLike, closeButtonStyle, navButtonStyle, overlayStyle, PhotoAlbumViewer()

### Community 41 - "documents.ts"
Cohesion: 0.19
Nodes (12): DocFolderPage(), DocFileRow(), DownloadLink(), deleteDocFileAction(), getDocFileUrl(), UploadedFile, Ctx, DocSelectionProvider() (+4 more)

### Community 42 - "icons.tsx"
Cohesion: 0.18
Nodes (11): AddToCalendar(), destinations(), CopyInviteCode(), DeleteButton(), Icon(), IconName, iconPaths, PickButton() (+3 more)

### Community 43 - "server.ts"
Cohesion: 0.39
Nodes (6): TodayPage(), initials(), BriefItem, getHubCards(), getTodayBriefing(), HubCard

### Community 44 - "dependencies"
Cohesion: 0.29
Nodes (7): dependencies, @anthropic-ai/sdk, next, react, react-dom, @supabase/ssr, @supabase/supabase-js

### Community 45 - "login-form.tsx"
Cohesion: 0.38
Nodes (4): CALLBACK_ERROR_MESSAGES, initialState, LoginForm(), signIn()

### Community 48 - "reset-password-form.tsx"
Cohesion: 0.47
Nodes (4): ResetPasswordPage(), initialState, ResetPasswordForm(), updatePasswordAction()

### Community 49 - "scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, lint, start

### Community 50 - "add-child-form.tsx"
Cohesion: 0.60
Nodes (4): AddChildForm(), initialState, addChildWithLoginAction(), addManagedChildAction()

### Community 51 - "routines/new/page.tsx"
Cohesion: 0.50
Nodes (3): RoutinePage(), EditRoutine, RoutineForm()

## Knowledge Gaps
- **202 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+197 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 271 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `uploadFileDirect`, `getCurrentMember`, `wealth/page.tsx`, `chat-thread.tsx`, `actions/household.ts`, `calendar-sync.ts`, `google-drive.ts`, `planner/page.tsx`, `(app)/family/page.tsx`, `lib/routines.ts`, `lib/recipes.ts`, `recipe-book.tsx`, `household-money.ts`, `ActionState`, `auth.ts`, `tools.ts`, `settings/page.tsx`, `actions/family.ts`, `react`, `ui.tsx`, `profile-fields.tsx`, `members/[id]/page.tsx`, `new-health-entry-form.tsx`, `household-price-controls.tsx`, `household/page.tsx`, `(app)/layout.tsx`, `profile.ts`, `meal-day.tsx`, `documents.ts`, `server.ts`, `login-form.tsx`, `reset-password-form.tsx`, `add-child-form.tsx`, `routines/new/page.tsx`?**
  _High betweenness centrality (0.220) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `uploadFileDirect`, `getCurrentMember`, `wealth/page.tsx`, `chat-thread.tsx`, `actions/household.ts`, `calendar-sync.ts`, `google-drive.ts`, `planner/page.tsx`, `package.json`, `lib/routines.ts`, `recipe-book.tsx`, `ActionState`, `createClient`, `auth.ts`, `settings/page.tsx`, `actions/family.ts`, `ui.tsx`, `profile-fields.tsx`, `members/[id]/page.tsx`, `new-health-entry-form.tsx`, `household-price-controls.tsx`, `household/page.tsx`, `(app)/layout.tsx`, `member-profile-editor.tsx`, `meal-day.tsx`, `family-background-album.tsx`, `documents.ts`, `icons.tsx`, `login-form.tsx`, `reset-password-form.tsx`, `add-child-form.tsx`?**
  _High betweenness centrality (0.154) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `getCurrentMember` to `wealth/page.tsx`, `chat-thread.tsx`, `household/page.tsx`, `(app)/layout.tsx`, `calendar-sync.ts`, `google-drive.ts`, `documents.ts`, `planner/page.tsx`, `(app)/family/page.tsx`, `server.ts`, `routines/new/page.tsx`, `createClient`, `tools.ts`, `settings/page.tsx`, `react`, `ui.tsx`, `members/[id]/page.tsx`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _202 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `getCurrentMember` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `wealth/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.054385964912280704 - nodes in this community are weakly interconnected._
- **Should `chat-thread.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.1455026455026455 - nodes in this community are weakly interconnected._