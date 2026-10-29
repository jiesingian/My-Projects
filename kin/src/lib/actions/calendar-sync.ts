"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCurrentMember } from "@/lib/session";
import { getValidCalendarAccessToken, deleteCalendarEvent, type CalendarEventInput } from "@/lib/google-calendar";
import type { ActionState } from "@/lib/actions/auth";
import { reportError, refusalMessage } from "@/lib/report-error";
// The reconcile itself lives in lib/calendar-sync-core (29 October), so the
// Planner can run it in after() with a client made before.
import { pushRowToCalendars, syncFamilyCalendars, type CalendarTarget, type SourceTable } from "@/lib/calendar-sync-core";

export type { CalendarTarget };

export async function disconnectCalendarAction(): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("calendar_links").update({ connected: false }).eq("member_id", me.id);
  if (error) return { error: `Google Calendar could not be disconnected. ${refusalMessage(error)}` };

  // The link is off, so nothing will sync either way; a token left behind is
  // a credential we no longer need rather than a live connection. Worth
  // saying so, because "disconnected" should mean the token is gone too.
  const admin = createAdminClient();
  if (admin) {
    const { error: tokenError } = await admin.from("calendar_tokens").delete().eq("member_id", me.id);
    if (tokenError) {
      return { error: `Disconnected, but the stored Google token could not be removed. ${refusalMessage(tokenError)}` };
    }
  }

  revalidatePath("/settings", "layout");
  return { error: null };
}

/** Who this row should end up on, or null when we could not find out.
 *
 * The distinction carries more weight than it looks. A failed read used to
 * arrive here as an empty list, and an empty list does not mean "do nothing":
 * it means "nobody should have this any more", so the caller went on to delete
 * the event from every phone that already had it. The row stayed in Kin
 * looking fine and the item quietly left the family's calendars. Saying "I
 * could not tell" leaves them alone instead. */


/** Creates, updates, and removes per-member Google Calendar events for one
 * Kin row so its live calendar_event_links exactly match `target` — used for
 * both "just created" (no existing links) and "just edited" (tagging may
 * have changed, e.g. an activity went from one person to the whole family).
 * Each tagged member gets their own event on their own calendar. */
/** `input` may be null, which means "there is nothing to sync" rather than
 * "sync nothing": allDayEvent returns null for a date it cannot read, and
 * every caller would otherwise need the same guard around it. */
export async function syncRowToCalendars(familyId: string, table: SourceTable, rowId: string, input: CalendarEventInput | null, target: CalendarTarget): Promise<void> {
  if (!input) return;
  return pushRowToCalendars(await createClient(), familyId, table, rowId, input, target);
}

/** Removes a Kin row from every calendar it was synced to — called when the
 * row itself is deleted. */
export async function removeRowFromCalendars(familyId: string, table: SourceTable, rowId: string): Promise<void> {
  const supabase = await createClient();
  const { data: links, error: readError } = await supabase.from("calendar_event_links").select("*").eq("family_id", familyId).eq("source_table", table).eq("source_id", rowId);
  if (readError) {
    // Carrying on would delete no Google events -- there are none to iterate --
    // and then clear the links anyway, which is the worst of both: the events
    // stay on the family's phones with nothing pointing at them, so they can
    // never be updated or removed, and the next pull reads them as somebody's
    // own events and makes activities out of them. Leaving the links in place
    // keeps the row reachable for a later sync.
    reportError("Calendar links could not be read; the events stay on the calendars and the links stay in place so a later sync can still clear them", readError, table, rowId);
    return;
  }

  for (const link of links ?? []) {
    const accessToken = await getValidCalendarAccessToken(link.member_id);
    if (accessToken) {
      const { data: linkRow } = await supabase.from("calendar_links").select("calendar_id").eq("member_id", link.member_id).maybeSingle();
      await deleteCalendarEvent(accessToken, linkRow?.calendar_id ?? "primary", link.google_event_id).catch(() => {});
    }
  }
  const { error } = await supabase.from("calendar_event_links").delete().eq("source_table", table).eq("source_id", rowId);
  if (error) reportError("Calendar links were not cleared after the row was deleted", error, table, rowId);
}



/** Full two-way reconcile for the whole household: pushes any not-yet-synced
 * upcoming item to every relevant connected member's calendar, then pulls
 * changes from each connected member's own calendar in turn. Safe to call
 * repeatedly — a manual "Sync now" in Settings and an opportunistic call
 * from the Planner Calendar tab both use this. */
export async function syncGoogleCalendarAction(): Promise<ActionState & { synced?: number }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { data: connectedRows, error: connectedError } = await supabase.from("calendar_links").select("member_id").eq("family_id", me.family_id).eq("connected", true);
  // These are different answers and used to be the same one. "Nobody has
  // connected" is a settled fact you act on by connecting; a read that failed
  // is a reason to press Sync now again.
  if (connectedError) return { error: `Google Calendar could not be synced: the list of connected members could not be read. ${refusalMessage(connectedError)}` };
  if (!connectedRows || connectedRows.length === 0) return { error: "No one in the household has connected Google Calendar yet." };

  // Every phase used to swallow whatever went wrong and the action returned
  // error: null regardless, so "Sync now" reported success even when a whole
  // member's calendar had thrown. Both places that call this already render
  // result.error -- they were simply never given one.
  const { pushed, pulled, trouble } = await syncFamilyCalendars(supabase, me.family_id, connectedRows.map((r) => r.member_id));

  revalidatePath("/planner");
  revalidatePath("/settings", "layout");

  if (trouble.length > 0) {
    return { error: `Synced ${pushed + pulled}, but ${trouble.join("; ")}.`, synced: pushed + pulled };
  }
  return { error: null, synced: pushed + pulled };
}
