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
