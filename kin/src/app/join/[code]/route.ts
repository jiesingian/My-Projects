import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const INVITE_COOKIE = "kin-invite";

/** The link a household sends a relative: kin.app/join/A7K2QD. It opens
 * straight into joining instead of asking them to find and type a code.
 *
 * All it does is remember the code for the join step and send the person
 * where they need to go: sign-up if they are new, onward if they are signed
 * in. The code is still checked by join_family() when they join, exactly as a
 * typed one is -- this route grants nothing. */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12);
  const url = new URL(request.url);
  if (code.length < 4) return NextResponse.redirect(new URL("/signup", url));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const res = NextResponse.redirect(new URL(user ? "/onboarding/profile" : "/signup", url));
  res.cookies.set(INVITE_COOKIE, code, { path: "/", maxAge: 60 * 60 * 24 * 14, sameSite: "lax", httpOnly: true });
  return res;
}
