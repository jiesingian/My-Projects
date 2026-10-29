/** A guest link on an event (20261020231000_event_guest_links.sql): a
 * relative with no account answers by name. Pure, so the guest page, the
 * event screen and the logic tests read the same rules the database keeps
 * (guest_clean_name, guest_link_live, the caps). */

export const GUEST_NAME_MAX = 40;
export const GUEST_HEADCOUNT_MAX = 20;
export const GUESTS_PER_EVENT = 40;
export const GUEST_DISHES_MAX = 3;
/** The link works this many days after the event's last day. */
export const GUEST_LINK_GRACE_DAYS = 7;

export const GUEST_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** A guest's name as the database keeps it: spaces collapsed and trimmed,
 * 1 to 40 characters, nothing that could be markup (< >) and no control
 * characters. Null when nothing usable is left. */
export function cleanGuestName(raw: string | null | undefined): string | null {
  const n = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!n || n.length > GUEST_NAME_MAX) return null;
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
  if (/[<>]/.test(n) || /[\u0000-\u001f\u007f]/.test(n)) return null;
  return n;
}

/** Two names that are the same guest: case and spacing aside. */
export function guestNameKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

/** How the household sees a guest: "Tita Baby (by link)". */
export function guestLabel(name: string): string {
  return `${name} (by link)`;
}

type EventDays = { event_date: string; end_date?: string | null; recurs_yearly?: boolean | null };

const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

function lastDay(e: EventDays): string {
  return e.end_date && e.end_date > e.event_date ? e.end_date : e.event_date;
}

/** A link can be made on a one-off event whose last day has not gone. */
export function guestLinkCanBeMade(e: EventDays, today: string): boolean {
  return !e.recurs_yearly && lastDay(e) >= today;
}

/** The link still opens: through the event's last day and seven days after. */
export function guestLinkLive(e: EventDays, today: string): boolean {
  if (e.recurs_yearly) return false;
  return (day(today) - day(lastDay(e))) / 86_400_000 <= GUEST_LINK_GRACE_DAYS;
}

export type GuestRow = { id: string; name: string; answer: string | null; headcount: number };

export type GuestGroups = Record<"going" | "maybe" | "no", { id: string; name: string; heads: number }[]>;

/** Guests by answer, labelled for the household, headcount on each. A guest
 * who has not answered (only claimed a dish, say) is in no group. */
export function groupGuests(guests: GuestRow[]): GuestGroups {
  const groups: GuestGroups = { going: [], maybe: [], no: [] };
  for (const g of guests) {
    if (g.answer === "going" || g.answer === "maybe" || g.answer === "no") {
      groups[g.answer].push({ id: g.id, name: guestLabel(g.name), heads: g.answer === "going" || g.answer === "maybe" ? g.headcount : 1 });
    }
  }
  return groups;
}

/** "Tita Baby (by link) ×4" when more than one is coming. */
export function guestHeadsLabel(name: string, heads: number): string {
  return heads > 1 ? `${name} ×${heads}` : name;
}

/** How many people a group stands for: members count one, guests their
 * headcount. */
export function headsIn<T extends { heads?: number }>(people: T[]): number {
  return people.reduce((n, p) => n + (p.heads ?? 1), 0);
}

/** "Going 5 · maybe 2" for the host's link card. */
export function guestsLine(guests: GuestRow[]): string {
  if (guests.length === 0) return "Nobody has answered by link yet";
  const g = groupGuests(guests);
  const parts = [
    g.going.length ? `${headsIn(g.going)} going` : "",
    g.maybe.length ? `${headsIn(g.maybe)} maybe` : "",
    g.no.length ? `${g.no.length} can't go` : "",
  ].filter(Boolean);
  return `${guests.length} by link${parts.length ? ` · ${parts.join(" · ")}` : ""}`;
}

/** The share-sheet message beside the link, written once by Kin and sent by
 * the host themselves. */
export function guestInviteMessage(eventTitle: string, when: string, url: string): string {
  return `You're invited: ${eventTitle}, ${when}. Tap to say if you're coming and what you'll bring (no app needed): ${url}`;
}

/** What the guest page keeps on the phone: the name typed, per link. */
export const GUEST_NAME_KEY = (token: string) => `kin-guest-${token.slice(0, 12)}`;

/** The guest's own state as guest_state() returns it. */
export type GuestState = {
  name: string;
  answer: "going" | "maybe" | "no" | null;
  headcount: number;
  claims: Record<string, number>;
  dishes: number;
  in_draw: boolean;
  pick: { name: string; household: string; wishes: string[] } | null;
};

export function isGuestState(v: unknown): v is GuestState {
  return !!v && typeof v === "object" && typeof (v as GuestState).name === "string" && typeof (v as GuestState).headcount === "number";
}

/** What is left of a name for telling two guests apart: lower case, no
 * punctuation, and no title in front -- "Tita Bing" and "bing" are one
 * person to whoever typed them. */
const GUEST_TITLES = new Set(["tita", "tito", "ate", "kuya", "lola", "lolo", "ninang", "ninong", "auntie", "aunt", "uncle", "mr", "mrs", "ms", "dr"]);
function nameWords(name: string): string[] {
  const words = guestNameKey(name)
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .split(" ")
    .filter(Boolean);
  const bare = words.filter((w) => !GUEST_TITLES.has(w));
  return bare.length ? bare : words;
}

function oneEditApart(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** Guests by link type their own names, so one relative can arrive twice:
 * "Tita Bing" and "Bing Santos", "Marites" and "Maritess" (29 October). For
 * each guest that looks like one listed before them, the earlier name -- so
 * the household can take one off. A match needs every word of the shorter
 * name in the longer one: "Ana" and "Ana Cruz" match, "Ana Cruz" and "Ana
 * Reyes" do not. */
export function likelySameGuests(guests: { id: string; name: string }[]): Map<string, string> {
  const out = new Map<string, string>();
  const seen: { name: string; words: string[] }[] = [];
  for (const g of guests) {
    const words = nameWords(g.name);
    const twin = seen.find((s) => {
      const [short, long] = s.words.length <= words.length ? [s.words, words] : [words, s.words];
      if (short.length === 0) return false;
      // Every word of the shorter name in the longer one, allowing a slip of
      // one letter in words of four or more.
      return short.every((w) => long.some((l) => l === w || (w.length >= 4 && l.length >= 4 && oneEditApart(w, l))));
    });
    if (twin) out.set(g.id, twin.name);
    seen.push({ name: g.name, words });
  }
  return out;
}
