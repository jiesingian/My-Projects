/** Private notes (personal space, 28 September; the screen 19 October): a
 * person's own, in `personal_notes`, which has no household at all. Row-level
 * security lets only the author read, change or delete a note -- not a parent,
 * not anyone at home (probes/personal-notes.mjs) -- and a child with a login
 * keeps notes of their own the same way, kid view included. */

/** The table's own limit (body between 1 and 20,000 characters). */
export const NOTE_MAX = 20_000;

/** A note as saved: trimmed, and null when nothing is left or it is too
 * long for the table, so the person gets a sentence instead of a refusal. */
export function cleanNote(body: unknown): string | null {
  if (typeof body !== "string") return null;
  const text = body.replace(/\r\n/g, "\n").trim();
  return text && text.length <= NOTE_MAX ? text : null;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Search: every word typed is somewhere in the note, in any order, with
 * case and accents ignored ("nino" finds "Niño"). An empty search is
 * everything. */
export function noteMatches(body: string, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = fold(body);
  return words.every((w) => text.includes(w));
}

/** A note's first line, for the list and for "Delete …?". */
export function noteTitle(body: string): string {
  const first = body.split("\n").find((l) => l.trim())?.trim() ?? "";
  return first.length > 80 ? `${first.slice(0, 77).trimEnd()}…` : first;
}
