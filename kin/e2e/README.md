# End-to-end tests

These drive the real app in a real browser against a real Supabase project.
They exist because every bug that has actually reached `main` — a query that
returned nothing, a calendar filing Monday under Sunday, a chat thread thrown
away on every load — passed `tsc`, `lint` and `build` without complaint.

## What you need

A **throwaway household**. Never point these at your own family: the write
tests add rows, and nobody wants test data in their journal.

**There are three, and which one is yours is not a free choice.**
`docs/QA_HOUSEHOLDS.md` is the list and this section defers to it:

| Account | Whose |
| --- | --- |
| `kin-e2e-qa@example.com` | Jonathan's machine, **and CI** |
| `kin-e2e-qa2@example.com` | Janine's machine |
| `kin-e2e-qa3@example.com` | `delete-household.spec.ts` only, via `E2E_DELETE_EMAIL` |

Until 9 September there was one, and this file said so — which is why anyone
reading only this page asks for the first account by name. Two people ran the
suite against it from two machines minutes apart and spent an hour deciding
nothing was broken. Use the one your machine is assigned. The two households
are seeded identically, so there is nothing in one that the other lacks and
no reason to reach for somebody else's.

**The passwords are not here and must not be put here.** Jonathan has all
three; ask him for the one your machine needs.

**Do not reset the first account's password.** It is the CI secret
`E2E_PASSWORD`, so changing it in the SQL editor stops every End-to-end run
dead — the suite refuses to start rather than testing a logged-out shell —
until somebody with repository-settings access updates the secret to match.
If a password is genuinely lost, that is Jonathan's to reissue, secret and
all, together. For the record the statement is:

```sql
update auth.users
   set encrypted_password = extensions.crypt('<new>', extensions.gen_salt('bf'))
 where email = 'kin-e2e-qa2@example.com';   -- never a real account
```

It writes directly to `auth.users` in the one Supabase project the Singian
family's real records live in, so the `where` clause is the only thing keeping
it off somebody's actual login. Read it twice before running it.

To create a fresh throwaway household of your own, make an auth user in
Supabase (**Authentication → Users → Add user**, *Auto Confirm User* ticked)
and then set:

```bash
export E2E_EMAIL='the throwaway account'
export E2E_PASSWORD='its password'
export E2E_BASE_URL='http://localhost:3000'   # or a preview URL
```

The suite refuses to run without the first two rather than quietly testing a
logged-out shell.

## Running

```bash
npm run dev          # in one terminal
npm run e2e          # in another
npm run e2e:ui       # or watch it happen
```

`e2e/.auth/state.json` holds the signed-in cookie between specs. It is
gitignored, and it is a real session — treat it like a password.

## What is covered

| Spec | What it holds the app to |
| --- | --- |
| `smoke.spec.ts` | All seven hubs, at 390/834/1440, light and dark: 200, no redirect, right theme, no sideways scroll, no console or page errors, no failed requests. 42 combinations. |
| `regressions.spec.ts` | One test per bug that already shipped once. |
| `writes.spec.ts` | The forms that add things, each verified by going back and finding what it made. |
| `deletes.spec.ts` | Removing things: each makes two, removes one, and checks the other survived. |
| `edits.spec.ts` | Changing things: set several fields, change one, and check the others are still what they were. |
| `preferences.spec.ts` | Household settings that are supposed to change something, checked against the thing they change. |
| `authorization.spec.ts` | What row-level security refuses, asked of the database directly. |

## What is not covered, and why

- **Signing up and resetting a password.** Both need email, and email needs
  custom SMTP, which needs a domain.
- **Google Calendar and Drive.** Both need OAuth credentials.
- **Uploads.** Storage plus Drive; worth doing once the above exists.
- **Most of the 128 server actions.** Adding is covered, two of the thirty
  destructive ones are, and one of the editing ones is.

## Adding to it

Prefer a test that fails the way the bug behaved over one that asserts an
implementation detail. `regressions.spec.ts` is the pattern: name the symptom,
assert against the symptom.

One caution, learned the hard way. A round trip through the interface can be
wrong in both directions and so look right: an activity typed as 18:00 read
back as 18:00 for months while being stored at the wrong instant, because the
form and the calendar were making the same mistake. Where a value is stored
in one form and shown in another — times above all — assert the stored value
too, as `edits.spec.ts` does through PostgREST. Otherwise the test agrees
with the bug.
