import { WHO_HEIGHT, WHO_WEIGHT } from "@/lib/who-growth";

/** Where a child's weight or length sits against the WHO Child Growth
 * Standards, as a percentile: 50 is the middle, and most healthy children are
 * between the 3rd and 97th. Only for 0 to 5 years, the ages the standard
 * covers; anything outside gives null rather than a guess. */

export type Sex = "female" | "male";

const DAYS_PER_MONTH = 30.4375;

export function ageInMonths(dob: string, on: string): number {
  const ms = Date.parse(`${on}T00:00:00Z`) - Date.parse(`${dob}T00:00:00Z`);
  return ms / 86_400_000 / DAYS_PER_MONTH;
}

function lmsAt(table: [number, number, number][], months: number): [number, number, number] | null {
  if (!(months >= 0) || months > table.length - 1) return null;
  const i = Math.floor(months);
  if (i === table.length - 1) return table[i];
  const f = months - i;
  const [a, b] = [table[i], table[i + 1]];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

export function zScore(value: number, [l, m, s]: [number, number, number]): number {
  return l === 0 ? Math.log(value / m) / s : ((value / m) ** l - 1) / (l * s);
}

/** The standard normal CDF (Abramowitz and Stegun 7.1.26), good to about
 * seven decimal places -- far finer than a whole percentile. */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

export function growthPercentile(kind: "weight" | "length", value: number, months: number, sex: Sex): number | null {
  if (!(value > 0)) return null;
  const lms = lmsAt(kind === "weight" ? WHO_WEIGHT[sex] : WHO_HEIGHT[sex], months);
  if (!lms) return null;
  return normalCdf(zScore(value, lms)) * 100;
}

/** "52nd", "below the 1st", "above the 99th". */
export function percentileLabel(p: number): string {
  if (p < 1) return "below the 1st";
  if (p > 99) return "above the 99th";
  const n = Math.round(p);
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** The weight or length at a given percentile for an age, for drawing the
 * 3rd / 50th / 97th guide lines. */
export function valueAtPercentile(kind: "weight" | "length", months: number, sex: Sex, z: number): number | null {
  const lms = lmsAt(kind === "weight" ? WHO_WEIGHT[sex] : WHO_HEIGHT[sex], months);
  if (!lms) return null;
  const [l, m, s] = lms;
  return l === 0 ? m * Math.exp(s * z) : m * (1 + l * s * z) ** (1 / l);
}
