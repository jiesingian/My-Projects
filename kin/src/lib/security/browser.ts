/** base64url helpers for the browser half of WebAuthn. Deliberately separate
 * from lib/security/crypto.ts, which imports node:crypto and must never be
 * pulled into a client bundle. */

export function b64urlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function bytesToB64(buffer: ArrayBuffer): string {
  const view = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
  return btoa(binary);
}

export function bytesToB64url(buffer: ArrayBuffer): string {
  return bytesToB64(buffer).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Is there a fingerprint reader, a face camera or a device passcode behind
 * this browser? Anything else -- a security key, an unsupported browser --
 * falls back to the PIN rather than offering a button that cannot work. */
export async function hasPlatformAuthenticator(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** A short name for the device, so a list of three credentials is not three
 * identical rows. Best-effort by design: it is a label, not a claim. */
export function deviceLabel(): string {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android phone";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  return "This device";
}
