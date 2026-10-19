/** Undas and babang-luksa (20261019233000_remembrance_undas.sql): the days a
 * household remembers relatives on its tree who have passed. Pure, so Today,
 * Coming up and the tree's candle read the same rules as the morning push
 * (due_remembrance_reminders), which the logic tests hold them to.
 *
 * The days: Undas (1 and 2 November); the 40th day, counting the day of
 * passing as the first, as the pasiyam is counted; the first year, the
 * babang-luksa; and every anniversary after. A 29 February passing is
 * remembered on 28 February in other years. */

export type Departed = { id: string; name: string; diedOn: string };

export type RemembranceDay = {
  personId: string;
  name: string;
  kind: "fortieth" | "first-year" | "anniversary";
  years: number;
};

const day = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const plusDays = (d: string, n: number) => iso(day(d) + n * 86_400_000);
const leap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** 1 or 2 November. */
export function isUndas(today: string): boolean {
  const md = today.slice(5);
  return md === "11-01" || md === "11-02";
}

/** The 40th day: the day of passing is the first. */
export function fortiethDay(diedOn: string): string {
  return plusDays(diedOn, 39);
}

/** This person's day on `today`, if it is one. */
export function remembranceOn(p: Departed, today: string): RemembranceDay | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.diedOn) || p.diedOn >= today) return null;
  if (fortiethDay(p.diedOn) === today) return { personId: p.id, name: p.name, kind: "fortieth", years: 0 };
  const md = p.diedOn.slice(5);
  const year = Number(today.slice(0, 4));
  const on = md === "02-29" && !leap(year) ? "02-28" : md;
  if (today.slice(5) !== on) return null;
  const years = year - Number(p.diedOn.slice(0, 4));
  return { personId: p.id, name: p.name, kind: years === 1 ? "first-year" : "anniversary", years };
}

/** What a remembrance day says, the same words as the push. */
export function remembranceLine(r: RemembranceDay): string {
  if (r.kind === "fortieth") return "The 40th day since their passing";
  if (r.kind === "first-year") return "One year since their passing · babang-luksa";
  return `${r.years} years since their passing`;
}

/** Up to three names, then "and N more". */
export function namesLine(names: string[]): string {
  if (names.length <= 3) return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
}

export type RemembranceItem = { id: string; title: string; meta: string; inDays: number };

/** Today's lines (inDays 0) and the next `ahead` days' (Coming up): Undas,
 * then each person's day. Only those who had passed by then. */
export function remembranceItems(people: Departed[], today: string, ahead = 7): RemembranceItem[] {
  const departed = people.filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.diedOn)).sort((a, b) => a.diedOn.localeCompare(b.diedOn));
  const items: RemembranceItem[] = [];
  for (let i = 0; i <= ahead; i++) {
    const d = plusDays(today, i);
    const on = i === 0 ? "today" : i === 1 ? "tomorrow" : `in ${i} days`;
    const before = departed.filter((p) => p.diedOn < d);
    if (d.slice(5) === "11-01" || (i === 0 && d.slice(5) === "11-02")) {
      if (before.length > 0) {
        items.push({
          id: `undas-${d}`,
          title: i === 0 ? "Undas · remembering" : `Undas ${on}`,
          meta: i === 0 ? namesLine(before.map((p) => p.name)) : `${namesLine(before.map((p) => p.name))} · candles and flowers?`,
          inDays: i,
        });
      }
    }
    for (const p of before) {
      const r = remembranceOn(p, d);
      if (r) items.push({ id: `remember-${p.id}-${d}`, title: `Remembering ${p.name}`, meta: i === 0 ? remembranceLine(r) : `${remembranceLine(r)} · ${on}`, inDays: i });
    }
  }
  return items;
}

/** A date of passing the tree will keep: a real day, not in the future, not
 * before their birth. Returns the problem, or null. */
export function diedOnProblem(diedOn: string, dob: string | null, today: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(diedOn) || iso(day(diedOn)) !== diedOn) return "That date isn't a real date.";
  if (diedOn > today) return "A date of passing can't be in the future.";
  if (dob && diedOn < dob) return "The date of passing is before their birth.";
  return null;
}
