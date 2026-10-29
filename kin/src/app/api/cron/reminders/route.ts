import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { constantTimeEquals } from "@/lib/security/crypto";
import { deliver, vapidReady } from "@/lib/push";
import { doseAlarmUrl, doseFromKey } from "@/lib/dose-alarm";
import { reportError } from "@/lib/report-error";
import { apnsConfigured, apnsWakeRequest, nativeDevice, sendApns, tokenGone } from "@/lib/apns";
import { fcmConfigured, fcmDevice, fcmTokenGone, fcmWakeMessage, sendFcm } from "@/lib/fcm";

/** The five-minute reminder tick (20260926140000_reminders.sql).
 *
 * Supabase's pg_cron calls this with the shared secret; nothing else should.
 * The secret is checked here against CRON_SECRET and again by the database,
 * which will only say what is due to a caller who holds it -- so the route
 * needs no service-role key, and a stranger who finds it gets a 401 and
 * learns nothing. Until CRON_SECRET and the VAPID keys are set it answers
 * 503 and sends nothing. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (secret.length < 32) return Response.json({ error: "Reminders are not set up here." }, { status: 503 });
  if (!constantTimeEquals(given, secret)) return Response.json({ error: "Not allowed." }, { status: 401 });
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return Response.json({ error: "Push is not set up here." }, { status: 503 });

  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [main, pantry, trial, week, promises, scheduled, billsAhead, letters, rsvps, missed, refills, vault, remembrance, recap, doseRepeats] = await Promise.all([
    supabase.rpc("due_reminders", { p_secret: secret }),
    // What is running low, once a day from 09:00 (20260928100000).
    supabase.rpc("due_pantry_reminders", { p_secret: secret }),
    // The organizer, on day 5 and day 7 of a Kin Plus trial and the day after
    // it ends (20260929140000_trial_seven_days.sql).
    supabase.rpc("due_trial_reminders", { p_secret: secret }),
    // The grown-ups, Sunday from 19:00: the week ahead (20260928221500).
    supabase.rpc("due_week_ahead_reminders", { p_secret: secret }),
    // A promised goal reward: due a day after it is claimed, then chased every
    // five minutes until it is received (20260929003000).
    supabase.rpc("due_goal_reward_reminders", { p_secret: secret }),
    // Chat messages written for later ("send at 7am", 20261006100400): each
    // is posted as its writer, then its conversation is notified as usual.
    supabase.rpc("due_scheduled_messages", { p_secret: secret }),
    // A bill its own number of days ahead (3 unless set), from 09:00; the
    // day before and the day itself stay in due_reminders (20261008110000).
    supabase.rpc("due_bill_ahead_reminders", { p_secret: secret }),
    // Letters for later, on the morning they open: one notification per
    // person and day, however many letters (20261009090100).
    supabase.rpc("due_letter_notifications", { p_secret: secret }),
    // Who's coming: two days before a one-off event, from 09:00, to each
    // person asked who hasn't answered (20261014090000).
    supabase.rpc("due_rsvp_reminders", { p_secret: secret }),
    // A dose still not ticked its chosen time after it was due: the one
    // grown-up named on the medicine, once per dose (20261014200000).
    supabase.rpc("due_missed_dose_alerts", { p_secret: secret }),
    // A medicine with 7 days or fewer left: on the To-Buy list and the
    // grown-ups told, once per supply cycle, from 09:00 (20261014201000).
    supabase.rpc("due_refill_reminders", { p_secret: secret }),
    // Emergency access to the vault (20261015120000): every grown-up of the
    // household, at once when someone asks, daily while it waits, and when it
    // opens. Sent as urgent below.
    supabase.rpc("due_vault_emergency_reminders", { p_secret: secret }),
    // Relatives on the tree who have passed (20261019233000): the grown-ups,
    // from 09:00, three days before Undas and on each one's 40th day, first
    // year and anniversaries, unless the household turned it off.
    supabase.rpc("due_remembrance_reminders", { p_secret: secret }),
    // The grown-ups, on the 1st from 08:00: last month's money recap is
    // ready. Names the month only; the figures are on the page, read in
    // each grown-up's own session (20261020001000).
    supabase.rpc("due_money_recap_reminders", { p_secret: secret }),
    // The dose again 5 and 10 minutes after its time while it is still not
    // ticked (20261022190000): on an iPhone the nearest a web app gets to an
    // alarm that keeps ringing.
    supabase.rpc("due_dose_repeats", { p_secret: secret }),
  ]);
  // Logged and carried on like the rest, never an early return: each due_*()
  // has already written its reminder_sends keys by now, so leaving here sent
  // nothing for the other kinds and their keys kept them from going again --
  // one bad medicine time lost every household's Undas, recap and doses.
  if (main.error) reportError("Reminders: due_reminders failed", main.error);
  if (pantry.error) reportError("Reminders: due_pantry_reminders failed", pantry.error);
  if (trial.error) reportError("Reminders: due_trial_reminders failed", trial.error);
  if (week.error) reportError("Reminders: due_week_ahead_reminders failed", week.error);
  if (promises.error) reportError("Reminders: due_goal_reward_reminders failed", promises.error);
  if (scheduled.error) reportError("Reminders: due_scheduled_messages failed", scheduled.error);
  if (billsAhead.error) reportError("Reminders: due_bill_ahead_reminders failed", billsAhead.error);
  if (letters.error) reportError("Reminders: due_letter_notifications failed", letters.error);
  if (rsvps.error) reportError("Reminders: due_rsvp_reminders failed", rsvps.error);
  if (missed.error) reportError("Reminders: due_missed_dose_alerts failed", missed.error);
  if (refills.error) reportError("Reminders: due_refill_reminders failed", refills.error);
  if (vault.error) reportError("Reminders: due_vault_emergency_reminders failed", vault.error);
  if (remembrance.error) reportError("Reminders: due_remembrance_reminders failed", remembrance.error);
  if (doseRepeats.error) reportError("Reminders: due_dose_repeats failed", doseRepeats.error);
  if (recap.error) reportError("Reminders: due_money_recap_reminders failed", recap.error);
  const due = [...(main.data ?? []), ...(pantry.data ?? []), ...(trial.data ?? []), ...(week.data ?? []), ...(promises.data ?? []), ...(scheduled.data ?? []), ...(billsAhead.data ?? []), ...(letters.data ?? []), ...(rsvps.data ?? []), ...(missed.data ?? []), ...(refills.data ?? []), ...(vault.data ?? []), ...(remembrance.data ?? []), ...(recap.data ?? []), ...(doseRepeats.data ?? [])];

  vapidReady();
  // One payload per reminder, sent to all of its devices together through the
  // shared deliver(), which logs any refusal instead of swallowing it.
  const byKey = new Map<string, NonNullable<typeof due>>();
  for (const r of due ?? []) byKey.set(r.key, [...(byKey.get(r.key) ?? []), r]);
  let sent = 0;
  await Promise.all(
    [...byKey.values()].map(async (rows) => {
      const r = rows[0];
      // Someone asking to open the vault wakes the phone and stays on screen,
      // like an SOS, and is kept for longer if the phone is off.
      const urgent = r.key.startsWith("vault-emergency:");
      // A medicine dose rings like an alarm (22 October): sent at high
      // urgency so a phone saving battery still shows it now, kept on screen
      // where the phone allows it, and opening the full-screen dose alarm.
      // Old news after 20 minutes -- the repeats and the missed-dose alert
      // take over from there.
      const dose = doseFromKey(r.key);
      const url = dose ? doseAlarmUrl(dose) : r.url.startsWith("/") ? r.url : "/today";
      const payload = JSON.stringify({ title: r.title.slice(0, 80), body: r.body.slice(0, 180), url, tag: r.key, urgent: urgent || undefined, alarm: dose ? true : undefined });
      const options = urgent ? { TTL: 60 * 60 * 12, urgency: "high" as const } : dose ? { TTL: 20 * 60, urgency: "high" as const } : { TTL: 60 * 60 };
      const result = await deliver(rows, payload, options, async (endpoint) => {
        await supabase.rpc("cron_forget_endpoint", { p_secret: secret, p_endpoint: endpoint });
      });
      sent += result.sent;
      // Reached nobody but not because every device is gone: try it again
      // on the next tick rather than lose a medicine dose for good.
      if (result.sent === 0 && result.failed.length > 0) await supabase.rpc("cron_retry_reminder", { p_secret: secret, p_key: r.key });
    }),
  );
  const woken = await wakeAlarms(supabase, secret);
  return Response.json({ due: due?.length ?? 0, sent, woken });
}

/** The Kin apps' silent re-sync (due_alarm_wakes, 20261029200000; Android
 * since 20261030153700): each app phone once a day, and within a tick of a
 * medicine, picked plan, check-up or bill changing, so its two weeks of
 * alarms never run out. An iPhone gets Apple's background push, an Android
 * phone Firebase's data message `sync: alarms`. Not even asked until the
 * APNS_* or FCM_* keys exist, so no day's key is spent on a push that can't
 * go; a phone whose kind has no keys yet is skipped. A daily wake refused for
 * now is tried next tick; a lost change wake is caught by the next daily one. */
async function wakeAlarms(supabase: ReturnType<typeof createClient<Database>>, secret: string): Promise<number> {
  if (!apnsConfigured() && !fcmConfigured()) return 0;
  const { data, error } = await supabase.rpc("due_alarm_wakes", { p_secret: secret });
  if (error) {
    reportError("Reminders: due_alarm_wakes failed", error);
    return 0;
  }
  let woken = 0;
  await Promise.all(
    (data ?? []).map(async (row) => {
      const android = fcmDevice(row);
      if (android) {
        if (!fcmConfigured()) return;
        const r = await sendFcm(fcmWakeMessage(android));
        if (r.status === 200) woken++;
        else if (fcmTokenGone(r)) await supabase.rpc("cron_forget_endpoint", { p_secret: secret, p_endpoint: row.endpoint });
        else {
          reportError("Alarm wake refused by Firebase", new Error(`Push refused by FCM: ${r.status || "no status"}`), r.reason ?? "");
          if (row.reason === "daily") await supabase.rpc("cron_retry_reminder", { p_secret: secret, p_key: row.key });
        }
        return;
      }
      if (!apnsConfigured()) return;
      const device = nativeDevice(row);
      const req = device && apnsWakeRequest(device, new Date());
      if (!device || !req) return;
      const r = await sendApns(device, req);
      if (r.status === 200) woken++;
      else if (tokenGone(r)) await supabase.rpc("cron_forget_endpoint", { p_secret: secret, p_endpoint: row.endpoint });
      else {
        reportError("Alarm wake refused by Apple", new Error(`Push refused by APNs: ${r.status || "no status"}`), r.reason ?? "");
        if (row.reason === "daily") await supabase.rpc("cron_retry_reminder", { p_secret: secret, p_key: row.key });
      }
    }),
  );
  return woken;
}
