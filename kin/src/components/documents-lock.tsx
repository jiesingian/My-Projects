"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Blueprint } from "@/components/ui";
import { ErrorText } from "@/components/form";
import {
  unlockWithPinAction,
  beginBiometricUnlockAction,
  finishBiometricUnlockAction,
} from "@/lib/actions/security";
import { b64urlToBytes, bytesToB64url, hasPlatformAuthenticator } from "@/lib/security/browser";
import type { ActionState } from "@/lib/actions/auth";

const initialState: ActionState = { error: null };

/** The door on the documents. Shown instead of the folders, by the server,
 * so the list of what the household keeps is never rendered and then hidden
 * -- hiding it client-side would put every filename in the page source of a
 * screen that is supposed to be locked. */
export function DocumentsLock({
  hasPin,
  hasBiometric,
  title = "Documents are locked",
  blurb = "Passports, certificates and insurance live behind this. Unlocking lasts ten minutes.",
}: {
  hasPin: boolean;
  hasBiometric: boolean;
  /** The same lock guards more than one screen; each says what is behind it. */
  title?: string;
  blurb?: string;
}) {
  const router = useRouter();
  const [state, formAction, unlocking] = useActionState(unlockWithPinAction, initialState);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (hasBiometric) hasPlatformAuthenticator().then(setBioAvailable);
  }, [hasBiometric]);

  const unlockWithDevice = () => {
    setBioError(null);
    startTransition(async () => {
      try {
        const options = await beginBiometricUnlockAction();
        const credential = (await navigator.credentials.get({
          publicKey: {
            challenge: b64urlToBytes(options.challenge),
            rpId: options.rpId,
            timeout: 60_000,
            // Required, not preferred: the point of this is that the device
            // checked who was holding it, not merely that it was the device.
            userVerification: "required",
            allowCredentials: options.allowIds.map((id) => ({ id: b64urlToBytes(id), type: "public-key" as const })),
          },
        })) as PublicKeyCredential | null;
        if (!credential) {
          setBioError("That didn't complete. Try again, or use your PIN.");
          return;
        }
        const response = credential.response as AuthenticatorAssertionResponse;
        const result = await finishBiometricUnlockAction({
          credentialId: credential.id,
          authenticatorData: bytesToB64url(response.authenticatorData),
          clientDataJSON: bytesToB64url(response.clientDataJSON),
          signature: bytesToB64url(response.signature),
        });
        if (result.error) setBioError(result.error);
        else router.refresh();
      } catch {
        // A cancelled prompt throws the same way a failure does, and a
        // person who changed their mind does not need an error.
        setBioError("Unlock didn't finish. You can use your PIN instead.");
      }
    });
  };

  // The PIN pad. Digits collect here and go to the same server action the
  // text box used to, through a hidden field -- the lock rules, the try
  // limit and the ten minutes are all unchanged on the server.
  const [pin, setPin] = useState("");
  const press = (d: string) => setPin((p) => (p.length < 8 ? p + d : p));
  const back = () => setPin((p) => p.slice(0, -1));
  const formRef = useRef<HTMLFormElement>(null);

  // A wrong PIN clears the dots, the way a phone's own lock screen does.
  const [lastError, setLastError] = useState(state.error);
  if (state.error !== lastError) {
    setLastError(state.error);
    if (state.error) setPin("");
  }

  // A computer's keyboard types into the pad too.
  useEffect(() => {
    if (!hasPin) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea, select")) return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") back();
      else if (e.key === "Enter") formRef.current?.requestSubmit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasPin]);

  return (
    <Blueprint className="kin-lock" style={{ padding: "1.375rem 1.125rem", maxWidth: 380 }}>
      <div className="kin-lock-icon" aria-hidden="true">
        <Icon name="keyRound" size={22} />
      </div>
      <h3 style={{ font: "600 1.1875rem/1.2 var(--font-heading)", margin: "0 0 0.25rem", textAlign: "center" }}>{title}</h3>
      <p style={{ fontSize: "0.84375rem", lineHeight: 1.45, color: "var(--color-neutral-700)", margin: "0 0 1rem", textAlign: "center" }}>{blurb}</p>

      {/* Face ID or a fingerprint first: it is the faster of the two, and
          the PIN is right underneath for when it fails. It needs the tap --
          browsers only raise the prompt for something a person pressed. */}
      {bioAvailable && (
        <>
          <button type="button" className="btn btn-primary" disabled={pending} onClick={unlockWithDevice} style={{ width: "100%", gap: "0.4375rem", minHeight: "3rem" }}>
            <Icon name="shieldCheck" size={18} />
            Unlock with Face ID or fingerprint
          </button>
          {bioError && <ErrorText message={bioError} />}
          {hasPin && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5625rem", margin: "14px 0 12px" }}>
              <span style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
              <span style={{ fontSize: "0.71875rem", letterSpacing: ".06em", color: "var(--color-neutral-500)" }}>OR ENTER YOUR PIN</span>
              <span style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
            </div>
          )}
        </>
      )}

      {hasPin && (
        <form ref={formRef} action={formAction} className="kin-pinpad">
          <input type="hidden" name="pin" value={pin} />
          <div className="kin-pin-dots" role="img" aria-label={`${pin.length} digit${pin.length === 1 ? "" : "s"} entered`}>
            {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
              <span key={i} data-filled={i < pin.length || undefined} />
            ))}
          </div>
          <ErrorText message={state.error} />
          <div className="kin-pin-keys">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button key={d} type="button" className="kin-pin-key" onClick={() => press(d)}>
                {d}
              </button>
            ))}
            <span />
            <button type="button" className="kin-pin-key" onClick={() => press("0")}>
              0
            </button>
            <button type="button" className="kin-pin-key kin-pin-back" onClick={back} aria-label="Delete a digit" disabled={pin.length === 0}>
              ⌫
            </button>
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={pin.length < 4 || unlocking}>
            {unlocking ? "Unlocking…" : "Unlock"}
          </button>
        </form>
      )}

      {!hasPin && !bioAvailable && (
        <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", margin: 0 }}>
          This account unlocks with a device that isn&rsquo;t this one. Open Kin on the phone or laptop you set up, or
          add a PIN there as a backup.
        </p>
      )}
    </Blueprint>
  );
}
