/** Highlights (29 September): a photo or short video the household sees for
 * 24 hours. The limits and the pure checks live here so the phone, the upload
 * session and the tests all use the same numbers. */

export const HIGHLIGHT_PHOTO_BYTES = 15 * 1024 * 1024;
export const HIGHLIGHT_VIDEO_BYTES = 25 * 1024 * 1024;
export const HIGHLIGHT_MAX_SECONDS = 30;
/** How long a photo stays up in the viewer before the next one. */
export const HIGHLIGHT_PHOTO_MS = 5000;

/** Why a picked file can't be a highlight, in words, or null when it can.
 * `seconds` is the video's length, read on the phone before uploading. */
export function highlightRefusal(file: { type: string; size: number }, seconds?: number | null): string | null {
  if (file.type.startsWith("image/")) {
    return file.size > HIGHLIGHT_PHOTO_BYTES ? "That photo is too large for a highlight. The limit is 15 MB." : null;
  }
  if (file.type.startsWith("video/")) {
    if (seconds != null && seconds > HIGHLIGHT_MAX_SECONDS + 0.5) return `Highlights can be up to ${HIGHLIGHT_MAX_SECONDS} seconds. Trim the video and try again.`;
    return file.size > HIGHLIGHT_VIDEO_BYTES ? "That video is too large for a highlight. The limit is 25 MB — a shorter clip will fit." : null;
  }
  return "A highlight is a photo or a video.";
}

/** "23h left", "40m left", "Ending" -- how long a highlight has. */
export function timeLeft(expiresAt: string, now = Date.now()): string {
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 60_000) return "Ending";
  const h = Math.floor(ms / 3_600_000);
  return h >= 1 ? `${h}h left` : `${Math.floor(ms / 60_000)}m left`;
}

/** The order the rings are shown in: yours first, then whoever posted most
 * recently. Each person's own highlights play oldest first, like stories. */
export function groupHighlights<T extends { memberId: string; createdAt: string }>(items: T[], me: string): { memberId: string; items: T[] }[] {
  const by = new Map<string, T[]>();
  for (const h of [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    by.set(h.memberId, [...(by.get(h.memberId) ?? []), h]);
  }
  const latest = (g: T[]) => g[g.length - 1].createdAt;
  return [...by.entries()]
    .map(([memberId, items]) => ({ memberId, items }))
    .sort((a, b) => (a.memberId === me ? -1 : b.memberId === me ? 1 : latest(b.items).localeCompare(latest(a.items))));
}
