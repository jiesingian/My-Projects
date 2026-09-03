import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { getCurrentMember } from "@/lib/session";

export async function GET(request: Request) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.redirect(new URL("/login", request.url));
  if (!me.is_organiser) {
    const url = new URL("/settings", request.url);
    url.searchParams.set("calendar_error", "organizer_only");
    return NextResponse.redirect(url);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    const url = new URL("/settings", request.url);
    url.searchParams.set("calendar_error", "not_configured");
    return NextResponse.redirect(url);
  }

  const state = randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("kin-calendar-oauth-state", state, { httpOnly: true, path: "/", maxAge: 600 });

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/calendar.events email");
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl);
}
