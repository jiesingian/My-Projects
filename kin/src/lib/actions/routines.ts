"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/actions/auth";

/** A refusal names the field it is about, so the form can point at it
 * rather than leaving a message stranded at the top of a long page. */
export type RoutineActionState = { error: string | null; field?: string | null };
import { syncRowToCalendars, removeRowFromCalendars } from "@/lib/actions/calendar-sync";
import { postHubExpenseAction } from "@/lib/actions/wealth";
import {
  ROUTINE_KINDS,
  ASSUMED_DURATION_MINUTES,
  expandRoutine,
  findConflict,
  parseISODate,
  toRRule,
  toISODate,
  type Busy,
  type RoutineRule,
} from "@/lib/routines";

function ruleOf(row: {
  freq: string;
  repeat_interval: number;
  byweekday: number[] | null;
  bymonthday: number | null;
  start_date: string;
  end_date: string | null;
}): RoutineRule {
  return {
    freq: row.freq as RoutineRule["freq"],
    repeat_interval: row.repeat_interval,
    byweekday: row.byweekday ?? [],
    bymonthday: row.bymonthday,
    start_date: row.start_date,
    end_date: row.end_date,
  };
}

/** Push the routine to the calendars of whoever it concerns, as one recurring
 * event carrying its reminder. Paused routines are pulled back off. */
async function syncRoutine(familyId: string, routineId: string) {
  const supabase = await createClient();
  const { data: r } = await supabase
    .from("routines")
    .select("*, routine_members(member_id)")
    .eq("id", routineId)
    .eq("family_id", familyId)
    .maybeSingle();
  if (!r) return;

  if (r.paused) {
    await removeRowFromCalendars(familyId, "routines", routineId);
    return;
  }

  const rule = ruleOf(r);
  const startAt = r.time_of_day ? new Date(`${r.start_date}T${r.time_of_day}`) : parseISODate(r.start_date);
  const memberIds = (r.routine_members ?? []).map((m) => m.member_id);

  await syncRowToCalendars(
    familyId,
    "routines",
    routineId,
    {
      title: r.title,
      startAt,
      endAt: r.time_of_day && r.duration_minutes ? new Date(startAt.getTime() + r.duration_minutes * 60_000) : null,
      allDay: !r.time_of_day,
      location: r.location,
      description: r.notes,
      recurrence: [toRRule(rule)],
      reminderMinutes: r.reminder_minutes,
    },
    r.applies_to_whole_family || memberIds.length === 0 ? { kind: "all" } : { kind: "members", memberIds },
  );
}

function readForm(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const kind = String(formData.get("kind") ?? "other");
  const freq = String(formData.get("freq") ?? "weekly");
  const repeatInterval = Number(formData.get("repeat_interval") ?? 1);
  const byweekday = formData.getAll("byweekday").map(Number).filter((n) => n >= 0 && n <= 6);
  const bymonthdayRaw = String(formData.get("bymonthday") ?? "");
  const startDate = String(formData.get("start_date") ?? "");
  const endDate = String(formData.get("end_date") ?? "");
  const timeOfDay = String(formData.get("time_of_day") ?? "");
  const durationRaw = String(formData.get("duration_minutes") ?? "");
  const reminderRaw = String(formData.get("reminder_minutes") ?? "");
  const costRaw = String(formData.get("expected_cost") ?? "");

  return {
    title,
    kind: (ROUTINE_KINDS as readonly string[]).includes(kind) ? kind : "other",
    freq: ["daily", "weekly", "monthly"].includes(freq) ? freq : "weekly",
    repeat_interval: Number.isFinite(repeatInterval) && repeatInterval >= 1 && repeatInterval <= 12 ? Math.floor(repeatInterval) : 1,
    byweekday: [...new Set(byweekday)].sort((a, b) => a - b),
    bymonthday: bymonthdayRaw ? Math.min(31, Math.max(1, Number(bymonthdayRaw))) : null,
    start_date: startDate,
    end_date: endDate || null,
    time_of_day: timeOfDay || null,
    duration_minutes: durationRaw ? Number(durationRaw) : null,
    reminder_minutes: reminderRaw === "" ? null : Number(reminderRaw),
    location: String(formData.get("location") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
    applies_to_whole_family: formData.get("whole_family") === "on",
    rotate_assignee: formData.get("rotate") === "on",
    expected_cost: costRaw ? Number(costRaw) : null,
    cost_account_id: String(formData.get("cost_account_id") ?? "") || null,
    expense_category: String(formData.get("expense_category") ?? "").trim() || null,
    members: formData.getAll("members").map(String).filter(Boolean),
  };
}

function validate(input: ReturnType<typeof readForm>): RoutineActionState | null {
  const no = (field: string, error: string): RoutineActionState => ({ field, error });

  if (!input.title) return no("title", "Give the routine a name.");
  if (!input.start_date) return no("start_date", "Choose the date it starts.");
  if (input.freq === "weekly" && input.byweekday.length === 0) return no("byweekday", "Pick at least one day of the week.");
  if (input.freq === "monthly" && !input.bymonthday) return no("bymonthday", "Pick which day of the month it falls on.");
  if (input.end_date && input.end_date < input.start_date) return no("end_date", "The end date is before the start date.");
  if (!input.applies_to_whole_family && input.members.length === 0)
    return no("members", "Choose who this is for, or mark it for the whole family.");
  if (input.rotate_assignee && input.members.length < 2) return no("members", "Taking turns needs at least two people.");
  if (input.expected_cost !== null && !(input.expected_cost >= 0)) return no("expected_cost", "The expected cost has to be a number.");
  if (input.expected_cost && !input.cost_account_id) return no("cost_account_id", "Choose which account the cost comes from.");
  return null;
}

async function saveMembers(routineId: string, memberIds: string[]) {
  const supabase = await createClient();
  await supabase.from("routine_members").delete().eq("routine_id", routineId);
  if (memberIds.length === 0) return;
  await supabase
    .from("routine_members")
    .insert(memberIds.map((member_id, position) => ({ routine_id: routineId, member_id, position })));
}


/** How far ahead to look for clashes. Long enough for a monthly routine to
 * come round twice; short enough that the check stays one pair of queries. */
const CONFLICT_HORIZON_DAYS = 70;

function timedBusy(
  occurrences: { date: Date }[],
  timeOfDay: string | null,
  durationMinutes: number | null,
  label: string,
  memberIds: string[],
  appliesToAll: boolean,
): Busy[] {
  // An all-day routine ties nobody to an hour, so it cannot clash with one.
  if (!timeOfDay) return [];
  const minutes = durationMinutes && durationMinutes > 0 ? durationMinutes : ASSUMED_DURATION_MINUTES;
  return occurrences.map((o) => {
    const start = new Date(`${toISODate(o.date)}T${timeOfDay}`);
    return { start, end: new Date(start.getTime() + minutes * 60_000), label, memberIds, appliesToAll };
  });
}

function whenIn(d: Date): string {
  return d.toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
}

/** Whether saving this routine would double-book anyone, and against what.
 * `excludeId` keeps a routine from clashing with the version of itself that
 * is already stored when it is being edited. */
async function describeConflict(
  familyId: string,
  input: ReturnType<typeof readForm>,
  excludeId?: string,
): Promise<string | null> {
  if (!input.time_of_day) return null;

  const supabase = await createClient();
  const from = new Date();
  const until = new Date(from.getFullYear(), from.getMonth(), from.getDate() + CONFLICT_HORIZON_DAYS);

  const rule: RoutineRule = {
    freq: input.freq as RoutineRule["freq"],
    repeat_interval: input.repeat_interval,
    byweekday: input.byweekday,
    bymonthday: input.bymonthday,
    start_date: input.start_date,
    end_date: input.end_date,
  };
  const proposed = timedBusy(
    expandRoutine(rule, from, until),
    input.time_of_day,
    input.duration_minutes,
    input.title,
    input.members,
    input.applies_to_whole_family,
  );
  if (proposed.length === 0) return null;

  const [{ data: activities }, { data: others }] = await Promise.all([
    supabase
      .from("activities")
      .select("title, start_at, end_at, applies_to_whole_family, activity_members(member_id)")
      .eq("family_id", familyId)
      .gte("start_at", from.toISOString())
      .lt("start_at", until.toISOString()),
    supabase
      .from("routines")
      .select("id, title, freq, repeat_interval, byweekday, bymonthday, start_date, end_date, time_of_day, duration_minutes, applies_to_whole_family, routine_members(member_id)")
      .eq("family_id", familyId)
      .eq("paused", false)
      .not("time_of_day", "is", null),
  ]);

  const existing: Busy[] = [];

  for (const a of activities ?? []) {
    const start = new Date(a.start_at);
    existing.push({
      start,
      end: a.end_at ? new Date(a.end_at) : new Date(start.getTime() + ASSUMED_DURATION_MINUTES * 60_000),
      label: a.title,
      memberIds: (a.activity_members ?? []).map((m) => m.member_id),
      appliesToAll: a.applies_to_whole_family,
    });
  }

  for (const o of others ?? []) {
    if (excludeId && o.id === excludeId) continue;
    existing.push(
      ...timedBusy(
        expandRoutine(ruleOf(o), from, until),
        o.time_of_day,
        o.duration_minutes,
        o.title,
        (o.routine_members ?? []).map((m) => m.member_id),
        o.applies_to_whole_family,
      ),
    );
  }

  const clash = findConflict(proposed, existing);
  if (!clash) return null;

  return `This clashes with “${clash.against.label}” on ${whenIn(clash.against.start)}. Move this routine to another time, or change the one it runs into.`;
}

export async function createRoutineAction(_prev: RoutineActionState, formData: FormData): Promise<RoutineActionState> {
  const me = await requireCurrentMember();
  const input = readForm(formData);
  const problem = validate(input);
  if (problem) return problem;

  const clash = await describeConflict(me.family_id, input);
  if (clash) return { error: clash, field: "time_of_day" };

  const supabase = await createClient();
  const { members, ...row } = input;
  const { data, error } = await supabase
    .from("routines")
    .insert({ ...row, family_id: me.family_id, created_by: me.id })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not save the routine.", field: null };

  await saveMembers(data.id, members);
  await syncRoutine(me.family_id, data.id);

  revalidatePath("/planner");
  revalidatePath("/today");
  // Leaving the form sitting there was what let one routine be saved five
  // times: nothing said it had worked, so the button got pressed again.
  redirect("/planner?seg=routines&saved=1");
}

export async function updateRoutineAction(id: string, _prev: RoutineActionState, formData: FormData): Promise<RoutineActionState> {
  const me = await requireCurrentMember();
  const input = readForm(formData);
  const problem = validate(input);
  if (problem) return problem;

  const clash = await describeConflict(me.family_id, input, id);
  if (clash) return { error: clash, field: "time_of_day" };

  const supabase = await createClient();
  const { members, ...row } = input;
  const { error } = await supabase.from("routines").update(row).eq("id", id).eq("family_id", me.family_id);
  if (error) return { error: error.message, field: null };

  await saveMembers(id, members);
  await syncRoutine(me.family_id, id);

  revalidatePath("/planner");
  revalidatePath("/today");
  redirect("/planner?seg=routines&saved=1");
}

export async function setRoutinePausedAction(id: string, paused: boolean): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("routines").update({ paused }).eq("id", id).eq("family_id", me.family_id);
  if (error) return { error: error.message };

  // Pausing takes it off everyone's calendar; resuming puts it back.
  await syncRoutine(me.family_id, id);
  revalidatePath("/planner");
  revalidatePath("/today");
  return { error: null };
}

export async function deleteRoutineAction(id: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  await removeRowFromCalendars(me.family_id, "routines", id);
  const { error } = await supabase.from("routines").delete().eq("id", id).eq("family_id", me.family_id);
  if (error) return { error: error.message };

  revalidatePath("/planner");
  revalidatePath("/today");
  return { error: null };
}

/** Mark one occurrence done or skipped. Marking done posts the routine's
 * expected cost to the ledger, if it has one, so recurring spending lands in
 * Wealth without being typed in twice. */
export async function logRoutineAction(input: {
  routineId: string;
  date: string;
  status: "done" | "skipped";
  memberId?: string | null;
  amount?: number | null;
}): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { data: routine } = await supabase
    .from("routines")
    .select("id, title, expected_cost, cost_account_id, expense_category")
    .eq("id", input.routineId)
    .eq("family_id", me.family_id)
    .maybeSingle();
  if (!routine) return { error: "That routine is no longer here." };

  const amount = input.status === "done" ? (input.amount ?? (routine.expected_cost ? Number(routine.expected_cost) : null)) : null;

  const { error } = await supabase.from("routine_log").upsert(
    {
      routine_id: input.routineId,
      family_id: me.family_id,
      occurrence_date: input.date,
      status: input.status,
      member_id: input.memberId ?? me.id,
      amount,
      logged_by: me.id,
      logged_at: new Date().toISOString(),
    },
    { onConflict: "routine_id,occurrence_date" },
  );
  if (error) return { error: error.message };

  if (input.status === "done" && amount && amount > 0 && routine.cost_account_id) {
    const posted = await postHubExpenseAction({
      accountId: routine.cost_account_id,
      amount,
      particulars: `${routine.title} · ${input.date}`,
      category: routine.expense_category ?? "Routine",
      sourceTable: "routines",
      sourceId: routine.id,
    });
    // The tick is the point; a ledger problem is reported but does not undo it.
    if (posted.error) {
      revalidatePath("/planner");
      return { error: `Marked done, but the cost could not be posted: ${posted.error}` };
    }
  }

  revalidatePath("/planner");
  revalidatePath("/today");
  revalidatePath("/wealth");
  return { error: null };
}

/** Undo a tick — the occurrence goes back to unanswered. */
export async function clearRoutineLogAction(routineId: string, date: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase
    .from("routine_log")
    .delete()
    .eq("routine_id", routineId)
    .eq("occurrence_date", date)
    .eq("family_id", me.family_id);
  if (error) return { error: error.message };

  revalidatePath("/planner");
  revalidatePath("/today");
  return { error: null };
}
