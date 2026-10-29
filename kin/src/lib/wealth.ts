import { formatCurrency } from "@/lib/format";
import { addMonths } from "@/lib/subscriptions";

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
/** inScope, for the lists and totals of the Accounts, Cash Flow and A&L
 * tabs -- plus the viewer's own choice to leave their private accounts out
 * of All (members.wealth_include_private). `leaveOutPrivateOf` is the
 * viewer's member id when they've turned that off, else null. Only All
 * changes: the viewer's own Who still shows everything that's theirs.
 * "Private" there means Only you: an account its owner has shared with
 * people they picked (`shared`, from account_viewers) is not left out --
 * picking every grown-up by name read as "All grown-ups" on the form, then
 * vanished from All with the switch off (Janine, 22 October).
 * Nobody else's private account is ever here to leave out -- the database
 * never returns it to them. */
export function inTotalsScope(
  account: { is_joint: boolean | null; owner_member_id: string | null; is_private: boolean | null; shared?: boolean },
  scope: WealthScope,
  leaveOutPrivateOf: string | null,
): boolean {
  if (!inScope(account, scope)) return false;
  return !(scope === "all" && leaveOutPrivateOf !== null && !account.is_joint && !!account.is_private && !account.shared && account.owner_member_id === leaveOutPrivateOf);
}

export function inScope(
  row: { is_joint: boolean | null; owner_member_id: string | null },
  scope: WealthScope,
): boolean {
  if (scope === "all") return true;
  if (scope === WEALTH_FAMILY) return !!row.is_joint || row.owner_member_id === null;
  return !row.is_joint && row.owner_member_id === scope;
}

/** "Family" in the Who picker (29 September, Janine): the money that is not
 * one person's -- joint accounts, and anything nobody has been named on --
 * as against "All", every member's and the family's together. */
export const WEALTH_FAMILY = "family";

/** All and Family are the household's view: its budget, its allocations,
 * its joint accounts to add to. One named person is theirs. */
export function isHouseholdScope(scope: WealthScope): boolean {
  return scope === "all" || scope === WEALTH_FAMILY;
}

export const ACCOUNT_TYPES = ["bank", "cash", "ewallet", "credit", "investment", "stocks", "other"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  bank: "Bank",
  cash: "Cash",
  ewallet: "E-wallet",
  credit: "Credit card",
  investment: "Investment",
  stocks: "Stocks",
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
 * so these double as the budget-vs-actual axis.
 *
 * These are the names saved on every entry, bill and budget, so an old one
 * is never renamed here -- that would cut it off from what is already
 * filed under it. What a person reads is CATEGORY_LABELS below. New ones
 * may be added anywhere (Janine, 23 October: the common ones a Filipino
 * household spends on). */
export const EXPENSE_CATEGORIES = [
  "Groceries",
  // Palengke, talipapa, the wet market: apart from Groceries, the
  // supermarket (Janine, 26 October; 20261026140000).
  "Market",
  "Dining",
  "Utilities",
  "Housing",
  "Transport",
  "Household help",
  "Health",
  "Education",
  "Kids & baby",
  "Personal care",
  "Shopping",
  "Subscriptions",
  "Entertainment",
  "Travel",
  "Insurance",
  "Debt",
  "Family support",
  "Church & donations",
  // Christmas gifts and aguinaldo (20261019233300_gift_list.sql).
  "Gifts",
  "Pets",
  "Bank & service fees",
  "Other",
] as const;

/** Where money enters, when it comes from outside anything Kin tracks.
 * Also the groups of Cash Flow's INCOME and the slices of its donut, in
 * this order (Janine, 22 October: "House (rent)" for a place let out).
 * Saved names, like EXPENSE_CATEGORIES: never renamed, only relabelled. */
export const INCOME_SOURCES = [
  "Salary",
  "Bonus & 13th month",
  "Business",
  "Freelance & side jobs",
  "House (rent)",
  "Remittance",
  "Pension",
  "Allowance",
  "Investment",
  "Utang paid back",
  "Sold items",
  "Gift",
  "Government aid",
  "Refund",
  "Other",
] as const;

/** What a person reads for a saved category name, where the name alone
 * says too little or reads like the wrong side of the ledger: "House
 * (rent)" read like rent we pay, "Debt" like money we owe rather than a
 * payment on it, "Gift" and "Gifts" like the same thing. Anything not
 * here reads as it is saved. */
export const CATEGORY_LABELS: Record<string, string> = {
  // Money out
  Dining: "Eating out & delivery",
  Utilities: "Bills & utilities",
  Housing: "Rent & housing",
  Transport: "Transport & fuel",
  Health: "Health & medicine",
  Education: "School & tuition",
  Travel: "Travel & vacations",
  Debt: "Loan & card payments",
  Gifts: "Gifts given",
  // Money in
  Salary: "Salary & wages",
  Business: "Business income",
  "House (rent)": "Rent received",
  // Janine, 23 October: what Add income and Cash Flow call it.
  Remittance: "Remittance from abroad",
  Investment: "Interest & dividends",
  Gift: "Gifts received",
  Refund: "Refunds & cashback",
  "Utang paid back": "Lent money paid back",
  // Add income's own choice (UTANG_CATEGORY), never saved as a category.
  "Utang & paluwagan": "Lending & savings circles",
};
export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

/** How often a regular income (income_groups) comes. */
export const INCOME_FREQUENCY_LABELS: Record<string, string> = { monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly" };

/** Whose an income, an expense or a bill is, as the forms send it: "me",
 * "joint" (Family), or a household member's id (20261023210000). The
 * database checks the member is in the household. */
export function parseWhose(raw: unknown, meId: string): { is_joint: boolean; owner_member_id: string | null } {
  const v = String(raw ?? "me");
  if (v === "joint") return { is_joint: true, owner_member_id: null };
  if (v === "me" || !/^[0-9a-f-]{36}$/i.test(v)) return { is_joint: false, owner_member_id: meId };
  return { is_joint: false, owner_member_id: v };
}

/** Add income's category for money borrowed or paid back -- saved to the
 * utang log, not as an income of its own (income-category-extras). */
export const UTANG_CATEGORY = "Utang & paluwagan";

export type WhoseOption = { value: string; label: string };

/** The choices for "Whose is it?": You, everyone else in the household in
 * its own order (children too), then Family (joint). */
export function whoseOptions(members: { id: string; label: string }[], meId: string): WhoseOption[] {
  return [{ value: "me", label: "You" }, ...members.filter((m) => m.id !== meId).map((m) => ({ value: m.id, label: m.label })), { value: "joint", label: "Family (joint)" }];
}

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
      // Three letters, every month: en-GB spells September "Sept", and that
      // one extra letter was the label that wrapped on a phone.
      label: d.toLocaleDateString("en-GB", { month: "short" }).slice(0, 3).toUpperCase(),
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
  // A plain date is already its own key. Parsed, "2026-09-09" is midnight UTC,
  // which local getters west of UTC read as the 8th (19 October).
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
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

/** Confirmed money in and out per period, oldest first -- the history the
 * Cash Flow and Accounts graphs draw, and an account's own trend. `rows`
 * may include pending entries; only confirmed ones count. */
export function periodHistory(
  rows: { occurred_at: string; direction: string; amount: number | string; status: string }[],
  range: CashFlowRange,
  periods: { key: string; label: string }[],
): { key: string; label: string; income: number; expense: number }[] {
  const confirmed = rows.filter((t) => t.status === "confirmed");
  return periods.map((p) => {
    const inPeriod = confirmed.filter((t) => periodKey(t.occurred_at, range) === p.key);
    return {
      key: p.key,
      label: p.label,
      income: inPeriod.filter((t) => t.direction === "in").reduce((sum, t) => sum + Number(t.amount), 0),
      expense: inPeriod.filter((t) => t.direction === "out").reduce((sum, t) => sum + Number(t.amount), 0),
    };
  });
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

/** Category colour for the budget list and the spend-by-category bar -- a
 * small fixed palette (seven hues) rather than one per category. Seven is
 * deliberate: past that, colours stop being reliably tellable apart side by
 * side (checked with the same colourblind-safety method --cal-* already
 * uses), so the categories a household logs against every week get their
 * own colour and the occasional ones -- Education, Travel, Insurance, Debt,
 * the categories added 23 October, plus the literal Other bucket -- share
 * a neutral instead of a hue nobody
 * could actually distinguish from its neighbour. The CSS variables are
 * defined once, in globals.css, so light/dark swap in one place. */
const EXPENSE_CATEGORY_COLOR_VAR: Record<string, string> = {
  Groceries: "var(--wealth-groceries)",
  // Market took Shopping's hue when it split from Groceries (26 October):
  // a weekly spend, where Shopping is occasional. Seven hues stay seven.
  Market: "var(--wealth-shopping)",
  Utilities: "var(--wealth-utilities)",
  Housing: "var(--wealth-housing)",
  Transport: "var(--wealth-transport)",
  Health: "var(--wealth-health)",
  Dining: "var(--wealth-dining)",
};
export function expenseCategoryColor(category: string): string {
  return EXPENSE_CATEGORY_COLOR_VAR[category] ?? "var(--wealth-cat-other)";
}

/** The same palette for money in: each income source takes one of the
 * expense hues (the two donuts never share a screen's slice list), and
 * Other keeps the neutral. */
const INCOME_SOURCE_COLOR_VAR: Record<string, string> = {
  Salary: "var(--wealth-utilities)",
  Business: "var(--wealth-housing)",
  Remittance: "var(--wealth-dining)",
  Investment: "var(--wealth-health)",
  Gift: "var(--wealth-transport)",
  Refund: "var(--wealth-groceries)",
  "House (rent)": "var(--wealth-shopping)",
};
export function incomeSourceColor(category: string): string {
  return INCOME_SOURCE_COLOR_VAR[category] ?? "var(--wealth-cat-other)";
}

/** How this period compares to the one before it -- the badge that turns a
 * hero number into a judgment ("up ₱2,100 from last month") without making
 * anyone read the bars to find out, the way every net-worth screen from
 * Mint to Monarch leads with a delta next to the headline figure rather
 * than the figure alone.
 *
 * `history` is oldest first, the shape every history array in this file
 * already returns; the last two entries are this period and the one before
 * it. Needs at least two periods to compare. The previous period's net can
 * legitimately be zero -- a period with no activity at all -- and a
 * percentage of zero doesn't mean anything, so that case returns `null`
 * for `pctChange` rather than reporting it as Infinity or -Infinity. */
export function periodOverPeriodChange(
  history: { income: number; expense: number }[],
): { netDelta: number; previousNet: number; currentNet: number; pctChange: number | null; previousActive: boolean } | null {
  if (history.length < 2) return null;
  const previous = history[history.length - 2];
  const current = history[history.length - 1];
  const previousNet = previous.income - previous.expense;
  const currentNet = current.income - current.expense;
  const netDelta = currentNet - previousNet;
  const pctChange = previousNet === 0 ? null : (netDelta / Math.abs(previousNet)) * 100;
  // A period with nothing in it at all (the household's first month, say)
  // is not one to compare against: "▲ last month ₱0" read as a change
  // when there was nothing before to change from (27 October).
  const previousActive = previous.income !== 0 || previous.expense !== 0;
  return { netDelta, previousNet, currentNet, pctChange, previousActive };
}

/** A cash-balance trend across the same window the history strip already
 * covers, reconstructed backward from the current total rather than stored
 * anywhere -- an account's balance has never been stored, only computed as
 * opening balance plus every movement since (`loadAccounts`, in
 * `queries/wealth.ts`), so a trend has to work the same way: each period's
 * net is already known, and the balance held right after period *i* is
 * today's balance, less every period's net that happened after *i*.
 *
 * This is the cash portion of net worth only. Assets, liabilities and goals
 * don't carry a per-period history the way transactions do -- a car is
 * worth what it's worth until someone updates it -- so a full net-worth
 * trend would need a stored monthly snapshot (a migration), not this. Said
 * plainly rather than silently covering only half the number and calling
 * it "net worth". */
export function cashBalanceTrend(
  history: { key: string; label: string; income: number; expense: number }[],
  currentTotal: number,
): { key: string; label: string; balance: number }[] {
  const balances: number[] = new Array(history.length);
  let running = currentTotal;
  for (let i = history.length - 1; i >= 0; i--) {
    balances[i] = running;
    running -= history[i].income - history[i].expense;
  }
  return history.map((h, i) => ({ key: h.key, label: h.label, balance: balances[i] }));
}

/** "6 months ago" -- the freshness cue next to a manually-tracked asset or
 * liability value (updated_at). A car or a piano doesn't reprice itself,
 * so its value on the A&L tab is only as current as whoever last opened
 * UPDATE and typed a new one; this is what lets a household actually see
 * that, the way Empower nudges a stale holding. Coarse on purpose -- a
 * household checking a car's value once a year doesn't need to know it
 * was 187 days, just that it's been months. */
export function timeSinceLabel(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const days = Math.max(0, Math.floor((now.getTime() - then.getTime()) / (24 * 60 * 60 * 1000)));
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? "a week ago" : `${weeks} weeks ago`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return months === 1 ? "a month ago" : `${months} months ago`;
  }
  const years = Math.floor(days / 365);
  return years === 1 ? "a year ago" : `${years} years ago`;
}

/** A PostgREST filter keeping only bills the viewer may know about: never
 * paid, or paid from one of the accounts they can see (`seen`, read through
 * the accounts policy as them). A bill paid from someone else's private
 * account is theirs alone. In the query, so a limit or a count is of what
 * may be shown, not of everything. */
export function paidFromVisibleFilter(seen: string[]): string {
  const ids = seen.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  return ids.length > 0 ? `paid_from_account_id.is.null,paid_from_account_id.in.(${ids.join(",")})` : "paid_from_account_id.is.null";
}

/** How many days before a bill falls due its first reminder comes (a push
 * and a line on Today); the day before and the day itself always follow.
 * 3 unless the bill says otherwise (20261007170000_bill_reminder_days). */
export const BILL_REMIND_DAYS = [1, 2, 3, 5, 7, 14] as const;
export const DEFAULT_BILL_REMIND_DAYS = 3;
/** A weekly bill (25 October) is due again within the week: its reminder
 * comes no more than this many days ahead. */
export const WEEKLY_REMIND_MAX = 3;

/** A form's "remind me" value, held to what the database accepts (1-30). */
export function billRemindDays(raw: unknown): number {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) && n >= 1 && n <= 30 ? n : DEFAULT_BILL_REMIND_DAYS;
}

export type BillLike = { due_date: string | null; status: string; amount: number | string };

/** Bills due within the next `days`, soonest (or most overdue) first, with a
 * running total -- what Copilot and YNAB call an "upcoming" view: not
 * "here is every unpaid bill" (the household already has that, sorted by
 * due date, further down the same page) but "here is what you'll actually
 * need between now and then, and how much". An overdue bill is still owed,
 * so it counts too, at the front rather than dropped for being in the past.
 * A bill with no due date isn't due *by* anything, so it's left out of a
 * forecast that only makes sense as a deadline. */
export function billsDueWithin<T extends BillLike>(bills: T[], days: number, from: Date = new Date()): { bills: T[]; total: number } {
  const horizon = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  const due = bills
    .filter((b) => b.status !== "paid" && b.due_date && new Date(b.due_date) <= horizon)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  return { bills: due, total: due.reduce((sum, b) => sum + Number(b.amount), 0) };
}

export type PhoneKind = "ios" | "android" | "other";

/** Which account type a known app fits under, so the dropdown shows only
 * what's relevant once TYPE is picked: a bank account isn't going to be
 * GCash, picking E-wallet shouldn't surface BPI, and an investment isn't
 * going to be any of them. GoTyme is technically a licensed digital bank, not a wallet app --
 * filed under "ewallet" anyway because that's how households actually
 * think of it (a phone-first account opened the same way GCash and Maya
 * are), and that's the only thing this classification is for. */
export type KnownAppKind = "bank" | "ewallet" | "investment" | "stocks";

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
 *   PalawanPay   apps.apple.com id1612022476 / com.palawanpay.ewallet,
 *                Play publisher PPS-PEPP Financial Services Corporation
 *                (Palawan Pawnshop's) -- not "PalawanPay Money Shop", a
 *                separate listing
 *   MariBank     apps.apple.com id1592249158 / ph.seabank.seabank, both
 *                listed as "MariBank PH (SeaBank)", publisher MariBank
 *                Philippines, Inc.; the package kept SeaBank's name
 *   BanKo        apps.apple.com id1401097498 / com.banko.cm, both "BPI
 *                BanKo Mobile App", publisher Bank of the Philippine
 *                Islands -- not com.banko.pm, the agents' app
 *   Virtual      apps.apple.com id6444034285 / pagibigfund.virtualpagibigapp,
 *   Pag-IBIG     publisher Pag-IBIG Fund; where MP2 savings are seen
 *   COL          apps.apple.com id1610734076 ("COL Mobile", publisher COL
 *   Financial    Financial Group, Inc.). Its Play listing
 *                (com.colfinancial.release) was reported pulled on 25 July
 *                2026 and could not be confirmed either way, so Android
 *                gets a Play search for the name instead of a dead page.
 *
 * Added 12 October 2026 from search results, not the stores themselves
 * (unreachable from where this was written): ids and packages matched
 * across more than one listing each, but worth a tap-through on a phone.
 *
 * Left out on purpose, not overlooked: UnionBank's digital-only sibling
 * (UnionDigital) turned up nothing verifiable on one pass -- worth another
 * look later, not worth guessing now. */
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
  {
    label: "PalawanPay",
    kind: "ewallet",
    appStoreUrl: "https://apps.apple.com/ph/app/palawanpay/id1612022476",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.palawanpay.ewallet",
  },
  {
    label: "MariBank",
    kind: "ewallet",
    appStoreUrl: "https://apps.apple.com/ph/app/maribank-ph-seabank/id1592249158",
    playStoreUrl: "https://play.google.com/store/apps/details?id=ph.seabank.seabank",
  },
  {
    label: "BanKo",
    kind: "ewallet",
    appStoreUrl: "https://apps.apple.com/ph/app/bpi-banko-mobile-app/id1401097498",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.banko.cm",
  },
  {
    label: "MP2 (Virtual Pag-IBIG)",
    kind: "investment",
    appStoreUrl: "https://apps.apple.com/ph/app/virtual-pag-ibig/id6444034285",
    playStoreUrl: "https://play.google.com/store/apps/details?id=pagibigfund.virtualpagibigapp",
  },
  {
    label: "COL Financial",
    kind: "stocks",
    appStoreUrl: "https://apps.apple.com/ph/app/col-mobile/id1610734076",
    playStoreUrl: "https://play.google.com/store/search?q=COL%20Financial&c=apps",
  },
];

export function isKnownInstitutionLabel(label: string): boolean {
  return KNOWN_APPS.some((a) => a.label === label);
}

/** Which of KNOWN_APPS actually make sense to offer, given the account
 * type someone just picked -- a bank account isn't going to be GCash, and
 * an e-wallet isn't going to be BPI. Every type shows only its own kind.
 * Until 12 October the types with no apps of their own (credit, investment,
 * other) showed the whole list, which offered every bank and wallet again
 * under Investment; a type with none (cash, credit, other) now offers just
 * Other, which is the honest answer. */
export function knownAppsForType(accountType: AccountType): KnownApp[] {
  return KNOWN_APPS.filter((a) => a.kind === accountType);
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

/** Where OPEN <bank> should send this phone: straight into the bank's app
 * when it's installed, and to the store page to install it when it isn't
 * -- one button instead of OPEN plus a row of GET … APP STORE / PLAY STORE
 * buttons beside it.
 *
 * A web page cannot ask a phone whether an app is installed, so each
 * platform gets the nearest thing it allows:
 *   - Android: an intent: link naming the app's package (read off its Play
 *     Store link). Chrome opens the app if it can, and otherwise follows
 *     S.browser_fallback_url to the Play Store page itself.
 *   - iPhone with a scheme of the app's own (gcash://): try that, and if
 *     the page is still showing a moment later nothing opened, so go to
 *     the App Store (`fallback`).
 *   - iPhone without one (most banks publish none): the App Store page,
 *     which shows OPEN instead of GET when the app is already there.
 *   - A computer: the link as saved if it's a web page, else the App Store
 *     page -- there is no phone app to open.
 * A store link Kin doesn't have is a search for the institution's name,
 * the same fallback GET APP used. `null` when there is nothing to open. */
export function appLaunchPlan(
  kind: PhoneKind,
  links: { linkedAppUrl: string | null; appStoreUrl: string | null; playStoreUrl: string | null; institution: string | null; country?: string | null },
): { href: string; fallback: string | null } | null {
  const isWeb = (u: string | null): u is string => !!u && /^https?:\/\//i.test(u);
  const scheme = links.linkedAppUrl && !isWeb(links.linkedAppUrl) ? links.linkedAppUrl : null;
  const appStore = links.appStoreUrl || (links.institution ? appStoreSearchUrl(links.institution, links.country) : null);
  const playStore = links.playStoreUrl || (links.institution ? playStoreSearchUrl(links.institution) : null);

  if (kind === "android") {
    const pkg = links.playStoreUrl ? new URL(links.playStoreUrl).searchParams.get("id") : null;
    if (pkg && /^[\w.]+$/.test(pkg)) {
      const fallback = encodeURIComponent(links.playStoreUrl!);
      return { href: `intent://#Intent;package=${pkg};S.browser_fallback_url=${fallback};end`, fallback: null };
    }
    if (scheme) return { href: scheme, fallback: playStore };
    const href = playStore ?? links.linkedAppUrl;
    return href ? { href, fallback: null } : null;
  }
  if (kind === "ios") {
    if (scheme) return { href: scheme, fallback: appStore };
    const href = appStore ?? links.linkedAppUrl;
    return href ? { href, fallback: null } : null;
  }
  const href = isWeb(links.linkedAppUrl) ? links.linkedAppUrl : appStore ?? playStore;
  return href ? { href, fallback: null } : null;
}

/* --------------------------------------------------------- account numbers */

/** An account number as typed, checked against the same shape the table
 * allows (account_numbers_number_shape): 4 to 40 letters, digits, spaces
 * and dashes -- room for an IBAN, nothing that isn't a number. Empty means
 * "no number", which clears one. */
export function cleanAccountNumber(raw: string): { number: string | null } | { error: string } {
  const number = raw.trim().replace(/\s+/g, " ");
  if (number === "") return { number: null };
  if (!/^[A-Za-z0-9 -]{4,40}$/.test(number)) return { error: "An account number is 4 to 40 digits or letters; spaces and dashes are fine." };
  return { number };
}

/** "•••• 7890": the last four characters that are digits or letters, for
 * showing a number without showing it. */
export function maskAccountNumber(number: string): string {
  const plain = accountNumberForPaste(number);
  return `•••• ${plain.slice(-4)}`;
}

/** What Copy puts on the clipboard: the number without its spaces or
 * dashes, which bank apps' fields generally refuse. */
export function accountNumberForPaste(number: string): string {
  return number.replace(/[\s-]/g, "");
}

/* ------------------------------------------------------------- remittances */

/** How a padala reached home. GCash and Maya are named because they are how
 * most of it arrives now; a remittance centre (Western Union, Palawan, LBC,
 * Cebuana) keeps its own name in `channel_name`. */
export const REMITTANCE_CHANNELS = ["bank", "gcash", "maya", "remittance_centre", "cash", "other"] as const;
export type RemittanceChannel = (typeof REMITTANCE_CHANNELS)[number];
export const REMITTANCE_CHANNEL_LABELS: Record<RemittanceChannel, string> = {
  bank: "Bank transfer",
  gcash: "GCash",
  maya: "Maya",
  remittance_centre: "Remittance centre",
  cash: "Hand-carried",
  other: "Other",
};

/** The category a remittance's money-in carries on the ledger, so Cash Flow
 * can tell it apart from salary. */
export const REMITTANCE_CATEGORY = "Remittance";

/** A remittance's months, newest first, each with its peso total -- the
 * "how much came home this month" number, and the one a family abroad is
 * most often asked. Pesos received, not the reference value: that is what
 * the household actually had to spend. */
export function remittancesByMonth<T extends { sent_on: string; php_received: number | string }>(rows: T[]): { key: string; total: number; rows: T[] }[] {
  const months = new Map<string, T[]>();
  for (const r of [...rows].sort((a, b) => b.sent_on.localeCompare(a.sent_on))) {
    const key = r.sent_on.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), r]);
  }
  return [...months.entries()].map(([key, list]) => ({ key, rows: list, total: list.reduce((sum, r) => sum + Number(r.php_received), 0) }));
}

/** A loan's payment schedule as entered: monthly from `nextPaymentDate`,
 * `paymentsRemaining` of them. Null when either is missing. */
/** How one payment on a loan splits (20261023220000): this month's interest
 * on what is still owed -- the balance times the yearly rate over twelve,
 * how Philippine banks amortise a housing or car loan -- and the rest pays
 * the loan down, never past what is owed. A payment smaller than the
 * interest pays no principal. No rate, no interest: all of it is principal.
 * Interest is a cost; principal only turns cash into less debt. */
export function loanPaymentSplit(balance: number, ratePct: number | null, payment: number): { interest: number; principal: number } {
  const owed = Math.max(0, balance);
  const interest = Math.min(payment, cents(owed * ((ratePct ?? 0) / 100 / 12)));
  const principal = Math.min(owed, cents(payment - interest));
  return { interest: cents(payment - principal), principal };
}

export type LoanSchedule = { next_payment_date: string | null; payments_remaining: number | null };

/** Every payment date in the schedule, first to last (YYYY-MM-DD). A 31st
 * stays the 31st wherever the month has one, and the month's last day where
 * it does not. */
export function loanPaymentDates(loan: LoanSchedule): string[] {
  if (!loan.next_payment_date || !loan.payments_remaining || loan.payments_remaining < 1) return [];
  const first = loan.next_payment_date.slice(0, 10);
  return Array.from({ length: Math.min(loan.payments_remaining, 1200) }, (_, i) => addMonths(first, i));
}

/** Where a loan stands today: the next payment still ahead (today counts as
 * ahead -- it is still to pay), how many are left including it, and the last
 * one. Counted from the dates, so nobody ticks the number down each month. */
export function loanStatus(loan: LoanSchedule, today: string): { next: string | null; left: number; last: string | null } {
  const dates = loanPaymentDates(loan);
  const ahead = dates.filter((d) => d >= today);
  return { next: ahead[0] ?? null, left: ahead.length, last: dates[dates.length - 1] ?? null };
}

/* ------------------------------------------------- what an asset is made of */

/** The things inside an asset -- mostly a house or condo -- each with its own
 * price and the day it was bought. */
export const ASSET_ITEM_KINDS = ["appliance", "furniture", "electronics", "improvement", "fees", "other"] as const;
export type AssetItemKind = (typeof ASSET_ITEM_KINDS)[number];

export const ASSET_ITEM_KIND_LABELS: Record<AssetItemKind, string> = {
  appliance: "Appliance",
  furniture: "Furniture",
  electronics: "Gadgets & electronics",
  improvement: "Renovation / fixture",
  fees: "Fees & dues",
  other: "Other",
};

/** How each kind ages, in plain words for the form. */
export const ASSET_ITEM_KIND_HINTS: Record<AssetItemKind, string> = {
  appliance: "Resells for about a tenth less each year it ages, never below a tenth of its price.",
  furniture: "Resells for about a tenth less each year it ages, never below a tenth of its price.",
  electronics: "Resells for about a fifth less each year it ages, never below a tenth of its price.",
  improvement: "Part of the place now: rises or falls with the property's yearly change.",
  fees: "Money spent, not something you could sell: counts toward what you put in, not what it is worth.",
  other: "Kept at what it cost, unless you type what it would sell for now.",
};

/** Straight-line loss a year, and the floor it stops at, as fractions of the
 * price. Rough on purpose: a household wants "about what would the aircon
 * fetch", not an accountant's schedule, and can type the real figure. */
const ITEM_AGEING: Partial<Record<AssetItemKind, { perYear: number; floor: number }>> = {
  appliance: { perYear: 0.1, floor: 0.1 },
  furniture: { perYear: 0.1, floor: 0.1 },
  electronics: { perYear: 0.2, floor: 0.1 },
};

export type AssetForWorth = { value: number | string; annual_change_pct: number | string | null; valued_on: string | null };
export type AssetItemForWorth = { kind: string; cost: number | string; acquired_on: string | null; value_now: number | string | null };

/** Whole years (fractional) from one YYYY-MM-DD to another; 0 if either is
 * missing or the first is later. */
export function yearsBetween(from: string | null, to: string): number {
  if (!from) return 0;
  const ms = Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10));
  return Number.isFinite(ms) && ms > 0 ? ms / (365.25 * 24 * 60 * 60 * 1000) : 0;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** The place itself today: its value as last set, grown (or shrunk) by its
 * yearly change, compounded from the day it was set. */
export function propertyWorth(asset: AssetForWorth, today: string): number {
  const value = Number(asset.value);
  const pct = asset.annual_change_pct == null ? 0 : Number(asset.annual_change_pct);
  if (!pct) return value;
  return cents(value * Math.pow(1 + pct / 100, yearsBetween(asset.valued_on, today)));
}

/** One item today: what someone typed it would sell for, if they did;
 * otherwise worked out from its kind and age (see ASSET_ITEM_KIND_HINTS). */
export function itemWorth(item: AssetItemForWorth, today: string, propertyChangePct: number | string | null = null): number {
  if (item.value_now != null) return Number(item.value_now);
  const cost = Number(item.cost);
  const kind = item.kind as AssetItemKind;
  if (kind === "fees") return 0;
  if (kind === "improvement") {
    const pct = propertyChangePct == null ? 0 : Number(propertyChangePct);
    return pct ? cents(cost * Math.pow(1 + pct / 100, yearsBetween(item.acquired_on, today))) : cost;
  }
  const ageing = ITEM_AGEING[kind];
  if (!ageing) return cost;
  const left = Math.max(ageing.floor, 1 - ageing.perYear * yearsBetween(item.acquired_on, today));
  return cents(cost * left);
}

/** An asset with everything in it: the place, the items, their sum (what
 * counts toward net worth), and what was put in altogether (value as set
 * plus every item's price, fees included) -- the gap is what time did. */
export function assetWorth(asset: AssetForWorth, items: AssetItemForWorth[], today: string) {
  const property = propertyWorth(asset, today);
  const itemsWorth = cents(items.reduce((sum, i) => sum + itemWorth(i, today, asset.annual_change_pct), 0));
  const itemsCost = cents(items.reduce((sum, i) => sum + Number(i.cost), 0));
  return { property, items: itemsWorth, total: cents(property + itemsWorth), putIn: cents(Number(asset.value) + itemsCost) };
}

/** Someone an account can be shown to: a member of the household. */
/** Someone an account can be shown to. `hasLogin` false is a managed
 * child's profile: listed so the household is all there, but nobody can be
 * shown an account without a login to see it with. */
export type AccountAudienceMember = { id: string; label: string; grownUp: boolean; hasLogin?: boolean };

/** The chip on an account: who can see it, in a word or two. `viewers` are
 * the people it is shared with besides its owner. */
export function accountAudienceLabel(
  account: { is_joint: boolean; is_private: boolean; owner_member_id: string | null },
  viewers: string[],
  people: AccountAudienceMember[],
  me: string,
): string {
  if (account.is_joint) return "Joint";
  // Open to "everyone" means every grown-up (children see only their own
  // accounts and ones they are named on), so the chip says so.
  if (!account.is_private) return "Grown-ups";
  const mine = account.owner_member_id === me;
  if (viewers.length === 0) return mine ? "Only you" : "Private";
  if (!mine) return "Shared with you";
  const names = viewers.map((id) => people.find((p) => p.id === id)?.label).filter((n): n is string => !!n);
  const grownUps = people.filter((p) => p.grownUp && p.id !== me && p.hasLogin !== false);
  if (grownUps.length > 0 && grownUps.length === viewers.length && grownUps.every((g) => viewers.includes(g.id)) && people.some((p) => !p.grownUp)) return "Grown-ups";
  if (names.length === 0) return "Only you";
  return names.length <= 2 ? `You + ${names.join(", ")}` : `You + ${names.length} people`;
}

/* ------------------------------------------------- what A&L groups together */

/** The groups of what is owned on A&L (Jonathan, 26 October), as a personal
 * balance sheet reads: cash and what is as good as cash, then what is held
 * to grow, then what the household owns outright. A savings goal is cash
 * set aside, not an asset of its own (every contribution left a real
 * account and is still the household's), so it sits under Cash & savings
 * as "set aside". An investment account and an asset of kind investment
 * are the same thing recorded two ways, so both land under Investments. */
export const AL_CASH = "Cash & savings";
export const AL_INVESTMENTS = "Investments";
export const AL_SET_ASIDE = "Set aside for a goal";

export const ASSET_GROUP: Record<AssetKind, string> = {
  property: "Property",
  vehicle: "Vehicles",
  investment: AL_INVESTMENTS,
  business: "Business",
  valuable: "Valuables",
  other: "Other",
};

/** Owned, in the order a balance sheet lists them: liquid first. */
export const AL_OWNED_ORDER: readonly string[] = [AL_CASH, AL_INVESTMENTS, "Property", "Vehicles", "Business", "Valuables", "Other"];

/** Which A&L group an account's money belongs in. A credit card is not
 * money owned at all: below zero it is owed (creditOwed in getNetWorth);
 * above it, an overpayment, it is cash. */
export function accountGroup(accountType: string): string {
  return accountType === "investment" || accountType === "stocks" ? AL_INVESTMENTS : AL_CASH;
}

export function assetGroup(kind: string): string {
  return ASSET_GROUP[kind as AssetKind] ?? ASSET_GROUP.other;
}

/** What the yearly-change box should suggest for a kind of asset, in the
 * words of someone who has watched one age. Null: leave the box blank. */
export const ASSET_KIND_CHANGE_HINTS: Record<AssetKind, string> = {
  property: "5, or -2 if it loses",
  vehicle: "-10: a car loses value",
  investment: "6, what it earns a year",
  business: "Leave blank",
  valuable: "Leave blank, or -5",
  other: "Leave blank",
};

/** The loan a kind of asset is usually bought on. */
export function loanKindFor(assetKind: string): LiabilityKind {
  return assetKind === "property" ? "mortgage" : assetKind === "vehicle" ? "auto_loan" : "personal_loan";
}

/* --------------------------------------------------- a loan by its own terms */

/** Running a loan month by month (20261026170000): each month's interest is
 * the yearly rate over twelve on what is still owed, the rest of the payment
 * pays it down -- how a Philippine bank's amortisation table is built. Stops
 * at `months`, or sooner once nothing is owed. A payment that does not
 * cover the interest leaves the balance growing; it is reported as it is. */
export function amortise(principal: number, ratePct: number | null, payment: number, months: number): { balance: number; interest: number; principalPaid: number; months: number } {
  let balance = Math.max(0, principal);
  let interest = 0;
  let paid = 0;
  let ran = 0;
  const r = Math.max(0, ratePct ?? 0) / 100 / 12;
  for (let m = 0; m < Math.min(months, 1200) && balance > 0; m++) {
    const i = cents(balance * r);
    const p = Math.min(balance, cents(payment - i));
    interest += i;
    paid += Math.max(0, p);
    balance = cents(balance - p);
    ran += 1;
  }
  return { balance, interest: cents(interest), principalPaid: cents(paid), months: ran };
}

/** The level monthly payment that clears `principal` in `termMonths` at
 * `ratePct` a year -- the figure on a bank's loan offer. */
export function amortisedPayment(principal: number, ratePct: number | null, termMonths: number): number {
  const n = Math.max(1, Math.round(termMonths));
  const r = Math.max(0, ratePct ?? 0) / 100 / 12;
  if (!r) return cents(principal / n);
  const f = Math.pow(1 + r, n);
  return cents((principal * r * f) / (f - 1));
}

export type LoanTerms = LoanSchedule & {
  balance: number | string;
  interest_rate: number | string | null;
  monthly_payment: number | string | null;
  original_amount: number | string | null;
  term_months: number | null;
  rate_fixed_until: string | null;
  /** Repriced (20261028120000): the day the rate changed, and the balance
   * and payments left that day. The table then runs from there. */
  repriced_on?: string | null;
  repriced_balance?: number | string | null;
  repriced_payments_left?: number | null;
};

export type LoanOriginStatus = {
  /** Where the table starts: the loan's first day, or the day it was
   * repriced (then `original` is the balance that day). */
  from: "start" | "repricing";
  /** What was borrowed, and the payment the figures below assume: the one
   * typed, else the level payment the terms imply. */
  original: number;
  payment: number;
  /** Payments made so far, by the dates that have passed; the whole term;
   * what is still ahead. */
  made: number;
  term: number;
  left: number;
  /** What should still be owed after those payments, by the terms alone;
   * how far the balance on record is from it (positive: more is on record
   * than the terms say). */
  expectedBalance: number;
  gap: number;
  /** Interest paid so far and principal paid so far, by the terms; the
   * interest the whole loan comes to. */
  interestPaid: number;
  principalPaid: number;
  totalInterest: number;
  /** Months the rate stays fixed from today, or null with no repricing
   * date; negative when it has passed. */
  fixedMonthsLeft: number | null;
  /** Days the rate stays fixed from today (negative once passed), for a
   * repricing under a month away, where months read "0". */
  fixedDaysLeft: number | null;
  /** The balance on record agrees with the terms: within what one payment
   * pays down. The table moves a payment at a time, so a balance read off a
   * statement mid-month, or after "keep the balance", falls between two of
   * its points and never matches to the peso (28 October test). */
  matches: boolean;
};

/** Where a loan stands by the terms it was taken on -- for a household that
 * installs Kin halfway through a mortgage and wants to know the balance on
 * their statement is what it should be. Null unless what was borrowed and
 * the term are both known (and a rate, when a payment has to be worked
 * out); payments made are counted from the schedule's dates that have
 * passed, so nobody ticks them off. */
export function loanOriginStatus(loan: LoanTerms, today: string): LoanOriginStatus | null {
  // After a repricing the bank's new table starts from that day's balance
  // over the payments left then (Jonathan, 28 October): the original terms
  // would read every peso since as a gap.
  const repriced = !!loan.repriced_on && loan.repriced_balance != null && Number(loan.repriced_balance) > 0 && !!loan.repriced_payments_left;
  const original = repriced ? Number(loan.repriced_balance) : loan.original_amount == null ? null : Number(loan.original_amount);
  const term = repriced ? loan.repriced_payments_left! : loan.term_months;
  if (original == null || !(original > 0) || !term || term < 1) return null;
  const rate = loan.interest_rate == null ? null : Number(loan.interest_rate);
  const typed = loan.monthly_payment == null ? null : Number(loan.monthly_payment);
  const payment = typed && typed > 0 ? typed : amortisedPayment(original, rate, term);
  const status = loanStatus(loan, today);
  // No schedule dates: nothing has been counted as paid.
  const left = loan.next_payment_date ? Math.min(term, status.left) : term;
  const made = Math.max(0, term - left);
  const soFar = amortise(original, rate, payment, made);
  const whole = amortise(original, rate, payment, term);
  const balance = Number(loan.balance);
  const fixedMonthsLeft = !loan.rate_fixed_until ? null : loan.rate_fixed_until >= today ? Math.round(yearsBetween(today, loan.rate_fixed_until) * 12) : -Math.round(yearsBetween(loan.rate_fixed_until, today) * 12);
  return {
    from: repriced ? "repricing" : "start",
    original,
    payment,
    made,
    term,
    left,
    expectedBalance: soFar.balance,
    gap: cents(balance - soFar.balance),
    interestPaid: soFar.interest,
    principalPaid: soFar.principalPaid,
    totalInterest: whole.interest,
    fixedMonthsLeft,
    fixedDaysLeft: !loan.rate_fixed_until ? null : Math.round((Date.parse(loan.rate_fixed_until.slice(0, 10)) - Date.parse(today.slice(0, 10))) / 86_400_000),
    matches: Math.abs(balance - soFar.balance) < Math.max(1, cents(payment - soFar.balance * (Math.max(0, rate ?? 0) / 100 / 12))),
  };
}

/** The other way to read a gap between a loan's balance and its terms: the
 * balance is right and the schedule is off. How many payments are left if
 * `balance` is what is owed -- the first point on the amortisation table
 * at or below it. Null unless what was borrowed and the term are known. */
export function paymentsLeftForBalance(loan: LoanTerms, balance: number): number | null {
  const original = loan.original_amount == null ? null : Number(loan.original_amount);
  const term = loan.term_months;
  if (original == null || !(original > 0) || !term || term < 1) return null;
  const rate = loan.interest_rate == null ? null : Number(loan.interest_rate);
  const typed = loan.monthly_payment == null ? null : Number(loan.monthly_payment);
  const payment = typed && typed > 0 ? typed : amortisedPayment(original, rate, term);
  for (let made = 0; made <= term; made++) {
    if (amortise(original, rate, payment, made).balance <= balance + 0.005) return term - made;
  }
  return 0;
}

/* ------------------------------------------------- what moved net worth */

/** A month's net worth in its parts, as net_worth_snapshots keeps them:
 * every account's money (cash), what is set aside for goals, what is
 * owned (assets, with money owed to us), and what is owed. */
export type NetWorthParts = { cash: number; goals: number; assets: number; liabilities: number };

/** One thing waiting on a person under Accounts' "Waiting on you"
 * (Jonathan, 27 October): a pending transfer is one row, not its two
 * legs, since confirming either leg confirms both
 * (confirmTransactionAction), and the list showed seven cards for four
 * decisions. */
export type PendingRow = {
  /** The transfer group's id, or the single entry's. */
  id: string;
  /** An entry to confirm or discard by; the whole group follows. */
  entryId: string;
  kind: "transfer" | "in" | "out";
  amount: number;
  occurredOn: string;
  particulars: string;
  /** A transfer's two sides. A side the viewer cannot see, or only knows
   * the name of, has no id and cannot be changed. */
  from: { id: string | null; name: string } | null;
  to: { id: string | null; name: string } | null;
  /** The account a single entry sits in; null for a transfer. */
  account: { id: string; name: string } | null;
  /** Whether the particulars are the words Kin wrote ("Transfer to X"),
   * not something the person typed, so they need not be repeated. */
  defaultWords: boolean;
};

/** The words transferAction writes when the person typed none. */
export function isTransferWords(particulars: string): boolean {
  return /^Transfer (to|from) /.test(particulars);
}

/** Pending entries as the rows a person decides on, newest first. A
 * transfer's two legs fold into one row; a leg on an account the viewer
 * cannot see is simply absent, and the row says "another account". */
export function pendingRows(
  entries: { id: string; transfer_group_id: string | null; direction: string; amount: number | string; occurred_at: string; particulars: string; account_id: string; accountName: string }[],
): PendingRow[] {
  const rows = new Map<string, PendingRow>();
  for (const e of entries) {
    const side = { id: e.account_id, name: e.accountName };
    if (!e.transfer_group_id) {
      rows.set(e.id, { id: e.id, entryId: e.id, kind: e.direction === "in" ? "in" : "out", amount: Number(e.amount), occurredOn: e.occurred_at.slice(0, 10), particulars: e.particulars, from: null, to: null, account: side, defaultWords: false });
      continue;
    }
    const row = rows.get(e.transfer_group_id) ?? { id: e.transfer_group_id, entryId: e.id, kind: "transfer" as const, amount: Number(e.amount), occurredOn: e.occurred_at.slice(0, 10), particulars: e.particulars, from: null, to: null, account: null, defaultWords: isTransferWords(e.particulars) };
    if (e.direction === "out") row.from = side;
    else row.to = side;
    rows.set(e.transfer_group_id, row);
  }
  return [...rows.values()].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));
}

/** The same rows on Today (27 October): a transfer or an entry logged
 * ahead of time and still waiting on "it went through" was seen only by
 * whoever opened Accounts. Confirm opens that row's sheet there. */
export function pendingBriefItems(rows: PendingRow[], currency: string): { id: string; title: string; meta: string; href: string }[] {
  return rows.map((r) => ({
    id: `pending-${r.id}`,
    title: r.kind === "transfer" ? `${r.from?.name ?? "Another account"} → ${r.to?.name ?? "another account"}` : r.particulars,
    meta: [formatCurrency(r.amount, currency), r.kind === "transfer" ? "transfer" : r.kind === "in" ? `into ${r.account?.name ?? "an account"}` : `from ${r.account?.name ?? "an account"}`, "waiting on confirmation"].join(" · "),
    href: `/wealth?seg=accounts&pending=${r.id}`,
  }));
}

/** One point of the net-worth line: a period, and the figure recorded
 * last in it. `longLabel` names the period in full when it is pointed at. */
export type NetWorthPoint = { key: string; label: string; longLabel: string; netWorth: number; parts?: NetWorthParts };

/** What a period is called in full: "27 October 2026", "Week of 19
 * October 2026", "October 2026", "2026". */
export function periodLongLabel(start: Date, range: CashFlowRange): string {
  if (range === "year") return String(start.getFullYear());
  if (range === "month") return start.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const day = start.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return range === "week" ? `Week of ${day}` : day;
}

/** One net-worth figure per period from the days a viewer's visits
 * recorded (net_worth_snapshots, one row a day since 20261027120000): the
 * last day recorded in the period, or, for a period nobody opened Wealth
 * in, the figure before it carried forward -- what the household was worth
 * on a day nothing was recorded is what it was worth the day before, not
 * zero. `before` is the last day recorded ahead of the window, so the
 * first periods shown can carry too. Periods ahead of any record are left
 * out, and so are leading periods at nothing: a household's first visit
 * recorded ₱0 before an account existed, and the line then read "▲
 * ₱2,004,318 since Sep" as if the money had appeared (27 October). The
 * line starts at the first figure that is not zero. `snapshots` need not
 * be sorted. */
export function netWorthSeries(
  snapshots: { day: string; netWorth: number; parts?: NetWorthParts }[],
  range: CashFlowRange,
  periods: { key: string; label: string; start: Date }[],
  before: { netWorth: number; parts?: NetWorthParts } | null = null,
): NetWorthPoint[] {
  const sorted = [...snapshots].sort((a, b) => a.day.localeCompare(b.day));
  const lastIn = new Map<string, { netWorth: number; parts?: NetWorthParts }>();
  for (const s of sorted) lastIn.set(periodKey(s.day, range), { netWorth: s.netWorth, parts: s.parts });
  let carried = before;
  const out: NetWorthPoint[] = [];
  for (const p of periods) {
    const hit = lastIn.get(p.key);
    if (hit) carried = hit;
    if (!carried) continue;
    if (out.length === 0 && carried.netWorth === 0) continue;
    out.push({ key: p.key, label: p.label, longLabel: periodLongLabel(p.start, range), netWorth: carried.netWorth, parts: carried.parts });
  }
  return out;
}

/** What moved net worth from one month to the next, part by part (Jonathan,
 * 26 October): each part's change as it moved net worth -- more owed is a
 * fall -- largest first, the ones under a peso left out. They add up to the
 * change in net worth. */
export function netWorthMoves(from: NetWorthParts, to: NetWorthParts): { label: string; delta: number }[] {
  const moves = [
    { label: "accounts", delta: to.cash - from.cash },
    { label: "set aside for goals", delta: to.goals - from.goals },
    { label: "what you own", delta: to.assets - from.assets },
    { label: "what you owe", delta: -(to.liabilities - from.liabilities) },
  ];
  return moves.map((m) => ({ ...m, delta: cents(m.delta) })).filter((m) => Math.abs(m.delta) >= 1).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
}

/** The next day a credit card's statement is due, on or after `today`, from
 * the day of the month it falls on (accounts.card_due_day,
 * 20261027140000). A 31st falls on the month's last day in a shorter
 * month. */
export function cardDueDate(dueDay: number, today: string): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const onMonth = (year: number, month: number) => {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(dueDay, last)).padStart(2, "0")}`;
  };
  const thisMonth = onMonth(y, m);
  return thisMonth >= today ? thisMonth : m === 12 ? onMonth(y + 1, 1) : onMonth(y, m + 1);
}

/* --------------------------------------------------- emergency cover */

/** How many months the household's cash could carry its spending
 * (Jonathan, 28 October): cash and savings over an average month's living
 * costs, the first check most finance guides use, three to six months
 * the usual aim. The average is over the months that had spending, so a
 * household new to Kin is not measured against empty months. Fewer than
 * two such months: too soon to say (null). */
export function emergencyCover(liquid: number, monthlySpending: number[]): { months: number; average: number; counted: number; status: "low" | "on_track" | "ample" } | null {
  const spent = monthlySpending.filter((m) => m > 0);
  if (spent.length < 2) return null;
  const average = cents(spent.reduce((t, m) => t + m, 0) / spent.length);
  const months = Math.round((Math.max(0, liquid) / average) * 10) / 10;
  return { months, average, counted: spent.length, status: months < 3 ? "low" : months <= 6 ? "on_track" : "ample" };
}

/* --------------------------------------------- paying a loan down faster */

/** Paying `extra` on top of each month's payment (Jonathan, 28 October): how
 * many months the loan then takes and the interest over them, against the
 * payment alone, both run on the table from what is owed now. A payment
 * that does not cover the interest never ends: months null. The first
 * payment falls on `firstDate` (YYYY-MM-DD), so the last one is dated. */
export function extraPaymentEffect(balance: number, ratePct: number | null, payment: number, extra: number, firstDate: string) {
  const run = (pay: number) => {
    const r = amortise(balance, ratePct, pay, 1200);
    return r.balance > 0.005 ? null : { months: r.months, interest: r.interest, last: addMonths(firstDate.slice(0, 10), Math.max(0, r.months - 1)) };
  };
  const base = run(payment);
  const faster = run(payment + Math.max(0, extra));
  return {
    base,
    faster,
    monthsSooner: base && faster ? base.months - faster.months : null,
    interestSaved: base && faster ? cents(base.interest - faster.interest) : null,
  };
}

/** What a loan's monthly payment becomes at a new rate: the level payment
 * that clears what is owed over the payments left, as the bank works it out
 * when it reprices. */
export function repricedPayment(balance: number, ratePct: number, paymentsLeft: number): number {
  return amortisedPayment(balance, ratePct, paymentsLeft);
}

/** The insurance a lender requires on a loan, renewed every year (Jonathan,
 * 28 October). A Philippine bank housing loan wants fire and allied perils
 * cover on the property and mortgage redemption insurance (MRI, life cover
 * on the borrower that pays the loan off), each renewed yearly with proof
 * sent before the old policy ends; a car loan wants comprehensive car
 * insurance with the bank named, until the loan is paid. Pag-IBIG differs:
 * both covers are in its monthly amortisation, so nothing is bought
 * separately. Null for a loan with no such requirement. */
export type LoanInsurance = { included: boolean; what: string; title: string; note: string };

export function loanInsurance(loan: { name: string; kind: string; lender?: string | null }): LoanInsurance | null {
  const title = `${loan.name} insurance`.slice(0, 150);
  if (loan.kind === "mortgage") {
    if (/pag-?\s?ibig|\bhdmf\b/i.test(`${loan.lender ?? ""} ${loan.name}`)) {
      return { included: true, what: "Pag-IBIG adds MRI and fire insurance to the monthly payment, so there is nothing to buy each year.", title, note: "" };
    }
    return { included: false, what: "The bank requires fire insurance on the property and MRI (life cover on the borrower), renewed every year. Send the bank the new policy before the old one ends.", title, note: "Fire and MRI renewal for the bank" };
  }
  if (loan.kind === "auto_loan") {
    return { included: false, what: "The bank requires comprehensive car insurance, with the bank named, renewed every year until the loan is paid.", title, note: "Comprehensive car insurance renewal for the bank" };
  }
  return null;
}

/** The yearly fund that pays a loan's insurance: a yearly savings goal
 * titled with the loan's whole name and then insurance, a premium or MRI
 * ("Set aside for it" titles it "<loan> insurance"). The name starts the
 * title: "Car loan" is not "BDO car loan insurance". */
export function loanInsuranceFund<G extends { title: string; repeats_yearly: boolean | null }>(loanName: string, goals: G[]): G | null {
  const name = loanName.trim().toLowerCase();
  if (!name) return null;
  return goals.find((g) => g.repeats_yearly && g.title.toLowerCase().startsWith(`${name} `) && /insurance|premium|\bmri\b/i.test(g.title.slice(name.length))) ?? null;
}

/* ------------------------------------------------ an asset's running costs */

/** What owning a thing costs to keep (Jonathan, 28 October): a condo's
 * association dues, the yearly real property tax (amilyar), a car's
 * insurance and LTO registration. Each is a repeating bill against the
 * asset (bills.against_table = "assets"), so it reaches Today, the calendar
 * and its reminder like any bill, and paying it records upkeep on the asset.
 * The suggestions are by kind; anything else can be typed. */
export type RunningCostRepeat = "monthly" | "quarterly" | "yearly";
export const RUNNING_COST_PRESETS: Record<string, { name: string; category: string; recurrence: RunningCostRepeat }[]> = {
  property: [
    { name: "Association dues", category: "Housing", recurrence: "monthly" },
    { name: "Real property tax (amilyar)", category: "Housing", recurrence: "yearly" },
    { name: "Fire insurance", category: "Insurance", recurrence: "yearly" },
  ],
  vehicle: [
    { name: "Car insurance", category: "Insurance", recurrence: "yearly" },
    { name: "LTO registration", category: "Transport", recurrence: "yearly" },
    { name: "Preventive maintenance", category: "Transport", recurrence: "quarterly" },
  ],
};

const PER_MONTH: Record<string, number> = { monthly: 1, quarterly: 3, yearly: 12 };

/** One repeating cost's monthly share: a yearly ₱28,000 is ₱2,333.33 a month. */
export function costPerMonth(amount: number, recurrence: string): number {
  const every = PER_MONTH[recurrence];
  return every ? cents(amount / every) : 0;
}

export type RunningCost = { name: string; amount: number; recurrence: RunningCostRepeat; due: string | null; open: boolean; perMonth: number };

/** An asset's running costs from its repeating bills: the newest bill of
 * each name (a paid one stands until "Add the next one?" makes the next),
 * its next due day while one is open, and what they come to a month. */
export function runningCosts(bills: { name: string; amount: number; recurrence: string | null; due_date: string | null; status: string }[]): { costs: RunningCost[]; perMonth: number } {
  const newest = new Map<string, (typeof bills)[number]>();
  for (const b of bills) {
    if (!b.recurrence || !(b.recurrence in PER_MONTH)) continue;
    const key = b.name.trim().toLowerCase();
    const seen = newest.get(key);
    if (!seen || (b.due_date ?? "") > (seen.due_date ?? "")) newest.set(key, b);
  }
  const costs = [...newest.values()]
    .map((b) => {
      const open = b.status === "unpaid" || b.status === "scheduled";
      return { name: b.name, amount: Number(b.amount), recurrence: b.recurrence as RunningCostRepeat, due: open ? b.due_date : null, open, perMonth: costPerMonth(Number(b.amount), b.recurrence!) };
    })
    .sort((a, b) => b.perMonth - a.perMonth);
  return { costs, perMonth: cents(costs.reduce((t, c) => t + c.perMonth, 0)) };
}

/* ------------------------------------------- pay the loan down, or MP2? */

/** Pag-IBIG MP2's dividend for 2025, declared February 2026: what the
 * comparison below holds a loan's rate against. A year's rate is declared
 * after the year ends and is not promised; this is updated by hand. */
export const MP2_RECENT_RATE = 7.12;
export const MP2_RATE_YEAR = 2025;

/** Paying a loan down early "earns" its rate, certainly; the same money in
 * MP2 earns its dividend, declared yearly and locked in for five years
 * (Jonathan, 29 October). Within a quarter point the two are a wash. */
export function payOrInvest(loanRatePct: number | null): { better: "loan" | "mp2" | "even"; gap: number } | null {
  if (loanRatePct == null || !(loanRatePct > 0)) return null;
  const gap = Math.round((loanRatePct - MP2_RECENT_RATE) * 100) / 100;
  return { better: Math.abs(gap) < 0.25 ? "even" : gap > 0 ? "loan" : "mp2", gap };
}

/** A car or a house with no insurance among its running costs (29
 * October): a car cannot be registered without at least CTPL, and a house
 * without fire cover is one bad night from nothing. Null when one is
 * there, or the asset is not one that needs it. */
export function insuranceGap(kind: string, costNames: string[]): string | null {
  if (kind !== "vehicle" && kind !== "property") return null;
  if (costNames.some((n) => /insurance|\bctpl\b|\btpl\b|\bmri\b|comprehensive/i.test(n))) return null;
  return kind === "vehicle"
    ? "No insurance listed. LTO registration needs at least CTPL each year."
    : "No insurance listed. Fire insurance covers the house itself; add it if you have a policy.";
}

/* --------------------------------------------- which debt to pay first */

/** A card's interest where none is recorded: the BSP's ceiling on unpaid
 * card balances, 3% a month (Circular 1165, January 2023), which issuers
 * mostly charge in full. */
export const CARD_RATE_CEILING = 36;

/** Where an extra peso does the most good (29 October): the debt with the
 * highest rate, since every peso off it stops the dearest interest -- the
 * "avalanche" order. A card with no rate is taken at the ceiling (`assumed`).
 * Nothing to say with fewer than two debts, or none with a rate. */
export function payFirst(debts: { name: string; balance: number; ratePct: number | null; card?: boolean }[]): { name: string; rate: number; assumed: boolean; next: { name: string; rate: number } | null } | null {
  const rated = debts
    .filter((d) => d.balance > 0)
    .map((d) => ({ name: d.name, rate: d.ratePct != null && d.ratePct > 0 ? d.ratePct : d.card ? CARD_RATE_CEILING : null, assumed: (d.ratePct == null || !(d.ratePct > 0)) && !!d.card }))
    .filter((d): d is { name: string; rate: number; assumed: boolean } => d.rate != null)
    .sort((a, b) => b.rate - a.rate);
  if (rated.length < 2) return null;
  return { ...rated[0], next: { name: rated[1].name, rate: rated[1].rate } };
}

/** Whether a newer MP2 rate has likely been declared by `day` (29
 * October): Pag-IBIG declares a year's dividend by about March of the next,
 * so after March of the year after next, MP2_RECENT_RATE is a year old. */
export function mp2RateStale(day: string): boolean {
  return day.slice(0, 10) >= `${MP2_RATE_YEAR + 2}-04-01`;
}
