import { test, expect } from "@playwright/test";
import { humanDatabaseError } from "@/lib/db-errors";

/** What a person reads when the database refuses something.
 *
 * Every string below is a real Postgres message. The first two were measured
 * against the throwaway household on 9 September -- adding a recipe the
 * family already had, and leaving a required field blank -- and were what the
 * member saw, word for word, in 110 places across the app.
 */

const REAL_MESSAGES = {
  duplicate: 'duplicate key value violates unique constraint "family_recipes_family_id_base_key_key"',
  notNull: 'null value in column "name" of relation "family_recipes" violates not-null constraint',
  fkInsert: 'insert or update on table "wealth_transactions" violates foreign key constraint "wealth_transactions_account_id_fkey"',
  fkDelete: 'update or delete on table "accounts" violates foreign key constraint "wealth_transactions_account_id_fkey" on table "wealth_transactions"',
  check: 'new row for relation "calendar_event_links" violates check constraint "calendar_event_links_source_table_check"',
  tooLong: "value too long for type character varying(120)",
  badDate: 'invalid input syntax for type date: "31 Septembr"',
  outOfRange: 'date/time field value out of range: "2026-13-01"',
  rls: 'new row violates row-level security policy for table "health_conditions"',
  multipleRows: "JSON object requested, multiple (or no) rows returned",
};

test("no rewritten message leaks the machinery", () => {
  for (const [name, raw] of Object.entries(REAL_MESSAGES)) {
    const shown = humanDatabaseError(raw);
    expect(shown, name).not.toBe(raw);
    for (const leak of ["constraint", "relation", "null value", "row-level security", "syntax", "_fkey", "_key"]) {
      expect(shown.toLowerCase(), `${name} leaks "${leak}"`).not.toContain(leak);
    }
  }
});

test("each one says something a person could act on", () => {
  expect(humanDatabaseError(REAL_MESSAGES.duplicate)).toContain("already have");
  expect(humanDatabaseError(REAL_MESSAGES.notNull)).toContain("left blank");
  expect(humanDatabaseError(REAL_MESSAGES.fkDelete)).toContain("cannot be removed");
  expect(humanDatabaseError(REAL_MESSAGES.tooLong)).toContain("shortening");
  expect(humanDatabaseError(REAL_MESSAGES.badDate)).toContain("YYYY-MM-DD");
});

test("insert and delete foreign-key failures are not the same sentence", () => {
  // They are opposite problems: one points at something gone, the other is
  // pointed at by something still here. Telling somebody to reload the page
  // when the truth is "delete the thing that uses it" wastes their time.
  expect(humanDatabaseError(REAL_MESSAGES.fkInsert)).not.toBe(humanDatabaseError(REAL_MESSAGES.fkDelete));
});

test("anything unrecognised is passed through word for word", () => {
  // The important half. A message nobody has thought about is more useful
  // whole than guessed at, and this is what stops the translator becoming a
  // way to hide new failures -- which is the exact bug this week was spent
  // undoing.
  const unknown = [
    "could not serialize access due to concurrent update",
    "deadlock detected",
    "canceling statement due to statement timeout",
    "Invalid login credentials",
    "TypeError: fetch failed",
    "",
  ];
  for (const message of unknown) {
    expect(humanDatabaseError(message), JSON.stringify(message)).toBe(message);
  }
});

test("a Supabase auth message is not mangled by this", () => {
  // auth.ts was deliberately left out of the sweep, but a message could still
  // reach here by another route, and these are already written for people.
  for (const message of ["Email not confirmed", "User already registered", "Token has expired or is invalid"]) {
    expect(humanDatabaseError(message)).toBe(message);
  }
});
