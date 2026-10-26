import type { BriefItem } from "@/lib/queries/today";
import type { OpenCard } from "@/lib/queries/time-capsules";
import type { FeedOccasion } from "@/lib/occasions";

/** The rest of the household on Today (Jonathan, 23 October): a document
 * running out, a card waiting for a signature, a message that did not
 * send, a vault request waiting on a grown-up, a linked household's
 * birthday, and the monito-monita's exchange day -- each of which pushed
 * or sat on its own tab while Today said nothing. Pure; queries/today-family
 * reads the rows under the member's own policies. */

export type DocumentLike = { id: string; title: string; doc_type: string | null; expires_at: string | null; folder_id: string | null };
export type FailedMessageLike = { id: string; body: string; thread: string; send_at: string };
export type VaultRequestLike = { id: string; memberName: string; reason: string | null; status: string; waitDays: number | null };
export type GiftDrawLike = { id: string; title: string; exchange_date: string };

const DAY_MS = 86_400_000;

function daysUntil(today: string, day: string): number {
  return Math.round((Date.parse(day) - Date.parse(today)) / DAY_MS);
}

function onDay(today: string, day: string): string {
  const n = daysUntil(today, day);
  return n === 1 ? "tomorrow" : `on ${new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })}`;
}

/** A passport takes weeks to renew, so it is heard of a month ahead; the
 * rest, a week. An expired one stays for a month, then is the folder's. */
export function documentWindow(docType: string | null): number {
  return /passport/i.test(docType ?? "") ? 30 : 7;
}

export function documentRows(docs: DocumentLike[], today: string): { today: BriefItem[]; soon: BriefItem[] } {
  const rows: BriefItem[] = [];
  const soon: BriefItem[] = [];
  for (const d of docs) {
    if (!d.expires_at) continue;
    const day = d.expires_at.slice(0, 10);
    const n = daysUntil(today, day);
    const href = d.folder_id ? `/family/documents/${d.folder_id}` : "/family?seg=documents";
    const base = { icon: "fileText" as const, tint: "home" as const, title: d.title, href };
    if (n <= 0 && n >= -30) {
      rows.push({ ...base, id: `doc-${d.id}`, urgent: true, meta: n === 0 ? "expires today · renew it" : `expired ${-n === 1 ? "yesterday" : `${-n} days ago`} · renew it` });
    } else if (n >= 1 && n <= documentWindow(d.doc_type)) {
      soon.push({ ...base, id: `soon-doc-${d.id}`, meta: n <= 7 ? `expires ${onDay(today, day)} · renew it` : `expires in ${n} days · renew it`, at: n, whose: "family", memberIds: [] });
    }
  }
  return { today: rows, soon };
}

/** A card open for the reader to sign (open_cards): whose day and when;
 * never a word of what others wrote. */
export function cardRows(cards: OpenCard[], today: string): BriefItem[] {
  return cards
    .filter((c) => !c.signedByMe)
    .map((c) => ({
      id: `card-${c.recipientMemberId}-${c.opensOn}`,
      icon: "gift" as const,
      tint: "occasion" as const,
      title: `Sign ${c.recipientName}'s card`,
      meta: [c.occasion, `opens ${daysUntil(today, c.opensOn) <= 7 ? onDay(today, c.opensOn) : c.opensOn}`, c.signers.length > 0 ? `${c.signers.length} signed` : "nobody has signed yet"].filter(Boolean).join(" · "),
      href: "/journal",
    }));
}

/** Where a chat thread key opens. */
export function threadHref(thread: string): string {
  if (thread === "household") return "/chat/household";
  if (thread === "family") return "/chat/family";
  const dm = /^dm:([0-9a-f-]{36})$/.exec(thread);
  if (dm) return `/chat/dm/${dm[1]}`;
  const group = /^group:([0-9a-f-]{36})$/.exec(thread);
  if (group) return `/chat/groups/${group[1]}`;
  return "/chat";
}

/** A scheduled message that failed to send (scheduled_messages.failed):
 * said once, since nothing else would. */
export function failedMessageRows(messages: FailedMessageLike[]): BriefItem[] {
  return messages.map((m) => {
    const snippet = m.body.trim().replace(/\s+/g, " ");
    return {
      id: `message-${m.id}`,
      icon: "message" as const,
      tint: "schedule" as const,
      title: "A message didn't send",
      meta: `“${snippet.length > 60 ? `${snippet.slice(0, 57)}…` : snippet}” · send it again`,
      href: threadHref(m.thread),
      urgent: true,
    };
  });
}

/** A vault emergency request still waiting: the grown-ups answer it in
 * Privacy & lock, behind their own lock, so the row opens there. */
export function vaultRequestRows(requests: VaultRequestLike[]): BriefItem[] {
  return requests
    .filter((r) => r.status === "waiting")
    .map((r) => ({
      id: `vault-${r.id}`,
      icon: "shieldCheck" as const,
      tint: "home" as const,
      title: `${r.memberName} asks for the vault`,
      meta: [r.reason?.trim() || "emergency access", r.waitDays ? `opens by itself in ${r.waitDays} day${r.waitDays === 1 ? "" : "s"} unless answered` : null, "answer in Privacy & lock"].filter(Boolean).join(" · "),
      href: "/settings/privacy",
      urgent: true,
    }));
}

/** A linked household's birthday or anniversary today (feed_occasions_today):
 * seen, like the household's own. */
export function occasionRows(occasions: FeedOccasion[]): BriefItem[] {
  return occasions
    .filter((o) => !o.isOurs)
    .map((o) => ({
      id: `occasion-${o.eventId}`,
      icon: o.kind === "birthday" ? ("cupcake" as const) : ("gift" as const),
      tint: "occasion" as const,
      title: o.title,
      meta: [o.years ? (o.kind === "birthday" ? `Turns ${o.years} today` : `${o.years} years today`) : "Today", `${o.householdName} household`].join(" · "),
      href: "/journal",
    }));
}

/** The monito-monita's exchange day this week, outside Pasko on Today
 * (lib/christmas covers December). */
export function giftDrawSoon(draws: GiftDrawLike[], today: string): BriefItem[] {
  return draws.flatMap((d) => {
    const n = daysUntil(today, d.exchange_date);
    if (n < 1 || n > 7) return [];
    return [{ id: `soon-draw-${d.id}`, icon: "gift" as const, tint: "occasion" as const, title: `Gift exchange · ${d.title}`, meta: `Exchange ${onDay(today, d.exchange_date)} · got your gift?`, href: `/planner/monito/${d.id}`, at: n, whose: "family" as const, memberIds: [] }];
  });
}
