"use server";

import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import type { ActionState } from "@/lib/actions/auth";
import { databaseError } from "@/lib/report-error";
import { deliver, vapidReady } from "@/lib/push";
import { arrivedWords, helperListWords, pushPayload, sosWords, treeStoryWords, type PushWords } from "@/lib/push-words";
import { arrivedMessage } from "@/lib/arrived";
import { checkInAskPush } from "@/lib/member-card";
import { isPushTestKind, testTitle, type PushTestKind } from "@/lib/push-test";
import { isGrownUp } from "@/lib/roles";

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
  if (error) return { error: databaseError(error) };
  return { error: null };
}

export async function removePushSubscriptionAction(endpoint: string): Promise<ActionState> {
  await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) return { error: databaseError(error) };
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
  if (error) return { error: databaseError(error), sent: 0 };
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

/** "Send me a test" for one kind of push (20261020210000): the real words,
 * link and icon for that kind, marked "Test: ", to the signed-in grown-up's
 * own devices only. A kind worded in the database is sampled by
 * sample_push(); one worded in the app by the builder its sender uses. The
 * database says who may (a grown-up; never a child, kid view included) and
 * holds the rate (five a minute). A user action: nothing here touches the
 * cron secret or the reminders ledger. */
export async function sendTestKindPushAction(kind: string): Promise<{ error: string | null; sent: number }> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only a grown-up can send a test.", sent: 0 };
  if (!isPushTestKind(kind)) return { error: "Kin doesn't send that kind of notification.", sent: 0 };
  if (!vapidReady()) return { error: "Notifications aren't switched on for Kin yet.", sent: 0 };
  const supabase = await createClient();
  const { error: allowedError } = await supabase.rpc("push_test_allowed", { p_kind: kind });
  if (allowedError) return { error: /few a minute/.test(allowedError.message) ? "That's a few tests in a minute. Wait a moment, then try again." : databaseError(allowedError), sent: 0 };
  const { data: devices, error } = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth").eq("member_id", me.id);
  if (error) return { error: databaseError(error), sent: 0 };
  if (!devices?.length) return { error: "No device of yours has notifications turned on in Kin yet.", sent: 0 };

  const words = await testWords(kind, me);
  if (!words) return { error: "That test couldn't be built. Try again in a moment.", sent: 0 };
  const payload = pushPayload({ ...words, title: testTitle(words.title) });
  // Delivered the way the real one would be shaped (urgent stays urgent),
  // but kept only a minute: a test that arrives an hour later is noise.
  const options = words.urgent ? { TTL: 60, urgency: "high" as const } : { TTL: 60, urgency: "high" as const };
  const result = await deliver(devices, payload, options, async (endpoint) => {
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  });
  if (result.sent > 0) return { error: null, sent: result.sent };
  if (result.gone > 0 && result.failed.length === 0)
    return { error: "This device's notification address had expired. Turn notifications off and on again here, then test again.", sent: 0 };
  return { error: `The phone's notification service refused it (${result.failed.join(", ")}). Try turning notifications off and on again here.`, sent: 0 };
}

async function testWords(kind: PushTestKind, me: { id: string; family_id: string; full_name: string; avatar_url: string | null; families: { time_zone: string | null } }): Promise<PushWords | null> {
  const first = me.full_name.split(" ")[0];
  switch (kind) {
    case "tree_story":
      return treeStoryWords({ id: "test", personId: me.id, ours: true, title: "The day she met Lolo at the fiesta", writerFirst: first, personFirst: "Lola" });
    case "helper_line":
      return helperListWords({ familyId: me.family_id, name: "Itlog", by: first });
    case "arrived": {
      const tz = me.families.time_zone || "Asia/Manila";
      const home = { id: "test", name: "Home", lat: 14.5995, lng: 120.9842, radiusM: 150, notify: true };
      return arrivedWords(arrivedMessage({ first, lat: home.lat, lng: home.lng, accuracyM: 20, places: [home], at: new Date(), tz }), me.id);
    }
    case "sos":
      return sosWords({ id: "test", first, where: true, icon: me.avatar_url });
    case "checkin": {
      const p = checkInAskPush(me.full_name, me.id, "test");
      return { title: p.title, body: p.body, url: p.url, tag: p.tag };
    }
    default: {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc("sample_push", { p_kind: kind });
      const row = data?.[0];
      if (error || !row) return null;
      return { title: row.title, body: row.body, url: row.url, tag: row.tag };
    }
  }
}
