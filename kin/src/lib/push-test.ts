/** "Send me a test" (Settings -> Notifications, 20261020210000): one row per
 * kind of push the household can receive. A kind worded in the database is
 * sampled by sample_push(); one worded in the app by its own builder
 * (lib/push-words.ts, lib/member-card.ts). Either way the test is the real
 * words, link and icon, with "Test: " in front. */

export const PUSH_TEST_KINDS = [
  { key: "dose", name: "A medicine is due", sub: "Time for Grandma's Losartan", where: "sql" },
  { key: "missed_dose", name: "A missed dose", sub: "Not ticked an hour after it was due", where: "sql" },
  { key: "refill", name: "A refill", sub: "Runs out in about 5 days; added to the list", where: "sql" },
  { key: "undas", name: "All Saints' Day", sub: "Three days before 1 November", where: "sql" },
  { key: "remembrance", name: "A remembrance day", sub: "The 40th day, the first year, an anniversary", where: "sql" },
  { key: "money_recap", name: "The monthly money recap", sub: "On the 1st", where: "sql" },
  { key: "week_ahead", name: "The week ahead", sub: "Sunday at 7pm", where: "sql" },
  { key: "plan", name: "A plan in 30 minutes", sub: "Time to get going", where: "sql" },
  { key: "tree_story", name: "A tree story", sub: "Someone added a story about a relative", where: "app" },
  { key: "helper_line", name: "The helper's line", sub: "What a helper's phone gets when the family adds to the list", where: "app" },
  { key: "arrived", name: "I've arrived", sub: "Someone has arrived", where: "app" },
  { key: "sos", name: "An SOS", sub: "Urgent; stays on screen", where: "app" },
  { key: "checkin", name: "Are you okay?", sub: "One tap to answer", where: "app" },
] as const;

export type PushTestKind = (typeof PUSH_TEST_KINDS)[number]["key"];

const KEYS = new Set<string>(PUSH_TEST_KINDS.map((k) => k.key));

export function isPushTestKind(key: string): key is PushTestKind {
  return KEYS.has(key);
}

/** How many a person may send in a minute (push_test_allowed). */
export const PUSH_TESTS_PER_MINUTE = 5;

/** "Test: Time for Lola's Losartan": the real title, marked as a test, and
 * kept inside the title's 80 characters. */
export function testTitle(title: string): string {
  return `Test: ${title}`.slice(0, 80);
}
