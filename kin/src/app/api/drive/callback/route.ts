import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentMember } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureDriveFolderStructure } from "@/lib/google-drive";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const settingsUrl = new URL("/settings", request.url);

  const me = await getCurrentMember();
  if (!me) return NextResponse.redirect(new URL("/login", request.url));
  if (!me.is_organiser) {
    settingsUrl.searchParams.set("drive_error", "organiser_only");
    return NextResponse.redirect(settingsUrl);
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("kin-drive-oauth-state")?.value;
  cookieStore.delete("kin-drive-oauth-state");

  if (!code || !state || state !== expectedState) {
    settingsUrl.searchParams.set("drive_error", "invalid_state");
    return NextResponse.redirect(settingsUrl);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const admin = createAdminClient();
  if (!clientId || !clientSecret || !redirectUri || !admin) {
    settingsUrl.searchParams.set("drive_error", "not_configured");
    return NextResponse.redirect(settingsUrl);
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    settingsUrl.searchParams.set("drive_error", "token_exchange_failed");
    return NextResponse.redirect(settingsUrl);
  }
  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    id_token?: string;
  };

  let email: string | null = null;
  try {
    const userInfo = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    }).then((r) => r.json());
    email = userInfo.email ?? null;
  } catch {
    // Non-fatal — the connection still works without the display email.
  }

  await admin.from("drive_tokens").upsert({
    family_id: me.family_id,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? undefined,
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  });

  await admin.from("drive_links").upsert({
    family_id: me.family_id,
    connected_by_member_id: me.id,
    connected: true,
    account_email: email,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  try {
    await ensureDriveFolderStructure(me.family_id, tokens.access_token, me.families.name);
  } catch (err) {
    // Connection itself succeeded; folder setup can be retried on next upload.
    console.error("Drive folder setup failed", err);
  }

  return NextResponse.redirect(settingsUrl);
}
