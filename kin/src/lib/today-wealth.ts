import type { BriefItem } from "@/lib/queries/today";
import { formatCurrency } from "@/lib/format";
import { currentRound, instalmentPlan, pot, roundDate, type PaluwaganFrequency, type UtangDirection } from "@/lib/utang";
import { cardDueDate, loanPaymentDates } from "@/lib/wealth";
import { cycleStart, fundPlan } from "@/lib/sinking-fund";
import { monthLabel, recapMonthFor } from "@/lib/money-recap";

/** Wealth on Today (Jonathan, 23 October, decision 5): what is due today
 * and what the week holds, for a grown-up with Wealth, built from the same
 * sums the Wealth tab shows -- an utang's instalments (lib/utang), a
 * paluwagan's rounds, a loan's payment dates (lib/wealth), a sinking fund's
 * plan (lib/sinking-fund), the expected income, and the money recap on the
 * first days of the month. Only bills reached Today before; everything else
 * sat on Wealth and the Planner's calendar. Pure: the queries are in
 * queries/today-wealth. */

export type WealthRows = { today: BriefItem[]; soon: BriefItem[] };

export type UtangLike = {
  id: string;
  direction: UtangDirection;
  personName: string;
  amount: number;
  paid: number;
  left: number;
  settled: boolean;
  dueOn: string | null;
  instalments: number | null;
  instalmentFrequency: PaluwaganFrequency | null;
  firstDueOn: string | null;
};
export type PaluwaganLike = {
  id: string;
  name: string;
  contribution: number;
  frequency: PaluwaganFrequency;
  startsOn: string;
  members: { id: string; name: string; turn: number; isUs: boolean }[];
  paid: Set<string>;
};
export type LoanLike = { id: string; name: string; monthly_payment: number | null; next_payment_date: string | null; payments_remaining: number | null; rate_fixed_until?: string | null };
export type FundLike = { id: string; title: string; target_amount: number | null; current_amount: number; target_date: string | null; repeats_yearly: boolean; created_at: string };
export type MaturityLike = { id: string; name: string; balance: number; matures_on: string | null };
export type CardLike = { id: string; name: string; owed: number; card_due_day: number | null; card_min_payment: number | null };
export type AssetLike = { id: string; name: string; valued_on: string | null; annual_change_pct: number | string | null };
export type MatchLike = { id: string; name: string };
export type IncomeLike = { id: string; name: string; amount: number; next_date: string | null; status: string };

const DAY_MS = 86_400_000;

function daysUntil(today: string, day: string): number {
  return Math.round((Date.parse(day) - Date.parse(today)) / DAY_MS);
}

/** "tomorrow", "on Tuesday": the week's days as Coming up says them. */
function onDay(today: string, day: string): string {
  return daysUntil(today, day) === 1 ? "tomorrow" : `on ${new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })}`;
}

function soonItem(partial: Omit<BriefItem, "whose" | "memberIds"> & { at: number }): BriefItem {
  return { ...partial, whose: "family", memberIds: [] };
}

export function wealthRows(input: { utang: UtangLike[]; paluwagans: PaluwaganLike[]; loans: LoanLike[]; funds: FundLike[]; income: IncomeLike[]; assets?: AssetLike[]; cards?: CardLike[]; maturities?: MaturityLike[]; toMatch?: MatchLike[] }, today: string, currency: string): WealthRows {
  const fmt = (n: number) => formatCurrency(n, currency);
  const todayRows: BriefItem[] = [];
  const soon: BriefItem[] = [];
  const inWeek = (day: string) => {
    const n = daysUntil(today, day);
    return n >= 1 && n <= 7 ? n : null;
  };

  // Utang: the next instalment, or the one date it is due by. Money lent is
  // recorded as it comes back ("Record"); money borrowed is paid.
  for (const u of input.utang) {
    if (u.settled) continue;
    const title = u.direction === "lent" ? `${u.personName} owes us` : `We owe ${u.personName}`;
    const action = u.direction === "lent" ? ("record" as const) : ("pay" as const);
    const base = { id: `utang-${u.id}`, icon: "wallet" as const, tint: "money" as const, title, href: "/wealth/utang" };
    if (u.instalments && u.instalmentFrequency && u.firstDueOn) {
      const plan = instalmentPlan(u.amount, u.instalments, u.instalmentFrequency, u.firstDueOn, u.paid, today);
      const next = plan.find((i) => i.status !== "paid");
      if (!next) continue;
      const which = `instalment ${next.n} of ${plan.length}`;
      if (next.due <= today) {
        todayRows.push({ ...base, action, urgent: true, meta: `${fmt(next.amount)} · ${which} · ${next.due < today ? "overdue" : "due today"}${next.status === "part" ? " · part paid" : ""}` });
      } else {
        const n = inWeek(next.due);
        if (n) soon.push(soonItem({ ...base, id: `soon-${base.id}`, at: n, meta: `${fmt(next.amount)} · ${which} · due ${onDay(today, next.due)}` }));
      }
    } else if (u.dueOn) {
      if (u.dueOn <= today) {
        todayRows.push({ ...base, action, urgent: true, meta: `${fmt(u.left)} left · ${u.dueOn < today ? "overdue" : "due today"}` });
      } else {
        const n = inWeek(u.dueOn);
        if (n) soon.push(soonItem({ ...base, id: `soon-${base.id}`, at: n, meta: `${fmt(u.left)} left · due ${onDay(today, u.dueOn)}` }));
      }
    }
  }

  // Paluwagan: our hulog for the round that is on, until it is in; our own
  // turn on its day; and next week's round.
  for (const g of input.paluwagans) {
    const rounds = g.members.length;
    const ours = g.members.find((m) => m.isUs);
    if (rounds === 0 || !ours) continue;
    const now = currentRound(g.startsOn, g.frequency, rounds, today);
    const href = `/wealth/paluwagan/${g.id}`;
    if (now >= 1) {
      const date = roundDate(g.startsOn, g.frequency, now);
      if (ours.turn === now && date === today) {
        todayRows.push({ id: `paluwagan-turn-${g.id}`, icon: "wallet", tint: "money", title: `Savings circle · ${g.name}`, meta: `Our turn · the pot is ${fmt(pot(g.contribution, rounds))}`, href });
      }
      if (!g.paid.has(`${ours.id}:${now}`)) {
        todayRows.push({ id: `paluwagan-${g.id}`, action: "pay", urgent: true, icon: "wallet", tint: "money", title: `Contribution · ${g.name}`, meta: `${fmt(g.contribution)} · round ${now} of ${rounds} · ${date < today ? "overdue" : "due today"}`, href });
      }
    }
    if (now < rounds) {
      const nextRound = now + 1;
      const date = roundDate(g.startsOn, g.frequency, nextRound);
      const n = inWeek(date);
      if (n) {
        const turn = ours.turn === nextRound;
        soon.push(soonItem({ id: `soon-paluwagan-${g.id}`, icon: "wallet", tint: "money", title: turn ? `Savings circle · ${g.name}` : `Contribution · ${g.name}`, meta: turn ? `Our turn ${onDay(today, date)} · the pot is ${fmt(pot(g.contribution, rounds))}` : `${fmt(g.contribution)} ${onDay(today, date)} · round ${nextRound} of ${rounds}`, href, at: n }));
      }
    }
  }

  // A loan's payment on its date, from the schedule as entered. And its
  // fixed rate ending within the month (Jonathan, 26 October): the bank
  // reprices then, and the household wants the new rate before the first
  // payment at it.
  for (const l of input.loans) {
    if (l.rate_fixed_until) {
      const n = daysUntil(today, l.rate_fixed_until);
      if (n >= 0 && n <= 30) {
        const when = n === 0 ? "today" : n === 1 ? "tomorrow" : n <= 7 ? onDay(today, l.rate_fixed_until) : `in ${n} days`;
        soon.push(soonItem({ id: `soon-loan-reprice-${l.id}`, icon: "wallet", tint: "money", title: `${l.name} · fixed rate ends`, meta: `${when[0].toUpperCase()}${when.slice(1)} · ask the bank for the new rate, then update it under Payments`, href: "/wealth?seg=assets", at: Math.max(n, 0.5) }));
      }
    }
    const dates = loanPaymentDates(l);
    const amount = l.monthly_payment ? fmt(Number(l.monthly_payment)) : null;
    if (dates.includes(today)) {
      todayRows.push({ id: `loan-${l.id}`, action: "record", urgent: true, icon: "wallet", tint: "money", title: `${l.name} payment`, meta: [amount, "due today"].filter(Boolean).join(" · "), href: "/wealth?seg=assets" });
      continue;
    }
    const ahead = dates.find((d) => inWeek(d));
    if (ahead) soon.push(soonItem({ id: `soon-loan-${l.id}`, icon: "wallet", tint: "money", title: `${l.name} payment`, meta: [amount, `due ${onDay(today, ahead)}`].filter(Boolean).join(" · "), href: "/wealth?seg=assets", at: inWeek(ahead)! }));
  }

  // A credit card on its due day, and the week before (26 October): only
  // while something is owed on it. Pay opens the card, where a transfer
  // from the bank pays it.
  for (const c of input.cards ?? []) {
    if (!c.card_due_day || !(c.owed > 0)) continue;
    const due = cardDueDate(c.card_due_day, today);
    const what = [`${fmt(c.owed)} owed`, c.card_min_payment ? `minimum ${fmt(Number(c.card_min_payment))}` : null].filter(Boolean).join(" · ");
    // Pay opens the card's Pay sheet (28 October).
    const href = `/wealth/accounts/${c.id}?pay=1`;
    if (due === today) todayRows.push({ id: `card-${c.id}-${due}`, action: "pay", urgent: true, icon: "wallet", tint: "money", title: `${c.name} due`, meta: `${what} · due today`, href });
    else {
      const n = inWeek(due);
      if (n) soon.push(soonItem({ id: `soon-card-${c.id}`, icon: "wallet", tint: "money", title: `${c.name} due`, meta: `${what} · due ${onDay(today, due)}`, href, at: n }));
    }
  }

  // An investment maturing (28 October): the week before in Coming up; from
  // the day, a row for two weeks -- decide to roll it over or move it,
  // before the bank rolls it over for you.
  for (const m of input.maturities ?? []) {
    if (!m.matures_on) continue;
    const day = m.matures_on.slice(0, 10);
    const n = daysUntil(today, day);
    const href = `/wealth/accounts/${m.id}`;
    const worth = fmt(m.balance);
    if (n <= 0 && n >= -14) {
      todayRows.push({ id: `matures-${m.id}-${day}`, action: "record", icon: "wallet", tint: "money", title: `${m.name} ${n === 0 ? "matures today" : "has matured"}`, meta: `${worth}${n < 0 ? ` · since ${onDay(today, day).replace(/^on /, "")}` : ""} · roll it over, or move it`, href });
    } else {
      const w = inWeek(day);
      if (w) soon.push(soonItem({ id: `soon-matures-${m.id}`, icon: "wallet", tint: "money", title: `${m.name} matures`, meta: `${worth} · ${onDay(today, day)} · decide: roll it over, or move it`, href, at: w }));
    }
  }

  // A sinking fund on its date, until "Paid it" records the payment.
  for (const f of input.funds) {
    const target = Number(f.target_amount ?? 0);
    if (!f.target_date || target <= 0) continue;
    const plan = fundPlan({ target, saved: Number(f.current_amount), due: f.target_date, today, cycleStart: cycleStart({ createdDay: f.created_at.slice(0, 10), due: f.target_date, repeatsYearly: f.repeats_yearly }) });
    if (plan.status === "funded") continue;
    if (f.target_date <= today) {
      todayRows.push({ id: `fund-${f.id}`, action: "record", urgent: true, icon: "wallet", tint: "money", title: f.title, meta: `${fmt(plan.left)} to go · ${f.target_date < today ? "the date has passed" : "due today"} · record the payment`, href: "/wealth?seg=assets" });
    } else {
      const n = inWeek(f.target_date);
      if (n) soon.push(soonItem({ id: `soon-fund-${f.id}`, icon: "wallet", tint: "money", title: f.title, meta: `${fmt(plan.left)} to go · due ${onDay(today, f.target_date)}`, href: "/wealth?seg=assets", at: n }));
    }
  }

  // Income expected: on its day it is received; before, it is coming.
  for (const x of input.income) {
    if (x.status !== "expected" || !x.next_date) continue;
    if (x.next_date <= today) {
      todayRows.push({ id: `income-${x.id}`, action: "receive", icon: "wallet", tint: "money", title: x.name, meta: `${fmt(Number(x.amount))} · expected ${x.next_date < today ? `since ${onDay(today, x.next_date).replace(/^on /, "")}` : "today"}`, href: "/wealth?seg=cashflow" });
    } else {
      const n = inWeek(x.next_date);
      if (n) soon.push(soonItem({ id: `soon-income-${x.id}`, icon: "wallet", tint: "money", title: x.name, meta: `${fmt(Number(x.amount))} expected ${onDay(today, x.next_date)}`, href: "/wealth?seg=cashflow", at: n }));
    }
  }

  // The first three days of a month: last month's recap is ready (the push
  // on the 1st opens the same page).
  if (Number(today.slice(8, 10)) <= 3) {
    const month = recapMonthFor(today);
    todayRows.push({ id: `recap-${month}`, icon: "wallet", tint: "money", title: `Your ${monthLabel(month)} money recap`, meta: "last month's spending, bills and savings", href: `/wealth/recap?month=${month}` });

    // Beside it, the values not set in a year or more (Jonathan, 26
    // October): a yearly change is an estimate, and it drifts. One row for
    // all of them, in the same three days, so it reminds without nagging;
    // Update on A&L sets the value again and the row goes.
    const stale = valuesToCheck(input.assets ?? [], today);
    if (stale.length > 0) {
      const names = stale.slice(0, 3).map((a) => a.name).join(", ") + (stale.length > 3 ? ` and ${stale.length - 3} more` : "");
      todayRows.push({ id: `values-${month}`, icon: "house", tint: "money", title: stale.length === 1 ? "Check what it's worth now" : "Check what these are worth now", meta: `${names} · last set over a year ago`, href: "/wealth?seg=assets" });
    }

    // And the accounts not matched to their bank lately (29 October): with
    // no bank sync, a balance drifts by every fee and forgotten meal. One row,
    // the same three days; matching one takes it off.
    const toMatch = input.toMatch ?? [];
    if (toMatch.length > 0) {
      const names = toMatch.slice(0, 3).map((a) => a.name).join(", ") + (toMatch.length > 3 ? ` and ${toMatch.length - 3} more` : "");
      todayRows.push({ id: `match-${month}`, icon: "banknote", tint: "money", title: toMatch.length === 1 ? "Match it to the bank" : "Match these to the bank", meta: `${names} · type what the bank app shows`, href: toMatch.length === 1 ? `/wealth/accounts/${toMatch[0].id}?match=1` : "/wealth?seg=accounts" });
    }
  }

  return { today: todayRows, soon };
}

/** Assets whose value was last set a year or more before `today`, oldest
 * first. An asset with no date is left out: it was never set by hand. */
export function valuesToCheck<T extends AssetLike>(assets: T[], today: string): T[] {
  const yearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4, 10)}`;
  return assets.filter((a) => !!a.valued_on && a.valued_on.slice(0, 10) <= yearAgo).sort((x, y) => (x.valued_on! < y.valued_on! ? -1 : 1));
}

/** The accounts to match to their bank this month: a bank, e-wallet or card
 * of the reader's own or the household's (not another grown-up's), not
 * matched in the last 25 days. Cash is left out: counting it is not a bank
 * statement's job. */
export function accountsToMatch<T extends MatchLike & { account_type: string; is_joint: boolean | null; owner_member_id: string | null }>(accounts: T[], meId: string, matchedLately: Set<string>): T[] {
  return accounts.filter((a) => ["bank", "ewallet", "credit"].includes(a.account_type) && (a.is_joint || a.owner_member_id === meId) && !matchedLately.has(a.id));
}
