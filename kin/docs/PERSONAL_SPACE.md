# Personal space: a person owns their account, a household links them

Approved by Jonathan on 28 September (BACKLOG, "Agreed 28 September", item 1).
This note is the design; it ships in three pull requests so nothing is ever
half-migrated.

## Where it starts

`members` is one row per account **and** per household at once: `family_id` is
not null, `auth_user_id` is unique, and `current_family_id()` -- which about 150
policies call -- is simply "the family on my member row". So everything an
account has belongs to one household, and leaving one means losing all of it:
`create_family()` and `join_family()` refuse any account that has a member row
at all, even a removed one. Onboarding says it plainly: "You can be in one
family group at a time."

## The model

**A person** is a new, durable identity: `people (id, auth_user_id)`. It never
changes household and it is never deleted by a move.

**A membership** is what `members` already is -- a person's place in one
household -- now with `members.person_id`. Every existing member row gets a
person whose id is **the member's own id**, so the backfill needs no mapping and
anyone can check it with `person_id = id`. New member rows get one from a
trigger, and an account that already has a person (someone re-joining) gets
that one back rather than a new one.

A person still belongs to **one household at a time** for household things.
`current_family_id()` does not change, and neither does any household policy.
That is deliberate: the risk in this change is concentrated in the new
personal policies, not spread across 150 old ones.

`current_person_id()` joins `current_family_id()` and `current_member_id()`.

### Personal or the household's

| Record | Whose | On a move |
|---|---|---|
| Profile (name, photo, birthday, sizes, IDs, medical basics on `members`) | the person | **copied** to the new membership; the old one keeps the name its history refers to |
| Journal entry, `visibility = 'personal'` | the person | goes with them |
| Journal entry, `visibility = 'household'` (every entry today) | the household | stays; it is shared history |
| Journal photo, `visibility = 'personal'` | the person | goes with them (stored under `person/<person id>/`, so the file never moves) |
| Goal with `is_joint = false` (a personal goal, which already exists) | the person | goes with them; its ledger lines stay with the household's money |
| Private note (`personal_notes`, new) | the person | nothing to do: it has no household |
| Bills, budgets, calendar, chores, lists, chat, household journal, vault, tree | the household | stays |
| Health records (medicines, vitals, illness log) | the household today | **stays for now** -- see "Not in this change" |

`owner_person_id` is the column that says whose a record is. On a household
journal entry it records who wrote it; on a personal one it is the only person
who can see it.

### How RLS changes

Household rows: exactly as today. The new condition is always
`visibility = 'household' and family_id = current_family_id()`, and every
existing row is `'household'` by the column default, so the set of people who
can see each existing row is unchanged.

Personal rows: `visibility = 'personal' and owner_person_id =
current_person_id()`. Not the household, not the organiser, not a parent.
Writing one requires `owner_person_id = current_person_id()`, and nobody can
change a row's owner afterwards (a trigger refuses it). A personal entry is
never shared with linked households: `entry_shared_with_me()`,
`media_shared_with_me()` and the auto-share trigger all require
`'household'`.

Comments on a journal entry are visible only to people who can see the entry.

When an account is deleted, its personal notes, personal journal entries and
personal photo rows go with it. Household records it wrote stay.

## The steps

1. **The data model** (this PR). `people`, `members.person_id`,
   `current_person_id()`, `owner_person_id` and `visibility` on journal entries
   and photos, `owner_person_id` on goals, `personal_notes`, and the policies
   above. No screen changes; the app keeps writing household entries exactly as
   it does now. The journal restructure (item 3: Mine / Household / Family
   feed) builds on this.
2. **Starting your own household.** `start_own_household()`: a new household,
   a new membership for the same person with their profile copied, their
   personal rows re-homed, the old membership kept as history
   (`status = 'moved'`), the two households linked (so the family feed reaches
   them) and the tree person pointed at the new membership. Settings →
   Household gets the button; "one family group at a time" goes. A removed
   member can use it too, which today is a dead end.
3. **Profiles that feel like a person** (item 6). Cover and photo, recent
   moments and milestones, Message and Call, the long detail list under an
   About tab, Remove in a "⋯" menu, and the profile opening from the family
   tree as well as from the Family list.

## Not in this change

- **Health records** (medicines, vitals, illness log, labs) are keyed to the
  household today and stay there on a move. Moving a person's medical history
  is a real want and a sensitive one; it is its own decision.
- **Being in two households at once** (a grandparent in both) is not part of
  this. One household at a time, as now; the tree and family links do the
  reaching.
- **Private documents in the vault** stay in the household vault they were
  filed in. Their files are stored under the household's folder.
- **Deleting a household** still deletes everything whose `family_id` is that
  household -- including personal entries kept there at the time. Personal
  rows carry the household they are kept in (for storage and Kin Plus), and a
  row cannot outlive its household without making `family_id` nullable across
  the journal. Worth deciding before the journal's Mine tab (item 3) lets
  people write many of them.

## Step 2, as built

- `start_own_household(name)` and `move_to_household(code)`. An **organizer**
  with anyone else in the household (active or managed) hands the role over
  first; an organizer on their own already has a household of their own. Only
  a grown-up (parent or adult) starts one; anyone with a login can move.
- `members_bring_personal_space()` runs whenever a membership becomes active,
  so starting a household, an approved join and a reinstatement all bring the
  person's personal rows and photo album along -- including their own Planner
  goals (water, steps, weight, gym, custom) with what was logged against them
  and any reward. `planner_goals_fixed()` still refuses any change of owner,
  except this one: the same person, while this trigger names them. Personal goals keep their
  saved total; their ledger lines and linked account stay with the old
  household's money.
- A new household is linked to the one left behind (accepted: the mover was a
  grown-up there) and the tree person is matched across both trees. An
  approved move into someone else's household sends the old household a link
  request instead, which its grown-ups answer as any other.
- Someone **removed** from a household used to land on an empty app; they now
  land on "You're no longer in …" with the same two choices. No link is made
  to a household that removed them.

## How existing data is kept where it is

Every migration in this series is checked the same two ways:

- On dev, inside a transaction that ends in an exception (so nothing it did
  survives): the migration runs, then row-level-security probes as real
  `authenticated` sessions -- own household allowed, another household refused,
  a personal row hidden from the rest of the household, and (step 2) a moved
  person still reading their own data.
- Production is read (never written) before the merge and after `migrate.yml`
  runs: the same counts and the same fingerprints of members, journal entries
  and goals (id, household, owner), which must match exactly.
