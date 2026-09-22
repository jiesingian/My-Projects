import { fromBase64Url, sha256, subtle } from "@/lib/security/crypto";

/** Node's Buffer can sit on a SharedArrayBuffer, which WebCrypto's types
 * refuse. Copying into a plain Uint8Array is one allocation and removes the
 * whole question. */
function bytes(b: Buffer): Uint8Array<ArrayBuffer> {
  return new Uint8Array(b);
}

/** Verifying a WebAuthn assertion, using nothing but Node's own WebCrypto.
 *
 * The usual reason to reach for a library here is the registration step,
 * where the public key is buried in a CBOR attestation object. We do not
 * parse that at all: the browser's own getPublicKey() hands back SPKI DER,
 * which crypto.subtle.importKey takes directly. What is left is the
 * assertion check below, which is a fixed list of comparisons out of the
 * specification, and writing those out is clearer than a dependency.
 *
 * Every check here is load-bearing. Dropping any one of them leaves
 * something that looks like it works. */

export const ES256 = -7;
export const RS256 = -257;

type AssertionInput = {
  publicKeySpkiBase64: string;
  alg: number;
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
  expectedChallenge: string;
  expectedOrigin: string;
  expectedRpId: string;
  storedSignCount: number;
};

export type AssertionResult = { ok: true; signCount: number } | { ok: false; reason: string };

export async function verifyAssertion(input: AssertionInput): Promise<AssertionResult> {
  const authData = fromBase64Url(input.authenticatorData);
  const clientDataBytes = fromBase64Url(input.clientDataJSON);
  const signature = fromBase64Url(input.signature);

  if (authData.length < 37) return { ok: false, reason: "That sign-in response was malformed." };

  let clientData: { type?: string; challenge?: string; origin?: string };
  try {
    clientData = JSON.parse(clientDataBytes.toString("utf8"));
  } catch {
    return { ok: false, reason: "That sign-in response was malformed." };
  }

  // The challenge binds this signature to the request we just issued. Without
  // it, a signature captured once would unlock forever.
  if (clientData.type !== "webauthn.get") return { ok: false, reason: "That sign-in response was for something else." };
  if (clientData.challenge !== input.expectedChallenge) return { ok: false, reason: "That unlock attempt has expired. Try again." };
  // And the origin binds it to this site, so a credential cannot be driven
  // from a page the family did not open.
  if (clientData.origin !== input.expectedOrigin) return { ok: false, reason: "That unlock came from the wrong place." };

  const rpIdHash = authData.subarray(0, 32);
  if (!rpIdHash.equals(sha256(input.expectedRpId))) return { ok: false, reason: "That unlock came from the wrong place." };

  const flags = authData[32];
  const userPresent = (flags & 0x01) !== 0;
  const userVerified = (flags & 0x04) !== 0;
  if (!userPresent) return { ok: false, reason: "Nobody actually confirmed that." };
  // User verification is the whole feature. Without this bit the device
  // proved it holds the key but not that its owner was there -- which is a
  // pocket, not a face.
  if (!userVerified) return { ok: false, reason: "Your device didn't check it was you. Use your PIN instead." };

  const signCount = authData.readUInt32BE(33);
  // Many platform authenticators always report zero; only a pair of real
  // counters can say anything, and going backwards means a cloned key.
  if (signCount !== 0 && input.storedSignCount !== 0 && signCount <= input.storedSignCount) {
    return { ok: false, reason: "That credential looks wrong. Use your PIN and set it up again." };
  }

  const algorithm =
    input.alg === ES256
      ? ({ name: "ECDSA", namedCurve: "P-256" } as const)
      : input.alg === RS256
        ? ({ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as const)
        : null;
  if (!algorithm) return { ok: false, reason: "That device uses a signature we don't support. Use your PIN." };

  const spki = Buffer.from(input.publicKeySpkiBase64, "base64");
  let key: CryptoKey;
  try {
    key = await subtle.importKey("spki", bytes(spki), algorithm, false, ["verify"]);
  } catch {
    return { ok: false, reason: "That credential could not be read. Use your PIN and set it up again." };
  }

  const signed = Buffer.concat([authData, sha256(clientDataBytes)]);
  const verifyParams =
    input.alg === ES256 ? ({ name: "ECDSA", hash: "SHA-256" } as const) : ({ name: "RSASSA-PKCS1-v1_5" } as const);

  // ECDSA signatures arrive DER-wrapped from WebAuthn; WebCrypto wants the
  // raw r||s pair.
  const sig = input.alg === ES256 ? derToRawEcdsa(signature) : signature;
  if (!sig) return { ok: false, reason: "That sign-in response was malformed." };

  const ok = await subtle.verify(verifyParams, key, bytes(sig), bytes(signed));
  if (!ok) return { ok: false, reason: "That didn't match. Try again, or use your PIN." };

  return { ok: true, signCount };
}

/** DER SEQUENCE { INTEGER r, INTEGER s } to the fixed 64 bytes WebCrypto
 * expects. DER integers are signed, so a leading zero is stripped and a
 * short value is left-padded. */
function derToRawEcdsa(der: Buffer): Buffer | null {
  if (der.length < 8 || der[0] !== 0x30) return null;
  let offset = 2;
  if (der[1] & 0x80) offset += der[1] & 0x7f;

  const read = (): Buffer | null => {
    if (der[offset] !== 0x02) return null;
    const length = der[offset + 1];
    const start = offset + 2;
    if (start + length > der.length) return null;
    offset = start + length;
    let value = der.subarray(start, start + length);
    while (value.length > 32 && value[0] === 0x00) value = value.subarray(1);
    if (value.length > 32) return null;
    return Buffer.concat([Buffer.alloc(32 - value.length), value]);
  };

  const r = read();
  const s = read();
  return r && s ? Buffer.concat([r, s]) : null;
}
