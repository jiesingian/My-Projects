/** A child's vaccine guide (15 October): the usual Philippine childhood
 * schedule, set against the vaccinations already recorded, so a parent can see
 * what is done, what is due and what is past its usual age. A guide only --
 * the child's paediatrician decides; the screen says so.
 *
 * Sources:
 * - DOH Expanded Program on Immunization (the free, routine "EPI" doses given
 *   at health centres): BCG and hepatitis B at birth; pentavalent
 *   (DTwP-HepB-Hib), oral polio and PCV at 6, 10 and 14 weeks; IPV at 14
 *   weeks and 9 months; measles-containing vaccine (MR/MMR) at 9 and 12
 *   months; the school-based doses (MR and Td in Grade 1 and Grade 7, HPV for
 *   girls in Grade 4). As summarised by PIDS, "Vaccination" (2020):
 *   https://pidswebs.pids.gov.ph/CDN/EVENTS/vaccination_vuuy_20200521-1.pdf
 * - Philippine Pediatric Society / PIDSP Childhood Immunization Schedule:
 *   the usual extra, mostly private-clinic, vaccines (rotavirus, varicella,
 *   hepatitis A, Japanese encephalitis, the DTaP boosters, a second HPV dose).
 *   Ages here are the schedule's usual ones; check the current year's
 *   schedule at https://www.pps.org.ph before relying on them.
 * Yearly flu shots (from 6 months) repeat every year, so they are not listed
 * as doses here; the screen mentions them.
 *
 * Kept free of the database so it can be tested on its own
 * (e2e/vaccine-schedule.logic.spec.ts). */

import { addDays } from "@/lib/health-plan";

export type Age = { w?: number; m?: number; y?: number };
export type Source = "DOH" | "PPS";

export type Vaccine = {
  /** The name a "Mark as given" vaccination is recorded under. */
  name: string;
  /** Other names a recorded vaccination may go by (matched as whole words,
   * any case): "Penta", "DPT-HepB-Hib", "Measles". */
  aliases: string[];
  what: string;
  source: Source;
  /** Each dose's usual age, and the age after which it counts as past due. */
  doses: { at: Age; by: Age; label: string }[];
};

export const VACCINES: Vaccine[] = [
  { name: "BCG", aliases: ["bcg"], what: "Tuberculosis", source: "DOH", doses: [{ at: {}, by: { m: 2 }, label: "At birth" }] },
  { name: "Hepatitis B", aliases: ["hepatitis b", "hep b", "hepb", "hbv"], what: "Hepatitis B, birth dose", source: "DOH", doses: [{ at: {}, by: { w: 2 }, label: "At birth" }] },
  {
    name: "Pentavalent",
    aliases: ["pentavalent", "penta", "dpt hepb hib", "dtwp hepb hib", "5 in 1", "dtp hepb hib", "dpt", "dtp", "dtwp"],
    what: "Diphtheria, tetanus, whooping cough, hepatitis B, Hib",
    source: "DOH",
    doses: [
      { at: { w: 6 }, by: { w: 10 }, label: "6 weeks" },
      { at: { w: 10 }, by: { w: 14 }, label: "10 weeks" },
      { at: { w: 14 }, by: { w: 18 }, label: "14 weeks" },
    ],
  },
  {
    name: "Oral polio (OPV)",
    aliases: ["opv", "oral polio", "bopv"],
    what: "Polio, drops",
    source: "DOH",
    doses: [
      { at: { w: 6 }, by: { w: 10 }, label: "6 weeks" },
      { at: { w: 10 }, by: { w: 14 }, label: "10 weeks" },
      { at: { w: 14 }, by: { w: 18 }, label: "14 weeks" },
    ],
  },
  {
    name: "Pneumococcal (PCV)",
    aliases: ["pcv", "pcv10", "pcv13", "pcv15", "pcv20", "pneumococcal", "prevnar", "synflorix"],
    what: "Pneumonia, meningitis",
    source: "DOH",
    doses: [
      { at: { w: 6 }, by: { w: 10 }, label: "6 weeks" },
      { at: { w: 10 }, by: { w: 14 }, label: "10 weeks" },
      { at: { w: 14 }, by: { w: 18 }, label: "14 weeks" },
    ],
  },
  {
    name: "Inactivated polio (IPV)",
    aliases: ["ipv", "inactivated polio", "polio shot"],
    what: "Polio, injection",
    source: "DOH",
    doses: [
      { at: { w: 14 }, by: { w: 18 }, label: "14 weeks" },
      { at: { m: 9 }, by: { m: 10 }, label: "9 months" },
    ],
  },
  { name: "Rotavirus", aliases: ["rotavirus", "rota", "rotarix", "rotateq"], what: "Rotavirus diarrhoea", source: "PPS", doses: [{ at: { w: 6 }, by: { w: 10 }, label: "6 weeks" }, { at: { w: 10 }, by: { m: 6 }, label: "10 weeks" }] },
  {
    name: "Measles (MR/MMR)",
    aliases: ["mmr", "mr", "mcv", "measles", "measles rubella", "measles mumps rubella"],
    what: "Measles, mumps, rubella",
    source: "DOH",
    doses: [
      { at: { m: 9 }, by: { m: 10 }, label: "9 months" },
      { at: { m: 12 }, by: { m: 15 }, label: "12 months" },
    ],
  },
  { name: "Japanese encephalitis", aliases: ["japanese encephalitis", "je", "imojev"], what: "Japanese encephalitis", source: "PPS", doses: [{ at: { m: 9 }, by: { m: 24 }, label: "9 months or later" }] },
  {
    name: "Varicella",
    aliases: ["varicella", "chickenpox", "chicken pox", "varivax"],
    what: "Chickenpox",
    source: "PPS",
    doses: [
      { at: { m: 12 }, by: { m: 18 }, label: "12–15 months" },
      { at: { y: 4 }, by: { y: 7 }, label: "4–6 years" },
    ],
  },
  {
    name: "Hepatitis A",
    aliases: ["hepatitis a", "hep a", "hepa", "havrix"],
    what: "Hepatitis A",
    source: "PPS",
    doses: [
      { at: { m: 12 }, by: { m: 24 }, label: "12 months" },
      { at: { m: 18 }, by: { m: 36 }, label: "6–12 months after the first" },
    ],
  },
  {
    name: "DTaP booster",
    aliases: ["dtap", "dpt booster", "dtap booster", "dtp booster", "tdap"],
    what: "Diphtheria, tetanus, whooping cough",
    source: "PPS",
    doses: [
      { at: { m: 15 }, by: { m: 24 }, label: "15–18 months" },
      { at: { y: 4 }, by: { y: 7 }, label: "4–6 years" },
    ],
  },
  {
    name: "School MR and Td",
    aliases: ["td", "school mr", "school td", "mr td", "td mr"],
    what: "Measles-rubella and tetanus-diphtheria, given at school",
    source: "DOH",
    doses: [
      { at: { y: 6 }, by: { y: 8 }, label: "Grade 1" },
      { at: { y: 12 }, by: { y: 14 }, label: "Grade 7" },
    ],
  },
  {
    name: "HPV",
    aliases: ["hpv", "human papillomavirus", "gardasil", "cervarix"],
    what: "Cervical and other HPV cancers (DOH gives it to girls in Grade 4)",
    source: "DOH",
    doses: [
      { at: { y: 9 }, by: { y: 15 }, label: "9 years (Grade 4)" },
      { at: { y: 9, m: 6 }, by: { y: 15 }, label: "6 months after the first" },
    ],
  },
];

/** The guide is for children: it stops at 18. */
export const GUIDE_UNTIL_YEARS = 18;
/** A dose shows as due from two weeks before its usual age. */
export const DUE_AHEAD_DAYS = 14;

/** The day a child reaches an age: calendar years and months (the last day of
 * a short month when the birthday's day is past its end), then weeks. */
export function dateAtAge(dob: string, age: Age): string {
  const [y, m, d] = dob.split("-").map(Number);
  const months = (age.y ?? 0) * 12 + (age.m ?? 0);
  const ty = y + Math.floor((m - 1 + months) / 12);
  const tm = ((m - 1 + months) % 12) + 1;
  const last = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  const day = `${ty}-${String(tm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
  return addDays(day, (age.w ?? 0) * 7);
}

/** Lower-case words only, padded, so an alias matches as whole words:
 * "DPT-HepB-Hib #2" reads " dpt hepb hib 2 ". */
function words(s: string): string {
  return ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

/** Does a recorded vaccination's name mean this vaccine? */
export function namesVaccine(recorded: string, v: Vaccine): boolean {
  const w = words(recorded);
  return [v.name, ...v.aliases].some((a) => w.includes(words(a)));
}

/** The vaccine a recorded name belongs to. The longest matching alias wins,
 * so "School MR" is the school dose, not measles, and "DPT booster" is not
 * the infant series. A bare "DPT" is the infant series, as most clinics here
 * write it. */
export function vaccineFor(recorded: string): Vaccine | null {
  let best: Vaccine | null = null;
  let bestLen = 0;
  const w = words(recorded);
  for (const v of VACCINES) {
    for (const a of [v.name, ...v.aliases]) {
      const aw = words(a);
      if (w.includes(aw) && aw.length > bestLen) {
        best = v;
        bestLen = aw.length;
      }
    }
  }
  return best;
}

export type Recorded = { name: string; dates: string[] };
export type DoseStatus = "done" | "due" | "overdue" | "upcoming";
export type GuideDose = {
  key: string;
  vaccine: Vaccine;
  /** 1-based. */
  n: number;
  of: number;
  label: string;
  dueDate: string;
  byDate: string;
  status: DoseStatus;
  /** The day it was given, when it is done. */
  givenOn: string | null;
};

/** Every dose in the guide for a child born on `dob`, against what is
 * recorded: a vaccination's entries count as doses in date order, so a third
 * Pentavalent entry ticks off the 14-week dose. Past due is after the dose's
 * "by" age; due is from two weeks before its usual age. */
export function vaccineGuide(dob: string, recorded: Recorded[], today: string): GuideDose[] {
  const given = new Map<string, string[]>();
  for (const r of recorded) {
    const v = vaccineFor(r.name);
    if (!v) continue;
    given.set(v.name, [...(given.get(v.name) ?? []), ...r.dates]);
  }
  const out: GuideDose[] = [];
  for (const v of VACCINES) {
    const dates = (given.get(v.name) ?? []).slice().sort();
    v.doses.forEach((d, i) => {
      const dueDate = dateAtAge(dob, d.at);
      const byDate = dateAtAge(dob, d.by);
      const givenOn = dates[i] ?? null;
      const status: DoseStatus = givenOn ? "done" : today > byDate ? "overdue" : today >= addDays(dueDate, -DUE_AHEAD_DAYS) ? "due" : "upcoming";
      out.push({ key: `${v.name}#${i + 1}`, vaccine: v, n: i + 1, of: v.doses.length, label: d.label, dueDate, byDate, status, givenOn });
    });
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || VACCINES.indexOf(a.vaccine) - VACCINES.indexOf(b.vaccine));
}

/** "Pentavalent, 2nd of 3" or just "BCG". */
export function doseName(d: Pick<GuideDose, "vaccine" | "n" | "of">): string {
  if (d.of === 1) return d.vaccine.name;
  const nth = ["1st", "2nd", "3rd", "4th"][d.n - 1] ?? `${d.n}th`;
  return `${d.vaccine.name}, ${nth} of ${d.of}`;
}

/** How long a dose keeps coming up in "This week" once its usual age has
 * come, or gone. After that it stays on the guide but stops asking: a
 * household that never recorded an older child's vaccines is not nagged
 * about every one, nor about HPV's six-year window for six years. */
export const OVERDUE_NUDGE_DAYS = 90;

/** For the Health tab's "This week": the earliest dose not yet given that is
 * due within the week or went past its usual age lately, or nothing. */
export function nextVaccine(guide: GuideDose[], today: string): GuideDose | null {
  const inWeek = addDays(today, 7);
  const since = addDays(today, -OVERDUE_NUDGE_DAYS);
  return guide.find((d) => (d.status === "overdue" && d.byDate >= since) || (d.status === "due" && d.dueDate <= inWeek && d.dueDate >= since)) ?? null;
}

/** Is the guide for this person: a child, with a birthday, under 18? */
export function guideApplies(role: string, dob: string | null, today: string): dob is string {
  if (!dob || (role !== "child_managed" && role !== "child_self")) return false;
  return today < dateAtAge(dob, { y: GUIDE_UNTIL_YEARS }) && dob <= today;
}
