import { familyInstant } from "@/lib/time";

/** The two instants an activity is made of, or a sentence saying why not.
 *
 * These were built by hand -- `new Date(`${date}T${from}`)` -- which fails in
 * the two ways lib/time.ts documents, and both were measured on this form on
 * 9 September:
 *
 *   2026-09-31 09:00  ->  1 October, silently, no error anywhere
 *   2026-09-15 25:00  ->  Invalid Date, and .toISOString() then throws
 *
 * The first is the worse one. Somebody asks for the 31st of a thirty-day
 * month -- which people do, and which a date field pasted or typed into
 * allows -- and the activity is filed on a different day from the one they
 * chose, with nothing to say so.
 *
 * familyInstant was written for exactly this and applied to the assistant's
 * tools, where a model was composing the same strings. The form a person uses
 * was left as it was, so the AI path was careful and the human one was not.
 */
export function activityInstants(date: string, from: string, to: string): { startAt: Date; endAt: Date | null } | { error: string } {
  const startAt = familyInstant(date, from || "09:00");
  if (!startAt) return { error: "That date and start time aren't a real moment — check them." };
  if (!to) return { startAt, endAt: null };
  const endAt = familyInstant(date, to);
  if (!endAt) return { error: "That end time isn't a real time — check it." };
  // Nothing in the database refuses this, and an activity that ends before it
  // begins renders as a negative span wherever a duration is shown.
  if (endAt.getTime() < startAt.getTime()) return { error: "It ends before it starts." };
  return { startAt, endAt };
}
