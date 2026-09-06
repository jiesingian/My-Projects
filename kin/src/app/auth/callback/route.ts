import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Where the "Confirm signup" email link lands. Supabase's own /auth/v1/verify
// endpoint checks the token server-side first, then redirects the browser
// here with a PKCE `code` to exchange for a session.
/** Where to go after the code is exchanged, when the link asked for somewhere
 * particular — the recovery link asks for /reset-password.
 *
 * Only a path inside Kin is allowed. The value travels in a URL, so anyone can
 * put anything in it; unchecked, an emailed link could carry
 * `next=https://…` and hand a freshly signed-in family member to someone
 * else's site. A leading "//" is refused too, because a browser reads that as
 * an address on another host rather than a path. */
function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        if (next) return NextResponse.redirect(new URL(next, request.url));
        const { data: member } = await supabase
          .from("members")
          .select("id")
          .eq("auth_user_id", user.id)
          .maybeSingle();
        return NextResponse.redirect(new URL(member ? "/today" : "/onboarding/profile", request.url));
      }
    }
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("error", "confirmation_failed");
  return NextResponse.redirect(loginUrl);
}
