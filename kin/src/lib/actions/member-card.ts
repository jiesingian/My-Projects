"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { humanDatabaseError } from "@/lib/db-errors";
import { sendPush } from "@/lib/push";
import { getWeather, type Weather } from "@/lib/weather";
import { getRoutinesNeedingAttention } from "@/lib/queries/routines";
import { getGoals } from "@/lib/queries/goals";
import { getMemberBudgets } from "@/lib/queries/wealth";
import { TRANSFER_CATEGORY } from "@/lib/wealth";
import { weekStartOf } from "@/lib/week";
import { inKidView } from "@/lib/kid-view";
import { dosesFor } from "@/lib/health-plan";
import { FAMILY_TZ, familyMidnight } from "@/lib/time";
import { audienceOf, checkInAnswerPush, checkInAskPush, dayIn, forPreview, isTimeZone, latest, ownSpendingAccounts, sectionsFor, type CardAudience, type CardSections } from "@/lib/member-card";
import type { ActionState } from "@/lib/actions/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CardDayItem = { id: string; title: string; at: string | null; kind: "plan" | "event" | "chore"; done: boolean };
export type CardGoal = { id: string; title: string; fraction: number; reached: boolean; noData: boolean };
export type CardDose = { name: string; dose: string | null; time: string; taken: boolean; late: boolean };

export type MemberCardData = {
  id: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  /** Can sign in: can be asked "Are you okay?" and can answer it. */
  hasLogin: boolean;
  mobile: string | null;
  /** Where "Message" goes: their one-to-one conversation when there is one,
   * the household chat otherwise. */
  messageHref: string;
  audience: CardAudience;
  /** True when this is your own card seen as someone else would see it. */
  preview: boolean;
  sections: CardSections;
  timezone: string | null;
  sharingLocation: boolean;
  location: { lat: number; lng: number; updatedAt: string | null } | null;
  weather: Weather | null;
  day: CardDayItem[];
  goals: CardGoal[];
  money: { spent: number; budget: number | null; currency: string; hasAccounts: boolean } | null;
  care: CardDose[] | null;
  lastActiveAt: string | null;
  lastMessageAt: string | null;
  checkIn: { id: string; askedAt: string; answer: string | null; answeredAt: string | null } | null;
};

/** Everything on one person's card, read with the viewer's own session so
 * row-level security decides first, then narrowed by lib/member-card's rules.
 * Fetched when the card opens rather than with Today, so the most-opened
 * page in the app pays nothing for a card nobody tapped.
 *
 * `as`: your own card, the way a grown-up or a child in the household sees
 * it. Ignored for anybody else's card. */
export async function getMemberCardAction(memberId: string, as?: "grownup" | "child"): Promise<{ error: string | null; card: MemberCardData | null }> {
  if (!UUID.test(memberId)) return { error: "That family member wasn't found.", card: null };
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { data: target } = await supabase
    .from("members")
    .select("id, full_name, role, status, auth_user_id, person_id, mobile, avatar_url, timezone")
    .eq("id", memberId)
    .eq("family_id", me.family_id)
    .maybeSingle();
  if (!target) return { error: "That family member wasn't found.", card: null };

  const isMe = target.id === me.id;
  const preview = isMe && (as === "grownup" || as === "child");
  const audience: CardAudience = preview ? as! : audienceOf({ id: me.id, role: me.role, kidView: inKidView(me) }, target.id);
  const sections = sectionsFor(audience);

  const now = new Date();
  const tz = isTimeZone(target.timezone) ? target.timezone : null;
  const day = dayIn(tz ?? FAMILY_TZ, now);
  const monthStart = familyMidnight(`${day.slice(0, 7)}-01`);
  const nextMonth = (() => {
    const [y, m] = day.split("-").map(Number);
    return familyMidnight(m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`);
  })();

  const [loc, activities, events, chores, goals, lastMessage, checkIn, peers, money, care] = await Promise.all([
    supabase.from("member_locations").select("sharing, lat, lng, updated_at").eq("member_id", target.id).maybeSingle(),
    supabase
      .from("activities")
      .select("id, title, start_at, status, applies_to_whole_family, activity_members(member_id)")
      .eq("family_id", me.family_id)
      .in("status", ["upcoming", "completed"])
      .gte("start_at", new Date(now.getTime() - 36 * 3600_000).toISOString())
      .lt("start_at", new Date(now.getTime() + 48 * 3600_000).toISOString())
      .order("start_at"),
    supabase
      .from("events")
      .select("id, title, event_date, end_date, recurs_yearly, applies_to_whole_family, event_members(member_id)")
      .eq("family_id", me.family_id)
      .or(`event_date.eq.${day},recurs_yearly.eq.true,and(event_date.lte.${day},end_date.gte.${day})`),
    getRoutinesNeedingAttention(me.family_id, target.id),
    getGoals(me.family_id, me, weekStartOf(me.families.week_start)),
    supabase.from("family_messages").select("created_at").eq("member_id", target.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    isMe
      ? Promise.resolve({ data: null })
      : supabase.from("member_checkins").select("id, asked_at, answer, answered_at").eq("asked_by", me.id).eq("member_id", target.id).order("asked_at", { ascending: false }).limit(1).maybeSingle(),
    isMe || !target.person_id ? Promise.resolve({ data: [] as { person_id: string }[] }) : supabase.rpc("my_direct_threads"),
    sections.money ? readMoney(me.family_id, target.id, preview, day, monthStart, nextMonth) : Promise.resolve(null),
    sections.care ? readCare(target.id, preview, day, tz ?? FAMILY_TZ, now) : Promise.resolve(null),
  ]);

  const tagged = (whole: boolean, tags: { member_id: string }[] | null) => whole || (tags ?? []).some((t) => t.member_id === target.id);
  const items: CardDayItem[] = [];
  for (const a of activities.data ?? []) {
    if (dayIn(tz ?? FAMILY_TZ, new Date(a.start_at)) !== day || !tagged(a.applies_to_whole_family, a.activity_members)) continue;
    items.push({ id: `a-${a.id}`, title: a.title, at: a.start_at, kind: "plan", done: a.status === "completed" });
  }
  for (const e of events.data ?? []) {
    const today = e.recurs_yearly ? e.event_date.slice(5) === day.slice(5) : e.event_date === day || (!!e.end_date && e.event_date <= day && e.end_date >= day);
    if (!today || !tagged(e.applies_to_whole_family, e.event_members)) continue;
    items.push({ id: `e-${e.id}`, title: e.title, at: null, kind: "event", done: false });
  }
  for (const r of chores) {
    if (!r.today || (r.today.assignee && r.today.assignee.id !== target.id)) continue;
    if (!r.appliesToAll && !r.members.some((m) => m.id === target.id)) continue;
    items.push({ id: `r-${r.id}`, title: r.title, at: null, kind: "chore", done: r.today.status !== null });
  }
  items.sort((x, y) => Number(x.done) - Number(y.done) || (x.at ?? "").localeCompare(y.at ?? ""));

  const sharing = loc.data?.sharing === true;
  const position = sharing && loc.data?.lat != null && loc.data?.lng != null ? { lat: loc.data.lat, lng: loc.data.lng, updatedAt: loc.data.updated_at } : null;
  const weather = position ? await getWeather(position.lat, position.lng) : null;
  const hasThread = (peers.data ?? []).some((p) => p.person_id === target.person_id);

  return {
    error: null,
    card: {
      id: target.id,
      name: target.full_name,
      role: target.role,
      avatarUrl: target.avatar_url,
      hasLogin: target.status === "active" && !!target.auth_user_id,
      mobile: target.mobile?.trim() || null,
      messageHref: hasThread ? `/chat/dm/${target.person_id}` : "/chat/household",
      audience,
      preview,
      sections,
      timezone: tz,
      sharingLocation: sharing,
      location: position,
      weather,
      day: items.slice(0, 8),
      goals: goals
        .filter((g) => g.ownerId === target.id)
        .slice(0, 4)
        .map((g) => ({ id: g.id, title: g.title, fraction: g.fraction, reached: g.reached, noData: g.noData })),
      money: money ? { ...money, currency: me.families.currency } : null,
      care,
      lastActiveAt: latest(lastMessage.data?.created_at, position?.updatedAt ?? null, checkIn.data?.answered_at),
      lastMessageAt: lastMessage.data?.created_at ?? null,
      checkIn: checkIn.data ? { id: checkIn.data.id, askedAt: checkIn.data.asked_at, answer: checkIn.data.answer, answeredAt: checkIn.data.answered_at } : null,
    },
  };
}

/** This month's spending on the person's own accounts, against the monthly
 * spending budget a grown-up set for them on Wealth (member_budgets). The
 * household can read those, so the budget shows on anyone's card and in a
 * preview -- the same figure Wealth's "Spending by person" draws. It used to
 * be the person's private income target, which only they could see; that
 * stays on Wealth's Cash Flow, where it belongs. Transfers between accounts
 * are moving money, not spending it, so they are left out, as on Wealth. */
async function readMoney(familyId: string, memberId: string, preview: boolean, day: string, from: Date | null, to: Date | null) {
  if (!from || !to) return null;
  const supabase = await createClient();
  const { data: accounts } = await supabase.from("accounts").select("id, owner_member_id, is_joint, is_private, is_archived").eq("family_id", familyId).eq("owner_member_id", memberId);
  const own = ownSpendingAccounts(accounts ?? [], memberId, preview).filter((a) => !a.is_archived);
  const [{ data: rows }, budgets] = await Promise.all([
    own.length
      ? supabase
          .from("wealth_transactions")
          .select("amount")
          .in("account_id", own.map((a) => a.id))
          .eq("direction", "out")
          .eq("status", "confirmed")
          .or(`category.is.null,category.neq.${TRANSFER_CATEGORY}`)
          .gte("occurred_at", from.toISOString())
          .lt("occurred_at", to.toISOString())
      : Promise.resolve({ data: [] as { amount: number }[] }),
    getMemberBudgets(familyId, Number(day.slice(0, 4)), Number(day.slice(5, 7))),
  ]);
  const spent = (rows ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
  const set = budgets.get(memberId);
  const budget = set != null && set > 0 ? set : null;
  return { spent, budget, hasAccounts: own.length > 0 };
}

/** Medicines due today, as far as Health lets the viewer see them
 * (health_can_see: "Just me" and "Parents only" rows stay where they are).
 * A preview keeps only what the whole household is shown. */
async function readCare(memberId: string, preview: boolean, day: string, tz: string, now: Date): Promise<CardDose[]> {
  const supabase = await createClient();
  const { data: medicines } = await supabase.from("health_medicines").select("id, member_id, name, dose, times, start_date, end_date, visibility").eq("member_id", memberId);
  const visible = preview ? forPreview(medicines ?? []) : (medicines ?? []);
  if (visible.length === 0) return [];
  const { data: doses } = await supabase.from("health_medicine_doses").select("medicine_id, dose_date, dose_time").in("medicine_id", visible.map((m) => m.id)).eq("dose_date", day);
  const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  return dosesFor(visible, doses ?? [], day, hhmm).map((d) => ({ name: d.name, dose: d.dose, time: d.time, taken: d.taken, late: d.late }));
}

/** "Are you okay?" -- one tap to ask, one tap to answer. Only someone who can
 * sign in can be asked, and not again while an earlier ask is waiting. */
export async function askAreYouOkayAction(memberId: string): Promise<ActionState & { id?: string }> {
  if (!UUID.test(memberId)) return { error: "That family member wasn't found." };
  const me = await requireCurrentMember();
  if (memberId === me.id) return { error: "That's you." };
  const supabase = await createClient();

  const { data: target } = await supabase.from("members").select("id, full_name, status, auth_user_id").eq("id", memberId).eq("family_id", me.family_id).maybeSingle();
  if (!target || target.status !== "active" || !target.auth_user_id) return { error: "They don't have Kin on a phone of their own to answer." };

  const { data: waiting } = await supabase
    .from("member_checkins")
    .select("id, asked_at")
    .eq("asked_by", me.id)
    .eq("member_id", memberId)
    .is("answered_at", null)
    .gte("asked_at", new Date(Date.now() - 15 * 60_000).toISOString())
    .limit(1)
    .maybeSingle();
  if (waiting) return { error: null, id: waiting.id };

  const { data, error } = await supabase.from("member_checkins").insert({ family_id: me.family_id, asked_by: me.id, member_id: memberId }).select("id").single();
  if (error) return { error: humanDatabaseError(error.message) };

  after(() => sendPush(checkInAskPush(me.full_name, memberId, data.id)));
  revalidatePath("/today");
  return { error: null, id: data.id };
}

export async function answerCheckInAction(id: string, answer: "ok" | "call_me"): Promise<ActionState> {
  if (!UUID.test(id) || (answer !== "ok" && answer !== "call_me")) return { error: "That check-in wasn't found." };
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data: asker, error } = await supabase.rpc("answer_checkin", { p_id: id, p_answer: answer });
  if (error) return { error: humanDatabaseError(error.message) };
  if (!asker) {
    revalidatePath("/today");
    return { error: null };
  }
  after(() => sendPush(checkInAnswerPush(me.full_name, asker, id, answer)));
  revalidatePath("/today");
  return { error: null };
}

/** The zone your phone is in, reported by your own phone when Today opens,
 * so the card can show your local time. Only ever your own row. */
export async function setMyTimezoneAction(tz: string): Promise<void> {
  if (!isTimeZone(tz)) return;
  const me = await requireCurrentMember();
  if (me.timezone === tz) return;
  const supabase = await createClient();
  await supabase.from("members").update({ timezone: tz }).eq("id", me.id);
}
