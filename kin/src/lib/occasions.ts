/** A birthday or anniversary on the family feed, on the day (agreed
 * 28 September). Built from the yearly events Kin already keeps; see
 * supabase/migrations/20260928170000_feed_occasions.sql. */
export type OccasionGreeting = {
  id: string;
  body: string;
  authorName: string;
  householdName: string;
  mine: boolean;
  ourHousehold: boolean;
};

export type FeedOccasion = {
  eventId: string;
  title: string;
  kind: "birthday" | "anniversary";
  years: number | null;
  householdName: string;
  isOurs: boolean;
  greetings: OccasionGreeting[];
};

/** "Lola Rosa's birthday" names Lola Rosa; so does plain "Lola Rosa". */
function personOf(title: string): string {
  const t = title.trim();
  const stripped = t
    .replace(/[’']s\s+(birthday|bday|kaarawan)\s*$/i, "")
    .replace(/^(birthday|kaarawan)\s*(of|ni|:|-)?\s+/i, "")
    .replace(/\s+(birthday|bday)\s*$/i, "")
    .trim();
  return stripped || t;
}

/** The card's one line: "Lola Rosa turns 72 today 🎂". Without a real birth
 * year there is no number to say, so it says whose day it is instead. */
export function occasionHeadline(title: string, kind: "birthday" | "anniversary", years: number | null): string {
  if (kind === "birthday") {
    const who = personOf(title);
    return years && years > 0 ? `${who} turns ${years} today 🎂` : `It’s ${who}’s birthday today 🎂`;
  }
  const what = title.trim();
  if (years && years > 0) return `${what}: ${years} ${years === 1 ? "year" : "years"} today 💍`;
  return /anniversary/i.test(what) ? `${what}, today 💍` : `${what}’s anniversary is today 💍`;
}
