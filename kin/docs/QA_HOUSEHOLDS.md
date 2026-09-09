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

The passwords are not in this repository and must not be put in it. Jonathan
has both; ask him for the one your machine needs.

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

They are seeded identically, because `regressions.spec` is not self-sufficient
— it asserts against fixtures the household is expected to already hold, and a
household missing them fails for reasons that have nothing to do with the code.

- **Three members**: Quinn Tester (parent, organiser, the login), Robin Tester
  and Alex Tester (managed children).
- **Two accounts**: Joint checking (joint, ₱185,000) and GCash (Quinn's own,
  ₱4,200). `goal-contribute.spec` needs an account to pay from; the Who picker
  needs one of each kind to mean anything.
- **Five activities** at 07:30, 10:00 and 17:30 Manila on Mon 7 September, plus
  two later in that week. The morning and evening ones are what
  `regressions.spec` reads to prove the Planner uses the household's clock
  rather than the server's — under UTC they would read 23:30 the previous day
  and 09:30.
- **One health item** due, and **one milestone**, for the two briefing tests.

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

## Never point these at the real household

`E2E_EMAIL` must always name a QA account. The suite writes freely — that is
what it is for — and row-level security is the only thing standing between it
and the Singian family's actual records. It has been checked and it holds:
neither QA household can see the other, nor the real one, including when it
asks for the other's rows by id rather than listing them.
