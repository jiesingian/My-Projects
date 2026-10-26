/** What a person should read when the database refuses something.
 *
 * Until now an action that failed handed the member whatever Postgres said.
 * Measured on 9 September, adding a recipe the household already had:
 *
 *   duplicate key value violates unique constraint "family_recipes_family_id_base_key_key"
 *
 * and leaving a required field empty:
 *
 *   null value in column "name" of relation "family_recipes" violates not-null constraint
 *
 * Both are true, both are useless to the person reading them, and both look
 * like the app is broken rather than like the app is telling them something.
 * There were 110 places that did this.
 *
 * Two rules keep this from becoming its own bug:
 *
 *  - Only messages that are RECOGNISED are rewritten. Anything else is
 *    returned word for word, because a message nobody has thought about is
 *    more useful whole than guessed at. That is the same rule as
 *    explainVisibilityRefusal and explainLedgerRefusal, which came first and
 *    say something more specific about their own corner.
 *  - The original is written to the log every time it is rewritten, so
 *    nothing that used to be visible to us stops being visible. This week was
 *    spent making failures speak up; it would be a poor ending to muffle them
 *    in the name of politeness.
 *
 * Each pattern below is a real Postgres message, quoted from the shape
 * Postgres actually produces rather than from memory.
 */

type Rule = { match: RegExp; text: string };

const RULES: Rule[] = [
  {
    // P0001 -- raised by require_kin_plus (20260928150000_kin_free_and_plus.sql)
    // when a household on Kin Free adds something to a Plus area.
    match: /kin_plus_required/i,
    text: "That's part of Kin Plus. Everything already here stays yours to read — see Settings → Your plan to add more.",
  },
  {
    // P0001 -- raised by alkansya_entries_not_overdrawn (20261019100000)
    // when money taken out of a jar is more than it holds.
    match: /alkansya_not_enough/i,
    text: "There isn't that much in the jar.",
  },
  {
    // P0001 -- raised by utang_payments_not_over (20261019110000) when
    // payments would add up to more than was lent or borrowed.
    match: /utang_overpaid/i,
    text: "That is more than is left on this IOU.",
  },
  {
    // P0001 / 42501 / 22023 -- raised by import_wealth_transactions
    // (20261019120000): too many lines, an account the caller cannot write
    // to, or a line without a date, direction, amount or description.
    match: /statement_too_long/i,
    text: "That is more than 2000 lines. Import the statement in parts.",
  },
  {
    match: /statement_account/i,
    text: "That account can't take an import: it is archived, or it isn't one you can add to.",
  },
  {
    match: /statement_row/i,
    text: "One of the lines is missing its date, amount or description. Untick it and try again.",
  },
  {
    // 23505 -- duplicate key value violates unique constraint "..."
    match: /duplicate key value violates unique constraint/i,
    text: "That looks like something you already have — check the list before adding it again.",
  },
  {
    // 23502 -- null value in column "x" of relation "y" violates not-null constraint
    match: /violates not-null constraint/i,
    text: "Something that has to be filled in was left blank.",
  },
  {
    // 23503, on insert -- ... violates foreign key constraint ...
    match: /insert or update on table .* violates foreign key constraint/i,
    text: "That points at something which is no longer here. Reload the page and try again.",
  },
  {
    // 23503, on delete -- update or delete on table "x" violates ... on table "y"
    match: /update or delete on table .* violates foreign key constraint/i,
    text: "Something else still refers to this, so it cannot be removed yet.",
  },
  {
    // 23514 -- new row for relation "x" violates check constraint "..."
    match: /violates check constraint/i,
    text: "One of those values isn't allowed here.",
  },
  {
    // 22001 -- value too long for type character varying(n)
    match: /value too long for type/i,
    text: "That is longer than this field can hold. Try shortening it.",
  },
  {
    // 22007 / 22008 -- invalid input syntax for type date: "..."
    //                  date/time field value out of range: "..."
    match: /invalid input syntax for type (date|timestamp)|date\/time field value out of range/i,
    text: "That date could not be read. Use the date picker, or write it as YYYY-MM-DD.",
  },
  {
    // 22P02 -- invalid input syntax for type numeric/uuid/integer
    match: /invalid input syntax for type/i,
    text: "One of those values isn't in a form the app can read.",
  },
  {
    // 42501 -- new row violates row-level security policy for table "..."
    // The two callers with something more specific to say (health and document
    // visibility, and the ledger) translate it themselves before reaching here.
    match: /row-level security/i,
    text: "You don't have permission to change that.",
  },
  {
    // PGRST116 -- JSON object requested, multiple (or no) rows returned
    match: /multiple \(or no\) rows returned/i,
    text: "That record could not be found — it may have been changed or removed while this page was open.",
  },
];

export function humanDatabaseError(message: string): string {
  const rule = RULES.find((r) => r.match.test(message));
  if (!rule) return message;
  // Kept where we can still read it. The member gets the sentence; we keep the
  // constraint name, which is the half that says what actually happened.
  console.error("Database refused an action:", message);
  return rule.text;
}

/** The same sentence, without the log line: for databaseError
 * (lib/report-error.ts), which logs and reports for itself. */
export function databaseErrorText(message: string): string {
  return RULES.find((r) => r.match.test(message))?.text ?? message;
}

/** Whether the database said no because Kin itself is wrong (#808's "errors
 * that are only logged"), as against saying no on purpose. Reported to
 * app_errors when true; the person reads the same sentence either way.
 *
 * On purpose, never reported: what Kin's own functions raise for a person
 * to read (P0001, 22023, and a 42501 or 23514 raised by name, such as "That
 * message was removed."), the Plus and money refusals above, a duplicate
 * (23505: something added twice, usually a double tap), and a delete that
 * something else still needs. A fault, reported: a required field not sent,
 * an insert pointing at nothing, a check constraint the form let through, a
 * value too long or unreadable, a row-level security refusal of something
 * the screen offered, a missing grant ("permission denied for function"), a
 * record gone mid-request, the database not answering (fetch failed, an
 * abort), and anything else Postgres or PostgREST says with a code of its
 * own (a missing column, a timeout). Without a code (our own words, an Auth or Storage
 * error) only the message decides. Pure. */
export function isDatabaseDefect(message: string, code?: string | null): boolean {
  if (/kin_plus_required|alkansya_not_enough|utang_overpaid|statement_(too_long|account|row)/i.test(message)) return false;
  if (
    /violates not-null constraint|insert or update on table .* violates foreign key constraint|violates check constraint|value too long for type|invalid input syntax for type|date\/time field value out of range|row-level security|multiple \(or no\) rows returned|permission denied for (table|function|schema|sequence|relation|view)|fetch failed|AbortError|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|network error/i.test(
      message,
    )
  ) {
    return true;
  }
  if (!code || !/^([0-9A-Z]{5}|PGRST\d+)$/.test(code)) return false;
  return !["P0001", "P0002", "22023", "23505", "23503", "42501", "23514"].includes(code);
}
