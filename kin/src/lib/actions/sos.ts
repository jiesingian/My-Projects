"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { humanDatabaseError } from "@/lib/db-errors";
import { sendPush } from "@/lib/push";
import { cleanPosition } from "@/lib/member-card";
import type { ActionState } from "@/lib/actions/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Emergency SOS (approved 30 September). Reached only after the button has
 * been held for three seconds and a five-second countdown was left to run
 * (components/sos-button), so by the time this is called somebody meant it.
 *
 * Every grown-up in the household is sent an urgent push that stays on the
 * screen, opening /today/sos/<id>: who, when, where if the phone allowed, and
 * buttons to call. The alert is logged in sos_alerts whether or not any phone
 * could be reached, and the sender is told honestly how many were.
 *
 * The push is awaited rather than left to after(): the count of phones it
 * reached is the one thing the sender most needs to be told. */
export async function sendSosAction(position: { lat: number; lng: number; accuracy: number | null } | null): Promise<ActionState & { id?: string; notified?: number; grownUps?: number }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const where = position ? cleanPosition(position.lat, position.lng, position.accuracy) : null;

  // A second SOS within two minutes of an open one is the same emergency --
  // a double tap, or a retry on a bad connection. Point at the first.
  const { data: open } = await supabase
    .from("sos_alerts")
    .select("id, notified")
    .eq("member_id", me.id)
    .is("resolved_at", null)
    .gte("created_at", new Date(Date.now() - 2 * 60_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: household } = await supabase.from("members").select("id, role, status").eq("family_id", me.family_id);
  const grownUps = (household ?? []).filter((m) => m.id !== me.id && m.status === "active" && (m.role === "parent" || m.role === "adult")).map((m) => m.id);

  if (open) return { error: null, id: open.id, notified: open.notified, grownUps: grownUps.length };

  const { data, error } = await supabase
    .from("sos_alerts")
    .insert({ family_id: me.family_id, member_id: me.id, lat: where?.lat ?? null, lng: where?.lng ?? null, accuracy_m: where?.accuracy_m ?? null })
    .select("id")
    .single();
  if (error) return { error: humanDatabaseError(error.message) };

  const name = me.full_name.split(" ")[0];
  const notified = grownUps.length
    ? await sendPush({
        kind: "sos",
        memberIds: grownUps,
        title: `SOS from ${name}`,
        body: where ? `${name} needs help now. Tap for where they are and to call.` : `${name} needs help now. Their phone didn't share a location. Tap to call.`,
        url: `/today/sos/${data.id}`,
        tag: `sos-${data.id}`,
        urgent: true,
        icon: me.avatar_url,
      })
    : 0;
  if (notified > 0) await supabase.rpc("sos_record_notified", { p_id: data.id, p_count: notified });

  revalidatePath("/today");
  return { error: null, id: data.id, notified, grownUps: grownUps.length };
}

/** "I'm safe" from the sender ends the alert; "I'm on it" from a grown-up
 * tells the rest that somebody is dealing with it. Each tells the others. */
export async function sosAction(id: string, action: "safe" | "handling"): Promise<ActionState> {
  if (!UUID.test(id) || (action !== "safe" && action !== "handling")) return { error: "That alert wasn't found." };
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data: sender, error } = await supabase.rpc("sos_act", { p_id: id, p_action: action });
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath(`/today/sos/${id}`);
  if (!sender) return { error: null };

  const { data: household } = await supabase.from("members").select("id, full_name, role, status").eq("family_id", me.family_id);
  const people = household ?? [];
  const senderName = (people.find((m) => m.id === sender)?.full_name ?? "").split(" ")[0] || "They";
  const myName = me.full_name.split(" ")[0];
  const grownUps = people.filter((m) => m.id !== me.id && m.status === "active" && (m.role === "parent" || m.role === "adult")).map((m) => m.id);
  const reach = action === "handling" ? [...new Set([...grownUps, sender])].filter((m) => m !== me.id) : grownUps;

  after(() =>
    sendPush({
      kind: "sos",
      memberIds: reach,
      title: action === "safe" ? `${myName} is safe` : `${myName} is responding`,
      body: action === "safe" ? `${myName} ended their SOS.` : `${myName} is dealing with ${senderName}'s SOS.`,
      url: `/today/sos/${id}`,
      tag: `sos-${id}`,
    }),
  );
  return { error: null };
}
