import { test, expect } from "@playwright/test";
import { REACTIONS, isReaction } from "@/lib/chat";

/** What may be sent back to a message without words.
 *
 * reactToMessageAction took its emoji as a plain string and wrote it through,
 * and family_message_reactions.emoji has no CHECK behind it, so nothing
 * anywhere had an opinion. Measured on 9 September against the throwaway
 * households: a whole sentence was accepted as a reaction, and so were five
 * thousand characters -- which then render in the chip under that message,
 * on the thread, for everybody in the household.
 *
 * The same shape as the currency bug found in Settings the same day: one
 * public endpoint, no validation, and the result stored where the whole
 * household has to look at it.
 */

test("the six the composer offers are accepted", () => {
  expect(REACTIONS.length, "six, as the picker renders").toBe(6);
  for (const r of REACTIONS) expect(isReaction(r), r).toBe(true);
});

test("a sentence is not a reaction", () => {
  expect(isReaction("not an emoji at all")).toBe(false);
  expect(isReaction("")).toBe(false);
});

test("nor is five thousand characters, which is what was actually stored", () => {
  expect(isReaction("X".repeat(5000))).toBe(false);
});

test("nor an emoji we simply do not offer", () => {
  // Refused because it is not on the list, not because it is not an emoji --
  // the check is membership, which is the only kind that cannot be argued
  // with by a caller who knows more Unicode than we do.
  expect(isReaction("🎉")).toBe(false);
  expect(isReaction("👍🏽"), "a skin-tone variant is a different string").toBe(false);
});

test("every reaction the picker renders is one the server accepts", () => {
  // The point of the shared list: the picker is built from it, so a reaction
  // somebody can actually tap can never come back refused.
  for (const r of REACTIONS) expect(isReaction(r)).toBe(true);
  expect(new Set(REACTIONS).size, "and none of them is listed twice").toBe(REACTIONS.length);
});
