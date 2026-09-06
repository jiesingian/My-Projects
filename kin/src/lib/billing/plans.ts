/** What Kin costs. One price for the whole household — everyone in a family
 * is covered by the one subscription, which is the only shape that makes sense
 * when every row in the database belongs to a family rather than a person.
 *
 * Amounts are in centavos, because that is how payment providers take them and
 * because money should never be a float. */

export type PlanId = "monthly" | "annual";

export type Plan = {
  id: PlanId;
  name: string;
  amountCents: number;
  /** How long one payment buys. */
  months: number;
  blurb: string;
};

export const PLANS: Record<PlanId, Plan> = {
  monthly: {
    id: "monthly",
    name: "Monthly",
    amountCents: 14_900,
    months: 1,
    blurb: "Billed every month. Cancel whenever.",
  },
  annual: {
    id: "annual",
    name: "Yearly",
    // Two months off, which is the usual shape and the reason to pick it.
    amountCents: 149_000,
    months: 12,
    blurb: "Billed once a year — two months cheaper than monthly.",
  },
};

export const PLAN_LIST: Plan[] = [PLANS.monthly, PLANS.annual];

export function pesos(cents: number): string {
  return `₱${(cents / 100).toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** What one month of the yearly plan works out at, for the comparison that
 * makes the saving legible. */
export function perMonth(plan: Plan): string {
  return pesos(Math.round(plan.amountCents / plan.months));
}
