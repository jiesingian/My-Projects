import { FAMILY_TZ } from "@/lib/time";

/** Runs once, before the server takes its first request.
 *
 * Almost every date in the app is handled in the server's own zone: the
 * Planner asks a Date for getDate() to work out which day a thing belongs to,
 * groups by toDateString(), and prints with toLocaleTimeString(). That code is
 * not wrong — it is consistent with itself, and would be correct in the
 * household's own zone. It is only wrong because the zone underneath it is
 * UTC, which is nowhere anyone lives.
 *
 * Left alone, a school run at half past seven on Monday morning in Manila is
 * an instant at 23:30 on Sunday in UTC, and the Planner faithfully files it
 * under Sunday night. Every clock in the app was eight hours out, all day,
 * rather than only in the evening.
 *
 * Rather than thread a zone through several hundred lines of date arithmetic
 * and hope none was missed, the server is told where the family lives. Then
 * server-local and family-local are the same thing, which is what the rest of
 * the code already assumes.
 *
 * This is the same stopgap as FAMILY_TZ and it ends the same way: when
 * families.timezone exists, a household's dates get formatted in its own zone
 * and the process zone stops mattering. */
export function register() {
  // Only the Node runtime has a process whose zone means anything; on Edge
  // this is absent and assigning to it would do nothing useful.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // KIN_TZ is the escape hatch, so a deployment can be moved without a code
  // change. TZ itself is deliberately not read: it is unset on Vercel and
  // defaults to UTC, so honouring it would mean honouring the bug.
  //
  // This is the belt. The braces are TZ on the npm scripts, and they are there
  // because next dev renders in a worker pool rather than in the process that
  // ran this function: a worker forked before register() ran keeps the zone it
  // was forked with, so the same page could be served in Manila or in UTC
  // depending on nothing the code can see. Setting the variable in the shell
  // means every worker inherits it, whenever it starts. On Vercel there is no
  // pool and no shell, which is what this line is for.
  process.env.TZ = process.env.KIN_TZ ?? FAMILY_TZ;
}
