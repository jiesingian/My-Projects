import { test, expect } from "@playwright/test";
import { generateKeyPairSync, verify } from "node:crypto";
import { fcmConfigured, fcmDevice, fcmMessage, fcmServiceAccount, fcmTokenGone, fcmWakeMessage, serviceAccountAssertion } from "@/lib/fcm";
import { FCM_PREFIX, NATIVE_KEY, fcmEndpoint, tokenEndpoint, usableToken } from "@/lib/native";

/** Firebase push for the Kin Android app (29 October): how its token is
 * kept, what a push becomes, and the service account's signed request. */

const TOKEN = "dQw4w9WgXcQ:APA91bH" + "x".repeat(140);
const ring = { title: "Ann is calling", body: "Kin video call · tap to answer", url: "/chat/household", tag: "call-ann", ring: true, call: { id: "c1", from: "ann", video: true } };
const sos = { title: "SOS from Kid", body: "Tap to see where", url: "/today/sos/s1", tag: "sos-s1", urgent: true };
const plain = { title: "Milk was added", body: "To-Buy", url: "/household?seg=buy", tag: "buy" };

test("the Android token is kept under Kin's own address, never read as Chrome's Web Push", () => {
  const ep = fcmEndpoint(TOKEN);
  expect(ep).toBe(FCM_PREFIX + TOKEN);
  expect(tokenEndpoint({ channel: "fcm", token: TOKEN, env: "production" })).toBe(ep);
  expect(fcmDevice({ endpoint: ep, p256dh: NATIVE_KEY, auth: "fcm" })).toEqual({ endpoint: ep, token: TOKEN });
  // Chrome's own subscriptions live on fcm.googleapis.com/fcm/send/.
  expect(fcmDevice({ endpoint: `https://fcm.googleapis.com/fcm/send/${TOKEN}`, p256dh: "BNc...", auth: "x" })).toBeNull();
  expect(fcmDevice({ endpoint: `https://fcm.googleapis.com/fcm/send/${TOKEN}`, p256dh: NATIVE_KEY, auth: "fcm" })).toBeNull();
  expect(fcmDevice({ endpoint: ep, p256dh: "BNc...", auth: "fcm" })).toBeNull();
  expect(fcmDevice({ endpoint: FCM_PREFIX + "bad token!", p256dh: NATIVE_KEY, auth: "fcm" })).toBeNull();
});

test("tokens the app hands over are checked", () => {
  expect(usableToken({ channel: "fcm", token: TOKEN, env: "production" })).toBe(true);
  expect(usableToken({ channel: "fcm", token: "short", env: "production" })).toBe(false);
  expect(usableToken({ channel: "alert", token: "a".repeat(64), env: "production" })).toBe(true);
  expect(usableToken({ channel: "alert", token: TOKEN, env: "production" })).toBe(false);
  expect(usableToken({ channel: "other", token: TOKEN })).toBe(false);
});

test("a ring is a high-priority data message the app turns into the full-screen call, kept a minute", () => {
  const m = fcmMessage({ token: TOKEN }, ring)!.message as { token: string; data: Record<string, string>; android: Record<string, unknown> };
  expect(m.token).toBe(TOKEN);
  expect(m.data).toEqual({ kind: "ring", call_id: "c1", call_from: "ann", video: "true", caller: "Ann", url: "/chat/household" });
  expect(m.android).toEqual({ priority: "high", ttl: "60s" });
  // The caller's phone repeats the ring; the notification already rings.
  expect(fcmMessage({ token: TOKEN }, { ...ring, again: true })).toBeNull();
});

test("an SOS goes urgent and high; an ordinary push normal, collapsed by its tag", () => {
  const s = fcmMessage({ token: TOKEN }, sos)!.message as { data: Record<string, string>; android: Record<string, unknown> };
  expect(s.data.kind).toBe("notify");
  expect(s.data.urgent).toBe("true");
  expect(s.android).toEqual({ priority: "high", ttl: "3600s", collapse_key: "sos-s1" });
  const p = fcmMessage({ token: TOKEN }, plain, { ttlSeconds: 600 })!.message as { data: Record<string, string>; android: Record<string, unknown> };
  expect(p.data).toEqual({ kind: "notify", title: "Milk was added", body: "To-Buy", url: "/household?seg=buy", tag: "buy", urgent: "false" });
  expect(p.android).toEqual({ priority: "normal", ttl: "600s", collapse_key: "buy" });
  // Only ever a Kin page.
  expect((fcmMessage({ token: TOKEN }, { ...plain, url: "https://evil.example" })!.message as { data: Record<string, string> }).data.url).toBe("/today");
});

test("only Google's 'gone' answers forget the token", () => {
  expect(fcmTokenGone({ status: 404, reason: "UNREGISTERED" })).toBe(true);
  expect(fcmTokenGone({ status: 400, reason: "INVALID_ARGUMENT" })).toBe(false);
  expect(fcmTokenGone({ status: 429, reason: "QUOTA_EXCEEDED" })).toBe(false);
});

test("off until all three FCM_* keys exist; the service account's request is RS256, signed with its key", () => {
  const keep = { p: process.env.FCM_PROJECT_ID, e: process.env.FCM_CLIENT_EMAIL, k: process.env.FCM_PRIVATE_KEY };
  try {
    delete process.env.FCM_PROJECT_ID;
    delete process.env.FCM_CLIENT_EMAIL;
    delete process.env.FCM_PRIVATE_KEY;
    expect(fcmConfigured()).toBe(false);
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    process.env.FCM_PROJECT_ID = "kin-family";
    process.env.FCM_CLIENT_EMAIL = "kin-push@kin-family.iam.gserviceaccount.com";
    expect(fcmConfigured()).toBe(false);
    process.env.FCM_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString().replace(/\n/g, "\\n");
    expect(fcmConfigured()).toBe(true);
    const now = Date.parse("2026-10-29T00:00:00Z");
    const [h, c, sig] = serviceAccountAssertion(now).split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    const claims = JSON.parse(Buffer.from(c, "base64url").toString());
    expect(claims).toEqual({
      iss: "kin-push@kin-family.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now / 1000,
      exp: now / 1000 + 3600,
    });
    expect(verify("sha256", Buffer.from(`${h}.${c}`), publicKey, Buffer.from(sig, "base64url"))).toBe(true);
  } finally {
    for (const [k, v] of [["FCM_PROJECT_ID", keep.p], ["FCM_CLIENT_EMAIL", keep.e], ["FCM_PRIVATE_KEY", keep.k]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("the daily alarm re-sync is a silent data message the app answers, never a notification", () => {
  const m = fcmWakeMessage({ token: TOKEN }).message as { token: string; data: Record<string, string>; android: Record<string, unknown>; notification?: unknown };
  expect(m.token).toBe(TOKEN);
  // KinMessagingService looks for exactly this, before anything is shown.
  expect(m.data).toEqual({ sync: "alarms" });
  expect(m.notification).toBeUndefined();
  expect(m.android).toEqual({ priority: "normal", ttl: "86400s", collapse_key: "kin-alarm-sync" });
});

test("the whole key file pasted as one value is enough; a bad paste leaves push off", () => {
  const names = ["FCM_SERVICE_ACCOUNT_JSON", "FCM_PROJECT_ID", "FCM_CLIENT_EMAIL", "FCM_PRIVATE_KEY"] as const;
  const keep = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  try {
    for (const n of names) delete process.env[n];
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    // As Google writes it: the key's newlines are \n inside the JSON string.
    const file = JSON.stringify({
      type: "service_account",
      project_id: "family-app-kin-1a2b3",
      private_key_id: "abc",
      private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      client_email: "firebase-adminsdk-x@family-app-kin-1a2b3.iam.gserviceaccount.com",
    }, null, 2);
    process.env.FCM_SERVICE_ACCOUNT_JSON = `\n${file}\n`;
    expect(fcmConfigured()).toBe(true);
    expect(fcmServiceAccount()?.projectId).toBe("family-app-kin-1a2b3");
    const [h, c, sig] = serviceAccountAssertion(Date.parse("2026-10-30T00:00:00Z")).split(".");
    expect(JSON.parse(Buffer.from(c, "base64url").toString()).iss).toBe("firebase-adminsdk-x@family-app-kin-1a2b3.iam.gserviceaccount.com");
    expect(verify("sha256", Buffer.from(`${h}.${c}`), publicKey, Buffer.from(sig, "base64url"))).toBe(true);
    // Half a file, or the wrong file (google-services.json), is not a service account.
    process.env.FCM_SERVICE_ACCOUNT_JSON = file.slice(0, 200);
    expect(fcmConfigured()).toBe(false);
    process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_info: { project_id: "x" }, client: [] });
    expect(fcmConfigured()).toBe(false);
  } finally {
    for (const n of names) {
      if (keep[n] === undefined) delete process.env[n];
      else process.env[n] = keep[n];
    }
  }
});
