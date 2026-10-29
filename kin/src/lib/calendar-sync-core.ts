import { createAdminClient } from "@/lib/supabase/admin";
import {
  getValidCalendarAccessToken,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  listChangedCalendarEvents,
  type CalendarEventInput,
  type GoogleCalendarEvent,
} from "@/lib/google-calendar";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { familyDay, FAMILY_TZ } from "@/lib/time";
import { eventStartEnd, allDayEvent, syncLinkPatch, isQuarantined, QUARANTINE_AFTER } from "@/lib/calendar-shape";
import { activityRRule } from "@/lib/activity-repeat";
import { reportError, refusalMessage } from "@/lib/report-error";

/** The Google Calendar reconcile itself, given a database client (29
 * October). It was inside lib/actions/calendar-sync.ts, a "use server"
 * module, where each export is an endpoint and so could not take a client
 * from its caller. The Planner runs the reconcile in after(), once the page
 * has gone, and a page may not read cookies there (Next refuses: "used
 * cookies() inside after()"), so the client has to be made before -- and
 * handed in here. "Sync now" (syncGoogleCalendarAction) runs the same. */

type Db = SupabaseClient<Database>;
export type SourceTable = "activities" | "events" | "health_schedule" | "health_appointments" | "doc_entries" | "bills" | "meal_plans" | "goals" | "routines" | "income_schedules";

/** Who a Kin item should sync to: everyone connected in the household, a
 * specific set of tagged members, or a single owner (health/document rows,
 * which only ever belong to one person). Only members who've connected
 * their own Google Calendar are ever actually synced to — this list is
 * resolved against calendar_links inside syncRowToCalendars. */
export type CalendarTarget = { kind: "all" } | { kind: "members"; memberIds: string[] } | { kind: "member"; memberId: string | null };

/** The household's time zone (families.time_zone), Manila if it cannot be
 * read -- the same answer every household had before it could be set. */
export async function familyZone(supabase: Db, familyId: string): Promise<string> {
  const { data } = await supabase.from("families").select("time_zone").eq("id", familyId).maybeSingle();
  return data?.time_zone || FAMILY_TZ;
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
  /** `tz` is the household's zone, for a rule that needs one. */
  toInput: (row: Record<string, unknown>, tz: string) => CalendarEventInput | null;
  toTarget: (row: Record<string, unknown>) => CalendarTarget;
};

const BACKFILL_DESCRIPTORS: BackfillDescriptor[] = [
  {
    table: "activities",
    dateColumn: "start_at",
    toInput: (r, tz) => {
      const startAt = new Date(r.start_at as string);
      const rrule = activityRRule({ repeat: r.repeat as string, repeat_days: r.repeat_days as number[] | null, repeat_until: r.repeat_until as string | null }, startAt, tz);
      return { title: r.title as string, startAt, endAt: r.end_at ? new Date(r.end_at as string) : null, location: r.location as string | null, recurrence: rrule ? [rrule] : null };
    },
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
  const tz = await familyZone(supabase, familyId);
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

      const input = desc.toInput(row, tz);
      if (!input) continue;
      await pushRowToCalendars(supabase, familyId, desc.table, rowId, input, desc.toTarget(row));
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
  tz: string,
  // calendar_links.share_with_family (23 October): a new event is the whole
  // family's, or tagged to this member alone.
  shareWithFamily: boolean,
): Promise<string | null> {
  const { data: link, error: linkError } = await supabase.from("calendar_event_links").select("*").eq("member_id", memberId).eq("google_event_id", event.id).maybeSingle();
  // Treating this as "not linked yet" would send an edit down the create path
  // and make a second activity for an event that already has one. The unique
  // constraint on (member_id, google_event_id) refuses the link and the create
  // undoes itself, so the retry is where it ends up anyway -- this just gets
  // there without writing a row first, and says which read failed.
  if (linkError) return `could not check whether this event is already linked: ${refusalMessage(linkError)}`;

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
        if (error) return `could not remove the ${link.source_table} row nobody is linked to any more: ${refusalMessage(error)}`;
      } else if (link.source_table === "activities") {
        const { error } = await supabase.from("activity_members").delete().eq("activity_id", link.source_id).eq("member_id", memberId);
        if (error) return `could not take the member off the activity: ${refusalMessage(error)}`;
      }
    }
    return null;
  }

  const when = eventStartEnd(event, tz);
  // Not a failure: an event Google sent with no usable start is one we cannot
  // place, and replaying it forever would not help.
  if (!when) return null;
  const title = event.summary?.trim() || "(untitled)";

  if (!link) {
    const { data: activity, error: createError } = await supabase
      .from("activities")
      .insert({ family_id: familyId, title, start_at: when.start.toISOString(), end_at: when.end?.toISOString() ?? null, location: event.location ?? null, applies_to_whole_family: shareWithFamily })
      .select()
      .single();
    if (createError || !activity) return `could not create the activity: ${createError ? refusalMessage(createError) : "no row came back"}`;

    // The whole family's needs no tag; the member's own is tagged to them, so
    // Today and the reminders (lib/for-me) know whose it is.
    const { error: memberError } = shareWithFamily ? { error: null } : await supabase.from("activity_members").insert({ activity_id: activity.id, member_id: memberId });
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
        reportError("Calendar pull: activity was created but could not be undone after a partial failure; the retry may duplicate it", undoError, activity.id);
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

  const { data: link, error: linkError } = await supabase.from("calendar_links").select("calendar_id, sync_token, share_with_family").eq("member_id", memberId).maybeSingle();
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
  if (priorError) reportError("Prior calendar failure counts could not be read; every failure this batch will count as a first attempt and nothing will be set aside", priorError, memberId);
  const priorAttempts = new Map((priorRows ?? []).map((r) => [r.google_event_id, r.attempts]));

  const retrying: string[] = [];
  const setAside: string[] = [];
  const tz = await familyZone(supabase, familyId);

  for (const event of result.events) {
    const failed = await applyIncomingEvent(supabase, familyId, memberId, event, tz, link.share_with_family);

    if (!failed) {
      // It worked. Any record of it failing before is history, and leaving it
      // would count old failures against a future one.
      if (priorAttempts.has(event.id)) {
        const { error } = await supabase
          .from("calendar_sync_failures")
          .delete()
          .eq("member_id", memberId)
          .eq("google_event_id", event.id);
        if (error) reportError("Recovered calendar event is still recorded as failing", error, event.id);
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
    if (recordError) reportError("Attempt count for calendar event was not recorded", recordError, event.id);

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
  if (error) reportError("Calendar sync token was not saved; the next sync will replay this batch", error, memberId);

  if (retrying.length > 0) {
    reportError(
      "Calendar pull: changes could not be applied. Holding the sync token so Google sends them again.",
      new Error(`Calendar pull: ${retrying.length} of ${result.events.length} changes could not be applied`),
      memberId,
      retrying,
    );
  }
  if (setAside.length > 0) {
    reportError(
      `Calendar pull: changes have failed ${QUARANTINE_AFTER} times and are being set aside so the rest of the sync can move on. They are in calendar_sync_failures; delete a row to try it again.`,
      new Error(`Calendar pull: ${setAside.length} change(s) set aside`),
      memberId,
      setAside,
    );
  }

  return {
    applied: result.events.length - retrying.length - setAside.length,
    retrying: retrying.length,
    setAside: setAside.length,
  };
}

export type FamilySyncResult = { pushed: number; pulled: number; heldBack: number; setAside: number; trouble: string[] };

/** Pushes what has not reached Google, then pulls each connected member's
 * calendar back, as the member whose client this is. What went wrong is
 * counted in `trouble`, not thrown, so one member's calendar cannot stop the
 * rest. */
export async function syncFamilyCalendars(supabase: Db, familyId: string, memberIds: string[]): Promise<FamilySyncResult> {
  const trouble: string[] = [];

  let pushed = 0;
  try {
    pushed = await backfillFamily(supabase, familyId);
  } catch (err) {
    reportError("Calendar backfill push failed", err);
    trouble.push("some items could not be sent to Google");
  }

  let pulled = 0;
  let heldBack = 0;
  let setAside = 0;
  for (const memberId of memberIds) {
    try {
      const counts = await pullMemberCalendar(supabase, familyId, memberId);
      pulled += counts.applied;
      heldBack += counts.retrying;
      setAside += counts.setAside;
    } catch (err) {
      reportError("Calendar pull failed", err, memberId);
      trouble.push("one member's calendar could not be read");
    }
  }
  if (heldBack > 0) {
    trouble.push(`${heldBack} change${heldBack === 1 ? "" : "s"} from Google could not be applied and will be tried again on the next sync`);
  }
  if (setAside > 0) {
    trouble.push(
      `${setAside} change${setAside === 1 ? " has" : "s have"} failed ${QUARANTINE_AFTER} times and ${setAside === 1 ? "has" : "have"} been set aside so the rest could go through`,
    );
  }
  return { pushed, pulled, heldBack, setAside, trouble };
}

/** Runs the full reconcile only if it hasn't run recently for this family —
 * called from the Planner, in after(), so the view stays fresh without a
 * manual "Sync now" every time, but without hitting Google on every page
 * load. `supabase` is the viewer's own client, made before after() by the
 * page, which has checked the session and passes its household. Never
 * throws; a failed opportunistic sync just means slightly stale data until
 * the next view or a manual sync. */
export async function syncCalendarsIfStale(supabase: Db, familyId: string, maxAgeMs: number): Promise<void> {
  try {
    // Through the admin client only to read how stale the links are; the
    // reconcile itself runs as the viewer.
    const admin = createAdminClient();
    if (!admin) return;
    const { data: links, error } = await admin.from("calendar_links").select("member_id, connected, last_synced_at").eq("family_id", familyId).eq("connected", true);
    // Opportunistic, so a failed read costs only freshness -- "Sync now" still
    // works. But silence here would look exactly like a household with no
    // calendars connected, which is the state this is meant to skip.
    if (error) {
      reportError("Could not tell how stale a household's calendars are; skipping the opportunistic sync", error, familyId);
      return;
    }
    if (!links || links.length === 0) return;
    const stalest = links.reduce<number>((min, l) => Math.min(min, l.last_synced_at ? new Date(l.last_synced_at).getTime() : 0), Infinity);
    if (Date.now() - stalest < maxAgeMs) return;
    const { trouble } = await syncFamilyCalendars(supabase, familyId, links.map((l) => l.member_id));
    if (trouble.length > 0) reportError("Opportunistic calendar sync was partial", trouble.join("; "), familyId);
  } catch (err) {
    reportError("Opportunistic calendar sync failed", err);
  }
}

async function resolveTargetMemberIds(supabase: Db, familyId: string, target: CalendarTarget): Promise<string[] | null> {
  const { data: connectedRows, error } = await supabase.from("calendar_links").select("member_id").eq("family_id", familyId).eq("connected", true);
  if (error) {
    reportError("Could not read which members have a connected calendar; leaving the calendars untouched", error, familyId);
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
export async function pushRowToCalendars(supabase: Db, familyId: string, table: SourceTable, rowId: string, input: CalendarEventInput | null, target: CalendarTarget): Promise<void> {
  if (!input) return;
  // Google is told the household's own zone, so a repeating event keeps its
  // local hour wherever the household is.
  input = { ...input, timeZone: input.timeZone ?? (await familyZone(supabase, familyId)) };
  const desiredMemberIds = await resolveTargetMemberIds(supabase, familyId, target);
  if (!desiredMemberIds) return;

  const { data: existingLinks, error: existingError } = await supabase.from("calendar_event_links").select("*").eq("source_table", table).eq("source_id", rowId);
  if (existingError) {
    // Empty here would mean "this has never been synced", so we would create a
    // second event on a calendar that already has one. The unique constraint
    // bounces the link and the event is taken back again, so it does not last
    // -- but it is a create and a delete on someone's calendar for nothing,
    // and the tidy-up loop below would see no links and remove nothing.
    reportError("Could not read the existing calendar links; leaving the calendars as they are", existingError, table, rowId);
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
          reportError("Calendar link could not be recorded; removing the event again", error, table, rowId, memberId);
          await deleteCalendarEvent(accessToken, calendarId, googleEventId).catch(() => {});
        }
      }
    } catch (err) {
      reportError("Calendar push failed", err, table, rowId, memberId);
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
    if (error) reportError("Calendar link was not cleared after its event was deleted", error, link.id);
  }
}
