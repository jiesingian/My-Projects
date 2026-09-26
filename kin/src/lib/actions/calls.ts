"use server";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { sendPush } from "@/lib/push";
import { callWatchers } from "@/lib/calls";

/** The two things a call needs from the server; the call itself never
 * touches it (lib/calls.ts, components/call-provider.tsx). */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Wakes the person being called when Kin isn't open on their phone: a
 * notification that opens Kin, which then hears the ring still going. Only
 * someone in the caller's own household, with a login of their own, can be
 * rung -- the select runs under the caller's row-level security, and
 * push_targets() checks the household again.
 *
 * The household's grown-ups are told as well (26 September), each under
 * their own "Family calls" switch: "Alex is calling Robin". */
export async function ringAction(to: string, video: boolean): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  if (!UUID.test(to) || to === me.id) return { error: "That person can't be called." };
  const supabase = await createClient();
  const { data: household } = await supabase.from("members").select("id, full_name, role, status").eq("family_id", me.family_id);
  const callee = household?.find((m) => m.id === to);
  if (!callee || callee.status !== "active") return { error: "That person can't be called." };
  const caller = first(me.full_name);
  const watchers = callWatchers(household ?? [], me.id, to);
  after(() =>
    Promise.all([
      sendPush({
        kind: "calls",
        memberIds: [to],
        title: `${caller} is calling`,
        body: video ? "Video call. Open Kin to answer." : "Voice call. Open Kin to answer.",
        url: "/chat",
        tag: `call-${me.id}`,
        ring: true,
      }),
      watchers.length > 0 &&
        sendPush({
          kind: "family_calls",
          memberIds: watchers,
          title: `${caller} is calling ${first(callee.full_name)}`,
          body: video ? "Video call in Kin" : "Voice call in Kin",
          url: "/chat",
          tag: `family-call-${me.id}`,
          // Old news after a few minutes; not worth delivering late.
          ttlSeconds: 5 * 60,
        }),
    ]),
  );
  return { error: null };
}

/** The ring nobody picked up becomes "Missed call from Janine", in the same
 * place on the lock screen (same tag), so it does not keep saying "calling"
 * after the caller has given up. */
export async function missedCallAction(to: string, video: boolean): Promise<void> {
  const me = await requireCurrentMember();
  if (!UUID.test(to) || to === me.id) return;
  after(() =>
    sendPush({
      kind: "calls",
      memberIds: [to],
      title: `Missed ${video ? "video" : "voice"} call from ${first(me.full_name)}`,
      body: "Open Kin to call back.",
      url: "/chat",
      tag: `call-${me.id}`,
    }),
  );
}

function first(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
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
