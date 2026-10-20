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

  // getClaims() verifies the JWT locally (asymmetric signing keys), so a
  // request makes no auth-server call unless the token has expired and needs
  // refreshing. getUser() here was one round trip per request, prefetches
  // included, and overloaded the dev project. Pages and RLS still enforce
  // access; this only decides who is bounced to /login.
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims?.sub ? claimsData.claims : null;

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
    // Same for the spoken plan (app/api/brief): fetched by an iPhone Shortcut,
    // which sends no cookie.
    path.startsWith("/api/brief/") ||
    // And "Add to Kin" (app/api/list-add): the Shortcut posts what was said
    // to the member's own add-to-list link, again with no cookie.
    path.startsWith("/api/list-add/") ||
    // Likewise an iPhone Shortcut sending Apple Health readings: the link's
    // key is the credential (app/api/health/apple).
    path.startsWith("/api/health/apple/") ||
    // And Supabase's five-minute reminder job: the shared secret is its
    // credential (app/api/cron/reminders).
    path === "/api/cron/reminders" ||
    // The upstream check answers without a session only on a preview, which
    // Vercel Authentication already guards; in production it asks for a
    // member itself (app/api/upstream-check).
    path === "/api/upstream-check" ||
    // An invite link has to reach someone with no account yet; it only
    // remembers the code and redirects (app/join/[code]/route.ts).
    path.startsWith("/join/") ||
    // So does a helper link (app/helper/join/[code]/route.ts): it remembers
    // the code and sends them to sign up. Only this one route under /helper
    // is open; the helper's page itself needs a session.
    path.startsWith("/helper/join/") ||
    // Likewise a connection link (app/connect/[code]/route.ts): remembers
    // the code and redirects; the other person still has to accept.
    path.startsWith("/connect/") ||
    // The public feature pages (app/features, lib/feature-pages.ts) and
    // their Open Graph images: what people find from a search, before an
    // account exists.
    path.startsWith("/features/") ||
    // The privacy notice, terms and refund policy: read before an account
    // exists, and by app-store reviewers who never have one (app/legal).
    path.startsWith("/legal/") ||
    // The offline shell (app/offline): a static page with no data in it,
    // which the service worker fetches at install -- often from the sign-in
    // screen. Redirected to /login, the worker would store the sign-in form
    // as the thing to show offline. Its data comes from the phone, and only
    // for whoever is signed in (lib/offline/store.ts).
    path === "/offline";

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}
