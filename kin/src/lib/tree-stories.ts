/** Stories on the tree (14 October; 20261014204000_tree_person_stories): the
 * pure parts, so they can be checked without a database or a browser --
 * reading "about 1975" into a date the database can keep, saying it back,
 * what kind of file something is, and the small count on a tree tile. */

export type StoryPrecision = "day" | "month" | "year" | "decade";

/** A recorded story can run long -- Lola does not stop at two minutes the
 * way a chat voice note does -- but a recorder left on in a bag should not
 * become an hour's upload. Twenty minutes is a long sitting. */
export const STORY_RECORDING_MAX_SECONDS = 20 * 60;
export const STORY_TITLE_MAX = 160;
export const STORY_BODY_MAX = 20000;
export const STORY_TELLER_MAX = 120;
/** The words a phone wrote down while it recorded: twenty minutes of Lola
 * talking is far more than a chat voice note's 5,000 characters. */
export const STORY_TRANSCRIPT_MAX = 20000;
/** Files on one story: a recording and a small album of old photos. */
export const STORY_FILES_MAX = 12;
/** What a story's files may be, as the database checks it. */
export const STORY_FILE_TYPES = /^(image\/|audio\/|application\/pdf$)/;

const MONTHS: Record<string, number> = {};
[
  ["january", "jan", "enero"],
  ["february", "feb", "pebrero"],
  ["march", "mar", "marso"],
  ["april", "apr", "abril"],
  ["may", "mayo"],
  ["june", "jun", "hunyo"],
  ["july", "jul", "hulyo"],
  ["august", "aug", "agosto"],
  ["september", "sep", "sept", "setyembre"],
  ["october", "oct", "oktubre"],
  ["november", "nov", "nobyembre"],
  ["december", "dec", "disyembre"],
].forEach((names, i) => names.forEach((n) => (MONTHS[n] = i + 1)));
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const pad = (n: number) => String(n).padStart(2, "0");

/** Reads what somebody typed for when a story happened. A year is enough,
 * and so is a decade ("the 1960s"); a month and a year, or a whole date,
 * are kept as exactly that. "About", "around", "c." and the Filipino "mga"
 * and "noong" are let through, since every year in a story like this is
 * about. Empty means not known, which is fine. `today` is the household's
 * own day ("YYYY-MM-DD"), so nothing can be dated after it. */
export function parseStoryWhen(input: string, today: string): { on: string | null; precision: StoryPrecision } | { error: string } {
  let s = input.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");
  s = s.replace(/^(about|around|circa|ca\.?|c\.|mga|noong|in|the)\s+/g, "").replace(/^(the)\s+/, "").trim();
  if (!s) return { on: null, precision: "year" };

  const thisYear = Number(today.slice(0, 4));
  const yearOk = (y: number) => y >= 1000 && y <= thisYear;
  const tooLate = "That's after today. A story's date has already happened.";
  const unread = "Write a year (1975), a month and year (May 1975) or a date (3 May 1975).";

  // A decade: 1960s, 1960's.
  let m = s.match(/^(\d{3})0'?s$/);
  if (m) {
    const y = Number(m[1]) * 10;
    if (!yearOk(y)) return { error: y > thisYear ? tooLate : unread };
    return { on: `${y}-01-01`, precision: "decade" };
  }
  // A year.
  m = s.match(/^(\d{4})$/);
  if (m) {
    const y = Number(m[1]);
    if (!yearOk(y)) return { error: y > thisYear ? tooLate : unread };
    return { on: `${y}-01-01`, precision: "year" };
  }

  let y: number | null = null;
  let mo: number | null = null;
  let d: number | null = null;
  if ((m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/))) {
    // 1975-05 or 1975-05-03, as a date input sends it.
    y = Number(m[1]);
    mo = Number(m[2]);
    d = m[3] ? Number(m[3]) : null;
  } else if ((m = s.match(/^(\d{1,2}) ([a-z.]+) (\d{4})$/))) {
    // 3 May 1975
    d = Number(m[1]);
    mo = MONTHS[m[2].replace(/\.$/, "")] ?? null;
    y = Number(m[3]);
  } else if ((m = s.match(/^([a-z.]+) (\d{1,2}) (\d{4})$/))) {
    // May 3, 1975
    mo = MONTHS[m[1].replace(/\.$/, "")] ?? null;
    d = Number(m[2]);
    y = Number(m[3]);
  } else if ((m = s.match(/^([a-z.]+) (\d{4})$/))) {
    // May 1975
    mo = MONTHS[m[1].replace(/\.$/, "")] ?? null;
    y = Number(m[2]);
  }
  if (y === null || mo === null || mo < 1 || mo > 12) return { error: unread };
  if (y > thisYear) return { error: tooLate };
  if (!yearOk(y)) return { error: unread };
  if (d === null) {
    const on = `${y}-${pad(mo)}-01`;
    if (on.slice(0, 7) > today.slice(0, 7)) return { error: tooLate };
    return { on, precision: "month" };
  }
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return { error: "That date isn't a real date." };
  const on = `${y}-${pad(mo)}-${pad(d)}`;
  if (on > today) return { error: tooLate };
  return { on, precision: "day" };
}

/** A story's date as a person says it: "3 May 1975", "May 1975", "1975",
 * "the 1960s". Empty when it isn't known. */
export function formatStoryWhen(on: string | null, precision: string): string {
  if (!on) return "";
  const y = on.slice(0, 4);
  const mo = Number(on.slice(5, 7));
  const d = Number(on.slice(8, 10));
  switch (precision) {
    case "decade":
      return `the ${y.slice(0, 3)}0s`;
    case "month":
      return `${MONTH_NAMES[mo - 1]} ${y}`;
    case "day":
      return `${d} ${MONTH_NAMES[mo - 1]} ${y}`;
    default:
      return y;
  }
}

/** What the "When" box shows when a story is opened to edit: what was
 * kept, in words parseStoryWhen reads back the same. */
export function storyWhenInput(on: string | null, precision: string): string {
  if (!on) return "";
  return precision === "decade" ? `${on.slice(0, 3)}0s` : formatStoryWhen(on, precision);
}

export type StoryFileKind = "audio" | "photo" | "document";

/** How a story's file is shown: played, looked at, or opened. */
export function storyFileKind(mimeType: string): StoryFileKind | null {
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("image/")) return "photo";
  if (mimeType === "application/pdf") return "document";
  return null;
}

/** The mark on a tree tile: how many stories, kept to one or two
 * characters so it never widens the tile. Empty for none. */
export function storyMark(count: number): string {
  if (!(count > 0)) return "";
  return count > 9 ? "9+" : String(count);
}

export function storyCountLabel(count: number): string {
  if (!(count > 0)) return "No stories yet";
  return count === 1 ? "1 story" : `${count} stories`;
}

/** "Told by Lola" -- a member's name when a member told it, the words typed
 * otherwise, and nothing when nobody said. */
export function tellerLabel(memberName: string | null | undefined, name: string | null | undefined): string {
  const who = (memberName ?? "").trim() || (name ?? "").trim();
  return who ? `Told by ${who}` : "";
}

/** Stories in the order of a life: dated ones oldest first, then the ones
 * nobody could put a date to, newest added first. */
export function orderStories<T extends { happened_on: string | null; created_at: string }>(stories: T[]): T[] {
  return [...stories].sort((a, b) => {
    if (a.happened_on && b.happened_on) return a.happened_on.localeCompare(b.happened_on) || a.created_at.localeCompare(b.created_at);
    if (a.happened_on) return -1;
    if (b.happened_on) return 1;
    return b.created_at.localeCompare(a.created_at);
  });
}

/** May this member add a story? Grown-ups, and a child with a login of
 * their own who is not in kid view -- can_add_tree_stories() in the
 * database says the same. */
export function canAddStories(member: { role: string; kid_view?: boolean | null }): boolean {
  return member.role === "parent" || member.role === "adult" || (member.role === "child_self" && member.kid_view !== true);
}

/** A file name safe to put in a storage path: letters, digits, dots and
 * dashes, the end of the name kept (it holds the extension). */
export function storySafeFileName(name: string): string {
  const safe = name.replace(/[^\w.-]+/g, "_").replace(/\.{2,}/g, ".").slice(-80);
  return safe.replace(/^[._]+/, "") || "file";
}

/** What the "Share with linked households" switch says under it: who will
 * see the story, by household, or that nobody will until a linked household
 * has this person on its own tree too (20261019131500). */
export function storyShareHint(firstName: string, households: string[]): string {
  const names = [...new Set(households.map((h) => h.trim()).filter(Boolean))];
  if (names.length === 0) {
    return `No linked household has ${firstName} on their tree yet. Once one matches ${firstName} with you, they'll see the stories you share.`;
  }
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${list} ${names.length === 1 ? "has" : "have"} ${firstName} on their tree and will see it, with its recordings and photos. They can't change it.`;
}

/** Under a story another household shared: "From the Reyes household ·
 * added by Tess". */
export function linkedStoryFoot(familyName: string, createdByName: string | null): string {
  const from = `From ${familyName.trim() || "a linked household"}`;
  const by = (createdByName ?? "").trim().split(" ")[0];
  return by ? `${from} · added by ${by}` : from;
}
