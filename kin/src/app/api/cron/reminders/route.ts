import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { constantTimeEquals } from "@/lib/security/crypto";
import { deliver, vapidReady } from "@/lib/push";

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
  const [main, pantry, trial, week, promises, scheduled, billsAhead, letters, rsvps, missed, refills, vault, remembrance] = await Promise.all([
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
  ]);
  if (main.error) {
    console.error("Reminders: due_reminders failed", main.error.message);
    return Response.json({ error: "Try again later." }, { status: 503 });
  }
  if (pantry.error) console.error("Reminders: due_pantry_reminders failed", pantry.error.message);
  if (trial.error) console.error("Reminders: due_trial_reminders failed", trial.error.message);
  if (week.error) console.error("Reminders: due_week_ahead_reminders failed", week.error.message);
  if (promises.error) console.error("Reminders: due_goal_reward_reminders failed", promises.error.message);
  if (scheduled.error) console.error("Reminders: due_scheduled_messages failed", scheduled.error.message);
  if (billsAhead.error) console.error("Reminders: due_bill_ahead_reminders failed", billsAhead.error.message);
  if (letters.error) console.error("Reminders: due_letter_notifications failed", letters.error.message);
  if (rsvps.error) console.error("Reminders: due_rsvp_reminders failed", rsvps.error.message);
  if (missed.error) console.error("Reminders: due_missed_dose_alerts failed", missed.error.message);
  if (refills.error) console.error("Reminders: due_refill_reminders failed", refills.error.message);
  if (vault.error) console.error("Reminders: due_vault_emergency_reminders failed", vault.error.message);
  if (remembrance.error) console.error("Reminders: due_remembrance_reminders failed", remembrance.error.message);
  const due = [...(main.data ?? []), ...(pantry.data ?? []), ...(trial.data ?? []), ...(week.data ?? []), ...(promises.data ?? []), ...(scheduled.data ?? []), ...(billsAhead.data ?? []), ...(letters.data ?? []), ...(rsvps.data ?? []), ...(missed.data ?? []), ...(refills.data ?? []), ...(vault.data ?? []), ...(remembrance.data ?? [])];

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
      const payload = JSON.stringify({ title: r.title.slice(0, 80), body: r.body.slice(0, 180), url: r.url.startsWith("/") ? r.url : "/today", tag: r.key, urgent: urgent || undefined });
      const options = urgent ? { TTL: 60 * 60 * 12, urgency: "high" as const } : { TTL: 60 * 60 };
      const result = await deliver(rows, payload, options, async (endpoint) => {
        await supabase.rpc("cron_forget_endpoint", { p_secret: secret, p_endpoint: endpoint });
      });
      sent += result.sent;
      // Reached nobody but not because every device is gone: try it again
      // on the next tick rather than lose a medicine dose for good.
      if (result.sent === 0 && result.failed.length > 0) await supabase.rpc("cron_retry_reminder", { p_secret: secret, p_key: r.key });
    }),
  );
  return Response.json({ due: due?.length ?? 0, sent });
}
