# End-to-end tests

These drive the real app in a real browser against a real Supabase project.
They exist because every bug that has actually reached `main` — a query that
returned nothing, a calendar filing Monday under Sunday, a chat thread thrown
away on every load — passed `tsc`, `lint` and `build` without complaint.

## What you need

A **throwaway household**. Never point these at your own family: the write
tests add rows, and nobody wants test data in their journal.

**There are three, all in `kin-dev`.** `docs/QA_HOUSEHOLDS.md` is the list
and this section defers to it:

| Account | Whose |
| --- | --- |
| `kin-dev-qa@example.com` | every machine, **and CI** (`E2E_EMAIL`) |
| `kin-dev-delete@example.com` | `delete-household.spec.ts` only, via `E2E_DELETE_EMAIL` |
| `kin-dev-qa-partner@example.com` | the household's second adult, via `E2E_PARTNER_EMAIL` |

Production's `kin-e2e-qa@` and `kin-e2e-qa2@` are still there and are to be
left alone; the suite refuses to start against production at all.

Until 9 September there was one household, and this file said so. Two people
ran the suite against it from two machines minutes apart and spent an hour
deciding nothing was broken. From 9 September each machine had its own; since
the dev split on 10 September both machines and CI share the one dev account,
and `QA_HOUSEHOLDS.md` says why that is enough there.

**The passwords are not here and must not be put here.** Jonathan has them;
ask him for the ones your machine needs.

**Do not reset `kin-dev-qa@`'s password.** It is the CI secret
`E2E_PASSWORD`, so changing it stops every End-to-end run dead — the suite
refuses to start rather than testing a logged-out shell — until somebody with
repository-settings access updates the secret to match. If a password is
genuinely lost, that is Jonathan's to reissue, secret and all, together; ask
the way the `ask-a-person` skill says. Nobody writes to `auth.users` by hand.

To create a fresh throwaway household of your own, make an auth user in
`kin-dev` (**Authentication → Users → Add user**, *Auto Confirm User* ticked)
and then set:

```bash
export E2E_EMAIL='the throwaway account'
export E2E_PASSWORD='its password'
export E2E_BASE_URL='http://localhost:3000'   # or a preview URL
```

The suite refuses to run without the first two rather than quietly testing a
logged-out shell.

## Running

Dev is shared, so never run the whole suite (`npm run e2e`) against it from
a session; CI and the weekly check take their turns there one at a time. Run
the one spec you need:

```bash
npm run dev                                 # in one terminal
npx playwright test e2e/<spec>.spec.ts      # in another
npm run test:logic                          # the function-only specs; no browser, no database
```

`e2e/.auth/state.json` holds the signed-in cookie between specs. It is
gitignored, and it is a real session — treat it like a password.

## What is covered

About two hundred spec files, checked 30 October. The `*.logic.spec.ts` ones
test functions on their own, with no browser and no database; the rest drive
the app. `smoke.spec.ts` opens every hub at every width in both themes;
`regressions.spec.ts` holds one test per bug that already shipped once.

Where each runs (`.github/workflows/e2e.yml`, `weekly-check.yml`):

- **Every pull request**: `smoke-private-db`, the smoke tier and the logic
  specs on a database of its own, every pull request at once (since
  23 October).
- **Main, after each merge**: the same smoke on dev, plus the specs that need
  dev itself (`chat-live`, `push-targets-live`), one run at a time.
- **Once a week**: the full write-heavy suite against dev, in
  `weekly-check.yml`.

## What is not covered, and why

- **Finishing a sign-up or a password reset.** Both send an email with a code
  or link, and the suite cannot read the mailbox. `signup-code.spec.ts` checks
  the screens and the refusals up to that point.
- **Google Calendar and Drive.** Both need OAuth credentials.
- **Uploads.** Storage plus Drive; worth doing once the above exists.

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
