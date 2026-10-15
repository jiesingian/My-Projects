import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { HELPER_INVITE_COOKIE, normaliseHelperCode } from "@/lib/helper-access";

/** The link a household sends its helper: kin.app/helper/join/K7M2QDXP4R.
 *
 * Like the household's own join link (app/join), all it does is remember the
 * code and send the person on: to sign-up when they have no session, to the
 * accept screen when they have one. Kin's account screens are untouched --
 * after signing up or in, a person with no household lands on
 * /onboarding/profile, which sees the waiting code and sends them to
 * /helper/accept. The code is checked by claim_helper_invite() there; this
 * route grants nothing. */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = normaliseHelperCode(raw);
  const url = new URL(request.url);
  if (!code) return NextResponse.redirect(new URL("/login", url));

  const user = await getSessionUser();
  const res = NextResponse.redirect(new URL(user ? "/helper/accept" : "/signup", url));
  // Seven days, as long as the code itself lasts.
  res.cookies.set(HELPER_INVITE_COOKIE, code, { path: "/", maxAge: 60 * 60 * 24 * 7, sameSite: "lax", httpOnly: true });
  return res;
}
