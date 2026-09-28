import { NextResponse, type NextRequest } from "next/server";
import { getCurrentMember } from "@/lib/session";
import { inKidView } from "@/lib/kid-view";
import { goPath } from "@/lib/quick-button";

/** Where the Action Button's pop-up and the Home Screen widget land
 * (quick-button.ts): /go/open, /go/ask, /go/talk and the rest, each one of
 * Kin's own actions.
 *
 * Signed-out, the proxy has already sent this to /login. The destination is
 * always a path from Kin's fixed list, never anything read from the request,
 * so the link cannot be turned into a redirect to elsewhere. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const member = await getCurrentMember();
  const to = member ? goPath(action, inKidView(member)) : "/onboarding/profile";
  const res = NextResponse.redirect(new URL(to, request.url), 303);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
