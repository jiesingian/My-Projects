import type { BriefItem } from "@/lib/queries/today";
import { formatCurrency } from "@/lib/format";
import { currentRound, instalmentPlan, pot, roundDate, type PaluwaganFrequency, type UtangDirection } from "@/lib/utang";
import { loanPaymentDates } from "@/lib/wealth";
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
export type LoanLike = { id: string; name: string; monthly_payment: number | null; next_payment_date: string | null; payments_remaining: number | null };
export type FundLike = { id: string; title: string; target_amount: number | null; current_amount: number; target_date: string | null; repeats_yearly: boolean; created_at: string };
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

export function wealthRows(input: { utang: UtangLike[]; paluwagans: PaluwaganLike[]; loans: LoanLike[]; funds: FundLike[]; income: IncomeLike[] }, today: string, currency: string): WealthRows {
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
        todayRows.push({ id: `paluwagan-turn-${g.id}`, icon: "wallet", tint: "money", title: `Paluwagan · ${g.name}`, meta: `Our turn · the pot is ${fmt(pot(g.contribution, rounds))}`, href });
      }
      if (!g.paid.has(`${ours.id}:${now}`)) {
        todayRows.push({ id: `paluwagan-${g.id}`, action: "pay", urgent: true, icon: "wallet", tint: "money", title: `Hulog · ${g.name}`, meta: `${fmt(g.contribution)} · round ${now} of ${rounds} · ${date < today ? "overdue" : "due today"}`, href });
      }
    }
    if (now < rounds) {
      const nextRound = now + 1;
      const date = roundDate(g.startsOn, g.frequency, nextRound);
      const n = inWeek(date);
      if (n) {
        const turn = ours.turn === nextRound;
        soon.push(soonItem({ id: `soon-paluwagan-${g.id}`, icon: "wallet", tint: "money", title: turn ? `Paluwagan · ${g.name}` : `Hulog · ${g.name}`, meta: turn ? `Our turn ${onDay(today, date)} · the pot is ${fmt(pot(g.contribution, rounds))}` : `${fmt(g.contribution)} ${onDay(today, date)} · round ${nextRound} of ${rounds}`, href, at: n }));
      }
    }
  }

  // A loan's payment on its date, from the schedule as entered.
  for (const l of input.loans) {
    const dates = loanPaymentDates(l);
    const amount = l.monthly_payment ? fmt(Number(l.monthly_payment)) : null;
    if (dates.includes(today)) {
      todayRows.push({ id: `loan-${l.id}`, action: "record", urgent: true, icon: "wallet", tint: "money", title: `${l.name} payment`, meta: [amount, "due today"].filter(Boolean).join(" · "), href: "/wealth?seg=assets" });
      continue;
    }
    const ahead = dates.find((d) => inWeek(d));
    if (ahead) soon.push(soonItem({ id: `soon-loan-${l.id}`, icon: "wallet", tint: "money", title: `${l.name} payment`, meta: [amount, `due ${onDay(today, ahead)}`].filter(Boolean).join(" · "), href: "/wealth?seg=assets", at: inWeek(ahead)! }));
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
  }

  return { today: todayRows, soon };
}
