import { createHash } from "node:crypto";
import { UUID } from "@/lib/ids";

/** Ledger rows a save writes, named by an id the phone made for it (29
 * October). A money form makes one id at its first try and keeps it until
 * the save succeeds; the rows it writes take ids from it, so a retry after
 * "Load failed" (a weak signal, the answer lost on its way back) writes the
 * same ids and the database refuses them as already there (23505) instead
 * of recording the money twice.
 *
 * The first row takes the id itself. A save that writes more than one (a
 * transfer's two legs, a sinking fund's way back and its payment) gives
 * each further row a fixed id worked out from it, so the phone still sends
 * only one. Server-only: it uses Node's hash. Pure, so it is tested without
 * a database. */
export function ledgerRowId(clientId: string | undefined | null, leg = 0): string | undefined {
  if (!clientId || !UUID.test(clientId)) return undefined;
  if (leg === 0) return clientId.toLowerCase();
  const h = createHash("sha256").update(`${clientId.toLowerCase()}:${leg}`).digest("hex");
  // Shaped as a version 4 id, which is what the column's own default makes.
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Whether an insert was refused because this save's rows are already
 * there: a duplicate key, on a save that named its own ids. Ledger rows
 * have no other unique key, so nothing else can raise it. */
export function alreadyRecorded(error: { code?: string } | null | undefined, clientId: string | undefined | null): boolean {
  return !!error && !!ledgerRowId(clientId) && error.code === "23505";
}
