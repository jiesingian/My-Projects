import http2 from "node:http2";
import { createPrivateKey, sign } from "node:crypto";

/** Apple's own push (APNs) for the Kin iPhone app (kin/native), beside Web
 * Push. The app's two device tokens are kept in push_subscriptions like any
 * browser's, so push_targets() decides who gets what with the same rules:
 * the endpoint is Apple's real device URL, and the key columns say what it
 * is (p256dh = NATIVE_KEY, auth = "<channel>"):
 *
 * - "alert": ordinary notifications. An SOS goes as time-sensitive, or as a
 *   Critical Alert once Apple grants Kin the entitlement (APNS_CRITICAL=1):
 *   through silent and Focus.
 * - "voip": only a ringing call, which the app hands to CallKit, so it rings
 *   full screen like Messenger, on silent too. Apple requires every VoIP
 *   push to become a call, so nothing else is ever sent on it.
 *
 * Off until Jonathan adds the key from the Apple Developer account (Vercel:
 * APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY; SETUP_FOR_JONATHAN.md):
 * without it the app's devices are skipped and everything else runs as
 * before. Pure parts are tested alone (e2e/apns.logic.spec.ts). */

import { APNS_HOSTS, NATIVE_KEY, type ApnsEnv } from "@/lib/native";

export { APNS_HOSTS, NATIVE_KEY, nativeEndpoint } from "@/lib/native";
export type NativeDevice = { endpoint: string; token: string; env: ApnsEnv; channel: "alert" | "voip" };

/** A push_subscriptions row that is the Kin app's, or null for a browser's. */
export function nativeDevice(row: { endpoint: string; p256dh: string; auth: string }): NativeDevice | null {
  if (row.p256dh !== NATIVE_KEY || (row.auth !== "alert" && row.auth !== "voip")) return null;
  const m = /^https:\/\/(api\.push\.apple\.com|api\.sandbox\.push\.apple\.com)\/3\/device\/([0-9a-f]{32,200})$/i.exec(row.endpoint);
  if (!m) return null;
  return { endpoint: row.endpoint, token: m[2].toLowerCase(), env: m[1] === APNS_HOSTS.production ? "production" : "sandbox", channel: row.auth };
}

export type PushContent = {
  title: string;
  body: string;
  url: string;
  tag?: string;
  ring?: boolean;
  urgent?: boolean;
  call?: { id: string; from: string; video: boolean };
  again?: boolean;
};

export type ApnsRequest = { pushType: "alert" | "voip"; topic: string; priority: 5 | 10; expiration: number; collapseId?: string; body: string };

export function apnsTopic(): string {
  return process.env.APNS_BUNDLE_ID || "com.jiesingian.kin";
}

/** What one push becomes for one of the app's devices, or null when that
 * device must not get it: a ring goes only on "voip", and everything else
 * only on "alert". */
export function apnsRequest(device: Pick<NativeDevice, "channel">, p: PushContent, now: Date, opts: { critical?: boolean; ttlSeconds?: number } = {}): ApnsRequest | null {
  const nowS = Math.floor(now.getTime() / 1000);
  const isRing = Boolean(p.ring && p.call);
  if (device.channel === "voip") {
    // Only the first ring: CallKit keeps that one ringing, and every VoIP
    // push must become a new call, so a repeat would stack a second one.
    if (!isRing || p.again) return null;
    return {
      pushType: "voip",
      topic: `${apnsTopic()}.voip`,
      priority: 10,
      // A ring an hour late is worse than none (lib/push.ts, ring).
      expiration: nowS + 60,
      body: JSON.stringify({ call: p.call, caller: p.title.replace(/ is calling$/, ""), url: p.url }),
    };
  }
  if (isRing) return null;
  const sos = Boolean(p.urgent);
  const aps: Record<string, unknown> = {
    alert: { title: p.title.slice(0, 80), body: p.body.slice(0, 180) },
    "thread-id": p.tag,
  };
  if (sos && opts.critical) {
    aps["interruption-level"] = "critical";
    aps.sound = { critical: 1, name: "default", volume: 1 };
  } else {
    aps["interruption-level"] = sos ? "time-sensitive" : "active";
    aps.sound = "default";
  }
  return {
    pushType: "alert",
    topic: apnsTopic(),
    priority: sos ? 10 : 5,
    expiration: nowS + (opts.ttlSeconds ?? (sos ? 3600 : 12 * 3600)),
    collapseId: p.tag?.slice(0, 64),
    body: JSON.stringify({ aps, url: p.url.startsWith("/") ? p.url : "/today" }),
  };
}

export function apnsConfigured(): boolean {
  return Boolean(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_PRIVATE_KEY);
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** The provider token Apple asks for: ES256, valid an hour; one is made
 * every 50 minutes. */
let cached: { jwt: string; at: number } | null = null;
export function providerToken(now = Date.now()): string {
  if (cached && now - cached.at < 50 * 60_000) return cached.jwt;
  const header = b64url(JSON.stringify({ alg: "ES256", kid: process.env.APNS_KEY_ID }));
  const claims = b64url(JSON.stringify({ iss: process.env.APNS_TEAM_ID, iat: Math.floor(now / 1000) }));
  const key = createPrivateKey((process.env.APNS_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"));
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), { key, dsaEncoding: "ieee-p1363" });
  cached = { jwt: `${header}.${claims}.${b64url(signature)}`, at: now };
  return cached.jwt;
}

/** Sends one request to Apple. Resolves to the status and Apple's reason;
 * never throws. */
export function sendApns(device: NativeDevice, req: ApnsRequest): Promise<{ status: number; reason?: string }> {
  return new Promise((resolve) => {
    let client: http2.ClientHttp2Session;
    try {
      client = http2.connect(`https://${APNS_HOSTS[device.env]}`);
    } catch (err) {
      resolve({ status: 0, reason: (err as Error).message });
      return;
    }
    client.on("error", (err) => resolve({ status: 0, reason: err.message }));
    const headers: http2.OutgoingHttpHeaders = {
      ":method": "POST",
      ":path": `/3/device/${device.token}`,
      authorization: `bearer ${providerToken()}`,
      "apns-push-type": req.pushType,
      "apns-topic": req.topic,
      "apns-priority": String(req.priority),
      "apns-expiration": String(req.expiration),
      "content-type": "application/json",
    };
    if (req.collapseId) headers["apns-collapse-id"] = req.collapseId;
    const stream = client.request(headers);
    let status = 0;
    let data = "";
    stream.setTimeout(10_000, () => {
      stream.close();
      client.close();
      resolve({ status: 0, reason: "timeout" });
    });
    stream.on("response", (h) => (status = Number(h[":status"]) || 0));
    stream.on("data", (c) => (data += c));
    stream.on("end", () => {
      client.close();
      let reason: string | undefined;
      try {
        reason = data ? (JSON.parse(data) as { reason?: string }).reason : undefined;
      } catch {
        reason = data.slice(0, 100);
      }
      resolve({ status, reason });
    });
    stream.on("error", (err) => {
      client.close();
      resolve({ status: 0, reason: err.message });
    });
    stream.end(req.body);
  });
}

/** Apple's answers that mean the token is gone for good: forget it. */
export function tokenGone(r: { status: number; reason?: string }): boolean {
  return r.status === 410 || (r.status === 400 && (r.reason === "BadDeviceToken" || r.reason === "DeviceTokenNotForTopic"));
}
