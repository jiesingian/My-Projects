# The throwaway QA households

There are two, and which one your machine uses is decided by two environment
variables in `kin/.env.local`:

```
E2E_EMAIL=...
E2E_PASSWORD=...
```

| Household | Account | Who uses it |
|---|---|---|
| `ZZ QA Testbed (throwaway)` | `kin-e2e-qa@example.com` | Jonathan's machine, and CI |
| `ZZ QA Testbed 2 (throwaway)` | `kin-e2e-qa2@example.com` | Janine's machine |

There is a third account, and it is different in kind:

| Account | What it holds |
|---|---|
| `kin-e2e-qa3@example.com` | **Nothing.** It holds no household between runs. |

It exists for `delete-household.spec.ts`, which is the one test that destroys
the household it runs against. That test creates a household, fills it,
deletes it, and leaves the account empty again — which is both why it needs
its own account and why it can be run twice. It reads
`E2E_DELETE_EMAIL` / `E2E_DELETE_PASSWORD`, never `E2E_EMAIL`, and it skips
loudly when they are unset rather than pretending to have run.

The passwords are not in this repository and must not be put in it. Jonathan
has all three; ask him for the ones your machine needs.

## Why there are two

There is one Supabase project, and until 9 September there was one throwaway
household. Both people's sessions ran the same suite against it from their own
containers, minutes apart, and the results were exactly as confusing as that
sounds: rows appearing under prefixes a clone had not used since a change
fifteen minutes earlier, tidy-ups truthfully reporting nothing of their own
left behind, and a full suite that could not be made to come out clean twice
running. It cost an hour to work out that nothing was broken.

`e2e.yml` holds a repo-wide concurrency group of one, so CI never overlaps
itself. Nothing serialises two laptops. Two households does.

## What each one holds

They started identically, seeded once on 9 September, because `regressions.spec`
is not self-sufficient — it asserts against fixtures the household is expected
to already hold, and a household missing them fails for reasons that have
nothing to do with the code. This part has stayed identical since, and neither
household's own tests touch it:

- **Three members**: Quinn Tester (parent, organiser, the login), Robin Tester
  and Alex Tester (managed children).
- **Five activities** at 07:30, 10:00 and 17:30 Manila on Mon 7 September, plus
  two later in that week. The morning and evening ones are what
  `regressions.spec` reads to prove the Planner uses the household's clock
  rather than the server's — under UTC they would read 23:30 the previous day
  and 09:30.
- **One health item** due, and **one milestone**, for the two briefing tests.

**Wealth data is not identical, and was never meant to stay that way.**
Nothing above asserts an exact balance, account count, or bill list —
`goal-contribute.spec` needs an account to pay from and the Who picker needs
one of each kind, both about shape, not values — so this is free to drift as
real test runs use it, and the two households have drifted apart rather than
staying matched:

- **qa1** currently holds one account, Joint checking, at ₱315,229.5 after
  real activity since the 9 September seed (it started at ₱185,000). It
  launched with a GCash account too; that's gone now, removed at some point
  this was not caught or recorded.
- **qa2** held no wealth data at all until 10 September, when it was seeded to
  match qa1's original shape: Joint checking from the same ₱185,000 opening
  balance (landed at the same ₱315,229.5 after the same five transactions —
  one salary, four expenses across Groceries/Utilities/Health/Education), two
  assets, one liability, two goals, and three bills. Seeding also added a
  second GCash account by mistake — one already existed from the original
  9 September seed (private, ₱4,200) — so the new one was archived the same
  day rather than left to confuse the next person reading this file. qa2's
  one e-wallet is that original private one, same as it always was.

Don't assume the two match without checking.

## Known: the seed is pinned to one week

Those activities are dated Monday **7 September 2026**, in both households.
The Planner test reads the current week, so from Monday **14 September** they
fall outside it and `regressions.spec` starts failing on both machines at once
— not because anything broke, but because the fixtures aged out.

The fix is for `regressions.spec` to create its own fixtures at a date it
chooses, the way `writes.spec` and the newer specs do, rather than asserting
against content somebody seeded by hand. That is a change to a spec, not to
this file; it is recorded in `KNOWN_RISKS.md`.

## Adding or repairing a household

Everything except the auth account can be done through the ordinary anon API
as that account — `create_family`, then `add_managed_child`, then plain
inserts. No service-role key is needed and none should be used: doing it as
the household's own account means row-level security decides what the work can
reach, so a mistake cannot escape into the Singian household.

The auth account is the exception. Supabase's public signup endpoint rejects
`example.com` outright and rate-limits confirmation mail to a couple an hour,
so neither household was created that way; both are rows written directly into
`auth.users` and `auth.identities`, mirroring each other exactly. If a third is
ever needed, the honest route is the Supabase dashboard's **Authentication →
Users → Add user** with *Auto Confirm User* ticked, which does the same thing
without anybody hand-writing an auth row.

## The one test that deletes a household

`delete-household.spec.ts` exists because DELETE HOUSEHOLD promises, on the
Settings screen, to remove "every member, journal entry, health record,
document index, and everything else in the app" — and nothing checked that it
did. On 9 September it quietly stopped being true: `income_schedules` was
created with no `ON DELETE` clause on `family_id`, which in Postgres means NO
ACTION, so from the first income schedule any household saved the delete would
have raised a foreign-key violation. Fifty-one other tables cascade. That one
did not, and it was caught by reading the schema, which nobody does twice.

**Why it cannot delete the wrong household.** `delete_household()` takes no
argument — it deletes the caller's own, resolved from the session. The only
household it can reach is the one belonging to the account it signed in as,
and that account holds nothing except while the test is running. If it finds a
household left behind by a run that died half way, it checks the name carries
the test's own prefix before removing it, and fails rather than guessing.

The last thing the spec does is sign in as `E2E_EMAIL` and confirm that
household is still there with its members — so "it deleted the right thing"
and "it left everything else alone" are both assertions rather than
impressions.

It was verified by putting the bug back: the constraint was returned to NO
ACTION, the test failed with `violates foreign key constraint
"income_schedules_family_id_fkey"`, and the constraint was restored. A test
for a destructive button is worth nothing until it has been seen to fail.

## Never point these at the real household

`E2E_EMAIL` must always name a QA account. The suite writes freely — that is
what it is for — and row-level security is the only thing standing between it
and the Singian family's actual records. It has been checked and it holds:
neither QA household can see the other, nor the real one, including when it
asks for the other's rows by id rather than listing them.
