/** Which slice of the household's money is on screen: everything the
 * viewer is allowed to see, or one person's own accounts. */
export type WealthScope = "all" | (string & {});

/** Whether one account, asset, liability or goal belongs in the slice the
 * Who picker is currently showing.
 *
 * "all" is everything already in reach -- the household's joint accounts,
 * your own, and whatever anyone else has opened to the family. Naming a
 * person narrows it to what is in *their* name, and a joint account is the
 * household's rather than theirs, so it stays under All even for the person
 * who opened it. That last part is the surprising half, and it is the half
 * that bites: a control built from a scoped list empties out the moment you
 * look at anybody's tab, including your own.
 *
 * Privacy is not decided here. The database has already withheld whatever is
 * not the viewer's to see; this only chooses what to show of what is left, so
 * a bug in it is a display bug and never a leak.
 *
 * It lives in this module rather than beside its callers so it can be tested
 * without a request behind it -- `queries/wealth.ts` reaches for
 * `next/headers` the moment it is imported. */
export function inScope(
  row: { is_joint: boolean | null; owner_member_id: string | null },
  scope: WealthScope,
): boolean {
  return scope === "all" ? true : !row.is_joint && row.owner_member_id === scope;
}

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

/** How far back the Cash Flow graph looks, per granularity it can switch to. */
export const CASH_FLOW_RANGES = ["day", "week", "month", "year"] as const;
export type CashFlowRange = (typeof CASH_FLOW_RANGES)[number];
export const CASH_FLOW_RANGE_LABELS: Record<CashFlowRange, string> = { day: "Days", week: "Weeks", month: "Months", year: "Years" };
const CASH_FLOW_RANGE_COUNT: Record<CashFlowRange, number> = { day: 14, week: 12, month: 12, year: 5 };
export function cashFlowRangeCount(range: CashFlowRange): number {
  return CASH_FLOW_RANGE_COUNT[range];
}

/** Calendar weeks, Sunday-start. The key is the week's own start date rather
 * than an ISO week number -- always unambiguous, always sortable, and it
 * sidesteps the year-boundary edge cases a "week 1 of 2027 starts in
 * December 2026" scheme would otherwise need special-casing. */
function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function weekKey(date: Date | string): string {
  const d = startOfWeek(typeof date === "string" ? new Date(date) : date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function yearKey(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return String(d.getFullYear());
}

export function dayKey(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The last `count` calendar days ending with the day containing `anchor`,
 * oldest first -- the finest granularity the Cash Flow and Accounts graphs
 * switch to, for a household that wants to see today and yesterday rather
 * than waiting for a week to fill in. */
export function recentDays(count: number, anchor: Date = new Date()): { key: string; label: string; start: Date }[] {
  const today = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(today);
    start.setDate(start.getDate() - (count - 1 - i));
    return { key: dayKey(start), label: start.toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase(), start };
  });
}

/** The last `count` calendar weeks ending with the week containing `anchor`, oldest first. */
export function recentWeeks(count: number, anchor: Date = new Date()): { key: string; label: string; start: Date }[] {
  const thisWeek = startOfWeek(anchor);
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(thisWeek);
    start.setDate(start.getDate() - (count - 1 - i) * 7);
    return { key: weekKey(start), label: start.toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase(), start };
  });
}

/** The last `count` years ending with the year containing `anchor`, oldest first. */
export function recentYears(count: number, anchor: Date = new Date()): { key: string; label: string; start: Date }[] {
  return Array.from({ length: count }, (_, i) => {
    const year = anchor.getFullYear() - (count - 1 - i);
    return { key: String(year), label: String(year), start: new Date(year, 0, 1) };
  });
}

/** One shared shape for the three granularities the Cash Flow graph can
 * switch between, so the page renders them without caring which is active. */
export function recentPeriods(range: CashFlowRange, count: number, anchor: Date = new Date()): { key: string; label: string; start: Date }[] {
  if (range === "day") return recentDays(count, anchor);
  if (range === "week") return recentWeeks(count, anchor);
  if (range === "year") return recentYears(count, anchor);
  return recentMonths(count, anchor).map((m) => ({ key: m.key, label: m.label, start: new Date(m.year, m.month - 1, 1) }));
}

export function periodKey(date: Date | string, range: CashFlowRange): string {
  if (range === "day") return dayKey(date);
  if (range === "week") return weekKey(date);
  if (range === "year") return yearKey(date);
  return monthKey(date);
}

/** A transaction only moves money once it is confirmed — anything still
 * waiting on the member finishing up in their banking app is held out of
 * every balance and total. */
export function signedAmount(t: { direction: string; amount: number | string; status: string }): number {
  if (t.status !== "confirmed") return 0;
  return (t.direction === "in" ? 1 : -1) * Number(t.amount);
}

/** The ledger's version of a policy refusal, in words a person can act on.
 *
 * An account is visible when it is joint, yours, or simply not marked private
 * -- but a transaction on it is visible only when the account is joint or
 * yours. So a household member's own shared account appears in every list and
 * refuses every entry written into it, because the insert asks for its row
 * back and the SELECT policy will not return it. Nothing is written, which is
 * the safe direction; the raw message is a sentence about tables and
 * policies. Anything else is passed through untouched.
 */
export function explainLedgerRefusal(message: string): string {
  return /row-level security/i.test(message)
    ? "That account belongs to someone else in the household, so entries cannot be recorded against it here. Ask them to record it, or use a joint account."
    : message;
}

export type PhoneKind = "ios" | "android" | "other";

/** Which BANK/WALLET-adjacent account type a known app fits under, so the
 * dropdown can show only what's relevant once TYPE is picked: a bank
 * account isn't going to be GCash, and picking E-wallet shouldn't surface
 * BPI. GoTyme is technically a licensed digital bank, not a wallet app --
 * filed under "ewallet" anyway because that's how households actually
 * think of it (a phone-first account opened the same way GCash and Maya
 * are), and that's the only thing this classification is for. */
export type KnownAppKind = "bank" | "ewallet";

export type KnownApp = {
  label: string;
  kind: KnownAppKind;
  appUrl?: string;
  appStoreUrl?: string;
  playStoreUrl?: string;
};

/** One tap instead of typing, for the handful of apps whose links are
 * confirmed correct and unlikely to change. Deliberately short: a wrong
 * entry here is worse than none, and most apps -- most Philippine banks
 * included -- publish no such thing anywhere a person or an AI could look
 * one up to add with any confidence.
 *
 * appUrl is an app's own scheme, opened when it's already installed
 * (GCash's verified against PayMongo's integration docs -- none of the
 * others below publish one anywhere findable, so they go without rather
 * than guess). appStoreUrl and playStoreUrl are where to get the app in
 * the first place, each verified the same way: the App Store id and the
 * Play Store package cross-checked against each other (same app name on
 * both) and against the bank's own developer/publisher listing, not
 * against a claim from any AI, including this one, without a listing to
 * back it up.
 *
 *   BPI          apps.apple.com id6443950982 / com.bpi.ng.app
 *   BDO          apps.apple.com id1551584630 / ph.com.bdo.retail,
 *                publisher BDO Unibank
 *   Maya         apps.apple.com id991673877 / com.paymaya, publisher
 *                Maya Philippines, Inc. on both stores
 *   Metrobank    apps.apple.com id1536081176 / ph.com.metrobank.mcc.mbonline,
 *                publisher Metropolitan Bank & Trust Company
 *   UnionBank    apps.apple.com id1242291412 / com.unionbankph.online,
 *                publisher Union Bank of the Philippines on both stores
 *   Security     apps.apple.com id6476122865 / com.securitybank.bbx,
 *   Bank         both listed as "Security Bank App"
 *   RCBC         apps.apple.com id1445403196 / com.rcbc.pulz, both
 *                listed as "RCBC Pulz", linked from RCBC's own site
 *   GoTyme       apps.apple.com id1637067963 / ph.com.gotyme -- the
 *                Philippine listing specifically; GoTyme also publishes a
 *                separate South African app under different ids, easy to
 *                grab by mistake
 *   LandBank     apps.apple.com id950232162 / com.landbank.mobilebanking,
 *                publisher Land Bank of the Philippines on both stores
 *
 * Left out on purpose, not overlooked: PalawanPay, MariBank and UnionBank's
 * own digital-only sibling (UnionDigital) turned up nothing verifiable on
 * one pass -- worth another look later, not worth guessing now. */
export const KNOWN_APPS: KnownApp[] = [
  { label: "GCash", kind: "ewallet", appUrl: "gcash://" },
  {
    label: "BPI",
    kind: "bank",
    appStoreUrl: "https://apps.apple.com/ph/app/bpi/id6443950982",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.bpi.ng.app",
  },
  {
    label: "BDO",
    kind: "bank",
    appStoreUrl: "https://apps.apple.com/ph/app/bdo-online/id1551584630",
    playStoreUrl: "https://play.google.com/store/apps/details?id=ph.com.bdo.retail",
  },
  {
    label: "Maya",
    kind: "ewallet",
    appStoreUrl: "https://apps.apple.com/ph/app/maya-savings-loans-cards/id991673877",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.paymaya",
  },
  {
    label: "Metrobank",
    kind: "bank",
    appStoreUrl: "https://apps.apple.com/ph/app/metrobank-app/id1536081176",
    playStoreUrl: "https://play.google.com/store/apps/details?id=ph.com.metrobank.mcc.mbonline",
  },
  {
    label: "UnionBank",
    kind: "bank",
    appStoreUrl: "https://apps.apple.com/ph/app/unionbank-online/id1242291412",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.unionbankph.online",
  },
  {
    label: "Security Bank",
    kind: "bank",
    appStoreUrl: "https://apps.apple.com/ph/app/security-bank-app/id6476122865",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.securitybank.bbx",
  },
  {
    label: "RCBC",
    kind: "bank",
    appStoreUrl: "https://apps.apple.com/ph/app/rcbc-pulz/id1445403196",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.rcbc.pulz",
  },
  {
    label: "GoTyme",
    kind: "ewallet",
    appStoreUrl: "https://apps.apple.com/ph/app/gotyme-bank/id1637067963",
    playStoreUrl: "https://play.google.com/store/apps/details?id=ph.com.gotyme",
  },
  {
    label: "LandBank",
    kind: "bank",
    appStoreUrl: "https://apps.apple.com/ph/app/landbank-mobile-banking/id950232162",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.landbank.mobilebanking",
  },
];

export function isKnownInstitutionLabel(label: string): boolean {
  return KNOWN_APPS.some((a) => a.label === label);
}

/** Which of KNOWN_APPS actually make sense to offer, given the account
 * type someone just picked -- a bank account isn't going to be GCash, and
 * an e-wallet isn't going to be BPI. Only bank and ewallet narrow the list;
 * every other type (credit, investment, other) shows all of it, since none
 * of those map to one of the two kinds a known app is ever tagged with,
 * and showing nothing would be worse than showing everything. */
export function knownAppsForType(accountType: AccountType): KnownApp[] {
  if (accountType === "bank") return KNOWN_APPS.filter((a) => a.kind === "bank");
  if (accountType === "ewallet") return KNOWN_APPS.filter((a) => a.kind === "ewallet");
  return KNOWN_APPS;
}

/** A working store link for literally any institution, in any country --
 * not a listing (Kin doesn't know one), a search. Both are each store's
 * own documented web search page, not scraped or reverse-engineered:
 * Apple's at apps.apple.com/{country}/search?term=, Google's at
 * play.google.com/store/search?q=&c=apps. This is what makes GET APP work
 * for a bank nobody has hand-verified yet, everywhere KNOWN_APPS has
 * nothing -- the fallback that makes "no specific country" true instead
 * of aspirational, since a fixed list can never cover every bank in every
 * market and was never going to.
 *
 * `country` is the household's own App Store region (families.country,
 * set once in Settings or at onboarding -- @/lib/countries), not wherever
 * the phone making the request currently is. Falls back to "us" when a
 * household hasn't set one: Apple's search still works from that region
 * path, just ranked for it rather than tuned to where the household
 * actually is. */
export function appStoreSearchUrl(query: string, country?: string | null): string {
  return `https://apps.apple.com/${country || "us"}/search?term=${encodeURIComponent(query)}`;
}

export function playStoreSearchUrl(query: string): string {
  return `https://play.google.com/store/search?q=${encodeURIComponent(query)}&c=apps`;
}

/** What LINK APP / APP STORE LINK / PLAY STORE LINK should become when
 * BANK / WALLET changes from `previousValue` to `nextValue`, given which
 * store matches the phone currently filling the form in. `null` means
 * "leave the three fields exactly as they are".
 *
 * Landing on a known app (GCash, BPI or BDO) always resolves them, known
 * apps included: BPI and BDO have no scheme of their own, so LINK APP
 * itself becomes whichever store link matches this phone -- a real,
 * working link on any device, not a placeholder.
 *
 * Leaving a known app -- for Other, or back to blank -- clears the three
 * fields, because otherwise the previous bank's links stay sitting there
 * with a new, unnamed institution now claiming them (the reported bug:
 * pick BDO, switch to Other, and BDO's App Store link was still in LINK
 * APP and both store fields, nothing saying it wasn't BDO anymore).
 *
 * Moving between Other and blank without ever having picked a known app
 * changes nothing -- those fields may hold links someone typed by hand,
 * and switching the dropdown around them must not erase real input. */
export function resolveInstitutionLinks(
  nextValue: string,
  previousValue: string,
  kind: PhoneKind,
): { appUrl: string; appStoreUrl: string; playStoreUrl: string } | null {
  const known = KNOWN_APPS.find((a) => a.label === nextValue);
  if (known) {
    const ownStore = kind === "android" ? known.playStoreUrl : known.appStoreUrl;
    return {
      appUrl: known.appUrl ?? ownStore ?? "",
      appStoreUrl: known.appStoreUrl ?? "",
      playStoreUrl: known.playStoreUrl ?? "",
    };
  }
  if (isKnownInstitutionLabel(previousValue)) {
    return { appUrl: "", appStoreUrl: "", playStoreUrl: "" };
  }
  return null;
}
