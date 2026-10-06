import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/session";
import { buildSnapshot } from "@/lib/offline/snapshot";

/** What offline Kin shows, for whoever is signed in (lib/offline/snapshot).
 *
 * Never cached anywhere but the member's own IndexedDB: no-store here, and
 * the service worker leaves /api alone, so no shared or HTTP cache ever
 * holds one household's list for the next person to open the phone. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const me = user ? await getCurrentMember() : null;
  if (!user || !me || me.status === "pending" || me.status === "removed") {
    return NextResponse.json({ error: "signed-out" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const snapshot = await buildSnapshot(me, user.id);
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "private, no-store" } });
}
