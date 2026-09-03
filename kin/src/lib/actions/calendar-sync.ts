"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCurrentMember } from "@/lib/session";
import {
  getValidCalendarAccessToken,
  createCalendarEvent,
  listChangedCalendarEvents,
  type CalendarEventInput,
  type GoogleCalendarEvent,
} from "@/lib/google-calendar";
import type { ActionState } from "@/lib/actions/auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Db = SupabaseClient<Database>;

export async function disconnectCalendarAction() {
  const me = await requireCurrentMember();
  if (!me.is_organiser) return;

  const supabase = await createClient();
  await supabase.from("calendar_links").update({ connected: false }).eq("family_id", me.family_id);

  const admin = createAdminClient();
  if (admin) await admin.from("calendar_tokens").delete().eq("family_id", me.family_id);

  revalidatePath("/settings");
}

/** Pushes a newly created activity/event/etc. to the household's connected
 * Google Calendar, if any — called right after the source row is inserted.
 * Silently does nothing if Calendar isn't connected; that's the normal case
 * for most households and shouldn't block the save. */
export async function pushNewRowToCalendar(
  familyId: string,
  table: "activities" | "events" | "doc_entries",
  rowId: string,
  input: CalendarEventInput,
): Promise<void> {
  try {
    const accessToken = await getValidCalendarAccessToken(familyId);
    if (!accessToken) return;
    const admin = createAdminClient();
    if (!admin) return;
    const { data: link } = await admin.from("calendar_links").select("calendar_id, connected").eq("family_id", familyId).maybeSingle();
    if (!link?.connected) return;

    const googleEventId = await createCalendarEvent(accessToken, link.calendar_id, input);
    await admin.from(table).update({ google_event_id: googleEventId }).eq("id", rowId);
  } catch (err) {
    console.error(`Failed to push new ${table} row to Google Calendar`, err);
  }
}

const todayDate = () => new Date().toISOString().slice(0, 10);
const todayTimestamp = () => new Date().toISOString();

async function backfillTable(
  supabase: Db,
  accessToken: string,
  calendarId: string,
  familyId: string,
  table: "activities" | "events" | "health_schedule" | "health_appointments" | "doc_entries",
  dateColumn: string,
  fromDate: string,
  toInput: (row: Record<string, unknown>) => CalendarEventInput | null,
): Promise<number> {
  const { data: rows } = await supabase
    .from(table)
    .select("*")
    .eq("family_id", familyId)
    .is("google_event_id", null)
    .gte(dateColumn, fromDate);

  let pushed = 0;
  for (const row of rows ?? []) {
    const input = toInput(row as Record<string, unknown>);
    if (!input) continue;
    try {
      const googleEventId = await createCalendarEvent(accessToken, calendarId, input);
      await supabase.from(table).update({ google_event_id: googleEventId }).eq("id", (row as { id: string }).id);
      pushed++;
    } catch (err) {
      console.error(`Backfill push failed for ${table}`, err);
    }
  }
  return pushed;
}

/** Finds which of the five calendar-eligible tables a Google event id
 * belongs to, if any. Checked in a fixed order — a given event id will
 * only ever exist in one, since each is set from a distinct create/backfill
 * call and never copied across tables. */
async function findRowByGoogleEventId(supabase: Db, familyId: string, googleEventId: string) {
  const tables = ["activities", "events", "health_schedule", "health_appointments", "doc_entries"] as const;
  for (const table of tables) {
    const { data } = await supabase.from(table).select("id").eq("family_id", familyId).eq("google_event_id", googleEventId).maybeSingle();
    if (data) return { table, id: data.id };
  }
  return null;
}

function eventStartEnd(event: GoogleCalendarEvent): { start: Date; end: Date | null; allDay: boolean } | null {
  if (event.start?.dateTime) return { start: new Date(event.start.dateTime), end: event.end?.dateTime ? new Date(event.end.dateTime) : null, allDay: false };
  if (event.start?.date) return { start: new Date(`${event.start.date}T00:00:00`), end: null, allDay: true };
  return null;
}

/** Applies one changed Google Calendar event to Kin's side. A cancelled
 * event deletes the matching activity/event outright (those two tables are
 * pure scheduling — deleting there is exactly what the user asked for by
 * deleting the calendar entry); for health/document rows a cancellation
 * just stops tracking that event rather than touching the underlying
 * record, since those carry meaning beyond "something is on a date". An
 * event with no Kin match at all is new — it lands as a plain activity,
 * the general-purpose "something is scheduled" table. */
async function applyIncomingEvent(supabase: Db, familyId: string, event: GoogleCalendarEvent): Promise<void> {
  const match = await findRowByGoogleEventId(supabase, familyId, event.id);

  if (event.status === "cancelled") {
    if (!match) return;
    if (match.table === "activities" || match.table === "events") {
      await supabase.from(match.table).delete().eq("id", match.id);
    } else {
      await supabase.from(match.table).update({ google_event_id: null }).eq("id", match.id);
    }
    return;
  }

  const when = eventStartEnd(event);
  if (!when) return;
  const title = event.summary?.trim() || "(untitled)";

  if (!match) {
    await supabase.from("activities").insert({
      family_id: familyId,
      title,
      start_at: when.start.toISOString(),
      end_at: when.end?.toISOString() ?? null,
      applies_to_whole_family: true,
      google_event_id: event.id,
    });
    return;
  }

  switch (match.table) {
    case "activities":
      await supabase
        .from("activities")
        .update({ title, start_at: when.start.toISOString(), end_at: when.end?.toISOString() ?? null, location: event.location ?? null })
        .eq("id", match.id);
      break;
    case "events":
      await supabase.from("events").update({ title, event_date: when.start.toISOString().slice(0, 10) }).eq("id", match.id);
      break;
    case "health_schedule":
      await supabase.from("health_schedule").update({ what: title, when_date: when.start.toISOString().slice(0, 10) }).eq("id", match.id);
      break;
    case "health_appointments":
      await supabase
        .from("health_appointments")
        .update({ what: title, when_at: when.start.toISOString(), where_text: event.location ?? null })
        .eq("id", match.id);
      break;
    case "doc_entries":
      await supabase.from("doc_entries").update({ title, expires_at: when.start.toISOString().slice(0, 10) }).eq("id", match.id);
      break;
  }
}

/** Runs the reconcile only if it hasn't run recently for this family —
 * called opportunistically from the Planner Calendar tab so the view stays
 * fresh without a manual "Sync now" every time, but without hitting Google
 * on every single page load. Never throws; a failed opportunistic sync just
 * means slightly stale data until the next view or a manual sync. */
export async function syncGoogleCalendarIfStale(familyId: string, maxAgeMs: number): Promise<void> {
  try {
    const admin = createAdminClient();
    if (!admin) return;
    const { data: link } = await admin.from("calendar_links").select("connected, last_synced_at").eq("family_id", familyId).maybeSingle();
    if (!link?.connected) return;
    if (link.last_synced_at && Date.now() - new Date(link.last_synced_at).getTime() < maxAgeMs) return;
    await syncGoogleCalendarAction();
  } catch (err) {
    console.error("Opportunistic calendar sync failed", err);
  }
}

/** The full two-way reconcile: pushes any not-yet-synced upcoming
 * activities/events/health items/document renewals to Google Calendar, then
 * pulls everything Google reports changed since the last sync (via an
 * incremental sync token) and applies it on Kin's side — new events land as
 * activities, edits update whichever row they're linked to, deletions
 * remove activities/events outright and just unlink health/document rows.
 * Safe to call repeatedly; a manual "Sync now" in Settings and an
 * opportunistic call from the Planner Calendar tab both use this. */
export async function syncGoogleCalendarAction(): Promise<ActionState & { synced?: number }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { data: link } = await supabase.from("calendar_links").select("*").eq("family_id", me.family_id).maybeSingle();
  if (!link?.connected) return { error: "Google Calendar isn't connected." };

  const accessToken = await getValidCalendarAccessToken(me.family_id);
  if (!accessToken) return { error: "Google Calendar's connection expired — reconnect it from Settings." };

  let pushed = 0;
  try {
    pushed += await backfillTable(supabase, accessToken, link.calendar_id, me.family_id, "activities", "start_at", todayTimestamp(), (r) => ({
      title: r.title as string,
      startAt: new Date(r.start_at as string),
      endAt: r.end_at ? new Date(r.end_at as string) : null,
      location: r.location as string | null,
    }));
    pushed += await backfillTable(supabase, accessToken, link.calendar_id, me.family_id, "events", "event_date", todayDate(), (r) => ({
      title: r.title as string,
      startAt: new Date(`${r.event_date as string}T00:00:00`),
      allDay: true,
    }));
    pushed += await backfillTable(supabase, accessToken, link.calendar_id, me.family_id, "health_schedule", "when_date", todayDate(), (r) =>
      r.when_date ? { title: r.what as string, startAt: new Date(`${r.when_date as string}T00:00:00`), allDay: true } : null,
    );
    pushed += await backfillTable(supabase, accessToken, link.calendar_id, me.family_id, "health_appointments", "when_at", todayTimestamp(), (r) => ({
      title: r.what as string,
      startAt: new Date(r.when_at as string),
      location: r.where_text as string | null,
    }));
    pushed += await backfillTable(supabase, accessToken, link.calendar_id, me.family_id, "doc_entries", "expires_at", todayDate(), (r) =>
      r.expires_at ? { title: `${r.title as string} renewal`, startAt: new Date(`${r.expires_at as string}T00:00:00`), allDay: true } : null,
    );
  } catch (err) {
    console.error("Calendar backfill push failed", err);
  }

  let pulled = 0;
  try {
    let syncToken = link.sync_token;
    let result = await listChangedCalendarEvents(accessToken, link.calendar_id, syncToken);
    if (result.tokenInvalid) {
      syncToken = null;
      result = await listChangedCalendarEvents(accessToken, link.calendar_id, null);
    }
    for (const event of result.events) {
      await applyIncomingEvent(supabase, me.family_id, event);
      pulled++;
    }
    await supabase
      .from("calendar_links")
      .update({ sync_token: result.nextSyncToken, last_synced_at: new Date().toISOString() })
      .eq("family_id", me.family_id);
  } catch (err) {
    console.error("Calendar pull sync failed", err);
    return { error: `Pushed ${pushed} item(s), but pulling changes failed: ${(err as Error).message}` };
  }

  revalidatePath("/planner");
  revalidatePath("/settings");
  return { error: null, synced: pushed + pulled };
}
