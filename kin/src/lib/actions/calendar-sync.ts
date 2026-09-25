"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCurrentMember, getCurrentMember } from "@/lib/session";
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
import { familyDay } from "@/lib/time";
import { eventStartEnd, allDayEvent, syncLinkPatch, isQuarantined, QUARANTINE_AFTER } from "@/lib/calendar-shape";

type Db = SupabaseClient<Database>;
type SourceTable = "activities" | "events" | "health_schedule" | "health_appointments" | "doc_entries" | "bills" | "meal_plans" | "goals" | "routines" | "income_schedules";

/** Who a Kin item should sync to: everyone connected in the household, a
 * specific set of tagged members, or a single owner (health/document rows,
 * which only ever belong to one person). Only members who've connected
 * their own Google Calendar are ever actually synced to — this list is
 * resolved against calendar_links inside syncRowToCalendars. */
export type CalendarTarget = { kind: "all" } | { kind: "members"; memberIds: string[] } | { kind: "member"; memberId: string | null };

export async function disconnectCalendarAction(): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("calendar_links").update({ connected: false }).eq("member_id", me.id);
  if (error) return { error: `Google Calendar could not be disconnected. ${error.message}` };

  // The link is off, so nothing will sync either way; a token left behind is
  // a credential we no longer need rather than a live connection. Worth
  // saying so, because "disconnected" should mean the token is gone too.
  const admin = createAdminClient();
  if (admin) {
    const { error: tokenError } = await admin.from("calendar_tokens").delete().eq("member_id", me.id);
    if (tokenError) {
      return { error: `Disconnected, but the stored Google token could not be removed. ${tokenError.message}` };
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
async function resolveTargetMemberIds(supabase: Db, familyId: string, target: CalendarTarget): Promise<string[] | null> {
  const { data: connectedRows, error } = await supabase.from("calendar_links").select("member_id").eq("family_id", familyId).eq("connected", true);
  if (error) {
    console.error(`Could not read which members have a connected calendar in family ${familyId}; leaving the calendars untouched`, error.message);
    return null;
  }
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
/** `input` may be null, which means "there is nothing to sync" rather than
 * "sync nothing": allDayEvent returns null for a date it cannot read, and
 * every caller would otherwise need the same guard around it. */
export async function syncRowToCalendars(familyId: string, table: SourceTable, rowId: string, input: CalendarEventInput | null, target: CalendarTarget): Promise<void> {
  if (!input) return;
  const supabase = await createClient();
  const desiredMemberIds = await resolveTargetMemberIds(supabase, familyId, target);
  if (!desiredMemberIds) return;

  const { data: existingLinks, error: existingError } = await supabase.from("calendar_event_links").select("*").eq("source_table", table).eq("source_id", rowId);
  if (existingError) {
    // Empty here would mean "this has never been synced", so we would create a
    // second event on a calendar that already has one. The unique constraint
    // bounces the link and the event is taken back again, so it does not last
    // -- but it is a create and a delete on someone's calendar for nothing,
    // and the tidy-up loop below would see no links and remove nothing.
    console.error(`Could not read the existing calendar links for ${table}/${rowId}; leaving the calendars as they are`, existingError.message);
    return;
  }
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
        const { error } = await supabase
          .from("calendar_event_links")
          .insert({ family_id: familyId, source_table: table, source_id: rowId, member_id: memberId, google_event_id: googleEventId });
        if (error) {
          // The event exists on their calendar and nothing here points at it,
          // so we would never update or delete it -- and the next pull would
          // read it as somebody's own event and make a duplicate activity out
          // of it. Take it back rather than leave that behind.
          console.error(`Calendar link could not be recorded for ${table}/${rowId} -> member ${memberId}; removing the event again`, error.message);
          await deleteCalendarEvent(accessToken, calendarId, googleEventId).catch(() => {});
        }
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
    const { error } = await supabase.from("calendar_event_links").delete().eq("id", link.id);
    if (error) console.error(`Calendar link ${link.id} was not cleared after its event was deleted`, error.message);
  }
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
    console.error(`Calendar links for ${table}/${rowId} could not be read; the events stay on the calendars and the links stay in place so a later sync can still clear them`, readError.message);
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
  if (error) console.error(`Calendar links for ${table}/${rowId} were not cleared after the row was deleted`, error.message);
}

// The household's own today, not UTC's. As the lower bound for what to pull
// back from Google this was merely conservative -- before eight in the
// morning it asked for a day too much -- but it is the same mistake as the
// one above and there is no reason to keep two answers to "what day is it".
const todayDate = () => familyDay();
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
    toInput: (r) => allDayEvent(r.title as string, r.event_date as string, { endDay: r.end_date as string | null }),
    toTarget: (r) => {
      const memberIds = ((r.event_members as { member_id: string }[] | null) ?? []).map((m) => m.member_id);
      return r.applies_to_whole_family || memberIds.length === 0 ? { kind: "all" } : { kind: "members", memberIds };
    },
  },
  {
    table: "health_schedule",
    dateColumn: "when_date",
    toInput: (r) => (r.when_date ? allDayEvent(r.what as string, r.when_date as string) : null),
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
    toInput: (r) => (r.expires_at ? allDayEvent(`${r.title as string} renewal`, r.expires_at as string) : null),
    toTarget: (r) => ({ kind: "member", memberId: r.owner_member_id as string | null }),
  },
  {
    table: "bills",
    dateColumn: "due_date",
    toInput: (r) => (r.due_date ? allDayEvent(`${r.name as string} due`, r.due_date as string) : null),
    toTarget: () => ({ kind: "all" }),
  },
  {
    table: "meal_plans",
    dateColumn: "plan_date",
    toInput: (r) => allDayEvent(r.dish as string, r.plan_date as string),
    toTarget: () => ({ kind: "all" }),
  },
  {
    table: "goals",
    dateColumn: "target_date",
    toInput: (r) => (r.target_date ? allDayEvent(r.title as string, r.target_date as string) : null),
    toTarget: (r) => (r.is_joint ? { kind: "all" } : { kind: "member", memberId: r.owner_member_id as string | null }),
  },
];

/** Pushes every not-yet-linked, upcoming row across the five calendar-eligible
 * tables — run as part of the full family reconcile so newly connected
 * members (and anything created before anyone had connected Calendar) catch
 * up automatically. */
async function backfillFamily(supabase: Db, familyId: string): Promise<number> {
  let pushed = 0;
  for (const desc of BACKFILL_DESCRIPTORS) {
    const selectCols = desc.table === "activities" ? "*, activity_members(member_id)" : desc.table === "events" ? "*, event_members(member_id)" : "*";
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

/** Applies one event Google reports changed on `memberId`'s calendar. A
 * cancellation just unlinks that member from a shared activity/event (other
 * tagged members keep theirs), deleting the row outright only once no one
 * else is still linked to it; health/document rows are only ever unlinked,
 * never deleted, since a calendar action shouldn't destroy that record. An
 * event with no Kin origin lands as a new activity tagged to this member —
 * "new schedules made on Google get tagged to that person in the app". */
async function applyIncomingEvent(
  supabase: Db,
  familyId: string,
  memberId: string,
  event: GoogleCalendarEvent,
): Promise<string | null> {
  const { data: link, error: linkError } = await supabase.from("calendar_event_links").select("*").eq("member_id", memberId).eq("google_event_id", event.id).maybeSingle();
  // Treating this as "not linked yet" would send an edit down the create path
  // and make a second activity for an event that already has one. The unique
  // constraint on (member_id, google_event_id) refuses the link and the create
  // undoes itself, so the retry is where it ends up anyway -- this just gets
  // there without writing a row first, and says which read failed.
  if (linkError) return `could not check whether this event is already linked: ${linkError.message}`;

  if (event.status === "cancelled") {
    if (!link) return null;
    const { error: unlink } = await supabase.from("calendar_event_links").delete().eq("id", link.id);
    if (unlink) return `could not unlink the cancelled event: ${unlink.message}`;

    if (link.source_table === "activities" || link.source_table === "events") {
      const { count } = await supabase
        .from("calendar_event_links")
        .select("id", { count: "exact", head: true })
        .eq("source_table", link.source_table)
        .eq("source_id", link.source_id);
      if (!count) {
        const { error } = await supabase.from(link.source_table).delete().eq("id", link.source_id);
        if (error) return `could not remove the ${link.source_table} row nobody is linked to any more: ${error.message}`;
      } else if (link.source_table === "activities") {
        const { error } = await supabase.from("activity_members").delete().eq("activity_id", link.source_id).eq("member_id", memberId);
        if (error) return `could not take the member off the activity: ${error.message}`;
      }
    }
    return null;
  }

  const when = eventStartEnd(event);
  // Not a failure: an event Google sent with no usable start is one we cannot
  // place, and replaying it forever would not help.
  if (!when) return null;
  const title = event.summary?.trim() || "(untitled)";

  if (!link) {
    const { data: activity, error: createError } = await supabase
      .from("activities")
      .insert({ family_id: familyId, title, start_at: when.start.toISOString(), end_at: when.end?.toISOString() ?? null, location: event.location ?? null, applies_to_whole_family: false })
      .select()
      .single();
    if (createError || !activity) return `could not create the activity: ${createError?.message ?? "no row came back"}`;

    const { error: memberError } = await supabase.from("activity_members").insert({ activity_id: activity.id, member_id: memberId });
    const { error: linkError } = memberError
      ? { error: null }
      : await supabase
          .from("calendar_event_links")
          .insert({ family_id: familyId, source_table: "activities", source_id: activity.id, member_id: memberId, google_event_id: event.id });

    if (memberError || linkError) {
      // Undo the activity. Because a failure here holds the sync token back,
      // Google will send this same event again -- and it would find no link,
      // and make a second copy. An activity nobody can see beats two.
      const { error: undoError } = await supabase.from("activities").delete().eq("id", activity.id);
      if (undoError) {
        // Now there is a half-made activity AND a retry coming. Say so loudly:
        // this is the one combination that produces a duplicate.
        console.error(`Calendar pull: activity ${activity.id} was created but could not be undone after a partial failure; the retry may duplicate it`, undoError.message);
      }
      return `could not finish creating the activity: ${(memberError ?? linkError)!.message}`;
    }
    return null;
  }

  const fail = (e: { message: string } | null) => (e ? `could not update the ${link.source_table} row: ${e.message}` : null);

  switch (link.source_table) {
    case "activities":
      return fail(
        (
          await supabase
            .from("activities")
            .update({ title, start_at: when.start.toISOString(), end_at: when.end?.toISOString() ?? null, location: event.location ?? null })
            .eq("id", link.source_id)
        ).error,
      );
    case "events":
      return fail((await supabase.from("events").update({ title, event_date: when.day }).eq("id", link.source_id)).error);
    case "health_schedule":
      return fail((await supabase.from("health_schedule").update({ what: title, when_date: when.day }).eq("id", link.source_id)).error);
    case "health_appointments":
      return fail(
        (
          await supabase
            .from("health_appointments")
            .update({ what: title, when_at: when.start.toISOString(), where_text: event.location ?? null })
            .eq("id", link.source_id)
        ).error,
      );
    case "doc_entries":
      return fail((await supabase.from("doc_entries").update({ title, expires_at: when.day }).eq("id", link.source_id)).error);
    case "bills":
      return fail((await supabase.from("bills").update({ name: title, due_date: when.day }).eq("id", link.source_id)).error);
    case "meal_plans":
      return fail((await supabase.from("meal_plans").update({ dish: title, plan_date: when.day }).eq("id", link.source_id)).error);
    case "goals":
      return fail((await supabase.from("goals").update({ title, target_date: when.day }).eq("id", link.source_id)).error);
  }
  return null;
}

async function pullMemberCalendar(
  supabase: Db,
  familyId: string,
  memberId: string,
): Promise<{ applied: number; retrying: number; setAside: number }> {
  const accessToken = await getValidCalendarAccessToken(memberId);
  if (!accessToken) return { applied: 0, retrying: 0, setAside: 0 };

  const { data: link, error: linkError } = await supabase.from("calendar_links").select("calendar_id, sync_token").eq("member_id", memberId).maybeSingle();
  // Returning zeros would report this member as synced with nothing to do.
  // Throwing lands in the caller's catch, which already says one member's
  // calendar could not be read and carries it into what "Sync now" reports.
  if (linkError) throw new Error(`the calendar link for member ${memberId} could not be read: ${linkError.message}`);
  if (!link) return { applied: 0, retrying: 0, setAside: 0 };

  let syncToken = link.sync_token;
  let result = await listChangedCalendarEvents(accessToken, link.calendar_id, syncToken);
  if (result.tokenInvalid) {
    syncToken = null;
    result = await listChangedCalendarEvents(accessToken, link.calendar_id, null);
  }

  // How many times each of these has already failed. Only this side knows --
  // everything else about a sync is derivable from Google.
  const { data: priorRows, error: priorError } = await supabase
    .from("calendar_sync_failures")
    .select("google_event_id, attempts")
    .eq("member_id", memberId);
  // Not fatal, and deliberately not: with no counts every failure reads as a
  // first attempt, so nothing is set aside and the token stays put -- the
  // pre-quarantine behaviour, which holds changes rather than losing them.
  // It must not be invisible though, because it is also what a missing table
  // looks like, and a sync that never sets anything aside looks identical to
  // one that never needed to.
  if (priorError) console.error(`Prior calendar failure counts could not be read for member ${memberId}; every failure this batch will count as a first attempt and nothing will be set aside`, priorError.message);
  const priorAttempts = new Map((priorRows ?? []).map((r) => [r.google_event_id, r.attempts]));

  const retrying: string[] = [];
  const setAside: string[] = [];

  for (const event of result.events) {
    const failed = await applyIncomingEvent(supabase, familyId, memberId, event);

    if (!failed) {
      // It worked. Any record of it failing before is history, and leaving it
      // would count old failures against a future one.
      if (priorAttempts.has(event.id)) {
        const { error } = await supabase
          .from("calendar_sync_failures")
          .delete()
          .eq("member_id", memberId)
          .eq("google_event_id", event.id);
        if (error) console.error(`Recovered calendar event ${event.id} is still recorded as failing`, error.message);
      }
      continue;
    }

    const attempts = (priorAttempts.get(event.id) ?? 0) + 1;
    const { error: recordError } = await supabase.from("calendar_sync_failures").upsert(
      {
        family_id: familyId,
        member_id: memberId,
        google_event_id: event.id,
        attempts,
        last_error: failed,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "member_id,google_event_id" },
    );
    // If the count cannot be kept, the event is retried rather than set aside:
    // losing the change is the worse of the two, and a stuck sync is visible.
    if (recordError) console.error(`Attempt count for calendar event ${event.id} was not recorded`, recordError.message);

    if (isQuarantined(attempts)) setAside.push(`${event.id} (${attempts} attempts) ${failed}`);
    else retrying.push(`${event.id} (attempt ${attempts}) ${failed}`);
  }

  // Google's sync token means "you have seen everything up to here". Saving it
  // after a change we could not write is what made a failed apply permanent:
  // that edit is never sent again, so a change someone made on their phone
  // simply never arrives and nothing anywhere says so.
  //
  // So the token is held back when anything failed, and the same batch comes
  // round again next sync. That is why applyIncomingEvent undoes a half-made
  // activity: the retry must not find a second one to make.
  //
  // The cost is real and worth naming: an event that can never be applied --
  // one that trips a constraint rather than a passing fault -- stops the token
  // advancing at all, and no later change from that member gets through until
  // someone looks. Stuck and loud beats lossy and silent, and the count is
  // handed back so "Sync now" can say so instead of reporting success.
  const { error } = await supabase
    .from("calendar_links")
    .update(syncLinkPatch(result.nextSyncToken, retrying.length, new Date().toISOString()))
    .eq("member_id", memberId);
  if (error) console.error(`Calendar sync token was not saved for member ${memberId}; the next sync will replay this batch`, error.message);

  if (retrying.length > 0) {
    console.error(
      `Calendar pull: ${retrying.length} of ${result.events.length} changes could not be applied for member ${memberId}. Holding the sync token so Google sends them again.`,
      retrying,
    );
  }
  if (setAside.length > 0) {
    console.error(
      `Calendar pull: ${setAside.length} change(s) for member ${memberId} have failed ${QUARANTINE_AFTER} times and are being set aside so the rest of the sync can move on. They are in calendar_sync_failures; delete a row to try it again.`,
      setAside,
    );
  }

  return {
    applied: result.events.length - retrying.length - setAside.length,
    retrying: retrying.length,
    setAside: setAside.length,
  };
}

/** Runs the full reconcile only if it hasn't run recently for this family —
 * called opportunistically from the Planner Calendar tab so the view stays
 * fresh without a manual "Sync now" every time, but without hitting Google
 * on every page load. Never throws; a failed opportunistic sync just means
 * slightly stale data until the next view or a manual sync. */
export async function syncGoogleCalendarIfStale(familyId: string, maxAgeMs: number): Promise<void> {
  try {
    // This reads through the admin client, which does not have row-level
    // security to fall back on, and the household arrives as an argument. It
    // leaks little -- whether a household has a connected calendar, and how
    // stale -- and you would have to guess a UUID to ask. But it is exported
    // from a "use server" module, which makes it an endpoint, and an endpoint
    // that reads with the service key should not take whose data on trust.
    //
    // syncGoogleCalendarAction below already requires a session, so this check
    // cannot make the call any less able to run than it already was.
    const me = await getCurrentMember();
    if (!me || me.family_id !== familyId) return;

    const admin = createAdminClient();
    if (!admin) return;
    const { data: links, error } = await admin.from("calendar_links").select("connected, last_synced_at").eq("family_id", familyId).eq("connected", true);
    // Opportunistic, so a failed read costs only freshness -- "Sync now" still
    // works. But silence here would look exactly like a household with no
    // calendars connected, which is the state this is meant to skip.
    if (error) {
      console.error(`Could not tell how stale family ${familyId}'s calendars are; skipping the opportunistic sync`, error.message);
      return;
    }
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

  const { data: connectedRows, error: connectedError } = await supabase.from("calendar_links").select("member_id").eq("family_id", me.family_id).eq("connected", true);
  // These are different answers and used to be the same one. "Nobody has
  // connected" is a settled fact you act on by connecting; a read that failed
  // is a reason to press Sync now again.
  if (connectedError) return { error: `Google Calendar could not be synced: the list of connected members could not be read. ${connectedError.message}` };
  if (!connectedRows || connectedRows.length === 0) return { error: "No one in the household has connected Google Calendar yet." };

  // Every phase below used to swallow whatever went wrong and the action
  // returned error: null regardless, so "Sync now" reported success even when
  // a whole member's calendar had thrown. Both places that call this already
  // render result.error -- they were simply never given one.
  const trouble: string[] = [];

  let pushed = 0;
  try {
    pushed = await backfillFamily(supabase, me.family_id);
  } catch (err) {
    console.error("Calendar backfill push failed", err);
    trouble.push("some items could not be sent to Google");
  }

  let pulled = 0;
  let heldBack = 0;
  let setAside = 0;
  for (const row of connectedRows) {
    try {
      const counts = await pullMemberCalendar(supabase, me.family_id, row.member_id);
      pulled += counts.applied;
      heldBack += counts.retrying;
      setAside += counts.setAside;
    } catch (err) {
      console.error(`Calendar pull failed for member ${row.member_id}`, err);
      trouble.push("one member's calendar could not be read");
    }
  }

  revalidatePath("/planner");
  revalidatePath("/settings", "layout");

  if (heldBack > 0) {
    trouble.push(
      `${heldBack} change${heldBack === 1 ? "" : "s"} from Google could not be applied and will be tried again on the next sync`,
    );
  }
  if (setAside > 0) {
    trouble.push(
      `${setAside} change${setAside === 1 ? " has" : "s have"} failed ${QUARANTINE_AFTER} times and ${setAside === 1 ? "has" : "have"} been set aside so the rest could go through`,
    );
  }
  if (trouble.length > 0) {
    return { error: `Synced ${pushed + pulled}, but ${trouble.join("; ")}.`, synced: pushed + pulled };
  }
  return { error: null, synced: pushed + pulled };
}
