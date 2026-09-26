import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { constantTimeEquals } from "@/lib/security/crypto";

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
  const { data: due, error } = await supabase.rpc("due_reminders", { p_secret: secret });
  if (error) {
    console.error("Reminders: due_reminders failed", error.message);
    return Response.json({ error: "Try again later." }, { status: 503 });
  }

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:hello@kin.family", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  let sent = 0;
  await Promise.all(
    (due ?? []).map(async (r) => {
      const payload = JSON.stringify({ title: r.title.slice(0, 80), body: r.body.slice(0, 180), url: r.url.startsWith("/") ? r.url : "/today", tag: r.key });
      try {
        await webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, payload, { TTL: 60 * 60 });
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await supabase.rpc("cron_forget_endpoint", { p_secret: secret, p_endpoint: r.endpoint });
      }
    }),
  );
  return Response.json({ due: due?.length ?? 0, sent });
}
