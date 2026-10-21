/** A thread on each event (20261014100000_event_comments.sql): the small
 * rules the event's screen, the Events list and the new-comment push read. */

export const COMMENT_MAX = 1000;

/** Who hears about a new comment: the people the event is for, or -- a
 * "Whole family" event, or one naming nobody -- the whole household
 * (`undefined`, which sendPush reads as the whole household). The writer is never
 * among them; push_targets leaves the caller out. */
export function threadAudience(e: { applies_to_whole_family: boolean }, memberIds: string[]): string[] | undefined {
  return e.applies_to_whole_family || memberIds.length === 0 ? undefined : memberIds;
}

/** "3 comments" on an Events row; nothing when there are none. */
export function commentCountLine(n: number): string {
  if (n <= 0) return "";
  return n === 1 ? "1 comment" : `${n} comments`;
}

/** How long ago, short: "now", "5m", "3h", "2d" -- as under a photo. */
export function commentAge(iso: string, now: number): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
