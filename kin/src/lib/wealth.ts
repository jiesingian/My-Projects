export const ACCOUNT_TYPES = ["bank", "cash", "ewallet", "credit", "investment", "other"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  bank: "Bank",
  cash: "Cash",
  ewallet: "E-wallet",
  credit: "Credit card",
  investment: "Investment",
  other: "Other",
};

export const ASSET_KINDS = ["property", "vehicle", "investment", "business", "valuable", "other"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const ASSET_KIND_LABELS: Record<AssetKind, string> = {
  property: "Property",
  vehicle: "Vehicle",
  investment: "Investment",
  business: "Business",
  valuable: "Valuable",
  other: "Other",
};

export const LIABILITY_KINDS = ["mortgage", "auto_loan", "personal_loan", "credit_card", "other"] as const;
export type LiabilityKind = (typeof LIABILITY_KINDS)[number];

export const LIABILITY_KIND_LABELS: Record<LiabilityKind, string> = {
  mortgage: "Mortgage",
  auto_loan: "Auto loan",
  personal_loan: "Personal loan",
  credit_card: "Credit card",
  other: "Other",
};

/** Where money leaves the household. Budget allocations are set per category,
 * so these double as the budget-vs-actual axis. */
export const EXPENSE_CATEGORIES = [
  "Groceries",
  "Utilities",
  "Housing",
  "Transport",
  "Health",
  "Education",
  "Travel",
  "Dining",
  "Shopping",
  "Insurance",
  "Debt",
  "Other",
] as const;

/** Where money enters, when it comes from outside anything Kin tracks. */
export const INCOME_SOURCES = ["Salary", "Business", "Gift", "Investment", "Refund", "Other"] as const;

export const TRANSFER_CATEGORY = "Transfer";
export const GOAL_CATEGORY = "Goal";

/** The last `count` months ending with the month containing `anchor`, oldest first. */
export function recentMonths(count: number, anchor: Date = new Date()): { year: number; month: number; key: string; label: string }[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() - (count - 1 - i), 1);
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      key: monthKey(d),
      label: d.toLocaleDateString("en-GB", { month: "short" }).toUpperCase(),
    };
  });
}

export function monthKey(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** A transaction only moves money once it is confirmed — anything still
 * waiting on the member finishing up in their banking app is held out of
 * every balance and total. */
export function signedAmount(t: { direction: string; amount: number | string; status: string }): number {
  if (t.status !== "confirmed") return 0;
  return (t.direction === "in" ? 1 : -1) * Number(t.amount);
}
