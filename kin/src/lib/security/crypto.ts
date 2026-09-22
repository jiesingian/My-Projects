import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, webcrypto } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);

/** base64url in, bytes out. The WebAuthn APIs speak base64url and Node's
 * Buffer speaks base64, and the two differ in three characters -- which is
 * exactly the sort of thing that works on every credential you test with and
 * fails on somebody's Android. */
export function fromBase64Url(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function toBase64Url(bytes: Buffer | Uint8Array): string {
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function sha256(data: Buffer | Uint8Array | string): Buffer {
  return createHash("sha256").update(data).digest();
}

export function randomToken(): string {
  return toBase64Url(randomBytes(32));
}

/** Compares without leaking, through timing, how much of the value was
 * right. Length is compared first because timingSafeEqual throws on a
 * mismatch rather than returning false. */
export function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** scrypt at the Node defaults, which are deliberately slow. A four-digit
 * PIN has ten thousand possibilities and a fast hash would make the whole
 * thing decorative; the lockout in member_security is the other half of
 * that, because slow is not the same as impossible. */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const derived = (await scrypt(pin.normalize("NFKC"), salt, 64)) as Buffer;
  return derived.toString("hex");
}

export function newSalt(): string {
  return randomBytes(16).toString("hex");
}

export const subtle: SubtleCrypto = (webcrypto as unknown as Crypto).subtle;
