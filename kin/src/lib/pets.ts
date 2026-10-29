/** Pets (20261029170000_pets.sql). Pure, so the page, Today and the logic
 * spec agree on what is due. */

export const PET_KINDS = ["dog", "cat", "bird", "fish", "rabbit", "other"] as const;
export type PetKind = (typeof PET_KINDS)[number];
export const PET_KIND_LABELS: Record<PetKind, string> = { dog: "Dog", cat: "Cat", bird: "Bird", fish: "Fish", rabbit: "Rabbit", other: "Other" };

export type PetDates = { id: string; name: string; next_vaccine_on: string | null; next_vet_on: string | null };
export type PetDue = { petId: string; name: string; what: "vaccine" | "vet visit"; on: string; inDays: number };

const days = (a: string, b: string) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86_400_000);

/** Vaccines and vet visits from overdue to a week ahead, soonest first:
 * negative inDays is overdue, 0 is today. */
export function petsDue(pets: PetDates[], today: string): PetDue[] {
  const out: PetDue[] = [];
  for (const p of pets) {
    for (const [what, on] of [["vaccine", p.next_vaccine_on], ["vet visit", p.next_vet_on]] as const) {
      if (!on) continue;
      const n = days(today, on.slice(0, 10));
      if (n <= 7) out.push({ petId: p.id, name: p.name, what, on: on.slice(0, 10), inDays: n });
    }
  }
  return out.sort((a, b) => a.inDays - b.inDays);
}

/** "Bantay's vaccine is due today", "… in 3 days", "… was due 2 days ago". */
export function petDueLine(d: PetDue): string {
  const when = d.inDays === 0 ? "is due today" : d.inDays === 1 ? "is due tomorrow" : d.inDays > 1 ? `is due in ${d.inDays} days` : d.inDays === -1 ? "was due yesterday" : `was due ${-d.inDays} days ago`;
  return `${d.name}'s ${d.what} ${when}`;
}
