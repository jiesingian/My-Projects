import { test, expect } from "@playwright/test";
import { revokeGoogleToken } from "@/lib/google-revoke";

/** Deleting an account takes Kin's access back at Google too (legal
 * readiness, 29 October; app/api/cron/account-deletions). */

function capture() {
  const calls: { url: string; body: string }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? "") });
    return new Response("", { status: 200 });
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = real) };
}

test("no token, nothing is sent", async () => {
  const f = capture();
  await revokeGoogleToken(null);
  await revokeGoogleToken({ refresh_token: null, access_token: null });
  f.restore();
  expect(f.calls).toEqual([]);
});

test("the refresh token is revoked, in the body and never in the address", async () => {
  const f = capture();
  await revokeGoogleToken({ refresh_token: "r-1", access_token: "a-1" });
  f.restore();
  expect(f.calls).toHaveLength(1);
  expect(f.calls[0].url).toBe("https://oauth2.googleapis.com/revoke");
  expect(f.calls[0].body).toBe("token=r-1");
});

test("with only an access token, that one is revoked", async () => {
  const f = capture();
  await revokeGoogleToken({ access_token: "a-1" });
  f.restore();
  expect(f.calls[0].body).toBe("token=a-1");
});
