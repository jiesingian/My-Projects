# End-to-end tests

These drive the real app in a real browser against a real Supabase project.
They exist because every bug that has actually reached `main` — a query that
returned nothing, a calendar filing Monday under Sunday, a chat thread thrown
away on every load — passed `tsc`, `lint` and `build` without complaint.

## What you need

A **throwaway household**. Never point these at your own family: the write
tests add rows, and nobody wants test data in their journal.

Create one in Supabase (SQL editor), then make an auth user for it and set:

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
| `authorization.spec.ts` | What row-level security refuses, asked of the database directly. |

## What is not covered, and why

- **Signing up and resetting a password.** Both need email, and email needs
  custom SMTP, which needs a domain.
- **Google Calendar and Drive.** Both need OAuth credentials.
- **Uploads.** Storage plus Drive; worth doing once the above exists.
- **Most of the 128 server actions.** Adding is covered, and two of the thirty
  destructive ones are. Editing is not covered at all.

## Adding to it

Prefer a test that fails the way the bug behaved over one that asserts an
implementation detail. `regressions.spec.ts` is the pattern: name the symptom,
assert against the symptom.
