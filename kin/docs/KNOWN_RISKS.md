# Known risks

Things found while bug-hunting that are **not** demonstrated bugs, and were
therefore deliberately not fixed. Each was looked into far enough to say what
would have to be true for it to bite, and measured where measuring was
possible. They are here so the next person does not spend the afternoon
rediscovering them.

Nothing in this file is a feature request. `docs/FUTURE_FEATURES.md` is the
place for those.

---

## Signing up: five bugs closed, and the one that needs a migration — 9 September

Onboarding had never had a bug-hunt pass. It is the only path in the app that
runs before there is a member row, so almost nothing it does is covered by the
policies and helpers the rest of the code leans on. Five things found and
fixed; one left, because closing it properly needs a migration.

**Fixed.**

- **An access code was spent on a household that was never created.**
  `redeem_household_code` increments `used_count` and returns; `create_family`
  is a separate statement that refuses anyone who already has a member row. In
  that order, walking back into step 4 from inside a household burned a use of
  a beta code and got an error for it. Codes are finite and issued by hand.
  `createFamilyAction` now checks membership before the code is looked at,
  pinned by a browser test that fails if the two are put back in the old order.
- **Name, date of birth and mobile travelled in the URL.** `saveProfile`
  redirected to `/onboarding/family?full_name=…&dob=…&mobile=…`, which put all
  three in the address bar, in browser history, and in the `Referer` header of
  anything that page went on to fetch. They now ride in an httpOnly cookie
  scoped to `/onboarding`, cleared the moment the member row exists.
- **Step 4 was a dead end when reached directly.** Its name field is hidden --
  it comes from step 3 -- so a bookmark or a back button rendered the form with
  an empty one, and pressing CREATE HOUSEHOLD answered "your name is required"
  while pointing at no field that asks for a name. Nothing on the page could
  clear it. It now sends you back one step.
- **"That invite code didn't match a household" was said to people whose code
  was fine.** `join_family` raises three distinct things and `joinFamilyAction`
  reported all of them as a bad code -- including "already a member of a
  family", which is nothing to do with the code and cannot be fixed by
  re-typing it.
- **Onboarding stored text of any length, and a birthday of any date.** It was
  the one path with no clamps: every other form in the app has them. And a
  birthday in the future ran through `formatAge`'s `Math.max(months, 0)` and
  rendered as "0 months", so a member born in 2035 appeared in the list as a
  newborn with nothing anywhere to say the date was impossible.
  `birthdayProblem` now refuses a future date, a year before 1900 (the short
  four-digit-year typo, 0219 for 2019), and anything that is not a real date.

**Left, and why.** Redemption and creation are still two statements, so a
failure between them still spends a code with nothing to show. The membership
check closes the case that actually happens, and the action now says plainly
that the code was counted and logs it -- but the only real fix is one RPC that
redeems and creates in a single transaction, which is a migration, which is
Jonathan's. Worth doing before the beta codes go out more widely.

**Not covered by any test, and honestly cannot be from here.** Everything
above is verified against an account that is *already* in a household --
arriving at step 4 cold, the membership guard, the URL, the redirect. The
path a genuinely new person takes (sign up, confirm an email, redeem a real
code, create a household) is not, because walking it means creating an auth
user and a family, and there is no service-role key in a session that follows
CLAUDE.md. The RPCs it calls are covered by their own constraints; the
sequence is not.

---

## Writes whose error was never captured — CLOSED 8 September, 67 of 67

`src/lib/actions/*.ts` and `src/lib/*.ts` contained 67 writes of the shape

    await supabase.from("x").update({ ... }).eq("id", id);

with no `const { error }`. If the write was refused — by RLS, by a constraint,
by the network — the action carried on and reported success. **There are none
left.**

They were not one problem. Sorted by what a silent failure actually cost:

**Lost something.** Delete-then-insert, five times over (activity members,
event members, trip travellers, routine members, recipe ingredients): only the
delete is certain, so a refused insert left the record marked for *nobody* —
indistinguishable from a save that worked. A photo uploaded, stored and
attached to nothing. A bill left unpaid after paying it, or paid after
deleting the payment. A meal's ingredients, so the grocery list was built
without them.

**Destroyed something.** The Drive photo migration copied a file to Drive,
updated the row to point at Drive, then deleted the original from storage — in
that order, with the middle step's error discarded. A failed update meant the
row still pointed at storage, the original was deleted, and the Drive copy was
unreferenced: **a family photo reachable by nobody.** The original is now kept
whenever the record does not follow, and the household is told which.

**Made a duplicate, forever.** A Google event created but not linked would
never be updated or removed, and the next *pull* read it as somebody's own
event and made an activity from it — every sync. Same shape in Drive: a folder
created but not recorded means another folder of the same name next run.

**Reported success while failing.** `syncGoogleCalendarAction` returned
`error: null` even when the backfill threw or a whole member's calendar could
not be read — and both UIs already rendered `result.error`. **ADD TO
JOURNAL**, **SET BUDGET**/**SET TARGET** and **GENERATE GROCERY LIST** each
called their action and ignored what came back; the grocery button navigated
to the shopping list either way, so a list that failed to write looked exactly
like a week with nothing planned.

**Saved a preference that did not save.** Theme set a cookie whether or not
the row wrote, so it appeared to change here and reverted on the member's other
devices. Text size and notification switches the same. This is the shape of the
bug that started all of it: `week_start` and `date_format` saved cleanly, said
so, and changed nothing.

**Leaked a file, or a login.** Storage `remove()` calls left orphans; the
compensating `deleteUser` after a failed child creation left an address
claimed by a login belonging to nobody, so a second attempt with the same
address would fail.

Three are deliberately logged rather than shown, each for a stated reason:
`apply_code_grant_to_family` (the household already exists, so an error would
strand a new member on a signup form), `resetPasswordForEmail` (answering
differently would tell a stranger which addresses have accounts), and the
sign-out after a password reset (they have just proved who they are and are on
their way in). All three are the kind of failure that must not be invisible to
*us*, which is what the logs are for.

---

## Reads whose failure looked exactly like "there is nothing there" — 9 September

The write sweep asked "was the error captured". This is the same question of
the reads, and it only matters where the answer is *acted on*: a page that
renders an empty list is a bad afternoon, but a read whose empty answer makes
the code delete or create something is a different thing entirely.

Counted 9 September: 47 reads in `src/lib` drop their error, 39 of them
outside `queries/`, and 17 sit within eighteen lines of a write. Every one of
the 17 was read. Most guard with `if (!row) return { error: "Not found." }`,
which says the wrong thing on a failed read and does nothing wrong; two more
fail closed, which is the right direction (a chat mention is dropped, the
assistant says it cannot find the account). **Two were acted on and wrong,
and both are fixed** — plus five more in the calendar file that were
misleading rather than harmful, tightened while I was in there.

**A calendar item could quietly leave every phone in the house.**
`syncRowToCalendars` asked which members have a connected calendar, and a
failed read came back as an empty list. Empty does not mean "do nothing"
there: it means "nobody should have this any more", so the second half of the
function deleted the event from every calendar that already had it and cleared
the links. The row stayed in Kin looking perfectly fine. `resolveTargetMemberIds`
now returns `string[] | null`, and null — "I could not tell" — leaves the
calendars alone.

Three more in the same file, each stated in a comment where it sits:
`removeRowFromCalendars` used to clear the link rows after a failed read that
had deleted nothing from Google, which orphans the events for good and gets
them re-imported as new activities on the next pull; `applyIncomingEvent` read
a failed link lookup as "not linked yet" and went down the create path; and
`syncGoogleCalendarAction` reported "No one in the household has connected
Google Calendar yet" for a read that had simply failed.

**A budget category could end up in the list twice, and then keep growing.**
`setAllocationAction` reads whether the category already has a row, then
updates it or inserts one. A failed read inserted. Worse, `.maybeSingle()`
*also* errors when there is more than one row — so once two existed, every
save added another, and the Wealth page drew the category once per row, each
copy claiming the whole month's spend.

The error is now surfaced and nothing is written. But the underlying hole is
that `budget_allocations` has no uniqueness on `(budget_period_id, category)`,
where every sibling table has one — so two people setting a budget in the same
minute is enough on its own, with nothing failing at all. Only the database
can close that: `migrations/2026-09-09-one-budget-line-per-category.sql`,
**APPLIED** 9 September after its own read-only step 1 came back empty for a
second time. With the constraint in place `setAllocationAction` became a
single upsert naming it — no read, no window, no branch — which is what the
migration file said it would allow. Verified against the live constraint:
two upserts of the same category returned 201 then 200 and left one row
holding the later amount.

**Left alone, with reasons.** Four reads of `calendar_links.calendar_id` fall
back to `"primary"` when the read fails. Nothing in the app ever writes a
different value — checked — so the fallback is the same answer the row holds.
It would become a wrong-calendar bug the day a calendar picker is added, and
that is the day to change it. `deleteHouseholdAction`'s storage sweep is
explicitly best-effort and logs what it leaves; a failed *list* there leaks
files after a household is deleted, which is worth knowing and is not worth
holding the deletion for. The two recipe-photo reads are the same shape at a
smaller size — the row is right either way and the file it replaced is left in
the bucket — so they now say so in the log rather than being fixed, because
there is nothing to fix: you cannot delete a path you could not read. And the several `if (!row) return "Not found."`
sites say the wrong thing on a failed read without doing the wrong thing.

**Not covered by a test.** None of this is reachable from the suite: making
PostgREST fail on demand is not something the app can be asked to do from the
outside, and the branches are error handling rather than logic. They are
verified by reading, by the type checker (the `string[] | null` return makes
the caller handle it), and by the full suite for regression — not by
exercising the failure itself. Said plainly because a green run does not mean
these paths work.

---

## "Parents only" meant "whoever set the household up" — CLOSED 9 September

`joinFamilyAction` hard-codes `p_role: "adult"`. Every member who has ever
joined by invite code is therefore an `adult`, and the only `parent` in a
household is the person who created it. Six row-level policies —
`health_conditions`, `health_condition_entries`, `health_labs`,
`health_vitals`, `doc_entries`, `doc_files` — grant a `parents`-visibility row
to `current_member_role() = 'parent'` and nobody else.

Put together, the "Parents only" option in the health and document forms means
"visible to whoever set this household up". In the Singian household that is
Jonathan; Janine and Erynne are both `adult`, and Janine is a parent of the
children by every measure except this column.

**What it did.** Measured 9 September against the throwaway household, as a
member whose role is `adult`:

| what was sent | result |
| --- | --- |
| `visibility: 'family'`, asking for the row back | **201**, saved |
| `visibility: 'parents'`, asking for the row back | **403**, nothing saved |
| `visibility: 'parents'`, not asking for it back | **201**, saved |

The middle row is what the app does — every create is
`.insert(...).select().single()`, which is `Prefer: return=representation`.
The insert is allowed; it is the RETURNING that the SELECT policy refuses, and
a blocked RETURNING aborts the statement. So the row rolls back, and the
person sees `new row violates row-level security policy for table
"health_conditions"` and loses what they typed.

Worth stating precisely, because I first assumed otherwise and it was wrong:
**nothing is orphaned.** The rollback is complete. This costs the entry and
the explanation, not the database's integrity.

**Fixed, and it is the half that needed no decision.** `lib/visibility.ts`
filters "Parents only" out of the menu for anyone who is not a `parent`, and
translates the policy's own words if a `parents` value arrives from somewhere
the menu does not control — an old tab, a replay, the assistant. Six tests in
`e2e/visibility.logic.spec.ts`, checked negatively: disabling the filter fails
two of them.

**The role model itself**, which was the deeper half. Three consequences, all
the same root:

1. **"Parents only" is unusable by anyone but the household's creator.** The
   option is now hidden rather than broken, which is better and still not
   right — Janine cannot file a private health note for the children, and
   cannot read one Jonathan files.
2. **An adult can add a managed child and then cannot edit it.**
   `add_managed_child` allows a parent *or* an adult (and `family/page.tsx`
   offers the button on the same test), but the `members` UPDATE policy for
   managed rows requires `current_member_role() = 'parent'`. So the app hands
   an adult a child profile they are locked out of. This one is a genuine
   inconsistency between two rules rather than a matter of taste.
3. **Drive settings need parent *and* organiser.** `drive_links` UPDATE. Not
   obviously wrong, listed for completeness.

**Both are now resolved, 9 September, as Jonathan chose.**

1. **The organizer can set a member's role.** `setMemberRoleAction`, offered
   only to the organizer, never on their own row, never on a managed child —
   the three conditions the database enforces anyway, so it is not offered
   where it could only fail. That is the lesson of this entry applied to its
   own fix. No migration: `members_update_by_organiser` already permitted the
   write, and `members_guard_self_update` already refused the two cases that
   should be refused.

   **Where it lives changed the same day, on Jonathan's feedback.** It began
   as a MAKE PARENT / MAKE ADULT button on every row of the family list, and
   he was right that this was wrong twice over: the decision is made about
   once per person, and the list is the one place everybody looks every day.
   A standing button for a rare action is clutter, and clutter beside Remove
   is worse than clutter. It now sits on the member's own page beside
   Relationship, in the same view-then-edit shape. The family row already
   links there, so the role stays plain text on the list and tapping the
   person is how you reach it — rather than a second, smaller tap target
   hidden inside a link.

   **And it is now asked at the right moment.** Approving a pending member
   offers Adult or Parent, defaulting to Adult. `joinFamilyAction` hard-codes
   `p_role: "adult"` and has to: somebody joining cannot be the one who
   decides whether they count as a parent, or the setting would mean nothing.
   So the decision belongs to whoever lets them in, at the moment they are
   already looking at them. Without that, every member stays an adult until
   somebody notices.

   **What "until somebody notices" looked like here.** Erynne — born
   2022-08-28, four years old — joined by invite code and therefore holds an
   `adult` role with an active login, which is every adult permission in the
   app including the money pages. That is household data rather than a code
   defect, and it is Jonathan's to correct; it is recorded because it is
   precisely the outcome the approval step above exists to prevent, and
   because it went unnoticed for as long as there was no way to see or change
   a role from inside the app.
2. **An adult may edit a managed child.**
   `migrations/2026-09-09-an-adult-may-edit-the-child-they-added.sql`,
   applied. The edit rule now matches the add rule, which allowed a parent or
   an adult all along. Measured after: as an `adult`, editing a managed
   child's details returned 204, and granting that child privileges still
   returned "not allowed to change privileges on a managed profile".
3. Drive settings still need parent *and* organiser. Left as it was.

**One thing not exercised, and worth knowing.** The successful promotion path
has not been run end to end. The toggle only appears for a member with a
login, and the throwaway household has exactly one; `members.auth_user_id` has
a foreign key to `auth.users`, so a second cannot be faked, and creating a
real one would leave an auth user behind that no key available here can
delete. What *was* measured is every refusal — a managed child, and a
self-change, both rejected by the trigger — and the policy that permits the
write reads plainly. The first real promotion will exercise it, and if the
database refuses, the action shows what it said rather than failing quietly.

---

## A transfer could take money out and put it nowhere — FIXED 9 September

`transferAction` wrote its two legs as two separate inserts in a loop, and
returned on the first error:

```ts
for (const leg of legs) {
  const { error } = await insertEntry(...);
  if (error) return { error: error.message };
}
```

The first leg is the one that takes the money **out**. If the second failed,
the household was down by the amount, it had arrived nowhere, and the person
was shown an error — so the natural next move is to do it again, and now it
has gone out twice.

**This needed no failure of any kind to happen.** Two policies disagree:

| | visible when |
| --- | --- |
| `accounts` | joint **or** mine **or NOT `is_private`** |
| `wealth_transactions` | joint **or** mine |

There is no `is_private` clause in the second. So a member's own account, once
they share it with the household, appears in everybody's transfer list and
refuses every transaction anybody else writes into it — the insert is allowed,
the RETURNING is refused, and a refused RETURNING aborts the statement.

**Measured 9 September** in the throwaway household, transferring into exactly
such an account:

| what was sent | result |
| --- | --- |
| two inserts, each asking for its row back | **201 then 403 — ₱5,000 left the joint account and landed nowhere** |
| one insert with both legs, asking for the rows back | 403, nothing written |
| one insert with both legs, not asking for them back | **201, both legs present** |

**Fixed** by the third line: both legs go in one statement, so Postgres commits
both or neither, and the rows are not read back because reading them is what
failed and nothing used them. The refusal for a *single* entry into someone
else's shared account stands — it writes nothing, which is the safe direction —
but now says so in words (`explainLedgerRefusal`), rather than quoting a policy.

**Not currently biting.** `accounts.is_private` defaults to **true**, and every
account in both households today is either joint or private, so nothing is in
the gap. It is one deliberate "share this account" toggle away, which is a
thing a household is meant to do.

**And the rule underneath is fixed too, 9 September**, as Jonathan chose:
`migrations/2026-09-09-a-shared-account-shares-its-ledger.sql` adds the same
`NOT is_private` clause to `wealth_transactions` that `accounts` already had.
Sharing an account now means sharing the entries that made its balance, which
is what somebody reading a shared account is actually asking. Measured after,
as a member who is not the owner: the shared account's entry is visible; a
private account and its ₱9,999 entry are both still invisible. Nobody's
private account changed, and writing was never restricted in the first place.

That also removes the cause rather than the symptom: the transfer above failed
*because* of this mismatch. Both halves are now closed.

**And it was quietly showing a wrong number.** `loadAccounts` computes
`balance = opening_balance + sum(transactions)` from the rows the query
returns, and those rows are filtered by the policy. So a shared account
displayed to anyone but its owner had a balance of its *opening balance
alone* — every movement since was invisible and therefore uncounted — with
nothing to say the figure was partial. Nobody has seen that, because no
shared account exists yet; it would have appeared the first time somebody
used the toggle. Reading the code rather than reproducing it: the sum is
built only from what the query returned, and what it returned was
policy-filtered.

**Also fixed:** `addBillAction` checked `!amount`, which is false for -500, so
a negative bill was accepted where every other money path requires `> 0`. It
now makes the same check as the other five. A negative bill subtracts from what
the household owes and reads as money it is owed.

---

## What a person actually saw when something failed — CLOSED 9 September

Swept because the app is going online and this is the class that produces bad
reviews without anything being broken.

**110 places handed the member whatever Postgres said.** Measured on
9 September against the throwaway household. Adding a recipe the family
already had:

    duplicate key value violates unique constraint "family_recipes_family_id_base_key_key"

Leaving a required field blank:

    null value in column "name" of relation "family_recipes" violates not-null constraint

Both true, both useless, and both read as a broken app rather than as the app
telling you something.

**Fixed** by `lib/db-errors.ts`, applied at 106 of them (the four in `auth.ts`
were left alone — Supabase's auth messages are already written for people).
Two rules keep the cure from being worse than the disease:

- **Only recognised messages are rewritten.** Everything else is returned word
  for word, because a failure nobody has thought about is more useful whole
  than guessed at. A deadlock, a statement timeout, a network error all reach
  the member unchanged. This is the property the tests defend hardest —
  breaking it deliberately fails the suite.
- **The original is logged every time one is rewritten.** This week was spent
  making failures speak up; muffling them in the name of politeness would
  undo it.

## The assistant could put an appointment on a day nobody asked for — CLOSED 9 September

The Today assistant takes what somebody typed and hands a tool a date and a
time, both written by a language model. Three places then built an instant by
hand:

    new Date(`${date}T${time}`).toISOString()

Measured, 9 September:

| given | result |
| --- | --- |
| `"2026-09-15"` + `"25:00"` | RangeError thrown |
| `"next Tuesday"` + `"19:00"` | RangeError thrown |
| `"2026-09-15"` + `"evening"` | RangeError thrown |
| **`"2026-09-31"` + `"19:00"`** | **1 October — silently, no error** |

**The throws were already contained**, and honestly: `api/assistant/route.ts`
wraps every tool call and answered "That didn't go through. Nothing was
saved", which was true — the throw happened while building the row, before any
insert. What it did not do was say *why*, so the member and the model both
retried the same phrasing and failed the same way.

**The last row is the real bug.** Somebody asks for the 31st of a thirty-day
month — which people do — and the appointment is made on a different day than
the one they said, with nothing anywhere to say so. The all-day path had been
guarded against exactly this since 8 September; the timed path went around it.

**Fixed** by `familyInstant(day, time)` in `lib/time.ts`, beside
`familyMidnight` and built the same way: validate both halves, refuse anything
that is not exactly what it claims, and state the household's zone rather than
inheriting whatever `TZ` the process runs under. The three call sites now
answer "I could not read that as a date and time — give me YYYY-MM-DD and
HH:MM", which the model can act on. An end time before its start is refused
too. Eight tests in `e2e/time.logic.spec.ts`, checked negatively: restoring
the naive construction fails four of them.

---

## One pasted word made every screen scroll sideways — CLOSED 9 September

The kind of thing that costs an app its rating without anything being broken.

People paste: a tracking link into a bill's name, a run-on word into an
activity title. Nothing in the app stops them — **203 text columns with no
length limit, and 172 inputs with no `maxLength` between them** (counted, not
estimated). The database stores it happily. The question is what the page then
does.

**Measured 9 September**, one 318-character unbroken title, on a 390px-wide
phone viewport:

| | |
| --- | --- |
| Planner, before | **2,057px of horizontal scroll** |
| Planner, after | 0 |

`overflow-wrap: anywhere` was set on chat bubbles and nowhere else, and the
Today brief truncates its own two lines; every other surface was unprotected.
One long word therefore made the *whole page* scroll sideways — not just the
row holding it — which reads as a broken app on every screen it touches.

**Fixed** with that rule on `body`. `anywhere` rather than `break-word` on
purpose: only `anywhere` lets a flex or grid item shrink below the width of
the long word, which is the half that actually stops the blowout. Both break a
word only when it would otherwise overflow, so ordinary text is untouched.

`e2e/long-text.spec.ts` pins it by measuring `scrollWidth - clientWidth` on a
phone viewport, which fails at 2,057 without the rule.

**Length limits — DONE, 9 September, and not by me.** Janine picked this up
from this file and merged it the same day: `lib/text.ts` `clamp` applied
server-side across family, planner, household, profile and routines, plus
`maxLength` on the inputs. Her reasoning is the right one and worth keeping:
a `maxLength` on an input is cosmetic, because these are Server Actions and
reachable with a string of any length regardless of what the form allows.

She covered documents and health in a second pull request while this was
being written, and we collided on both — same fields, slightly different
limits. Resolved in main's favour, per CLAUDE.md: hers had landed, and
arguing over a few characters of allowance is churn. What was left after that
is journal and wealth, the two files neither pass had reached: 16 more fields
clamped to her conventions (titles and names 150, a short note 300, longer
notes 1000, a location 200, a URL 500).

**A note on how this file's own tests behaved.** The first cleanup for that
spec clicked through the UI inside a `try/catch`, and left its row behind
while the test went green — a cleanup that silently did nothing, which is the
exact shape of bug this week was spent removing, written by the person
removing them. Measured, caught, replaced with a direct delete that asserts
the row is gone.

---

## A debt entered as -500 added to the household's net worth — CLOSED 9 September

Found by asking what an ordinary mistake does rather than what an attack does.

`addAssetAction` and `addLiabilityAction` checked the name and nothing else.
`updateAssetValueAction` and `updateLiabilityBalanceAction` took a number
straight from the client and wrote it. Every other money path in the file
already required `> 0`; these four required nothing at all.

The consequence is not an error message, it is arithmetic:

- an **asset** worth −500 subtracts from what the household owns
- a **liability** of −500 *adds* to its net worth

The second is the one somebody actually types. "Balance" reads as "what I
owe", so a person reaches for the minus key to say they owe it — and the app
records the opposite of what they meant, in the figure the whole Wealth page
is built on, with no error and nothing to notice.

`Number("abc")` is `NaN` and `Number("")` is `0`, neither of which was checked
either.

**Fixed** with `moneyFromForm`, which refuses anything that is not a finite
number of at least zero, at all four sites. Zero is allowed: an asset fallen
to nothing and a debt just cleared are both real things to record. `min="0"`
added to the seven inputs where a negative is genuinely wrong.

**`opening_balance` deliberately keeps no minimum.** An overdraft or a credit
card starts below zero, and that is a real account, not a typo.

---

## Every stored date rendered a day early west of UTC — CLOSED 9 September

`formatDate` did this:

```ts
const d = new Date("2018-09-06");   // UTC midnight
const dd = String(d.getDate());     // LOCAL
```

A plain date parsed as an instant in one zone and read back in another. The
server sits in Asia/Manila; a browser in the Americas is hours behind, so the
same stored date renders on the day before. Measured 9 September on a
member's date of birth:

| | |
| --- | --- |
| server | 06/09/2018 |
| browser | 07/09/2018 |

React reports that as a hydration mismatch. A person reads it as the wrong
birthday — and it is every date shown through that function, on every profile,
for anybody whose browser is not in the household's zone.

**How it was found is the point.** Not by reading: by adding the member
profile page's first test, which watched for page errors and caught the
mismatch immediately. The page had no coverage of any kind, and had been
edited three times that day on nothing but a careful read.

**And the lesson was already written down.** `spellDate`, four functions below
in the same file, parses the string rather than trusting `Date`, with a
comment about "the same trap that walked the planner's times back eight
hours". The knowledge existed and did not stop the bug, which is the argument
for the six tests now pinning it.

**Fixed** by reading the digits out of a plain `YYYY-MM-DD` and never
constructing a Date at all. A real timestamp still goes through the local
getters, because showing an appointment in the reader's own zone is the point
— that distinction is what the fix rests on. `formatAge` had the same shape
and now does its arithmetic entirely in UTC.

Checked negatively with the process in `America/New_York`: restoring the old
line fails three of the six.

---

## The test household had filled up with 612 leftover rows — CLEARED 9 September

Not a defect in the app, and worth recording anyway because it hid one.

Every write spec stamps its rows with a per-run prefix and leaves them behind.
Over days of runs the throwaway household reached **113 goals totalling
₱14,596,000**, 177 activities, 114 routines and so on — 612 rows of debris
around a fixture set of about twenty.

It surfaced while writing the contribute test: the Goals page had grown so
long that finding one card in it was the hard part, and the first version of
that test failed for reasons that had nothing to do with contributing. A
household nobody can read is a household nobody checks by looking.

**Cleared**: 612 rows, matched on the `E2E-` run prefix so the seeded
fixtures — `E2E New roof`, `Emergency fund` and the rest, which have no
hyphen and which tests depend on — were left alone. The full suite was re-run
afterwards and passes at 165, which is the only proof that nothing needed was
deleted.

**Not fixed: the specs still leave their rows.** Two now tidy up after
themselves and assert that they did (`long-text`, `goal-contribute`), which is
the pattern the rest could follow. Doing that to every write spec is a change
of its own, and until then this will fill up again — a note here beats a
surprise in a month.

---

## goals.current_amount is stored, not derived — CLOSED 8 September

*Kept for the reconciliation query at the foot, which is still the way to
check this, and because the shape of the bug is worth remembering.*

Account balances are computed on every read as
`opening_balance + sum(transactions)`, so a missed write self-corrects.
Savings goals were the opposite: `current_amount` was a running total mutated
by `+delta` at two sites and never reconciled against the ledger.

Two consequences, both now gone:

- **Lost update.** Both sites read the total, added to it, and wrote it back.
  Two people confirming a contribution to the same goal at the same moment
  each wrote `read + their own delta`, and one contribution vanished.
- **Double count.** Not a race at all, and so the likelier of the two:
  `confirmTransactionAction` never checked whether the entry was already
  confirmed, so a second click credited the goal again for one movement of
  money.

**Fixed** by `recalc_goal_total` (migration
`2026-09-08-goal-totals-from-the-ledger.sql`), which recomputes from the
ledger under a row lock taken before the sum is read. It writes a
destination rather than a distance, so the double count is impossible rather
than guarded against, and drift already in a row corrects itself the next
time anything touches that goal. `e2e/goal-totals.spec.ts` pins it.

**Now covered, 9 September.** `e2e/goal-contribute.spec.ts` drives the buttons
a person actually presses — add a goal, open its card, put money in — and then
checks the stored total against the ledger behind it. The type checker cannot
see a form posting the wrong field, a control wired to the wrong goal, or a
total read from somewhere other than the ledger; that is what this covers.

**Measured, 8 September.** Before: every goal in both households reconciled
except one — "Emergency fund", ₱210,000 against no transactions, in the
throwaway QA household, seeded by hand when the fixture was built. The
function corrected it on its first call. After: nothing in either household
differs from its ledger.

The reconciliation query is worth keeping:

```sql
select g.title, g.current_amount as stored,
       coalesce(sum(case when t.direction = 'out' then t.amount else -t.amount end), 0) as from_ledger
from public.goals g
left join public.wealth_transactions t on t.goal_id = g.id and t.status = 'confirmed'
group by g.id, g.title, g.current_amount
having g.current_amount <> coalesce(sum(case when t.direction = 'out' then t.amount else -t.amount end), 0);
```

Empty is correct.

---

## wealth_targets was writable by the whole household — CLOSED 8 September

`wealth_targets` was private to read (`member_id = current_member_id()`) and
open to write: both write policies checked only the family. Any member could
set or overwrite any other member's revenue target — and because the read
policy is the strict one, could not then see what they had done, while the
person whose target it is had no way to tell where the number came from.

Reproduced against the throwaway household: `POST` of another member's target
returned **201**. Row confirmed as theirs, then removed. The Singian household
was never touched.

**Closed on both sides.** `setWealthTargetAction` takes the member and the
household from the session rather than from its arguments (as do
`setJointBudgetAction` and `toggleOmronAction`), and
`migrations/2026-09-08-a-target-is-your-own.sql` is **applied**: all four verbs
now name `member_id`. Verified by re-running the reproduction both ways —
another member's target `403` where it was `201`, own target still `201`,
another member's row not deletable with the row confirmed surviving, own row
still deletable.

**The DELETE policy was missed on the first pass** and applied in a second
run. Four policies were on the table, three were considered. That is the kind
of gap that survives a fix precisely because the fix looks like it covered the
area, and it is written into the migration file rather than tidied away.

**A note worth keeping.** The first probe returned 403 and nearly had this
recorded as safe. That request carried `Prefer: return=representation`, and the
SELECT policy refuses to hand back another member's row — so the insert had
succeeded and the *read-back* failed, with an error naming the insert. A
refusal on a write that asks for its row back may be the read being refused.

---

## Native time inputs still render in the browser's locale — left alone

The date half of this was fixed on 8 September: every `type="date"` input now
writes the date out beneath itself, spelled, because a native picker draws
itself in the *browser's* locale and the page cannot say otherwise. Chrome set
to US shows `2026-09-07` as `09/07/2026`, which reads here as 9 July.

The four `type="time"` inputs were deliberately not touched. `08:30 PM` is
already unambiguous — there is no digit order to misread — so an echo would
be clutter buying nothing. It does mean the Planner list says `20:30` while
its edit form says `08:30 PM`, which is an inconsistency rather than a
hazard.

Replacing the native pickers outright was considered and rejected: on a phone
they are much better than anything we would build, and they are what the
household already knows.

---

## Another member's target read as zero — FIXED 8 September

The Wealth hub rendered `EARNED OF TARGET` against `${whosePossessive} target
this month` when viewing someone else's pane. But `wealth_targets` is private
by row-level policy — deliberately, and tightened further this morning — so
that number always read back as **0**. The page was stating a figure it had
never been allowed to see, and calling it theirs.

Fixed without touching the policy, because the policy is right: viewing
somebody else now shows `EARNED THIS MONTH` with no cap and the note "their
target is theirs to see". `Meter` takes `cap: number | null`, where null means
there is no target to measure against — not a target of nothing.

---

## A failed calendar sync used to lose the change for good — FIXED 8 September

Recorded because the shape is worth remembering: this looked like seventeen
dropped errors and was really one design fault.

`pullMemberCalendar` applied each change Google reported, discarding whatever
went wrong, and then saved the new sync token **unconditionally**. A Google
sync token means *"you have seen everything up to here"* — so a change that
failed to write into Kin was never sent again. Not delayed: gone. Something a
family member did on their phone would simply never arrive, and nothing
anywhere would say so.

**What changed**

- `applyIncomingEvent` reports failure instead of swallowing it; all 17 writes
  in the file capture their error.
- The token is only advanced when nothing in the batch is still being retried
  (`syncLinkPatch`, pure and tested).
- The create path undoes a half-made activity, since a failure now guarantees a
  retry and the retry must not find no link and make a second copy.
- Two orphan paths closed: a Google event created but not linked is deleted
  again (unlinked it would never be updated or removed, and the next *pull*
  would read it as somebody's own event and make a duplicate activity from it,
  every sync); a link that could not be cleared is logged.
- `syncGoogleCalendarAction` returns a real error. It used to return
  `error: null` even when the backfill threw or a whole member's calendar
  failed to read — and both UIs already rendered `result.error`.

**The cost that came with it, and what removes it.** An event that can *never*
apply would hold the token still for good, blocking every later change from
that member. `QUARANTINE_AFTER = 3` sets such an event aside: three separate
syncs is not a passing fault, and anything that survives them is structural.
The attempt count lives in `calendar_sync_failures`
(`migrations/2026-09-08-quarantine-unappliable-calendar-events.sql`), and the
count of set-aside items is reported to whoever pressed Sync now.

**The migration is APPLIED**, 9 September, on Jonathan's instruction:
`calendar_sync_failures` exists, row-level security is on, two policies. So the
attempt count is now kept and an event that fails three times is set aside, as
designed. Before it ran, every failure read as a first attempt and the token
was held indefinitely — safe, but not self-clearing.

**Nothing has ever been observed failing.** This was built ahead of the problem
because it was asked for, not because anything is broken.

---

## The Planner asked the browser what day it is — FIXED 8 September

Kept because of *how* it was found, which is the useful part.

`calendar-nav` and `routine-controls` are client components and read `new
Date()` for "today". The server renders in `Asia/Manila`. Whenever the two
zones are on different dates — every day from 16:00 UTC — React reported a
hydration mismatch on `/planner`, and `TodayButton` rendered a different
`href` from the one the server sent. `routine-controls` had it too: "N days
behind" changed depending on where the person reading it was.

It never showed for the Singian household, whose browsers sit in Manila
alongside the server. It showed for anyone travelling, anyone whose device is
on another zone, and the test container for eight hours a day.

**Fixed** with `familyDay()` — pure `Intl` with an explicit zone, so it works
in a browser exactly as on the server — and `daysBetween`, which counts days
from two plain dates and consults no clock at all.

**The suite was catching it by accident.** It only noticed because the
container happened to be in UTC, so the same code passed all morning and
failed all evening; a green run said nothing about whether this class held.
The chromium project now pins `timezoneId: "America/New_York"` — a zone that
never agrees with the household — so hydration mismatches fail on every run
rather than by the clock. Pinning it immediately caught the same bug inside a
test: `preferences.spec` computed "today" from the browser to check
`date_format`, and so compared the server's 9th against the browser's 8th and
called the app wrong.

**A standing skip worth knowing about.** The two `date_format` tests skip
themselves when the day and the month are the same number — on 09/09, `08/09`
and `09/08` are one string and the test cannot tell right from wrong. It says
so and stands down rather than passing for the wrong reason, so a run on those
days reports 2 skipped and that is correct.

---

## The Google Calendar paths: covered in part, and where the line is

*Was: "exercised by nothing." That is no longer true, but what is now covered
is worth stating precisely, because the gap that remains is the interesting
one.*

**Covered, 8 September** — 24 tests in `e2e/*.logic.spec.ts`, no browser, no
server, ~1 second:

- what we send: all-day dates and Google's exclusive end, multi-day trips,
  timed events and the one-hour default, reminders (an absent one must not
  override the member's own defaults), recurrence
- what we make of the reply: an all-day date kept whatever zone the process is
  in, an early-morning event filed on the household's day rather than UTC's,
  malformed dates refused
- the requests themselves, against a stubbed `fetch`: URL and method, the
  bearer token, calendar ids escaped, "already gone" (404/410) counting as
  deleted, pagination, an expired sync token handled rather than thrown

**Not covered, and cannot be here.** A real OAuth round trip needs credentials
the suite does not have, and giving CI a live Google account is a decision
with a bill attached. So none of the above proves Google *accepts* what we
send — only that we send what we meant to. If Google changes a field name or
tightens a rule, these tests stay green and the family's phones go quiet.

**Why it was untestable before**, which is the part worth remembering: the
shaping lived inside a `"use server"` module and one that reaches for the
service key, so nothing outside a request could call it. It was not that
nobody had got round to it. Moving the pure half into
`src/lib/calendar-shape.ts` is what made the tests possible at all.

**The tests run in UTC while production runs in Asia/Manila, deliberately.**
Every calendar bug so far has been correct in the environment it was written
in. Anything that depends on the process clock rather than the household's
stated zone now fails in CI and passes on the server, which is the alarm
worth having.

---

## All-day items reaching Google through the process clock — CLOSED 8 September

*Kept as a record: the shape of this is worth recognising again.*

Found while writing the calendar coverage. Every all-day sync built its
instant as

    startAt: new Date(`${date}T00:00:00`)

which is midnight in whatever zone the *process* is in, and was then read back
through `familyDay`, pinned to `FAMILY_TZ`. Two answers to "where does this
household live", agreeing only because `instrumentation.ts` sets `TZ` to the
same zone. Measured on one 9 September all-day event:

| process TZ | lands on |
|---|---|
| Asia/Manila | 2026-09-09 |
| UTC | 2026-09-09 |
| America/New_York | 2026-09-09 |
| **Asia/Tokyo** | **2026-09-08** |
| **Pacific/Auckland** | **2026-09-08** |

Anywhere east of the household, every birthday, bill, trip and meal lands a
day early — one `KIN_TZ` away, and it would look exactly like the 8 September
fix coming undone by itself.

**Fixed on both sides, 21 call sites.**

- Pull: `eventStartEnd` carries Google's own date string through as `day`
  rather than round-tripping it, and the seven update sites use that.
- Push: `allDayEvent(title, day, { endDay })` builds the input from plain
  dates, so no caller constructs the instant. Applied across
  `calendar-sync.ts` (7), `planner.ts` (4), `assistant/tools.ts` (5),
  `household.ts` (2), `wealth.ts` (2), `documents.ts` (1).
- `familyMidnight` in `lib/time.ts` states the zone by name for the one place
  an instant is still genuinely needed.
- `syncRowToCalendars` now takes `CalendarEventInput | null` and treats null
  as "nothing to sync", so an unreadable date syncs nothing rather than
  needing a guard at each of fourteen call sites. From a form or a `date`
  column null cannot happen; from the assistant, whose arguments a model
  writes, it can.

There is no `new Date(\`${x}T00:00:00\`)` left in any calendar path.

**Still there, and a different question:** `household.ts` computes the grocery
week that way, and `assistant/tools.ts` builds a query window that way. Those
are date ranges rather than things put on a calendar, and they were left
alone — the failure mode is a week boundary landing wrong for a server outside
the household's zone, not an item on the wrong day.

---

## The Planner groups its calendar in the process's clock, not the household's

Noticed while closing the all-day date bugs, and **left alone deliberately**.

`src/lib/queries/planner.ts` builds each item's `date` with
`new Date(`${column}T00:00:00`)` and then groups by `getFullYear()`,
`getMonth()`, `getDate()` — local getters. Construction and reading use the
same clock, so the module is internally consistent and correct in production,
where `instrumentation.ts` puts the process in `Asia/Manila`. The two page
anchors in `planner/page.tsx` and `household/page.tsx` are the same.

It is left because a partial change would be worse than none: swapping the
construction to `familyMidnight` without also moving every getter would break
the calendar grid outright. Doing it properly is a refactor of the whole
display module, with real regression risk, to buy robustness against a
`KIN_TZ` that nobody has moved.

The everything-else of this class *is* closed: no calendar path, query bound
or all-day sync builds a date from the process clock any more, and `addDays`
and `weekdayOf` in `lib/time.ts` do day arithmetic with no clock involved at
all.

---

## The database's own linter, swept — 9 September

Supabase ships security and performance advisors that had never been run
against this project. Both were, and the result is mostly good news, which is
worth recording so nobody runs them again expecting a haul.

**Security — nothing to fix.**

- **Four tables with row-level security on and no policies at all**:
  `access_codes`, `access_events`, `calendar_tokens`, `drive_tokens`. That is
  deny-all to `anon` and `authenticated`, which is right: each is reached only
  through a `SECURITY DEFINER` function or the service key. Deliberate, and
  the linter flags it as INFO because it cannot tell.
- **Seventeen `SECURITY DEFINER` functions callable by a signed-in member.**
  The three that take an identity as an *argument* were read line by line,
  because that is exactly the shape of the `wealth_targets` hole found on
  8 September. All three are sound: `add_child_with_login` and
  `attach_login_to_child` take the household from `current_family_id()`, check
  the caller's role, and refuse a login already attached to somebody;
  `attach_login_to_child` further restricts itself to a managed profile with
  no login, so it can never move an existing person's account.
  `transfer_organiser_role` reads the caller from `auth.uid()` and requires
  them to be the organizer.
- **`signup_code_is_valid` is callable anonymously**, and answers true or
  false for any code, for every household at once. That is an enumeration
  oracle, and it is worth knowing its exact size rather than worrying vaguely:
  `generate_invite_code` draws 6 characters from a 32-character alphabet
  (no I, O, 0 or 1), so **32⁶ ≈ 1.07 billion**. What a guessed code buys is
  the limiting factor: `join_family` inserts the joiner as **`pending`**, and
  `current_family_id()` only resolves for active members, so they see nothing
  until the organizer approves them — and it refuses to join as a parent. The
  cost of a successful guess is therefore a join request appearing in the
  household's pending list, not access. Left as it is.
- **Leaked-password protection is off** in Supabase Auth. Turning it on checks
  new passwords against HaveIBeenPwned. It is a dashboard setting rather than
  anything in this repository, and it is Jonathan's to enable.

**Performance — deliberately nothing done.** 62 foreign keys have no covering
index. At this size that is the right state: the same report lists 11 indexes
that have *never been used*, which is Postgres saying the tables are small
enough that a scan beats an index. Adding 62 indexes would slow every write to
speed up reads that are already instant. Worth revisiting if a table ever
reaches tens of thousands of rows; not before. The 30 "multiple permissive
policies" warnings are one `for all` write policy being counted alongside its
table's `select` policy, which is how these tables are deliberately built.

---

## Swept and found clean — 8 September

Recorded so nobody repeats the afternoon. Each was checked against the thing
itself, not against an assumption.

| Area | How it was checked | Result |
| --- | --- | --- |
| UTC date slicing | grep across `src/` for `toISOString().slice(0, 10)` and raw timestamp slicing | 11 fixed; **none remain** |
| Nullish vs empty (`??`) | every env read; all 18 form reads carrying a non-empty default | 3 fixed; the rest are selects or hidden inputs, which cannot submit empty |
| Whole-row clobber on edit | all 16 update actions diffed against the fields their forms populate | 1 fixed (routine duration); the other 15 complete |
| PGRST201 ambiguous embeds | the 14 tables carrying two FKs to `members`, against every embed | clean — all disambiguate by FK column |
| Goal totals vs the ledger | every goal in both households reconciled against confirmed transactions | clean — the one outlier is a hand-seeded QA fixture |
| Routine expansion | `expandRoutine` probed directly: daily/weekly/monthly, intervals, month-end clamping, `end_date` boundary, mid-range starts | clean — including 31st→28 Feb, and `end_date` inclusive |
| RLS coverage | every table: is RLS on, and does each family-scoped table have a scoping policy | clean — the two deny-all tables are deliberate |
| Permissive policies | every policy on a family-scoped table, for a scoping expression | clean — none permissive |
| Delete scoping | all 24 destructive actions; the 9 relying on RLS alone checked against their DELETE policies | clean — join tables scope through their parent |

One caution learned in the doing: the throwaway script written to probe
routine expansion made the very UTC-slice mistake it was helping to sweep
for, and printed every occurrence a day early. It read as a catastrophic
regression for about a minute. When the subject is dates, the check needs the
household's zone as much as the code does.
