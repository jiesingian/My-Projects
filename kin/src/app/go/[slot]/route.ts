import { NextResponse, type NextRequest } from "next/server";
import { getCurrentMember } from "@/lib/session";
import { inKidView } from "@/lib/kid-view";
import { isQuickSlot, quickPath, readQuickPrefs } from "@/lib/quick-button";

/** Where the phone's quick button lands (quick-button.ts). The Shortcut on the
 * Action Button or Back Tap opens /go/tap, /go/double or /go/hold, and this
 * sends it on to whatever the member picked in Settings -- so changing a
 * press is a setting, not a new Shortcut.
 *
 * Signed-out, the proxy has already sent this to /login. The destination is
 * always one of Kin's own paths from the fixed list, never anything read from
 * the request, so the link cannot be turned into a redirect to elsewhere. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slot: string }> }) {
  const { slot } = await params;
  const member = await getCurrentMember();
  const to = !member ? "/onboarding/profile" : isQuickSlot(slot) ? quickPath(readQuickPrefs(member.quick_actions), slot, inKidView(member)) : "/today";
  const res = NextResponse.redirect(new URL(to, request.url), 303);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
