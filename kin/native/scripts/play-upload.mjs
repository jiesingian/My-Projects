// Uploads a signed Kin AAB to a Google Play track (play-release.yml), through
// the Play Developer API with a service account. No dependencies: the token
// is the service account's own signed request, as in lib/fcm.ts.
//
//   PLAY_SERVICE_ACCOUNT_JSON='{...}' node scripts/play-upload.mjs <file.aab> [track]
//
// The track defaults to "internal". A new app that has never been rolled out
// is a "draft app", and Google takes only draft releases for it; then the
// release is made a draft, and Jonathan presses "Start rollout" in the Play
// Console once (SETUP_FOR_JONATHAN.md, the Android app on Google Play).
// Never prints the key.

import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";

const PACKAGE = "com.jiesingian.kin";
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}`;
const UPLOAD = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PACKAGE}`;

const [file, track = "internal"] = process.argv.slice(2);
if (!file) {
  console.error("Usage: node scripts/play-upload.mjs <file.aab> [track]");
  process.exit(2);
}

let account;
try {
  account = JSON.parse(process.env.PLAY_SERVICE_ACCOUNT_JSON ?? "");
} catch {
  console.error("PLAY_SERVICE_ACCOUNT_JSON is not the service account's JSON key file.");
  process.exit(2);
}

const b64url = (b) => Buffer.from(b).toString("base64url");

async function accessToken() {
  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/androidpublisher",
      aud: "https://oauth2.googleapis.com/token",
      iat,
      exp: iat + 3600,
    }),
  );
  const signature = b64url(sign("sha256", Buffer.from(`${header}.${claims}`), createPrivateKey(account.private_key)));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${signature}` }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`Google refused the service account (${res.status} ${j.error ?? ""}). Is the key current?`);
  return j.access_token;
}

async function call(token, method, url, body, contentType = "application/json") {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": contentType } : {}) },
    body: body === undefined ? undefined : contentType === "application/json" ? JSON.stringify(body) : body,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`${method} ${url.replace(API, "").replace(UPLOAD, "")}: ${res.status} ${j.error?.message ?? ""}`);
    err.status = res.status;
    err.detail = j.error?.message ?? "";
    throw err;
  }
  return j;
}

async function release(token, status) {
  const edit = await call(token, "POST", `${API}/edits`, {});
  const bundle = await call(token, "POST", `${UPLOAD}/edits/${edit.id}/bundles?uploadType=media`, readFileSync(file), "application/octet-stream");
  console.log(`Uploaded versionCode ${bundle.versionCode}.`);
  await call(token, "PUT", `${API}/edits/${edit.id}/tracks/${track}`, {
    track,
    releases: [{ versionCodes: [String(bundle.versionCode)], status }],
  });
  await call(token, "POST", `${API}/edits/${edit.id}:commit`);
  return bundle.versionCode;
}

try {
  const token = await accessToken();
  try {
    const v = await release(token, "completed");
    console.log(`versionCode ${v} is out to the ${track} track.`);
  } catch (err) {
    if (!/draft/i.test(err.detail ?? "")) throw err;
    console.log("Google takes only drafts until the app's first rollout; uploading it as a draft.");
    const v = await release(token, "draft");
    console.log(`versionCode ${v} is a draft on the ${track} track: press "Start rollout" in the Play Console (Testing -> Internal testing).`);
  }
} catch (err) {
  console.error(err.message);
  if (err.status === 401 || err.status === 403) {
    console.error("The service account has no access to Kin yet: invite its email in Play Console -> Users and permissions, with the app's release permissions.");
  }
  if (err.status === 404) {
    console.error("Google Play has no app com.jiesingian.kin yet: create it in the Play Console and upload the first AAB by hand.");
  }
  process.exit(1);
}
