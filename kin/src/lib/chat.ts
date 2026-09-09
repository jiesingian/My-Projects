/** What may be said back to a message without saying anything.
 *
 * The six the composer offers, in one place, because the server has to check
 * them and the picker has to render them and the two must not drift -- the
 * same reason `household-prefs.ts` and `profile-fields.ts` exist.
 *
 * What went wrong without it, measured on 9 September against the throwaway
 * households: `reactToMessageAction` took its emoji as a plain string and
 * wrote it through. There is no CHECK on the column either, so the database
 * had no opinion. A whole sentence was accepted as a reaction, and so were
 * five thousand characters of X -- which then render in the reaction chip
 * under that message, on the thread, for everybody in the household.
 *
 * It is the same shape as the currency bug found in Settings the same day:
 * one public endpoint, no validation, and the result is stored where the
 * whole household has to look at it.
 */
export const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

export type Reaction = (typeof REACTIONS)[number];

export function isReaction(value: string): value is Reaction {
  return (REACTIONS as readonly string[]).includes(value);
}
