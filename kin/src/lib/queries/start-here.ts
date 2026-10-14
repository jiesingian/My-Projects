import { createClient } from "@/lib/supabase/server";
import { readAccess } from "@/lib/access";
import { isGrownUp } from "@/lib/roles";
import { GONE_STATUSES } from "@/lib/member-status";
import type { Priority } from "@/lib/first-open";
import type { CurrentMember } from "@/lib/session";

/** "Start here" on Today (approved 28 September): the first steps for a new
 * family, each ticked off by the family's own records rather than by any
 * checklist of its own -- add something on the calendar anywhere in Kin and
 * the step is done.
 *
 * Since 13 October it follows the family check-up's top 3 (docs/BACKLOG.md,
 * "Agreed 13 October: first open"): health first adds "Add allergies and
 * blood type", kids "Turn on location sharing", emergency "Fill in the
 * emergency card", documents "Add one PSA certificate". The top 3 never
 * leaves the phone (lib/first-open.ts), so this sends every step with what
 * it follows and the card picks and orders them there. Without a top 3 --
 * another phone, an invited member, no check-up -- the card is the base
 * steps in their usual order.
 *
 * Shown only to grown-ups, only in households created from the day it
 * shipped (a family that has used Kin for weeks needs no first steps), only
 * for a household's first 30 days, and until the member hides it or every
 * step is done. */

/** Households created before this saw Kin before the card existed. */
const SHOWN_FROM = "2026-09-28T00:00:00Z";
const SHOWN_FOR_DAYS = 30;

/** The Start here bonus (20261013160000, then 20261013180000): trying every
 * part of Kin -- the eight below -- in a household's first 5 days adds 7 days
 * to its trial, once. The database decides (start_bonus_progress,
 * claim_start_bonus); this draws the checklist and says so. Same date as
 * start_bonus_from(). */
const BONUS_FROM = "2026-10-13T00:00:00Z";

type BonusKey = "plans" | "list" | "chat" | "journal" | "health" | "vault" | "wealth" | "ai";
type BonusProgress = { open: boolean; ends_at: string; steps: Record<BonusKey, boolean> } | null;

export type StartHere = {
  steps: StartStep[];
  /** While the checklist is open, the day it closes ("Sat 18 Oct", in the
   * household's zone, so server and phone agree); a number, the days just
   * added (said once); null otherwise. */
  bonus: { ends: string } | number | null;
};

export type StartStepId =
  | "event" | "invite" | "children" | "bills" | "chore" | "list" | "health" | "location" | "emergency" | "documents"
  | `try-${BonusKey}`;

export type StartStep = {
  id: StartStepId;
  title: string;
  hint: string;
  href: string | null;
  done: boolean;
  /** The check-up priority this step answers: an extra step shows only when
   * it is in the top 3, and any step moves up with its priority's rank. */
  priority?: Priority;
  /** Only for a family that put `priority` in its top 3. */
  extra?: boolean;
  /** One of the eight the bonus counts. */
  bonus?: boolean;
  /** A Kin Plus part of Kin, tagged so on the card. */
  plus?: boolean;
  /** Opens with a full page load (Ask Kin answers ?kin=chat on arrival). */
  reload?: boolean;
};

export async function getStartHere(me: CurrentMember): Promise<StartHere | null> {
  if (!isGrownUp(me.role) || me.start_here_dismissed_at) return null;
  const created = me.families.created_at;
  if (!created || created < SHOWN_FROM) return null;
  if (Date.now() - new Date(created).getTime() > SHOWN_FOR_DAYS * 24 * 60 * 60 * 1000) return null;

  // On a trial the bill is one of the Kin Plus card's three (plus-trial.ts),
  // so Start here offers the chore instead of asking twice.
  const access = readAccess(me.families);
  const plus = access.plus && !access.trialing;
  const supabase = await createClient();
  const count = (table: "events" | "activities" | "bills" | "routines" | "buy_items" | "emergency_contacts" | "doc_entries" | "family_vault_items") =>
    supabase.from(table).select("id", { count: "exact", head: true }).eq("family_id", me.family_id);
  const members = () => supabase.from("members").select("id", { count: "exact", head: true }).eq("family_id", me.family_id);
  const [progress, events, activities, people, children, bills, routines, list, health, sharing, emergency, docs, vault] = await Promise.all([
    // The bonus checklist, as the database counts it (rows the reader can't
    // see included). Null for households from before it.
    created >= BONUS_FROM ? supabase.rpc("start_bonus_progress").then((r) => r.data as BonusProgress) : Promise.resolve(null),
    count("events"),
    count("activities"),
    // Anyone else with a login of their own, or on their way in -- a managed
    // child's profile is not someone who has been invited.
    members().in("status", ["active", "pending"]).neq("id", me.id),
    // A child of the house, with a login or as a profile kept by the parents.
    members().in("role", ["child_managed", "child_self"]).not("status", "in", GONE_STATUSES),
    count("bills"),
    count("routines"),
    count("buy_items"),
    // Both filled in for somebody: what a doctor asks first.
    members().not("status", "in", GONE_STATUSES).not("blood_type", "is", null).not("allergies", "is", null),
    supabase.from("member_locations").select("member_id", { count: "exact", head: true }).eq("family_id", me.family_id).eq("sharing", true),
    count("emergency_contacts"),
    count("doc_entries"),
    count("family_vault_items"),
  ]);
  const any = (r: { count: number | null }) => (r.count ?? 0) > 0;

  // Inviting a partner, the kids, and the check-up's extras: wanted, but not
  // what the bonus counts (a household of one can earn it).
  const invite: StartStep = { id: "invite", title: "Invite your partner", hint: "Kin is better with two. They join with one tap.", href: null, done: any(people) };
  const kids: StartStep = { id: "children", title: "Add the kids", hint: "A profile for each, with or without a login of their own.", href: "/family?seg=profile", done: any(children) };
  const extras: StartStep[] = [
    { id: "health", title: "Add allergies and blood type", hint: "The first things a doctor asks, ready at 2 a.m.", href: `/family/members/${me.id}`, done: any(health), priority: "health", extra: true },
    { id: "location", title: "Turn on location sharing", hint: "Each person switches it on for themselves, and can pause it.", href: "/family?seg=quicklinks", done: any(sharing), priority: "together", extra: true },
    { id: "emergency", title: "Fill in the emergency card", hint: "Who to call when you can't be reached.", href: "/family?seg=quicklinks", done: any(emergency), priority: "health", extra: true },
  ];

  // The days, once every one of the eight is done in time. The database
  // checks the window and that it is the first claim, so asking again on a
  // later visit is harmless; it can also land after the window, for steps
  // finished inside it.
  const allEight = progress?.steps && Object.values(progress.steps).every(Boolean);
  const added = allEight && access.trialing ? (((await supabase.rpc("claim_start_bonus")).data ?? 0) as number) : 0;

  if (progress?.open && added === 0) {
    // Try every part of Kin: one thing on each page, half of them Plus.
    const t = progress.steps;
    const tries = ([
      { id: "try-plans", title: "Add a plan", hint: "Planner: one calendar for everyone, with reminders.", href: "/planner/add?type=event", done: t.plans, priority: "plans" },
      { id: "try-list", title: "Start the grocery list", hint: "Household: whoever is at the shop ticks it off.", href: "/household?seg=buy&add=1", done: t.list, priority: "meals" },
      { id: "try-chat", title: "Say hi in the family chat", hint: "Chat: photos, polls and calls, private to you.", href: "/chat", done: t.chat },
      { id: "try-journal", title: "Write a first journal entry", hint: "Journal: a photo and a line about today.", href: "/journal/new", done: t.journal, priority: "memories" },
      { id: "try-health", title: "Add a medicine or a reading", hint: "Health: dose reminders, blood pressure, weight.", href: `/family/members/${me.id}/health/new`, done: t.health, priority: "health", plus: true },
      { id: "try-vault", title: "Put a document in the vault", hint: "A PSA certificate or passport, behind your lock.", href: "/family?seg=documents", done: t.vault, priority: "documents", plus: true },
      { id: "try-wealth", title: "Add a bill or an account", hint: "Wealth: reminders before each bill is due.", href: "/wealth?seg=cashflow", done: t.wealth, priority: "money", plus: true },
      { id: "try-ai", title: "Ask Kin a question", hint: "\u201cWhen is Lia's next check-up?\u201d or scan a school flyer.", href: "/today?kin=chat", reload: true, done: t.ai, plus: true },
    ] satisfies StartStep[]).map((s): StartStep => ({ ...s, bonus: true }));
    const ends = new Date(progress.ends_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: me.families.time_zone });
    return { steps: [...tries, invite, kids, ...extras], bonus: { ends } };
  }

  const steps: StartStep[] = [
    { id: "event", title: "Add this week's plans", hint: "School, work, a birthday: one calendar for everyone.", href: "/planner/add?type=event", done: any(events) || any(activities), priority: "plans" },
    // No link: the card shares the invite itself (start-here.tsx).
    invite,
    kids,
    plus
      ? { id: "bills", title: "Add this month's bills", hint: "Kin reminds you the day before each one is due.", href: "/wealth?seg=cashflow", done: any(bills), priority: "money" }
      : // Wealth is Kin Plus; on Free the third step is one everyone can do.
        { id: "chore", title: "Give the kids a chore", hint: "They earn stars and trade them for rewards.", href: "/planner/routines/new", done: any(routines) },
    { id: "list", title: "Start the grocery list", hint: "Everyone adds to it; whoever is at the shop ticks it off.", href: "/household?seg=buy&add=1", done: any(list), priority: "meals" },
    // The check-up's extras, shown only for a top-3 pick (start-here.tsx).
    ...extras,
    // The vault is Kin Plus (the trial has it); on Free the step would only
    // lead to a locked door.
    ...(access.plus
      ? [{ id: "documents" as const, title: "Add one PSA certificate", hint: "Kept in the vault, behind your lock, for everyone who needs it.", href: "/family?seg=documents", done: any(docs) || any(vault), priority: "documents" as const, extra: true }]
      : []),
  ];
  const bonus = added > 0 ? added : null;
  // Every step done: nothing left to show, unless it is the moment the days
  // were added.
  return steps.every((s) => s.done) && bonus === null ? null : { steps, bonus };
}
