import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";

/** Web Push, in the session of whoever caused it.
 *
 * Off until VAPID keys exist (NEXT_PUBLIC_VAPID_PUBLIC_KEY and
 * VAPID_PRIVATE_KEY in Vercel): without them this does nothing and says
 * nothing, so the app ships and runs the same before and after they are
 * added. Who is reached is the database's decision -- push_targets() returns
 * the other members of the caller's own household whose switch for `kind`
 * is on -- so there is no list here to get wrong.
 *
 * Never throws: a notification that fails must not fail the message, post or
 * chore that caused it. Call it inside `after()` so it never slows a reply. */

export type PushKind = "chat" | "calls" | "family_calls" | "journal" | "shopping" | "approvals" | "events" | "health" | "bills";

export function pushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** `ring`: a call that is ringing now. Sent as urgent, so a sleeping phone is
 * woken rather than batched, and dropped after a minute -- "Janine is
 * calling" arriving an hour late is worse than not arriving. The service
 * worker keeps it on screen until it is dealt with. `ttlSeconds` overrides
 * how long an undelivered notification is kept (12 hours otherwise). */
export async function sendPush(input: {
  kind: PushKind;
  title: string;
  body: string;
  url: string;
  memberIds?: string[];
  tag?: string;
  ring?: boolean;
  ttlSeconds?: number;
}): Promise<void> {
  if (!pushConfigured()) return;
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:hello@kin.family",
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    const supabase = await createClient();
    const { data: targets, error } = await supabase.rpc("push_targets", { p_kind: input.kind, p_member_ids: input.memberIds ?? undefined });
    if (error || !targets?.length) return;
    const payload = JSON.stringify({
      title: input.title.slice(0, 80),
      body: input.body.slice(0, 180),
      url: input.url.startsWith("/") ? input.url : "/today",
      tag: input.tag,
      ring: input.ring || undefined,
    });
    const options = input.ring ? { TTL: 60, urgency: "high" as const } : { TTL: input.ttlSeconds ?? 60 * 60 * 12 };
    await Promise.all(
      targets.map(async (t) => {
        try {
          await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload, options);
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          // Gone or unsubscribed: stop trying that device.
          if (status === 404 || status === 410) await supabase.rpc("forget_push_endpoint", { p_endpoint: t.endpoint });
        }
      }),
    );
  } catch (err) {
    console.error("Push failed", err);
  }
}
