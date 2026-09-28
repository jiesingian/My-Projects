import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Decline" on an incoming-call notification (28 September). The phone
 * declining may not have Kin open, so the service worker posts here and this
 * sends the same decline signal the in-app button would, on the household's
 * private call channel, as the signed-in member -- the channel's own policy
 * (20260926090000_call_signalling.sql) decides whether it may. The caller's
 * phone stops ringing and shows "declined". */
export async function POST(request: Request) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { call?: unknown; from?: unknown } | null;
  const call = typeof body?.call === "string" ? body.call : "";
  const from = typeof body?.from === "string" ? body.from : "";
  if (!UUID.test(call) || !UUID.test(from)) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const supabase = await createClient();
  const { data: caller } = await supabase.from("members").select("id").eq("id", from).eq("family_id", me.family_id).maybeSingle();
  if (!caller) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await supabase.realtime.setAuth();
  const channel = supabase.channel(`call:${me.family_id}`, { config: { private: true } });
  // httpSend rejects (rather than returning success: false) when the
  // channel's policy refuses, so both are caught.
  const sent = await channel
    .httpSend("signal", { t: "decline", call, from: me.id, fromDevice: "notification" })
    .catch((err: Error) => ({ success: false as const, status: 0, error: err.message }));
  void supabase.removeChannel(channel);
  if (!sent.success) {
    console.error(`Call decline not delivered: ${sent.status} ${sent.error}`);
    return NextResponse.json({ error: "Not delivered" }, { status: 502 });
  }
  return new NextResponse(null, { status: 204 });
}
