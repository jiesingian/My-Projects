"use server";

import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import type { ActionState } from "@/lib/actions/auth";
import { humanDatabaseError } from "@/lib/db-errors";
import { deliver, vapidReady } from "@/lib/push";

/** Remembers this device for the signed-in member. Row-level security keeps
 * it theirs; the shape is checked here and again by the table's constraints. */
/** What PushSubscription.toJSON() hands over: an address and the two
 * values the browser generated to encrypt messages to this device. */
type DeviceKeys = Record<"p256dh" | "auth", string>;
type DeviceSubscription = { endpoint: string; keys: DeviceKeys };

export async function savePushSubscriptionAction(sub: DeviceSubscription): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!/^https:\/\//.test(sub?.endpoint ?? "") || sub.endpoint.length > 1000) return { error: "That device didn't give a usable address." };
  const fits = (v: unknown, max: number) => typeof v === "string" && v.length > 0 && v.length <= max;
  const keys: Partial<DeviceKeys> = sub.keys ?? {};
  if (!fits(keys.p256dh, 200) || !fits(keys.auth, 100)) return { error: "That device didn't give usable keys." };
  const supabase = await createClient();
  // A device re-subscribing replaces its old row rather than piling up.
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  const { error } = await supabase
    .from("push_subscriptions")
    .insert({ member_id: me.id, family_id: me.family_id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth });
  if (error) return { error: humanDatabaseError(error.message) };
  return { error: null };
}

export async function removePushSubscriptionAction(endpoint: string): Promise<ActionState> {
  await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) return { error: humanDatabaseError(error.message) };
  return { error: null };
}

/** "Send a test notification" (26 September): straight to the signed-in
 * member's own devices, so a phone can be checked without waiting for a call
 * or a reminder, and so "nothing arrived" has an answer. */
export async function sendTestPushAction(): Promise<{ error: string | null; sent: number }> {
  const me = await requireCurrentMember();
  if (!vapidReady()) return { error: "Notifications aren't switched on for Kin yet.", sent: 0 };
  const supabase = await createClient();
  const { data: devices, error } = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth").eq("member_id", me.id);
  if (error) return { error: humanDatabaseError(error.message), sent: 0 };
  if (!devices?.length) return { error: "No device of yours has notifications turned on in Kin yet.", sent: 0 };
  const payload = JSON.stringify({ title: "Kin", body: "Test notification. Calls and reminders will arrive like this.", url: "/settings/notifications", tag: "kin-test" });
  const result = await deliver(devices, payload, { TTL: 60, urgency: "high" }, async (endpoint) => {
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  });
  if (result.sent > 0) return { error: null, sent: result.sent };
  if (result.gone > 0 && result.failed.length === 0)
    return { error: "This device's notification address had expired. Turn notifications off and on again here, then test again.", sent: 0 };
  return { error: `The phone's notification service refused it (${result.failed.join(", ")}). Try turning notifications off and on again here.`, sent: 0 };
}
