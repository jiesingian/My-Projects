"use server";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { sendPush } from "@/lib/push";

/** The two things a call needs from the server; the call itself never
 * touches it (lib/calls.ts, components/call-provider.tsx). */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Wakes the person being called when Kin isn't open on their phone: a
 * notification that opens Kin, which then hears the ring still going. Only
 * someone in the caller's own household, with a login of their own, can be
 * rung -- the select runs under the caller's row-level security, and
 * push_targets() checks the household again. */
export async function ringAction(to: string, video: boolean): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  if (!UUID.test(to) || to === me.id) return { error: "That person can't be called." };
  const supabase = await createClient();
  const { data: callee } = await supabase.from("members").select("id, status").eq("id", to).eq("family_id", me.family_id).maybeSingle();
  if (!callee || callee.status !== "active") return { error: "That person can't be called." };
  after(() =>
    sendPush({
      kind: "chat",
      memberIds: [to],
      title: `${me.full_name.split(" ")[0]} is calling`,
      body: video ? "Video call. Open Kin to answer." : "Voice call. Open Kin to answer.",
      url: "/chat",
      tag: `call-${me.id}`,
    }),
  );
  return { error: null };
}

/** How the two phones find each other. STUN servers tell each phone its own
 * public address, which is enough on most home Wi-Fi. Mobile data usually
 * also needs a TURN relay; that comes from Vercel settings when one is added
 * (TURN_URLS, comma-separated, with TURN_USERNAME and TURN_CREDENTIAL) and
 * is simply absent until then. */
export async function iceServersAction(): Promise<RTCIceServer[]> {
  await requireCurrentMember();
  const servers: RTCIceServer[] = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];
  const turn = process.env.TURN_URLS?.split(",").map((u) => u.trim()).filter(Boolean);
  if (turn?.length && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    servers.push({ urls: turn, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  }
  return servers;
}
