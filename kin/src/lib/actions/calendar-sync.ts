"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCurrentMember } from "@/lib/session";
import {
  getValidCalendarAccessToken,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  listChangedCalendarEvents,
  type CalendarEventInput,
  type GoogleCalendarEvent,
} from "@/lib/google-calendar";
import type { ActionState } from "@/lib/actions/auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Db = SupabaseClient<Database>;
type SourceTable = "activities" | "events" | "health_schedule" | "health_appointments" | "doc_entries";

/** Who a Kin item should sync to: everyone connected in the household, a
 * specific set of tagged members, or a single owner (health/document rows,
 * which only ever belong to one person). Only members who've connected
 * their own Google Calendar are ever actually synced to — this list is
 * resolved against calendar_links inside syncRowToCalendars. */
export type CalendarTarget = { kind: "all" } | { kind: "members"; memberIds: string[] } | { kind: "member"; memberId: string | null };

export async function disconnectCalendarAction() {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  await supabase.from("calendar_links").update({ connected: false }).eq("member_id", me.id);

  const admin = createAdminClient();
  if (admin) await admin.from("calendar_tokens").delete().eq("member_id", me.id);

  revalidatePath("/settings");
}

async function resolveTargetMemberIds(supabase: Db, familyId: string, target: CalendarTarget): Promise<string[]> {
  const { data: connectedRows } = await supabase.from("calendar_links").select("member_id").eq("family_id", familyId).eq("connected", true);
  const connected = new Set((connectedRows ?? []).map((r) => r.member_id));

  if (target.kind === "all") return [...connected];
  if (target.kind === "member") return target.memberId && connected.has(target.memberId) ? [target.memberId] : [];
  return target.memberIds.filter((id) => connected.has(id));
}

/** Creates, updates, and removes per-member Google Calendar events for one
 * Kin row so its live calendar_event_links exactly match `target` — used for
 * both "just created" (no existing links) and "just edited" (tagging may
 * have changed, e.g. an activity went from one person to the whole family).
 * Each tagged member gets their own event on their own calendar. */
export async function syncRowToCalendars(familyId: string, table: SourceTable, rowId: string, input: CalendarEventInput, target: CalendarTarget): Promise<void> {
  const supabase = await createClient();
  const desiredMemberIds = await resolveTargetMemberIds(supabase, familyId, target);

  const { data: existingLinks } = await supabase.from("calendar_event_links").select("*").eq("source_table", table).eq("source_id", rowId);
  const existingByMember = new Map((existingLinks ?? []).map((l) => [l.member_id, l]));

  for (const memberId of desiredMemberIds) {
    const accessToken = await getValidCalendarAccessToken(memberId);
    if (!accessToken) continue;
    const { data: link } = await supabase.from("calendar_links").select("calendar_id").eq("member_id", memberId).maybeSingle();
    const calendarId = link?.calendar_id ?? "primary";
    const existing = existingByMember.get(memberId);

    try {
      if (existing) {
        await updateCalendarEvent(accessToken, calendarId, existing.google_event_id, input);
      } else {
        const googleEventId = await createCalendarEvent(accessToken, calendarId, input);
        await supabase.from("calendar_event_links").insert({ family_id: familyId, source_table: table, source_id: rowId, member_id: memberId, google_event_id: googleEventId });
      }
    } catch (err) {
      console.error(`Calendar push failed for ${table}/${rowId} -> member ${memberId}`, err);
    }
  }

  for (const [memberId, link] of existingByMember) {
    if (desiredMemberIds.includes(memberId)) continue;
    const accessToken = await getValidCalendarAccessToken(memberId);
    if (accessToken) {
      const { data: linkRow } = await supabase.from("calendar_links").select("calendar_id").eq("member_id", memberId).maybeSingle();
      await deleteCalendarEvent(accessToken, linkRow?.calendar_id ?? "primary", link.google_event_id).catch(() => {});
    }
    await supabase.from("calendar_event_links").delete().eq("id", link.id);
  }
}

/** Removes a Kin row from every calendar it was synced to — called when the
 * row itself is deleted. */
export async function removeRowFromCalendars(familyId: string, table: SourceTable, rowId: string): Promise<void> {
  const supabase = await createClient();
  const { data: links } = await supabase.from("calendar_event_links").select("*").eq("family_id", familyId).eq("source_table", table).eq("source_id", rowId);

  for (const link of links ?? []) {
    const accessToken = await getValidCalendarAccessToken(link.member_id);
    if (accessToken) {
      const { data: linkRow } = await supabase.from("calendar_links").select("calendar_id").eq("member_id", link.member_id).maybeSingle();
      await deleteCalendarEvent(accessToken, linkRow?.calendar_id ?? "primary", link.google_event_id).catch(() => {});
    }
  }
  await supabase.from("calendar_event_links").delete().eq("source_table", table).eq("source_id", rowId);
}

const todayDate = () => new Date().toISOString().slice(0, 10);
const todayTimestamp = () => new Date().toISOString();

type BackfillDescriptor = {
  table: SourceTable;
  dateColumn: string;
  toInput: (row: Record<string, unknown>) => CalendarEventInput | null;
  toTarget: (row: Record<string, unknown>) => CalendarTarget;
};

const BACKFILL_DESCRIPTORS: BackfillDescriptor[] = [
  {
    table: "activities",
    dateColumn: "start_at",
    toInput: (r) => ({ title: r.title as string, startAt: new Date(r.start_at as string), endAt: r.end_at ? new Date(r.end_at as string) : null, location: r.location as string | null }),
    toTarget: (r) =>
      r.applies_to_whole_family
        ? { kind: "all" }
        : { kind: "members", memberIds: ((r.activity_members as { member_id: string }[] | null) ?? []).map((m) => m.member_id) },
  },
  {
    table: "events",
    dateColumn: "event_date",
    toInput: (r) => ({ title: r.title as string, startAt: new Date(`${r.event_date as string}T00:00:00`), allDay: true }),
    toTarget: () => ({ kind: "all" }),
  },
  {
    table: "health_schedule",
    dateColumn: "when_date",
    toInput: (r) => (r.when_date ? { title: r.what as string, startAt: new Date(`${r.when_date as string}T00:00:00`), allDay: true } : null),
    toTarget: (r) => ({ kind: "member", memberId: r.member_id as string }),
  },
  {
    table: "health_appointments",
    dateColumn: "when_at",
    toInput: (r) => ({ title: r.what as string, startAt: new Date(r.when_at as string), location: r.where_text as string | null }),
    toTarget: (r) => ({ kind: "member", memberId: r.member_id as string }),
  },
  {
    table: "doc_entries",
    dateColumn: "expires_at",
    toInput: (r) => (r.expires_at ? { title: `${r.title as string} renewal`, startAt: new Date(`${r.expires_at as string}T00:00:00`), allDay: true } : null),
    toTarget: (r) => ({ kind: "member", memberId: r.owner_member_id as string | null }),
  },
];

/** Pushes every not-yet-linked, upcoming row across the five calendar-eligible
 * tables — run as part of the full family reconcile so newly connected
 * members (and anything created before anyone had connected Calendar) catch
 * up automatically. */
async function backfillFamily(supabase: Db, familyId: string): Promise<number> {
  let pushed = 0;
  for (const desc of BACKFILL_DESCRIPTORS) {
    const selectCols = desc.table === "activities" ? "*, activity_members(member_id)" : "*";
    const fromDate = desc.dateColumn === "start_at" || desc.dateColumn === "when_at" ? todayTimestamp() : todayDate();
    const { data: rows } = await supabase.from(desc.table).select(selectCols).eq("family_id", familyId).gte(desc.dateColumn, fromDate);

    for (const row of (rows ?? []) as unknown as Record<string, unknown>[]) {
      const rowId = row.id as string;
      const { count } = await supabase
        .from("calendar_event_links")
        .select("id", { count: "exact", head: true })
        .eq("source_table", desc.table)
        .eq("source_id", rowId);
      if (count && count > 0) continue;

      const input = desc.toInput(row);
      if (!input) continue;
      await syncRowToCalendars(familyId, desc.table, rowId, input, desc.toTarget(row));
      pushed++;
    }
  }
  return pushed;
}

function eventStartEnd(event: GoogleCalendarEvent): { start: Date; end: Date | null; allDay: boolean } | null {
  if (event.start?.dateTime) return { start: new Date(event.start.dateTime), end: event.end?.dateTime ? new Date(event.end.dateTime) : null, allDay: false };
  if (event.start?.date) return { start: new Date(`${event.start.date}T00:00:00`), end: null, allDay: true };
  return null;
}

/** Applies one event Google reports changed on `memberId`'s calendar. A
 * cancellation just unlinks that member from a shared activity/event (other
 * tagged members keep theirs), deleting the row outright only once no one
 * else is still linked to it; health/document rows are only ever unlinked,
 * never deleted, since a calendar action shouldn't destroy that record. An
 * event with no Kin origin lands as a new activity tagged to this member —
 * "new schedules made on Google get tagged to that person in the app". */
async function applyIncomingEvent(supabase: Db, familyId: string, memberId: string, event: GoogleCalendarEvent): Promise<void> {
  const { data: link } = await supabase.from("calendar_event_links").select("*").eq("member_id", memberId).eq("google_event_id", event.id).maybeSingle();

  if (event.status === "cancelled") {
    if (!link) return;
    await supabase.from("calendar_event_links").delete().eq("id", link.id);
    if (link.source_table === "activities" || link.source_table === "events") {
      const { count } = await supabase
        .from("calendar_event_links")
        .select("id", { count: "exact", head: true })
        .eq("source_table", link.source_table)
        .eq("source_id", link.source_id);
      if (!count) await supabase.from(link.source_table).delete().eq("id", link.source_id);
      else if (link.source_table === "activities") await supabase.from("activity_members").delete().eq("activity_id", link.source_id).eq("member_id", memberId);
    }
    return;
  }

  const when = eventStartEnd(event);
  if (!when) return;
  const title = event.summary?.trim() || "(untitled)";

  if (!link) {
    const { data: activity } = await supabase
      .from("activities")
      .insert({ family_id: familyId, title, start_at: when.start.toISOString(), end_at: when.end?.toISOString() ?? null, location: event.location ?? null, applies_to_whole_family: false })
      .select()
      .single();
    if (activity) {
      await supabase.from("activity_members").insert({ activity_id: activity.id, member_id: memberId });
      await supabase.from("calendar_event_links").insert({ family_id: familyId, source_table: "activities", source_id: activity.id, member_id: memberId, google_event_id: event.id });
    }
    return;
  }

  switch (link.source_table) {
    case "activities":
      await supabase
        .from("activities")
        .update({ title, start_at: when.start.toISOString(), end_at: when.end?.toISOString() ?? null, location: event.location ?? null })
        .eq("id", link.source_id);
      break;
    case "events":
      await supabase.from("events").update({ title, event_date: when.start.toISOString().slice(0, 10) }).eq("id", link.source_id);
      break;
    case "health_schedule":
      await supabase.from("health_schedule").update({ what: title, when_date: when.start.toISOString().slice(0, 10) }).eq("id", link.source_id);
      break;
    case "health_appointments":
      await supabase.from("health_appointments").update({ what: title, when_at: when.start.toISOString(), where_text: event.location ?? null }).eq("id", link.source_id);
      break;
    case "doc_entries":
      await supabase.from("doc_entries").update({ title, expires_at: when.start.toISOString().slice(0, 10) }).eq("id", link.source_id);
      break;
  }
}

async function pullMemberCalendar(supabase: Db, familyId: string, memberId: string): Promise<number> {
  const accessToken = await getValidCalendarAccessToken(memberId);
  if (!accessToken) return 0;

  const { data: link } = await supabase.from("calendar_links").select("calendar_id, sync_token").eq("member_id", memberId).maybeSingle();
  if (!link) return 0;

  let syncToken = link.sync_token;
  let result = await listChangedCalendarEvents(accessToken, link.calendar_id, syncToken);
  if (result.tokenInvalid) {
    syncToken = null;
    result = await listChangedCalendarEvents(accessToken, link.calendar_id, null);
  }

  for (const event of result.events) {
    await applyIncomingEvent(supabase, familyId, memberId, event);
  }

  await supabase.from("calendar_links").update({ sync_token: result.nextSyncToken, last_synced_at: new Date().toISOString() }).eq("member_id", memberId);
  return result.events.length;
}

/** Runs the full reconcile only if it hasn't run recently for this family —
 * called opportunistically from the Planner Calendar tab so the view stays
 * fresh without a manual "Sync now" every time, but without hitting Google
 * on every page load. Never throws; a failed opportunistic sync just means
 * slightly stale data until the next view or a manual sync. */
export async function syncGoogleCalendarIfStale(familyId: string, maxAgeMs: number): Promise<void> {
  try {
    const admin = createAdminClient();
    if (!admin) return;
    const { data: links } = await admin.from("calendar_links").select("connected, last_synced_at").eq("family_id", familyId).eq("connected", true);
    if (!links || links.length === 0) return;
    const stalest = links.reduce<number>((min, l) => Math.min(min, l.last_synced_at ? new Date(l.last_synced_at).getTime() : 0), Infinity);
    if (Date.now() - stalest < maxAgeMs) return;
    await syncGoogleCalendarAction();
  } catch (err) {
    console.error("Opportunistic calendar sync failed", err);
  }
}

/** Full two-way reconcile for the whole household: pushes any not-yet-synced
 * upcoming item to every relevant connected member's calendar, then pulls
 * changes from each connected member's own calendar in turn. Safe to call
 * repeatedly — a manual "Sync now" in Settings and an opportunistic call
 * from the Planner Calendar tab both use this. */
export async function syncGoogleCalendarAction(): Promise<ActionState & { synced?: number }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { data: connectedRows } = await supabase.from("calendar_links").select("member_id").eq("family_id", me.family_id).eq("connected", true);
  if (!connectedRows || connectedRows.length === 0) return { error: "No one in the household has connected Google Calendar yet." };

  let pushed = 0;
  try {
    pushed = await backfillFamily(supabase, me.family_id);
  } catch (err) {
    console.error("Calendar backfill push failed", err);
  }

  let pulled = 0;
  for (const row of connectedRows) {
    try {
      pulled += await pullMemberCalendar(supabase, me.family_id, row.member_id);
    } catch (err) {
      console.error(`Calendar pull failed for member ${row.member_id}`, err);
    }
  }

  revalidatePath("/planner");
  revalidatePath("/settings");
  return { error: null, synced: pushed + pulled };
}
