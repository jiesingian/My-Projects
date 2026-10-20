import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/session";
import { REFERRAL_COOKIE, REFERRAL_WINDOW_DAYS, cleanReferralCode } from "@/lib/referral";

/** The link a family shares to invite another family to Kin:
 * kin.app/r/AAAA1111 (20261020180000_invite_a_family.sql).
 *
 * Like /join and /connect, it grants nothing: it remembers the code for two
 * weeks and sends the person on -- to the home page and its check-up if they
 * are new, to setup if they signed up but have no household yet, to Today
 * if they are already in one (a household names who invited it once, in
 * its first 14 days, and this is not that household's first day). Finishing
 * setup claims the code (createFamilyAction), and claim_referral() checks
 * it then. */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = cleanReferralCode(raw);
  const url = new URL(request.url);
  if (!code) return NextResponse.redirect(new URL("/", url));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const member = user ? await getCurrentMember() : null;
  const res = NextResponse.redirect(new URL(member ? "/today" : user ? "/onboarding/profile" : "/", url));
  if (!member) res.cookies.set(REFERRAL_COOKIE, code, { path: "/", maxAge: 60 * 60 * 24 * REFERRAL_WINDOW_DAYS, sameSite: "lax", httpOnly: true });
  return res;
}
