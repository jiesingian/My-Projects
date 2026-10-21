/** Error capture that outlives Vercel Hobby's one hour of logs (Jonathan,
 * 21 October). The part that is the same in the browser and on the server:
 * what is kept of an error, scrubbed of anything personal, and the
 * fingerprint that groups repeats of it into one row with a count
 * (public.app_errors, read only by the weekly check's "Errors this week").
 *
 * Kept: the route as a pattern (/family/members/[id]), the message with
 * emails, ids, long numbers, tokens and query strings taken out, and the
 * app version. Never kept: names, emails, ids of people, request bodies or
 * query strings. log_app_error scrubs again in the database, the same way,
 * because anyone can call it. Pure: no network here. */

export type ErrorKind = "client" | "server";

export const ERROR_MESSAGE_MAX = 300;
export const ERROR_ROUTE_MAX = 200;
/** A browser sends at most this many reports per page load. */
export const ERROR_REPORTS_PER_PAGE = 5;

/** The deployment's commit, short. Vercel sets it; "dev" elsewhere. */
export function appVersion(): string {
  return (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 7);
}

/** An error message with nothing personal left in it. */
export function scrubMessage(message: unknown, max = ERROR_MESSAGE_MAX): string {
  const text = String(message ?? "")
    .replace(/[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}/g, "[email]")
    .replace(/(https?:\/\/[^\s?#]*)[?#]\S*/g, "$1")
    .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, "[id]")
    .replace(/[A-Za-z0-9_-]{24,}/g, "[token]")
    .replace(/[0-9]{4,}/g, "[n]")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, max);
}

/** The route as a pattern: path only, any id-like segment folded to [id]. */
export function scrubRoute(path: unknown): string {
  let p = String(path ?? "");
  try {
    if (/^https?:\/\//.test(p)) p = new URL(p).pathname;
  } catch {
    p = "";
  }
  p = p.split("?")[0].split("#")[0];
  p = p.replace(/\/[^/]*[0-9][^/]*/g, "/[id]").replace(/\/[A-Za-z_-]{24,}/g, "/[id]");
  return (p || "/").slice(0, ERROR_ROUTE_MAX);
}

/** The top frames of a stack, without line and column numbers (they move
 * with every build) or query strings, so one bug keeps one fingerprint. */
export function stackFrames(stack: unknown, depth = 5): string[] {
  return String(stack ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^at |@/.test(l))
    .slice(0, depth)
    .map((l) =>
      l
        .replace(/https?:\/\/[^/\s)]+/g, "")
        .replace(/[?#][^\s):]*/g, "")
        .replace(/:\d+(:\d+)?/g, "")
        .replace(/[0-9a-f]{8,}/gi, "")
        .trim(),
    );
}

/** Two 32-bit FNV-1a hashes side by side: 16 hex characters. Not for
 * security, only to group; the same in the browser and on the server. */
export function hash16(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193 + 2) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

export type ErrorReport = { fingerprint: string; kind: ErrorKind; route: string; message: string; version: string };

/** What is sent to log_app_error for one error. The fingerprint is the kind,
 * the scrubbed message and the top frames, so a bug on several pages with
 * the same stack is one row. */
export function errorReport(kind: ErrorKind, route: unknown, message: unknown, stack: unknown): ErrorReport {
  const clean = scrubMessage(message);
  return {
    fingerprint: hash16([kind, clean, ...stackFrames(stack)].join("\n")),
    kind,
    route: scrubRoute(route),
    message: clean || "(no message)",
    version: appVersion(),
  };
}

/** Message and stack of anything thrown (an Error, a string, a rejection reason). */
export function describeThrown(thrown: unknown): { message: string; stack: string } {
  if (thrown instanceof Error) return { message: `${thrown.name}: ${thrown.message}`, stack: thrown.stack ?? "" };
  if (thrown && typeof thrown === "object" && "message" in thrown) return { message: String((thrown as { message: unknown }).message), stack: "" };
  return { message: String(thrown), stack: "" };
}
