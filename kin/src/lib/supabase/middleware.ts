import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Keeps the Supabase auth session cookie fresh on every request. Must run
// before any page reads cookies(), and must not be skipped for routes that
// need auth — see middleware.ts matcher.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthRoute =
    path.startsWith("/login") ||
    path.startsWith("/signup") ||
    path.startsWith("/verify") ||
    // Both recovery screens are open, because someone who cannot sign in is
    // precisely who needs them. Setting a password is not left unguarded by
    // that: the form takes the 6-digit code from the email and verifies it
    // before changing anything, so possession of the mailbox is the proof,
    // exactly as a session would have been.
    path.startsWith("/forgot-password") ||
    path.startsWith("/reset-password") ||
    path.startsWith("/auth/callback");
  // The private calendar feed is fetched by Apple Calendar and Outlook, which
  // carry no session; its token is the credential (app/api/calendar/feed).
  const isPublic = isAuthRoute || path === "/" || path.startsWith("/api/calendar/feed/") ||
    // An invite link has to reach someone with no account yet; it only
    // remembers the code and redirects (app/join/[code]/route.ts).
    path.startsWith("/join/");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}
