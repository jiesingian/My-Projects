/** "Send it to Kin" (Jonathan, 20 October; Kin Plus): from the iPhone share
 * sheet, a Shortcut posts a screenshot -- a school circular, a Viber or
 * Messenger message -- to the member's private link; Kin keeps it for a
 * moment (sent_screenshots, 20261020230000) and answers with the address of
 * Planner -> Add, which reads it, scans it the way a flyer is scanned, and
 * shows the dates, places and tasks to tick. The same review screen, the
 * same rules: nothing is saved until the member says so.
 *
 * The parts that are not the database or the model, so
 * e2e/send-to-kin.logic.spec.ts can hold them. */

export const SENT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type SentImageType = (typeof SENT_IMAGE_TYPES)[number];
/** A phone screenshot is 0.5-3 MB as PNG; the table refuses above this. */
export const SENT_MAX_BYTES = 5 * 1024 * 1024;

/** The picture's type as the Shortcut sent it. "Get Contents of URL" with a
 * File body sends the file's own type; a JPEG from Photos sometimes arrives
 * as image/jpg, and a HEIC cannot be read at all. */
export function sentImageType(contentType: string | null): SentImageType | null {
  const t = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (t === "image/jpg" || t === "image/pjpeg") return "image/jpeg";
  return (SENT_IMAGE_TYPES as readonly string[]).includes(t) ? (t as SentImageType) : null;
}

/** Where the Shortcut's "Open URLs" lands: Planner -> Add, with the waiting
 * screenshot's id. The host is the request's own, so a preview and
 * production each open themselves. */
export function sentOpenUrl(host: string, id: string): string {
  return `https://${host}/planner/add?sent=${encodeURIComponent(id)}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The id from the address, or null for anything that is not one. */
export function sentIdFrom(raw: string | undefined | null): string | null {
  return raw && UUID.test(raw) ? raw.toLowerCase() : null;
}

/** What the Shortcut shows (or says) when it cannot send. Sentences, as the
 * other links' answers are, because "Show Result" is how they come back. */
export const SENT_SAYS = {
  unknown: "This Kin link isn't working any more. Make a new one in Kin, under Settings, Action Button and widget.",
  plus: "Send it to Kin is part of Kin Plus. See Settings, Your plan, in Kin.",
  picture: "Kin can only take a screenshot or photo (JPEG or PNG) under 5 MB. Share the picture itself, not a file or a link.",
  busy: "Kin couldn't take that just now. Try again in a minute.",
} as const;
