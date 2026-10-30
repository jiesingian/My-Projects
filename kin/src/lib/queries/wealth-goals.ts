import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { familyDate } from "@/lib/format-family";
import { householdZone } from "@/lib/household-zone";
import { getAccounts, getSpendingByMember } from "@/lib/queries/wealth";
import { formatCurrency } from "@/lib/format";
import { familyDay, familyMidnight } from "@/lib/time";
import { categoryLabel } from "@/lib/wealth";
import { accountProgress, isTracks, limitProgress, loanPace, loanProgress, monthsUntil, onTimeRun, trackKey, clamp01, type Tracks } from "@/lib/wealth-goals";

/** One Planner goal that follows something on Wealth (🎯, 29 October),
 * with how it stands -- the same figures on Wealth's 🎯 and Planner's
 * ring. */
export type TrackedGoal = {
  id: string;
  title: string;
  tracks: Tracks;
  key: string;
  /** What it follows, by name; null once that is gone or out of sight. */
  thing: string | null;
  href: string;
  ownerId: string | null;
  period: string;
  dueDate: string | null;
  /** The goal's own number as people set it: a balance, a monthly amount,
   * a limit, or (a loan) what is to be owed. */
  setTo: number;
  current: number;
  target: number;
  fraction: number;
  reached: boolean;
  /** An expense limit: past it. */
  over: boolean;
  watchOnTime: boolean;
  /** One line under the ring: "₱30,000 of ₱100,000". */
  caption: string;
  /** What else is worth knowing: pace, on time, what is left. */
  lines: string[];
  /** What it follows, for its 🎯 wherever else it shows ("Waiting on
   * you"): the thing's id, or an expense limit's category. */
  thingId: string | null;
  category: string | null;
  /** Needs a look (29 October): said on "Waiting on you" to whoever acts
   * on it -- a limit nearly or already spent, a salary late or short, a
   * loan behind its pace, a fund near or past its date. */
  nudge: string | null;
  /** What a month gets it there by its date (a fund, a balance), or the
   * extra a month a loan needs; null with no date or nothing to add. */
  perMonth: number | null;
  /** Auto-save (29 October): the monthly bill that moves money into a fund
   * or pays a loan down extra, when set up; and the next payday, the day
   * one is suggested for. */
  autoSave: { amount: number; accountId: string | null; next: string | null } | null;
  payday: string | null;
  /** Whether `payday` is an expected income's day, or just next month's 1st. */
  paydayKnown: boolean;
};

/** Every tracked goal of the household the viewer can see, by trackKey.
 * Built once a request (Wealth's tabs and Planner share it). */
/** The 1st of the month after `today` (YYYY-MM-DD). */
function firstOfNextMonth(today: string): string {
  const [y, m] = today.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/** Days after today to the month's end. */
function daysLeftInMonth(today: string): number {
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate() - d;
}

export const getTrackedGoals = cache(async (familyId: string, currency: string): Promise<Map<string, TrackedGoal>> => {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("planner_goals")
    .select("id, title, tracks, tracks_id, tracks_category, owner_member_id, target, period, due_date, start_value, savings_goal_id, watch_on_time")
    .eq("family_id", familyId)
    .not("tracks", "is", null)
    .is("removed_at", null);
  const goals = (rows ?? []).filter((g) => isTracks(g.tracks));
  const out = new Map<string, TrackedGoal>();
  if (goals.length === 0) return out;

  const [fmtDate, tz] = await Promise.all([familyDate(), householdZone()]);
  const today = familyDay(new Date(), tz);
  const monthStart = (familyMidnight(`${today.slice(0, 7)}-01`, tz) ?? new Date(`${today.slice(0, 7)}-01T00:00:00Z`)).toISOString();
  const ids = (t: Tracks) => goals.filter((g) => g.tracks === t).map((g) => g.tracks_id as string);
  const fmt = (n: number) => formatCurrency(n, currency);
  const none = Promise.resolve({ data: [] as never[] });

  const incomeIds = ids("income");
  const [accounts, { data: loans }, { data: assets }, { data: funds }, { data: groups }, { data: schedules }, spending] = await Promise.all([
    ids("account").length ? getAccounts(familyId) : Promise.resolve([]),
    ids("loan").length ? supabase.from("liabilities").select("id, name, balance, interest_rate, monthly_payment").in("id", ids("loan")) : none,
    ids("asset").length ? supabase.from("assets").select("id, name").in("id", ids("asset")) : none,
    goals.some((g) => g.savings_goal_id) ? supabase.from("goals").select("id, current_amount").in("id", goals.flatMap((g) => (g.savings_goal_id ? [g.savings_goal_id] : []))) : none,
    incomeIds.length ? supabase.from("income_groups").select("id, name").in("id", incomeIds) : none,
    // A group's payments, each with the day it was expected and what came
    // (its entry), and a one-off expected payment by its own id.
    incomeIds.length ? supabase.from("income_schedules").select("id, name, group_id, amount, next_date, status, received_at, transaction_id").or(`group_id.in.(${incomeIds.join(",")}),id.in.(${incomeIds.join(",")})`) : none,
    goals.some((g) => g.tracks === "expense") ? getSpendingByMember(familyId, Number(today.slice(0, 4)), Number(today.slice(5, 7))) : Promise.resolve([]),
  ]);
  // Auto-save bills (monthly, open) against a fund or a loan, and the next
  // payday: the soonest income still expected.
  const fundIds = goals.flatMap((g) => (g.tracks === "asset" && g.savings_goal_id ? [g.savings_goal_id] : []));
  const [{ data: saveBills }, { data: paydays }] = await Promise.all([
    fundIds.length || ids("loan").length || ids("account").length
      ? supabase.from("bills").select("id, name, amount, account_id, due_date, against_table, against_id").eq("family_id", familyId).eq("auto_save", true).in("status", ["unpaid", "overdue", "scheduled"]).in("against_id", [...fundIds, ...ids("loan"), ...ids("account")]).order("due_date", { ascending: true })
      : none,
    supabase.from("income_schedules").select("next_date").eq("family_id", familyId).eq("status", "expected").gte("next_date", today).order("next_date", { ascending: true }).limit(1),
  ]);
  // With no income expected (none set up yet), the 1st of next month: the
  // first auto-save still has a day, and the button isn't left greyed out.
  const nextIncome = paydays?.[0]?.next_date?.slice(0, 10) ?? null;
  const payday = nextIncome ?? firstOfNextMonth(today);
  const paydayKnown = nextIncome !== null;
  const autoSaveFor = (table: "goals" | "liabilities" | "accounts", id: string | null) => {
    const b = (saveBills ?? []).find((x) => x.against_table === table && x.against_id === id);
    return b ? { amount: Number(b.amount), accountId: b.account_id, next: b.due_date?.slice(0, 10) ?? null } : null;
  };
  const txIds = (schedules ?? []).flatMap((s) => (s.transaction_id ? [s.transaction_id] : []));
  const { data: txs } = txIds.length ? await supabase.from("wealth_transactions").select("id, amount, occurred_at, status").in("id", txIds) : { data: [] as { id: string; amount: number; occurred_at: string; status: string }[] };
  const txOf = new Map((txs ?? []).map((t) => [t.id, t]));

  for (const g of goals) {
    const tracks = g.tracks as Tracks;
    const setTo = Number(g.target);
    const base = { id: g.id, title: g.title, tracks, ownerId: g.owner_member_id, period: g.period, dueDate: g.due_date, setTo, watchOnTime: g.watch_on_time, over: false, lines: [] as string[], thingId: g.tracks_id, category: g.tracks_category, nudge: null as string | null, perMonth: null as number | null, autoSave: null as TrackedGoal["autoSave"], payday, paydayKnown };
    const by = g.due_date ? ` by ${fmtDate(g.due_date)}` : "";
    const left = g.due_date ? monthsUntil(today, g.due_date) : null;
    // A fund or balance near its date (two months) or past it, not there.
    const dateNudge = (reached: boolean, toGo: number) =>
      !g.due_date || reached ? null : g.due_date.slice(0, 10) < today ? `Its date has passed with ${fmt(toGo)} to go` : left! <= 2 ? `Due ${fmtDate(g.due_date)}, ${fmt(toGo)} to go` : null;

    if (tracks === "account") {
      const a = accounts.find((x) => x.id === g.tracks_id);
      const p = accountProgress(a ? Number(a.balance) : 0, setTo);
      const lines: string[] = [];
      const perMonth = a && !p.reached && left ? Math.ceil((setTo - p.current) / left) : null;
      if (perMonth) lines.push(`${fmt(perMonth)} a month gets it there${by}.`);
      out.set(trackKey("account", g.tracks_id!), { ...base, key: trackKey("account", g.tracks_id!), thing: a?.name ?? null, href: `/wealth/accounts/${g.tracks_id}`, current: p.current, target: setTo, fraction: p.fraction, reached: p.reached, caption: `${fmt(p.current)} of ${fmt(setTo)}${by}`, lines, perMonth, autoSave: autoSaveFor("accounts", g.tracks_id), nudge: a && !autoSaveFor("accounts", g.tracks_id) ? dateNudge(p.reached, setTo - p.current) : null });
    } else if (tracks === "loan") {
      const l = (loans ?? []).find((x) => x.id === g.tracks_id);
      const balance = l ? Number(l.balance) : 0;
      // Stored as how much to pay down from where it stood (start_value):
      // what is to be owed is the difference.
      const start = Number(g.start_value ?? balance);
      const owe = Math.max(0, start - setTo);
      const p = loanProgress(start, balance, owe);
      const lines: string[] = [`Owe ${fmt(balance)} now; the goal is ${owe > 0 ? `to owe ${fmt(owe)}` : "paid off"}${by}.`];
      let nudge: string | null = null;
      let perMonth: number | null = null;
      const autoSave = autoSaveFor("liabilities", g.tracks_id);
      if (l && !p.reached && left != null && Number(l.monthly_payment) > 0) {
        const pace = loanPace(balance, l.interest_rate == null ? null : Number(l.interest_rate), Number(l.monthly_payment), owe, left);
        perMonth = pace.extra || null;
        // An extra payment already set up for about that much: on its way.
        if (!pace.onTrack && !(autoSave && pace.extra && autoSave.amount >= pace.extra)) nudge = pace.extra ? `Behind: about ${fmt(pace.extra)} more a month gets it there` : `Its date has come with ${fmt(balance - owe)} still to go`;
        lines.push(pace.onTrack ? `On track: the ${fmt(Number(l.monthly_payment))} a month gets it there.` : pace.extra ? `Needs about ${fmt(pace.extra)} more a month to get there${by}.` : `Its date has come with ${fmt(balance - owe)} still to go.`);
      }
      out.set(trackKey("loan", g.tracks_id!), { ...base, setTo: owe, key: trackKey("loan", g.tracks_id!), thing: l?.name ?? null, href: `/wealth?seg=assets&line=${g.tracks_id}`, current: p.current, target: p.target, fraction: p.fraction, reached: p.reached, caption: `${fmt(p.current)} paid down of ${fmt(p.target)}`, lines, nudge, perMonth, autoSave });
    } else if (tracks === "asset") {
      const a = (assets ?? []).find((x) => x.id === g.tracks_id);
      const saved = Number((funds ?? []).find((f) => f.id === g.savings_goal_id)?.current_amount ?? 0);
      const p = accountProgress(saved, setTo);
      const perMonth = !p.reached && left ? Math.ceil((setTo - saved) / left) : null;
      const lines = perMonth ? [`${fmt(perMonth)} a month gets it there${by}.`] : [];
      const autoSave = autoSaveFor("goals", g.savings_goal_id);
      out.set(trackKey("asset", g.tracks_id!), { ...base, key: trackKey("asset", g.tracks_id!), thing: a?.name ?? null, href: `/wealth?seg=assets&line=${encodeURIComponent(`asset-${g.tracks_id}`)}`, current: saved, target: setTo, fraction: p.fraction, reached: p.reached, caption: `${fmt(saved)} saved of ${fmt(setTo)}${by}`, lines, perMonth, autoSave, nudge: a && !autoSave ? dateNudge(p.reached, setTo - saved) : null });
    } else if (tracks === "income") {
      const group = (groups ?? []).find((x) => x.id === g.tracks_id);
      const mine = (schedules ?? []).filter((s) => (group ? s.group_id === group.id : s.id === g.tracks_id));
      const thing = group?.name ?? mine[0]?.name ?? null;
      const received = (s: (typeof mine)[number]) => {
        const t = s.transaction_id ? txOf.get(s.transaction_id) : undefined;
        return t && t.status === "confirmed" ? t : undefined;
      };
      const thisMonth = mine.reduce((sum, s) => {
        const t = received(s);
        return t && t.occurred_at >= monthStart ? sum + Number(t.amount) : sum;
      }, 0);
      const lines: string[] = [];
      let nudge: string | null = null;
      if (g.watch_on_time) {
        const run = onTimeRun(
          mine.flatMap((s) => (s.next_date ? [{ expected: s.next_date.slice(0, 10), amount: Number(s.amount), receivedOn: received(s) ? (s.received_at ?? received(s)!.occurred_at) : null, received: received(s) ? Number(received(s)!.amount) : null }] : [])),
          today,
        );
        if (run.late) lines.push(run.late.why === "missing" ? `The one due ${fmtDate(run.late.expected)} hasn't come in yet.` : run.late.why === "late" ? `The one due ${fmtDate(run.late.expected)} came late.` : `The one due ${fmtDate(run.late.expected)} came short: check for deductions.`);
        if (run.run > 0) lines.push(`On time and in full ${run.run} ${run.run === 1 ? "time" : "times"} running.`);
        // Late or short in the last month: worth asking about. Not yet in
        // is already on the list as income expected.
        if (run.late && run.late.why !== "missing" && Date.parse(today) - Date.parse(run.late.expected) <= 31 * 86_400_000)
          nudge = run.late.why === "short" ? `The one due ${fmtDate(run.late.expected)} came short: check for deductions` : `The one due ${fmtDate(run.late.expected)} came late`;
      }
      out.set(trackKey("income", g.tracks_id!), { ...base, key: trackKey("income", g.tracks_id!), thing, href: "/wealth?seg=cashflow", current: thisMonth, target: setTo, fraction: clamp01(thisMonth / setTo), reached: thisMonth >= setTo, caption: `${fmt(thisMonth)} of ${fmt(setTo)} this month`, lines, nudge });
    } else {
      // A category's limit is its budget when it has one, so the two never
      // disagree; else the goal's own.
      const person = spending.find((p) => p.memberId === g.owner_member_id);
      const cat = person?.categories.find((c) => categoryLabel(c.category) === categoryLabel(g.tracks_category!));
      const limit = cat && cat.amount > 0 ? cat.amount : setTo;
      const p = limitProgress(cat?.spent ?? 0, limit);
      const key = trackKey("expense", g.tracks_category!, g.owner_member_id);
      out.set(key, { ...base, setTo: limit, key, thing: categoryLabel(g.tracks_category!), href: "/wealth?seg=cashflow", current: p.current, target: limit, fraction: p.fraction, reached: false, over: p.over > 0, caption: `${fmt(p.current)} spent of ${fmt(limit)} this month`, lines: [p.over > 0 ? `Over the limit by ${fmt(p.over)}.` : `${fmt(p.left)} left this month.`],
        // Nearly spent (80%) with the month still running, or past it.
        nudge: p.over > 0 ? `Over the limit by ${fmt(p.over)}` : p.fraction >= 0.8 ? `${Math.round(p.fraction * 100)}% of the limit spent, ${daysLeftInMonth(today)} days to go` : null });
    }
  }
  return out;
});
