import { after } from "next/server";
import { headers } from "next/headers";
import { databaseErrorText, isDatabaseDefect } from "@/lib/db-errors";
import { caughtReport, describeThrown, perMinuteLimit } from "@/lib/error-capture";
import { recordReport } from "@/lib/error-capture-server";

/** Errors that are caught, not thrown (#808 left them out: "Errors that are
 * only logged are missed"). onRequestError (instrumentation.ts) records what
 * escapes a render, a route handler or a server action; a catch that logs
 * and carries on, or an action that turns a database refusal into a
 * sentence, never reached it. Every server action and route handler now
 * reports those through here, into the same public.app_errors, scrubbed
 * the same way and grouped by the same fingerprint (lib/error-capture.ts).
 *
 * What is recorded: `where` (a fixed label, scrubbed again, never an id or a
 * name) with the page it came from as a pattern (/family/members/[id], from
 * the Referer, path only), the thrown thing's message scrubbed, and its top
 * stack frames for the fingerprint (the caller's, when what was caught has
 * no stack, as a Supabase error has none). Everything passed after `thrown`
 * goes to the log only, never to the table. Nothing is shown to anyone
 * differently. The write happens after the response (`after`), so a
 * person never waits on it; outside a request it is sent straight away. At
 * most 60 a minute per server instance, beside the database's own 120. */

const allowed = perMinuteLimit(60);

export function reportError(where: string, thrown: unknown, ...logOnly: unknown[]): void {
  console.error(where, forTheLog(thrown), ...logOnly);
  if (!allowed()) return;
  const callerStack = new Error().stack ?? "";
  try {
    after(async () => {
      let page = "";
      try {
        page = (await headers()).get("referer") ?? "";
      } catch {
        // A page render: request APIs are not allowed inside after there.
      }
      await recordReport(caughtReport(where, thrown, page, callerStack));
    });
  } catch {
    // Not inside a request (a script, a test): send it now.
    void recordReport(caughtReport(where, thrown, "", callerStack));
  }
}

/** A Supabase error as a server action returns it. */
export type DatabaseFailure = { message: string; code?: string | null } | string | null | undefined;

/** A refusal a screen expects and explains in its own words (Parents only,
 * someone else's account): row-level security there is not a fault. */
export const RLS_EXPLAINED = /row-level security/i;

/** The message of a failure, whatever shape it came in. */
export function failureText(error: DatabaseFailure): string {
  return typeof error === "string" ? error : (error?.message ?? "");
}

/** What the server log gets of a thrown thing. A Supabase error (an Error,
 * since postgrest-js 2) carries `details`, which quotes the row it refused:
 * the log gets its message, code and hint (for a 42501 the missing GRANT),
 * not that. Anything else as it was thrown. */
function forTheLog(thrown: unknown): unknown {
  if (!thrown || typeof thrown !== "object" || !("details" in thrown)) return thrown;
  const { hint } = thrown as { hint?: unknown };
  return { message: describeThrown(thrown).message, code: codeOf(thrown), hint: hint || undefined };
}

function codeOf(error: unknown): string | undefined {
  return typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code ?? "") || undefined : undefined;
}

/** Reported when Kin is at fault, unless the caller explains this refusal. */
function noteIfDefect(error: DatabaseFailure, explained?: RegExp): boolean {
  const message = failureText(error);
  if (explained?.test(message) || !isDatabaseDefect(message, codeOf(error))) return false;
  reportError("Database refused an action", error);
  return true;
}

/** What a person reads when the database refuses something
 * (humanDatabaseError's sentence), and, when the refusal is Kin's fault
 * rather than theirs (isDatabaseDefect), a report of it. Pass the error
 * itself, not its message: the code is what tells the two apart. */
export function databaseError(error: DatabaseFailure, explained?: RegExp): string {
  const message = failureText(error);
  if (!noteIfDefect(error, explained) && databaseErrorText(message) !== message) console.error("Database refused an action:", message);
  return databaseErrorText(message);
}

/** The database's own words, unchanged, for an action that words the
 * refusal itself (`That did not save. ${…}`, explainLedgerRefusal, a
 * feature's own `readable`), reported when it is Kin's fault as
 * databaseError does. What the person reads does not change. */
export function refusalMessage(error: DatabaseFailure, explained?: RegExp): string {
  noteIfDefect(error, explained);
  return failureText(error);
}
