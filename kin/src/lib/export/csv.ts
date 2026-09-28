/** Rows as CSV that Excel, Numbers and Google Sheets all open correctly:
 * RFC 4180 quoting, CRLF line ends, and a UTF-8 byte-order mark so Excel
 * does not turn "Niño" or "₱" into mojibake. Objects and arrays (a note's
 * JSON, a list of mentions) are written as JSON text in their cell. */
export function toCsv(rows: Record<string, unknown>[]): string {
  const columns: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!columns.includes(k)) columns.push(k);
  const cell = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    // A leading = + - @ makes a spreadsheet run the cell as a formula; a
    // family's note should never be able to do that on someone's laptop.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [columns.map(cell).join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))];
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** Columns never written to an export, whoever asks: vault secrets, sign-in
 * and calendar tokens, PIN and link hashes, push endpoints, billing ids, the
 * household's invite code and the login's internal id. The family's own
 * records are theirs to take; the keys that open Kin are not records. */
const WITHHELD = /(^|_)(secret|token|hash|password|pin|p256dh|endpoint|auth)(_|$)|^invite_code$|^billing_|^auth_user_id$/i;

export function withoutSecrets(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !WITHHELD.test(k))));
}
