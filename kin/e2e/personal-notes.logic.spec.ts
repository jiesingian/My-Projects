import { test, expect } from "@playwright/test";
import { cleanNote, noteMatches, noteTitle, NOTE_MAX } from "@/lib/personal-notes";

/** My notes (19 October). Who can see a note is row-level security's job
 * (supabase/tests/pglite/probes/personal-notes.mjs); these are the rules the
 * screen adds on top. */

test("a note is saved trimmed, and an empty or too-long one is refused", () => {
  expect(cleanNote("  buy Lola a gift\r\nsize M  ")).toBe("buy Lola a gift\nsize M");
  expect(cleanNote("   \n ")).toBeNull();
  expect(cleanNote(undefined)).toBeNull();
  expect(cleanNote("x".repeat(NOTE_MAX))).toHaveLength(NOTE_MAX);
  expect(cleanNote("x".repeat(NOTE_MAX + 1))).toBeNull();
});

test("search finds every word typed, in any order, ignoring case and accents", () => {
  const note = "Niño's school shoes: size 4, Rustan's";
  expect(noteMatches(note, "")).toBe(true);
  expect(noteMatches(note, "nino")).toBe(true);
  expect(noteMatches(note, "SHOES size")).toBe(true);
  expect(noteMatches(note, "size shoes")).toBe(true);
  expect(noteMatches(note, "shoes sandals")).toBe(false);
});

test("a note's title is its first line with words in it", () => {
  expect(noteTitle("\n  Passport renewal \nbring 2 IDs")).toBe("Passport renewal");
  expect(noteTitle("a".repeat(100))).toHaveLength(78);
});
