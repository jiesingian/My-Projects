import { test, expect } from "@playwright/test";
import { caughtReport, perMinuteLimit } from "@/lib/error-capture";
import { databaseErrorText, isDatabaseDefect } from "@/lib/db-errors";

/** Errors a server action or route handler catches (#808's "errors that are
 * only logged"), as lib/report-error.ts records them: what reaches
 * app_errors, that nothing personal does, and which database refusals count
 * as Kin's fault. No network, no database. */

const ANN = "2b1c9a52-8c1e-4f0e-9d3a-1c2b3c4d5e6f";

test("a caught Supabase error is captured: its message, a page pattern, a fingerprint", () => {
  const caught = { message: 'null value in column "name" of relation "family_recipes" violates not-null constraint', code: "23502", details: "Failing row contains (Ann Cruz, ann.cruz@gmail.com).", hint: null };
  const r = caughtReport("Database refused an action", caught, `https://kin.app/family/members/${ANN}?tab=health`, "Error\n    at addRecipeAction (/var/task/.next/server/chunks/412.js:1:2)");
  expect(r.kind).toBe("server");
  expect(r.message).toBe(caught.message);
  expect(r.route).toBe("Database refused an action /family/members/[id]");
  expect(r.fingerprint).toMatch(/^[0-9a-f]{16}$/);
});

test("nothing personal leaks: not the row in details, not what was typed, not an id or email in the label", () => {
  const leaks = ["Ann", "ann.cruz", ANN, "Septembr", "09171234567", "tab=health"];
  const reports = [
    caughtReport("Database refused an action", { message: "duplicate key", details: "Key (email)=(ann.cruz@gmail.com) already exists.", hint: "Ann Cruz" }),
    caughtReport("Database refused an action", { message: 'invalid input syntax for type date: "Ann birthday 31 Septembr"', code: "22007" }),
    caughtReport("Database refused an action", { message: 'invalid input syntax for type date: "Lola "Ann" Septembr"', code: "22007" }),
    caughtReport("Database refused an action", { message: 'malformed array literal: "Ann, Septembr"', code: "22P02" }),
    caughtReport(`Orphaned auth user ${ANN} could not be removed; ann.cruz@gmail.com is now unusable`, new Error("User not found")),
    caughtReport("Push refused by the push service", new Error("Push refused by fcm.googleapis.com: 410 for 09171234567"), `/today?member=${ANN}&tab=health`),
  ];
  for (const r of reports) {
    for (const leak of leaks) {
      expect(JSON.stringify(r), `leaked ${leak}`).not.toContain(leak);
    }
  }
});

test("the same failure from two pages, or with two different ids, is one row", () => {
  const stack = "Error\n    at payBillAction (/var/task/.next/server/app/wealth.js:10:20)";
  const a = caughtReport("Database refused an action", { message: `No row for ${ANN}` }, "/wealth", stack);
  const b = caughtReport("Database refused an action", { message: "No row for 9f1c9a52-8c1e-4f0e-9d3a-1c2b3c4d5e6f" }, "/today", stack);
  expect(a.fingerprint).toBe(b.fingerprint);
  expect(caughtReport("x", { message: "Something else" }, "/wealth", stack).fingerprint).not.toBe(a.fingerprint);
  // Two labels with the same message (two reminder kinds timing out) are two rows.
  const timeout = { message: "canceling statement due to statement timeout", code: "57014" };
  expect(caughtReport("Reminders: due_reminders failed", timeout, "", stack).fingerprint).not.toBe(caughtReport("Reminders: due_pantry_reminders failed", timeout, "", stack).fingerprint);
});

test("Kin's faults are reported; what the database says no to on purpose is not", () => {
  // Faults.
  expect(isDatabaseDefect('null value in column "name" of relation "bills" violates not-null constraint', "23502")).toBe(true);
  expect(isDatabaseDefect('new row violates row-level security policy for table "bills"', "42501")).toBe(true);
  expect(isDatabaseDefect('new row for relation "bills" violates check constraint "bills_status_check"', "23514")).toBe(true);
  expect(isDatabaseDefect('insert or update on table "bills" violates foreign key constraint "bills_family_id_fkey"', "23503")).toBe(true);
  expect(isDatabaseDefect("JSON object requested, multiple (or no) rows returned", "PGRST116")).toBe(true);
  expect(isDatabaseDefect("column bills.paid_from does not exist", "42703")).toBe(true);
  expect(isDatabaseDefect("canceling statement due to statement timeout", "57014")).toBe(true);
  expect(isDatabaseDefect("permission denied for function log_app_error", "42501")).toBe(true);
  expect(isDatabaseDefect("TypeError: fetch failed", "")).toBe(true);
  expect(isDatabaseDefect("AbortError: This operation was aborted")).toBe(true);
  // On purpose.
  expect(isDatabaseDefect("Only a grown-up can add bills.", "P0001")).toBe(false);
  expect(isDatabaseDefect("That message was removed.", "23514")).toBe(false);
  expect(isDatabaseDefect("That message can't be pinned here.", "42501")).toBe(false);
  expect(isDatabaseDefect('duplicate key value violates unique constraint "x_key"', "23505")).toBe(false);
  expect(isDatabaseDefect('update or delete on table "accounts" violates foreign key constraint "y" on table "z"', "23503")).toBe(false);
  expect(isDatabaseDefect("kin_plus_required", "P0001")).toBe(false);
  // Not a database code: an Auth or Storage error, or Kin's own words.
  expect(isDatabaseDefect("Invalid login credentials", "invalid_credentials")).toBe(false);
  expect(isDatabaseDefect("Could not save the goal.")).toBe(false);
});

test("what the person reads does not change", () => {
  expect(databaseErrorText('null value in column "name" of relation "bills" violates not-null constraint')).toBe("Something that has to be filled in was left blank.");
  expect(databaseErrorText("Only a grown-up can add bills.")).toBe("Only a grown-up can add bills.");
});

test("a loop that fails on every row reports a minute's worth, then waits for the next minute", () => {
  const allowed = perMinuteLimit(60);
  const t0 = 1_000_000;
  const first = Array.from({ length: 100 }, (_, i) => allowed(t0 + i));
  expect(first.filter(Boolean).length).toBe(60);
  expect(allowed(t0 + 59_000)).toBe(false);
  expect(allowed(t0 + 60_000)).toBe(true);
});
