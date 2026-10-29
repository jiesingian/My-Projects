import { createPrivateKey, sign } from "node:crypto";
import { FCM_PREFIX, NATIVE_KEY } from "@/lib/native";
import type { PushContent } from "@/lib/apns";

/** Firebase Cloud Messaging for the Kin Android app (kin/native/android),
 * beside Web Push and Apple's push. An Android web view can't take Web Push,
 * so every Kin notification reaches the app this way. Its token is kept in
 * push_subscriptions like any device (endpoint FCM_PREFIX + token, p256dh =
 * NATIVE_KEY, auth = "fcm"), so push_targets() decides who gets what with the
 * usual rules, and deliver() (lib/push.ts) sends it here.
 *
 * Always a data message, which the app's KinMessagingService turns into a
 * notification itself: a ring becomes Android's full-screen incoming-call
 * notification; an SOS goes on its urgent channel.
 *
 * Off until Jonathan makes the free Firebase project (Vercel: FCM_PROJECT_ID,
 * FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY, from a service account;
 * SETUP_FOR_JONATHAN.md): without them Android devices are skipped and
 * everything else runs as before. Pure parts tested alone
 * (e2e/fcm.logic.spec.ts). */

export type FcmDevice = { endpoint: string; token: string };

export function fcmDevice(row: { endpoint: string; p256dh: string; auth: string }): FcmDevice | null {
  if (row.p256dh !== NATIVE_KEY || row.auth !== "fcm" || !row.endpoint.startsWith(FCM_PREFIX)) return null;
  const token = row.endpoint.slice(FCM_PREFIX.length);
  return /^[A-Za-z0-9_:-]{20,400}$/.test(token) ? { endpoint: row.endpoint, token } : null;
}

export function fcmConfigured(): boolean {
  return Boolean(process.env.FCM_PROJECT_ID && process.env.FCM_CLIENT_EMAIL && process.env.FCM_PRIVATE_KEY);
}

/** What one push becomes for an Android phone (FCM HTTP v1's body). A repeat
 * of a ring is dropped: the notification already rings until answered. */
export function fcmMessage(device: Pick<FcmDevice, "token">, p: PushContent, opts: { ttlSeconds?: number } = {}): { message: Record<string, unknown> } | null {
  const isRing = Boolean(p.ring && p.call);
  if (isRing && p.again) return null;
  const url = p.url.startsWith("/") ? p.url : "/today";
  const data: Record<string, string> = isRing
    ? {
        kind: "ring",
        call_id: p.call!.id,
        call_from: p.call!.from,
        video: String(Boolean(p.call!.video)),
        caller: p.title.replace(/ is calling$/, "").slice(0, 80),
        url,
      }
    : { kind: "notify", title: p.title.slice(0, 80), body: p.body.slice(0, 180), url, tag: (p.tag ?? "kin").slice(0, 64), urgent: String(Boolean(p.urgent)) };
  // A ring an hour late is worse than none (lib/push.ts, ring).
  const ttl = isRing ? 60 : (opts.ttlSeconds ?? (p.urgent ? 3600 : 12 * 3600));
  return {
    message: {
      token: device.token,
      data,
      android: { priority: isRing || p.urgent ? "high" : "normal", ttl: `${ttl}s`, ...(isRing ? {} : { collapse_key: data.tag }) },
    },
  };
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** The service account's signed request for an access token (RS256). */
export function serviceAccountAssertion(now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: process.env.FCM_CLIENT_EMAIL,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat,
      exp: iat + 3600,
    }),
  );
  const key = createPrivateKey((process.env.FCM_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"));
  return `${header}.${claims}.${b64url(sign("sha256", Buffer.from(`${header}.${claims}`), key))}`;
}

let cached: { token: string; until: number } | null = null;
async function accessToken(): Promise<string | null> {
  if (cached && Date.now() < cached.until) return cached.token;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: serviceAccountAssertion() }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!j.access_token) return null;
    cached = { token: j.access_token, until: Date.now() + Math.max(60, (j.expires_in ?? 3600) - 300) * 1000 };
    return cached.token;
  } catch {
    return null;
  }
}

/** Sends one message. Resolves to the status and Google's reason; never throws. */
export async function sendFcm(body: { message: Record<string, unknown> }): Promise<{ status: number; reason?: string }> {
  const token = await accessToken();
  if (!token) return { status: 0, reason: "no access token" };
  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${process.env.FCM_PROJECT_ID}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { status: res.status };
    const j = (await res.json().catch(() => ({}))) as { error?: { status?: string; details?: { errorCode?: string }[] } };
    return { status: res.status, reason: j.error?.details?.find((d) => d.errorCode)?.errorCode ?? j.error?.status };
  } catch (err) {
    return { status: 0, reason: (err as Error).message };
  }
}

/** Google's answers that mean the token is gone for good: forget it. Not a
 * plain 400, which can be Kin's own mistake in the message. */
export function fcmTokenGone(r: { status: number; reason?: string }): boolean {
  return r.status === 404 || r.reason === "UNREGISTERED";
}
