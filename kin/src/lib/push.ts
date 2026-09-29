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
  /** The caller's photo, shown as the notification's picture. */
  icon?: string | null;
  /** A ringing call: lets the notification answer or decline it. */
  call?: { id: string; from: string; video: boolean };
}): Promise<void> {
  if (!vapidReady()) return;
  try {
    const supabase = await createClient();
    const { data: targets, error } = await supabase.rpc("push_targets", { p_kind: input.kind, p_member_ids: input.memberIds ?? undefined });
    if (error || !targets?.length) return;
    const payload = JSON.stringify({
      title: input.title.slice(0, 80),
      body: input.body.slice(0, 180),
      url: input.url.startsWith("/") ? input.url : "/today",
      tag: input.tag,
      ring: input.ring || undefined,
      icon: input.icon && /^(https:\/\/|\/[^/])/.test(input.icon) ? input.icon : undefined,
      call: input.call,
    });
    const options = input.ring ? { TTL: 60, urgency: "high" as const } : { TTL: input.ttlSeconds ?? 60 * 60 * 12 };
    await deliver(targets, payload, options, async (endpoint) => {
      await supabase.rpc("forget_push_endpoint", { p_endpoint: endpoint });
    });
  } catch (err) {
    console.error("Push failed", err);
  }
}

/** A message in the family-tree room or a one-to-one conversation, which
 * reaches people in other households: chat_push_targets() (20260929090000)
 * decides who, for conversations the sender is in, honouring each person's
 * "chat" switch. Same promises as sendPush: never throws, call in after(). */
export async function sendChatPush(thread: "family" | `dm:${string}` | `group:${string}`, input: { title: string; body: string; url: string; tag: string }): Promise<void> {
  if (!vapidReady()) return;
  try {
    const supabase = await createClient();
    const { data: targets, error } = await supabase.rpc("chat_push_targets", { p_thread: thread });
    if (error || !targets?.length) return;
    const payload = JSON.stringify({ title: input.title.slice(0, 80), body: input.body.slice(0, 180), url: input.url, tag: input.tag });
    // A device in another household cannot be forgotten from this session
    // (forget_push_endpoint is per household); its own household's next push
    // clears it.
    await deliver(targets, payload, { TTL: 60 * 60 * 12 }, async (endpoint) => {
      await supabase.rpc("forget_push_endpoint", { p_endpoint: endpoint });
    });
  } catch (err) {
    console.error("Chat push failed", err);
  }
}

export type PushDevice = { endpoint: string; p256dh: string; auth: string };

/** Sends one payload to each device and says what happened to each. A device
 * the push service calls gone (404/410) is forgotten; any other refusal is
 * logged with the service's own status and reason (26 September -- those used
 * to vanish, so a phone that never rang left no trace anywhere). */
export async function deliver(
  devices: PushDevice[],
  payload: string,
  options: webpush.RequestOptions,
  forget: (endpoint: string) => Promise<void>,
): Promise<{ sent: number; gone: number; failed: string[] }> {
  const result = { sent: 0, gone: 0, failed: [] as string[] };
  await Promise.all(
    devices.map(async (d) => {
      try {
        await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, payload, options);
        result.sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          result.gone++;
          await forget(d.endpoint);
          return;
        }
        const service = new URL(d.endpoint).host;
        const body = String((err as { body?: unknown }).body ?? (err as Error).message ?? "").slice(0, 200);
        console.error(`Push refused by ${service}: ${status ?? "no status"} ${body}`);
        result.failed.push(`${service} ${status ?? ""}`.trim());
      }
    }),
  );
  return result;
}

export function vapidReady(): boolean {
  if (!pushConfigured()) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:hello@kin.family", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  return true;
}
