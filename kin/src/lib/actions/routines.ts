"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/actions/auth";
import { syncRowToCalendars, removeRowFromCalendars } from "@/lib/actions/calendar-sync";
import { postHubExpenseAction } from "@/lib/actions/wealth";
import { ROUTINE_KINDS, parseISODate, toRRule, type RoutineRule } from "@/lib/routines";

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

function validate(input: ReturnType<typeof readForm>): string | null {
  if (!input.title) return "Give the routine a name.";
  if (!input.start_date) return "Choose when it starts.";
  if (input.freq === "weekly" && input.byweekday.length === 0) return "Pick at least one day of the week.";
  if (input.freq === "monthly" && !input.bymonthday) return "Pick which day of the month.";
  if (input.end_date && input.end_date < input.start_date) return "The end date is before the start date.";
  if (!input.applies_to_whole_family && input.members.length === 0) return "Choose who this is for, or mark it for the whole family.";
  if (input.rotate_assignee && input.members.length < 2) return "Taking turns needs at least two people.";
  if (input.expected_cost !== null && !(input.expected_cost >= 0)) return "The expected cost has to be a number.";
  if (input.expected_cost && !input.cost_account_id) return "Choose which account the cost comes from.";
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

export async function createRoutineAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const input = readForm(formData);
  const problem = validate(input);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { members, ...row } = input;
  const { data, error } = await supabase
    .from("routines")
    .insert({ ...row, family_id: me.family_id, created_by: me.id })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not save the routine." };

  await saveMembers(data.id, members);
  await syncRoutine(me.family_id, data.id);

  revalidatePath("/planner");
  revalidatePath("/today");
  return { error: null };
}

export async function updateRoutineAction(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const input = readForm(formData);
  const problem = validate(input);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { members, ...row } = input;
  const { error } = await supabase.from("routines").update(row).eq("id", id).eq("family_id", me.family_id);
  if (error) return { error: error.message };

  await saveMembers(id, members);
  await syncRoutine(me.family_id, id);

  revalidatePath("/planner");
  revalidatePath("/today");
  return { error: null };
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
