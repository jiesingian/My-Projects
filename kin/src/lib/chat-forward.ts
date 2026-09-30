/** Forwarding a message into another conversation (20260930031500). The
 * pure half, so the rules can be tested without a database: which
 * conversations a key names, what the label says, where a copied file goes,
 * and which files a conversation can take. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ForwardKind = "household" | "family" | "dm" | "group";

/** Where a message came from: its conversation kind and its id. */
export type ForwardSource = { kind: ForwardKind; id: string };

/** A conversation it can go to, by the same keys the chat list uses:
 * 'household', 'family', 'dm:<person>', 'group:<group>'. */
export type ForwardTarget = { key: string; kind: ForwardKind; title: string; subtitle: string; avatarUrl?: string | null };

/** At most this many conversations in one forward. Telegram has no limit;
 * a family has no need of one bigger than this, and it bounds the work one
 * tap can start. */
export const MAX_FORWARD_TARGETS = 5;

export type ParsedTarget = { kind: "household" } | { kind: "family" } | { kind: "dm"; id: string } | { kind: "group"; id: string };

export function parseTargetKey(key: string): ParsedTarget | null {
  if (key === "household" || key === "family") return { kind: key };
  const m = /^(dm|group):(.+)$/.exec(key);
  if (!m || !UUID.test(m[2])) return null;
  return m[1] === "dm" ? { kind: "dm", id: m[2].toLowerCase() } : { kind: "group", id: m[2].toLowerCase() };
}

export function isForwardSource(value: unknown): value is ForwardSource {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.kind === "string" &&
    ["household", "family", "dm", "group"].includes(v.kind) &&
    typeof v.id === "string" &&
    UUID.test(v.id)
  );
}

/** "Forwarded from Mama": the original writer's first name, or the name it
 * already carried when it was itself a forward -- a message passed along
 * twice is still Mama's words. */
export function forwardLabel(authorName: string | null | undefined, alreadyFrom?: string | null): string | null {
  const from = (alreadyFrom ?? "").trim() || (authorName ?? "").trim().split(/\s+/)[0] || "";
  return from ? from.slice(0, 60) : null;
}

/** Where the forwarder's copy of a file goes: their own household's chat
 * folder, which is the only place either attachment table accepts. Keeps the
 * original's readable name after the timestamp, as uploads do. */
export function forwardedPath(familyId: string, originalPath: string, now = Date.now(), nonce = "00000000"): string {
  const base = (originalPath.split("/").pop() ?? "file").replace(/^\d{10,}-[0-9a-f]{8}-/, "");
  return `${familyId}/chat/${now}-${nonce.slice(0, 8)}-fwd-${base || "file"}`.slice(0, 900);
}

/** The family room, one to one and groups take photos, videos and voice
 * notes; only the household chat takes other files (a PDF, a receipt). */
export function fileFitsTarget(kind: ForwardKind, mimeType: string): boolean {
  return kind === "household" || /^(image|video|audio)\//.test(mimeType);
}
