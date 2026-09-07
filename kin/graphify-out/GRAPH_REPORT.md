# Graph Report - kin  (2026-09-07)

## Corpus Check
- 190 files · ~127,562 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1111 nodes · 3453 edges · 49 communities (44 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 32 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1c6098db`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- database.types.ts
- profile.ts
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
- household/page.tsx
- buy-list.tsx
- money-actions.tsx
- ActionState
- calendar-sync.ts
- auth.ts
- wealth-controls.tsx
- settings-controls.tsx
- actions/family.ts
- gallery-grid.tsx
- family-fork-form.tsx
- hub-header.tsx
- profile-fields.tsx
- reset-password-form.tsx
- react
- smoke.spec.ts
- household-price-controls.tsx
- add-child-form.tsx
- members/[id]/page.tsx
- family-background-album.tsx
- meal-day.tsx
- settings/page.tsx
- google-drive.ts
- @playwright/test
- End-to-end tests
- dependencies
- edits.spec.ts
- vercel.json
- scripts
- form.tsx

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
- `HouseholdPage()` --calls--> `getCurrentMember`  [EXTRACTED]
  src/app/(app)/household/page.tsx → src/lib/session.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kin Frontend/Backend Technology Stack** — readme_kin_family_os, readme_nextjs_16, readme_react_19, readme_tailwind_v4, readme_supabase [EXTRACTED 1.00]
- **Kin Privacy/Access Control Mechanisms** — readme_rls_policies, readme_managed_child_profiles, readme_supabase_auth_otp [INFERRED 0.85]

## Communities (49 total, 4 thin omitted)

### Community 0 - "database.types.ts"
Cohesion: 0.05
Nodes (48): NewDocForm(), onSubmit(), VISIBILITY, initialState, NewHealthEntryForm(), TYPES, VISIBILITY, OmronToggle() (+40 more)

### Community 1 - "profile.ts"
Cohesion: 0.19
Nodes (12): AvatarAlbumViewer(), Avatar(), MemberProfileEditor(), save(), addAvatarToAlbumAction(), AlbumPhoto, deleteAvatarFromAlbumAction(), setActiveAvatarAction() (+4 more)

### Community 2 - "wealth/page.tsx"
Cohesion: 0.05
Nodes (54): AssetForm(), initialState, LiabilityForm(), AssetsPane(), BillsPane(), EntryRow(), FlowRow(), GoalsPane() (+46 more)

### Community 3 - "chat-thread.tsx"
Cohesion: 0.20
Nodes (16): ChatPage(), dynamic, ChatThread(), clockOf(), dayLabel(), REACTIONS, deleteMessageAction(), editMessageAction() (+8 more)

### Community 4 - "devDependencies"
Cohesion: 0.20
Nodes (10): devDependencies, eslint, eslint-config-next, @playwright/test, tailwindcss, @tailwindcss/postcss, @types/node, @types/react (+2 more)

### Community 5 - "actions/household.ts"
Cohesion: 0.12
Nodes (26): GenerateGroceryButton(), CategoryManager(), RecipeEditor(), ShoppingDayControl(), addMealFromRecipeAction(), addMealIngredientsToBuyAction(), addMealPlanAction(), addRecipeCategoryAction() (+18 more)

### Community 6 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 7 - "createClient"
Cohesion: 0.20
Nodes (30): submit(), disconnectCalendarAction(), addFamilyBackgroundAction(), removeFamilyAddressAction(), setActiveFamilyBackgroundAction(), updateMemberProfileAction(), addAssetAction(), addLiabilityAction() (+22 more)

### Community 8 - "getCurrentMember"
Cohesion: 0.05
Nodes (52): @anthropic-ai/sdk, POST(), systemPrompt(), GET(), GET(), NewDocPage(), NewHealthEntryPage(), DocumentsPane() (+44 more)

### Community 9 - "planner/page.tsx"
Cohesion: 0.07
Nodes (63): AgendaRow(), CALENDAR_VIEWS, calendarBase(), calendarHref(), CalendarPane(), CalendarView, concerns(), EmptyCalendar() (+55 more)

### Community 10 - "Kin — Family Operating System"
Cohesion: 0.17
Nodes (12): Next.js Agent Rules Block (AGENTS.md), Sandboxed Build Verification Gap, Google Drive OAuth Integration, Industry Blueprint Design System, Kin — Family Operating System, Managed Child Profiles (no login), Next.js 16 (App Router, TypeScript), React 19 (+4 more)

### Community 11 - "(app)/family/page.tsx"
Cohesion: 0.21
Nodes (10): ProfilePane(), Seg, SEGMENTS, ReinstateMemberButton(), RemoveMemberButton(), ChipRow(), Segmented(), reinstateMemberAction() (+2 more)

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
Nodes (64): BuyPane(), RoutinesPane(), Account, initialState, Member, REMINDERS, Template, TEMPLATES (+56 more)

### Community 18 - "household/page.tsx"
Cohesion: 0.05
Nodes (64): DishCard(), HouseholdPage(), MealsPane(), PriceBookSheet(), Seg, SEGMENT_LABEL, SEGMENTS, AddMealControl() (+56 more)

### Community 19 - "buy-list.tsx"
Cohesion: 0.21
Nodes (16): BuyGroup, BuyList(), ClearCheckedPanel(), finish(), EditItemRow(), save(), initialState, SOURCE_LABEL (+8 more)

### Community 20 - "money-actions.tsx"
Cohesion: 0.30
Nodes (12): AccountPrivacyToggle(), DeleteEntryButton(), DELETERS, GoalContributeControl(), LogSpendControl(), PayBillControl(), PendingEntryActions(), RemoveButton() (+4 more)

### Community 21 - "ActionState"
Cohesion: 0.25
Nodes (11): initialState, standing(), SubscribeScreen(), ActionState, redeemCodeForHouseholdAction(), perMonth(), pesos(), Plan (+3 more)

### Community 22 - "calendar-sync.ts"
Cohesion: 0.06
Nodes (59): @supabase/supabase-js, GET(), GET(), ActivityForm(), EditActivity, EditEvent, EditTrip, EventForm() (+51 more)

### Community 23 - "auth.ts"
Cohesion: 0.13
Nodes (17): ForgotPasswordForm(), initialState, CALLBACK_ERROR_MESSAGES, initialState, LoginForm(), PendingApprovalPage(), initialState, SignupPage() (+9 more)

### Community 24 - "wealth-controls.tsx"
Cohesion: 0.22
Nodes (11): AddAccountForm(), AddBillForm(), AllocationEditor(), initialState, SetBudgetControl(), SetTargetControl(), addAccountAction(), addBillAction() (+3 more)

### Community 25 - "settings-controls.tsx"
Cohesion: 0.15
Nodes (20): CopyInviteCode(), CalendarConnectedPanel(), DriveConnectedPanel(), HouseholdNameForm(), HouseholdPrefsForm(), InviteCodeCard(), NotificationToggles(), TextSizeControl() (+12 more)

### Community 26 - "actions/family.ts"
Cohesion: 0.10
Nodes (22): DeleteHouseholdButton(), FamilyAboutEditor(), emptyFields, FamilyAddress, FamilyAddressList(), remove(), save(), startEdit() (+14 more)

### Community 27 - "gallery-grid.tsx"
Cohesion: 0.22
Nodes (5): Failure, GalleryGrid(), deleteSelected(), MediaItem, GalleryTile()

### Community 28 - "family-fork-form.tsx"
Cohesion: 0.43
Nodes (4): FamilyForkForm(), initialState, createFamilyAction(), joinFamilyAction()

### Community 29 - "hub-header.tsx"
Cohesion: 0.17
Nodes (17): DocFolderPage(), EntriesPane(), GalleryPane(), MilestonesPane(), Seg, SEGMENTS, AccountPage(), MembersPage() (+9 more)

### Community 30 - "profile-fields.tsx"
Cohesion: 0.19
Nodes (8): ProfileEditForm(), save(), displayValue(), FieldGroup, FieldSpec, PROFILE_FIELD_GROUPS, ProfileFieldsEditor(), ProfileFieldsView()

### Community 31 - "reset-password-form.tsx"
Cohesion: 0.47
Nodes (4): ResetPasswordPage(), initialState, ResetPasswordForm(), updatePasswordAction()

### Community 32 - "react"
Cohesion: 0.12
Nodes (19): react, AddToCalendar(), destinations(), AssistantConsole(), SUGGESTIONS, Turn, DeleteButton(), DocFileRow() (+11 more)

### Community 33 - "smoke.spec.ts"
Cohesion: 0.40
Nodes (3): HUBS, THEMES, WIDTHS

### Community 34 - "household-price-controls.tsx"
Cohesion: 0.31
Nodes (12): AddPriceControl(), BuyItemPriceButton(), BuyItemPriceEditor(), PantryControls(), peso(), PriceRowControl(), useHouseholdAction(), removePantryItemAction() (+4 more)

### Community 35 - "add-child-form.tsx"
Cohesion: 0.60
Nodes (4): AddChildForm(), initialState, addChildWithLoginAction(), addManagedChildAction()

### Community 36 - "members/[id]/page.tsx"
Cohesion: 0.31
Nodes (6): MemberDetailPage(), Seg, SEGMENTS, memberToProfileFields(), buildBarSeries(), getMemberDetail()

### Community 38 - "family-background-album.tsx"
Cohesion: 0.32
Nodes (6): FamilyBackgroundAlbum(), AlbumPhotoLike, closeButtonStyle, navButtonStyle, overlayStyle, PhotoAlbumViewer()

### Community 39 - "meal-day.tsx"
Cohesion: 0.29
Nodes (11): AddIngredientRow(), IngredientAmountRow(), MealPhotoControl(), onPick(), useAct(), addMealIngredientAction(), removeMealIngredientAction(), removeRecipePhotoAction() (+3 more)

### Community 40 - "settings/page.tsx"
Cohesion: 0.27
Nodes (8): CALENDAR_ERROR_MESSAGES, DRIVE_ERROR_MESSAGES, SettingsPage(), DeleteAccountButton(), TransferOrganizerRole(), deleteOwnAccountAction(), transferOrganiserRoleAction(), initials()

### Community 41 - "google-drive.ts"
Cohesion: 0.11
Nodes (34): DELETE(), GET(), POST(), SessionRequest, JournalPage(), MigratePhotosButton(), deleteDocFileAction(), UploadedFile (+26 more)

### Community 43 - "End-to-end tests"
Cohesion: 0.29
Nodes (6): Adding to it, End-to-end tests, Running, What is covered, What is not covered, and why, What you need

### Community 44 - "dependencies"
Cohesion: 0.29
Nodes (7): dependencies, @anthropic-ai/sdk, next, react, react-dom, @supabase/ssr, @supabase/supabase-js

### Community 45 - "edits.spec.ts"
Cohesion: 0.53
Nodes (4): createRichActivity(), dayUrl(), fill(), rowFor()

### Community 49 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, e2e, e2e:ui, lint, start

### Community 51 - "form.tsx"
Cohesion: 0.14
Nodes (14): initialState, NewMealPage(), AccountEditForm(), initialState, AddGoalForm(), initialState, initialState, ProfilePage() (+6 more)

## Knowledge Gaps
- **213 isolated node(s):** `HUBS`, `WIDTHS`, `THEMES`, `eslintConfig`, `nextConfig` (+208 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 296 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `database.types.ts`, `profile.ts`, `wealth/page.tsx`, `chat-thread.tsx`, `actions/household.ts`, `getCurrentMember`, `planner/page.tsx`, `(app)/family/page.tsx`, `lib/routines.ts`, `household/page.tsx`, `buy-list.tsx`, `money-actions.tsx`, `ActionState`, `calendar-sync.ts`, `auth.ts`, `wealth-controls.tsx`, `settings-controls.tsx`, `actions/family.ts`, `family-fork-form.tsx`, `hub-header.tsx`, `reset-password-form.tsx`, `react`, `household-price-controls.tsx`, `add-child-form.tsx`, `members/[id]/page.tsx`, `meal-day.tsx`, `settings/page.tsx`, `google-drive.ts`?**
  _High betweenness centrality (0.204) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `database.types.ts`, `profile.ts`, `wealth/page.tsx`, `chat-thread.tsx`, `actions/household.ts`, `getCurrentMember`, `planner/page.tsx`, `(app)/family/page.tsx`, `package.json`, `lib/routines.ts`, `household/page.tsx`, `buy-list.tsx`, `money-actions.tsx`, `ActionState`, `calendar-sync.ts`, `auth.ts`, `wealth-controls.tsx`, `settings-controls.tsx`, `actions/family.ts`, `gallery-grid.tsx`, `family-fork-form.tsx`, `hub-header.tsx`, `profile-fields.tsx`, `reset-password-form.tsx`, `household-price-controls.tsx`, `add-child-form.tsx`, `family-background-album.tsx`, `meal-day.tsx`, `settings/page.tsx`, `form.tsx`?**
  _High betweenness centrality (0.193) - this node is a cross-community bridge._
- **Why does `getCurrentMember` connect `getCurrentMember` to `wealth/page.tsx`, `chat-thread.tsx`, `members/[id]/page.tsx`, `createClient`, `settings/page.tsx`, `google-drive.ts`, `planner/page.tsx`, `(app)/family/page.tsx`, `household/page.tsx`, `calendar-sync.ts`, `auth.ts`, `hub-header.tsx`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **What connects `HUBS`, `WIDTHS`, `THEMES` to the rest of the system?**
  _213 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `database.types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0547945205479452 - nodes in this community are weakly interconnected._
- **Should `wealth/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05480769230769231 - nodes in this community are weakly interconnected._
- **Should `actions/household.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1206896551724138 - nodes in this community are weakly interconnected._