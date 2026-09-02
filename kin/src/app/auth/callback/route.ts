import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Where the "Confirm signup" email link lands. Supabase's own /auth/v1/verify
// endpoint checks the token server-side first, then redirects the browser
// here with a PKCE `code` to exchange for a session.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
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
