/** What an iPhone Shortcut sends, turned into readings the database will take
 * (ingest_apple_health in 20260926100000_apple_health_import.sql, which
 * checks every one again).
 *
 * The Shortcut builds a dictionary -- steps, weight, heart_rate, sleep, and
 * optionally date -- and Shortcuts is loose about types: a number can arrive
 * as 8423, as "8423", as "8,423" or as "68.2 kg" depending on which action
 * produced it and the phone's region. So each value is read as the first
 * number in it, commas as thousands separators, and anything that isn't a
 * number is left out rather than guessed at. A `samples` array in the
 * database's own shape is accepted too, for anyone sending several days. */

export type HealthKind = "steps" | "weight" | "heart_rate" | "sleep";
export type HealthSample = { type: HealthKind; value: number; date: string; unit?: string };

const KINDS: HealthKind[] = ["steps", "weight", "heart_rate", "sleep"];
const ALIASES: Record<string, HealthKind> = {
  steps: "steps",
  step_count: "steps",
  weight: "weight",
  body_mass: "weight",
  heart_rate: "heart_rate",
  resting_heart_rate: "heart_rate",
  heartrate: "heart_rate",
  sleep: "sleep",
  sleep_hours: "sleep",
};

export function numberIn(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const m = v.replace(/,(?=\d{3}\b)/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function unitIn(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  return /\b(lb|lbs)\b/i.test(v) ? "lb" : undefined;
}

/** A yyyy-mm-dd date, or null. Shortcuts' own "Current Date" formatted as
 * ISO 8601 arrives with a time on it; the day is what counts. */
export function dayIn(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/** Today in Manila, for a Shortcut that didn't say which day it meant. */
export function manilaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function toSamples(body: unknown, today: string): HealthSample[] {
  if (!body || typeof body !== "object") return [];
  const b = body as Record<string, unknown>;
  const out: HealthSample[] = [];

  if (Array.isArray(b.samples)) {
    for (const s of b.samples.slice(0, 40)) {
      if (!s || typeof s !== "object") continue;
      const r = s as Record<string, unknown>;
      const type = ALIASES[String(r.type ?? "").toLowerCase()];
      const value = numberIn(r.value);
      const date = dayIn(r.date) ?? today;
      if (type && value !== null) out.push({ type, value, date, ...(unitIn(r.unit) || unitIn(r.value) ? { unit: "lb" } : {}) });
    }
    return out;
  }

  const date = dayIn(b.date) ?? today;
  for (const [key, raw] of Object.entries(b)) {
    const type = ALIASES[key.toLowerCase()];
    if (!type) continue;
    const value = numberIn(raw);
    if (value === null) continue;
    // Sleep sent in minutes (Shortcuts often totals durations that way) is
    // anything above a day's worth of hours.
    const v = type === "sleep" && value > 24 ? value / 60 : value;
    out.push({ type, value: v, date, ...(type === "weight" && unitIn(raw) ? { unit: "lb" } : {}) });
  }
  return out.filter((s) => KINDS.includes(s.type));
}
