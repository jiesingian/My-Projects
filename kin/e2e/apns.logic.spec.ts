import { test, expect } from "@playwright/test";
import { generateKeyPairSync, verify } from "node:crypto";
import { apnsRequest, nativeDevice, nativeEndpoint, providerToken, tokenGone, NATIVE_KEY } from "@/lib/apns";

/** Apple's push for the Kin iPhone app (29 October): which of the app's two
 * tokens a push goes to, what Apple is sent, and the provider token. */

const TOKEN = "a".repeat(64);
const now = new Date("2026-10-29T00:00:00Z");
const nowS = Math.floor(now.getTime() / 1000);
const ring = { title: "Ann is calling", body: "Kin video call · tap to answer", url: "/chat/household", tag: "call-ann", ring: true, call: { id: "c1", from: "ann", video: true } };
const sos = { title: "SOS from Kid", body: "Tap to see where", url: "/today/sos/s1", tag: "sos-s1", urgent: true };
const plain = { title: "Milk was added", body: "To-Buy", url: "/household?seg=buy", tag: "buy" };

test("the app's token is kept under Apple's own address, and read back", () => {
  const ep = nativeEndpoint(TOKEN, "production");
  expect(ep).toBe(`https://api.push.apple.com/3/device/${TOKEN}`);
  expect(nativeDevice({ endpoint: ep, p256dh: NATIVE_KEY, auth: "voip" })).toEqual({ endpoint: ep, token: TOKEN, env: "production", channel: "voip" });
  expect(nativeDevice({ endpoint: nativeEndpoint(TOKEN, "sandbox"), p256dh: NATIVE_KEY, auth: "alert" })?.env).toBe("sandbox");
});

test("a browser's subscription, even Safari's, is never read as the app's", () => {
  expect(nativeDevice({ endpoint: "https://web.push.apple.com/QWxs", p256dh: "BNc...", auth: "x" })).toBeNull();
  expect(nativeDevice({ endpoint: `https://api.push.apple.com/3/device/${TOKEN}`, p256dh: "BNc...", auth: "alert" })).toBeNull();
  expect(nativeDevice({ endpoint: `https://evil.example/3/device/${TOKEN}`, p256dh: NATIVE_KEY, auth: "alert" })).toBeNull();
  expect(nativeDevice({ endpoint: `https://api.push.apple.com/3/device/${TOKEN}`, p256dh: NATIVE_KEY, auth: "other" })).toBeNull();
});

test("a ring goes only on the VoIP token, and nothing else ever does", () => {
  const voip = apnsRequest({ channel: "voip" }, ring, now)!;
  expect(voip.pushType).toBe("voip");
  expect(voip.topic).toBe("com.jiesingian.kin.voip");
  expect(voip.priority).toBe(10);
  expect(voip.expiration).toBe(nowS + 60);
  expect(JSON.parse(voip.body)).toEqual({ call: ring.call, caller: "Ann", url: "/chat/household" });
  expect(apnsRequest({ channel: "alert" }, ring, now)).toBeNull();
  // The caller's phone repeats the ring; the app takes the first only.
  expect(apnsRequest({ channel: "voip" }, { ...ring, again: true }, now)).toBeNull();
  expect(apnsRequest({ channel: "voip" }, sos, now)).toBeNull();
  expect(apnsRequest({ channel: "voip" }, plain, now)).toBeNull();
});

test("an SOS is time-sensitive, or a Critical Alert once Apple grants it", () => {
  const t = apnsRequest({ channel: "alert" }, sos, now)!;
  const tb = JSON.parse(t.body);
  expect(tb.aps["interruption-level"]).toBe("time-sensitive");
  expect(tb.aps.sound).toBe("default");
  expect(t.priority).toBe(10);
  expect(t.expiration).toBe(nowS + 3600);
  const c = JSON.parse(apnsRequest({ channel: "alert" }, sos, now, { critical: true })!.body);
  expect(c.aps["interruption-level"]).toBe("critical");
  expect(c.aps.sound).toEqual({ critical: 1, name: "default", volume: 1 });
  expect(c.url).toBe("/today/sos/s1");
});

test("an ordinary push is a plain alert, kept as long as Web Push keeps it", () => {
  const r = apnsRequest({ channel: "alert" }, plain, now, { critical: true, ttlSeconds: 600 })!;
  const b = JSON.parse(r.body);
  expect(b.aps["interruption-level"]).toBe("active");
  expect(b.aps.alert).toEqual({ title: "Milk was added", body: "To-Buy" });
  expect(r.priority).toBe(5);
  expect(r.expiration).toBe(nowS + 600);
  expect(r.collapseId).toBe("buy");
});

test("Apple's 'gone' answers forget the token; others don't", () => {
  expect(tokenGone({ status: 410 })).toBe(true);
  expect(tokenGone({ status: 400, reason: "BadDeviceToken" })).toBe(true);
  expect(tokenGone({ status: 400, reason: "BadTopic" })).toBe(false);
  expect(tokenGone({ status: 429 })).toBe(false);
});

test("the provider token is ES256, signed with the key, and names the key and team", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  process.env.APNS_KEY_ID = "ABC123DEFG";
  process.env.APNS_TEAM_ID = "TEAM123456";
  process.env.APNS_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const jwt = providerToken(now.getTime());
  const [h, c, s] = jwt.split(".");
  expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "ES256", kid: "ABC123DEFG" });
  expect(JSON.parse(Buffer.from(c, "base64url").toString())).toEqual({ iss: "TEAM123456", iat: nowS });
  expect(verify("sha256", Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"))).toBe(true);
  // Reused within the hour Apple allows.
  expect(providerToken(now.getTime() + 10 * 60_000)).toBe(jwt);
});
