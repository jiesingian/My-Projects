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
  const [main, pantry, trial, week, promises, scheduled, billsAhead] = await Promise.all([
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
    // day before and the day itself stay in due_reminders (20261007170000).
    supabase.rpc("due_bill_ahead_reminders", { p_secret: secret }),
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
  const due = [...(main.data ?? []), ...(pantry.data ?? []), ...(trial.data ?? []), ...(week.data ?? []), ...(promises.data ?? []), ...(scheduled.data ?? []), ...(billsAhead.data ?? [])];

  vapidReady();
  // One payload per reminder, sent to all of its devices together through the
  // shared deliver(), which logs any refusal instead of swallowing it.
  const byKey = new Map<string, NonNullable<typeof due>>();
  for (const r of due ?? []) byKey.set(r.key, [...(byKey.get(r.key) ?? []), r]);
  let sent = 0;
  await Promise.all(
    [...byKey.values()].map(async (rows) => {
      const r = rows[0];
      const payload = JSON.stringify({ title: r.title.slice(0, 80), body: r.body.slice(0, 180), url: r.url.startsWith("/") ? r.url : "/today", tag: r.key });
      const result = await deliver(rows, payload, { TTL: 60 * 60 }, async (endpoint) => {
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
