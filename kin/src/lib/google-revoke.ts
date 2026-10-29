import { reportError } from "@/lib/report-error";

/** Takes back Kin's access at Google itself, not just Kin's copy of the key
 * (legal readiness, 29 October: deleting an account removed the token rows
 * but left Kin listed at myaccount.google.com/permissions). Google's
 * documented endpoint takes either token; the refresh token is preferred
 * because revoking it ends the whole grant. Best effort: Google already
 * answering "invalid" (the person removed it themselves) is fine, and a
 * failure is reported and never stops the deletion. The token is never
 * logged. */
export async function revokeGoogleToken(token: { refresh_token?: string | null; access_token?: string | null } | null | undefined): Promise<void> {
  const value = token?.refresh_token || token?.access_token;
  if (!value) return;
  try {
    const res = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: value }),
      signal: AbortSignal.timeout(8000),
    });
    // 400 invalid_token: already revoked or expired, which is the outcome wanted.
    if (!res.ok && res.status !== 400) reportError("Google access could not be revoked", new Error(`Google answered ${res.status}`));
  } catch (e) {
    reportError("Google access could not be revoked", e);
  }
}
