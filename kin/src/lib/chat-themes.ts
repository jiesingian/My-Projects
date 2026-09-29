/** Chat themes (29 September): a thread's background and bubble colour,
 * shared by everyone in the thread (chat_themes, keyed by the thread's
 * realtime topic). Each has a light and a dark background so the thread stays
 * readable whichever mode a phone is in. The drawing is all in globals.css
 * under [data-chat-theme]; this is the list and the names. */

export type ChatTheme = { id: string; label: string; swatch: string };

export const CHAT_THEMES: ChatTheme[] = [
  { id: "default", label: "Kin", swatch: "var(--color-accent)" },
  { id: "sunset", label: "Sunset", swatch: "linear-gradient(135deg, #ffb88c, #de6262)" },
  { id: "ocean", label: "Ocean", swatch: "linear-gradient(135deg, #8fd3f4, #1e6f9f)" },
  { id: "garden", label: "Garden", swatch: "linear-gradient(135deg, #c6ea8d, #3a7d44)" },
  { id: "lavender", label: "Lavender", swatch: "linear-gradient(135deg, #e0c3fc, #8e6fd8)" },
  { id: "candy", label: "Candy", swatch: "linear-gradient(135deg, #ffd1dc, #f06292)" },
  { id: "hearts", label: "Hearts", swatch: "radial-gradient(circle at 30% 30%, #ff8fab 0 18%, transparent 19%), linear-gradient(135deg, #ffe3ec, #ff4d6d)" },
  { id: "stars", label: "Starry night", swatch: "radial-gradient(circle at 30% 30%, #fff 0 6%, transparent 7%), linear-gradient(135deg, #243b55, #141e30)" },
  { id: "sunny", label: "Sunny", swatch: "linear-gradient(135deg, #fff3b0, #f9a825)" },
];

const known = new Set(CHAT_THEMES.map((t) => t.id));

/** An id the app draws, or "default" for anything it doesn't know. */
export function chatTheme(id: string | null | undefined): string {
  return id && known.has(id) ? id : "default";
}

/** The topic a thread's theme is kept under: the same name its live channel
 * uses, which is what the database's chat_topic_is_mine() understands. */
export function householdTopic(familyId: string) {
  return `family-chat:${familyId}`;
}
