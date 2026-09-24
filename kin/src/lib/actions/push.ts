"use server";

import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import type { ActionState } from "@/lib/actions/auth";
import { humanDatabaseError } from "@/lib/db-errors";

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
