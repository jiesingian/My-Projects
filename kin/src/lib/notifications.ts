/** The notifications a member can switch on or off.
 *
 * Kept in a plain module rather than beside the toggles, because the server
 * action that writes them has to check the key it is handed against this list.
 * notification_prefs is a JSONB column, so without that check a caller could
 * put any key -- or any amount of them -- into their own row. */
export const NOTIFICATION_DEFS = [
  { key: "events", name: "Events and schedules", sub: "Day before, and one hour ahead" },
  { key: "health", name: "Health reminders", sub: "Vaccinations, check-ups, medication" },
  { key: "bills", name: "Bills and utilities", sub: "Three days before due date" },
  { key: "journal", name: "Journal activity", sub: "When someone adds photos or a note" },
  { key: "shopping", name: "Shopping list", sub: "When an item is added by another member" },
] as const;

export type NotificationKey = (typeof NOTIFICATION_DEFS)[number]["key"];

const KEYS = new Set<string>(NOTIFICATION_DEFS.map((n) => n.key));

export function isNotificationKey(key: string): key is NotificationKey {
  return KEYS.has(key);
}
