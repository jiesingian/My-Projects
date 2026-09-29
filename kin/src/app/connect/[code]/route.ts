import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const CONNECT_COOKIE = "kin-connect";

/** The link someone shares to connect with a relative or friend who may not
 * have Kin yet: kin.app/connect/K7Q2MX9P (29 September, suggestion 4).
 *
 * Like /join/<code> for households, it grants nothing. It remembers the code
 * for up to two weeks and sends the person on: straight to Connections with
 * the code filled in if they are signed in, or to sign-up if they are new --
 * where, once they have a household, Kin reminds them to finish connecting.
 * The code is still checked by request_connection_by_code() when they ask,
 * and the other person still has to accept. */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8);
  const url = new URL(request.url);
  if (code.length !== 8) return NextResponse.redirect(new URL("/signup", url));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const res = NextResponse.redirect(new URL(user ? `/family/connections?code=${code}` : "/signup", url));
  res.cookies.set(CONNECT_COOKIE, code, { path: "/", maxAge: 60 * 60 * 24 * 14, sameSite: "lax", httpOnly: true });
  return res;
}
