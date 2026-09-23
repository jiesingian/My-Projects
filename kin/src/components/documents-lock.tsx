"use client";

import { useActionState, useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Blueprint } from "@/components/ui";
import { SubmitButton, ErrorText } from "@/components/form";
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
export function DocumentsLock({ hasPin, hasBiometric }: { hasPin: boolean; hasBiometric: boolean }) {
  const router = useRouter();
  const uid = useId();
  const [state, formAction] = useActionState(unlockWithPinAction, initialState);
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

  return (
    <Blueprint style={{ padding: "1.375rem 1.125rem", maxWidth: 380 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.375rem" }}>
        <Icon name="keyRound" size={18} style={{ color: "var(--color-accent-700)" }} />
        <h3 style={{ font: "600 1.125rem/1.2 var(--font-heading)", margin: 0 }}>Documents are locked</h3>
      </div>
      <p style={{ fontSize: "0.84375rem", lineHeight: 1.45, color: "var(--color-neutral-700)", margin: "0 0 16px" }}>
        Passports, certificates and insurance live behind this. Unlocking lasts ten minutes.
      </p>

      {bioAvailable && (
        <>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={unlockWithDevice}
            style={{ width: "100%", gap: "0.4375rem" }}
          >
            <Icon name="shieldCheck" size={16} />
            Unlock with this device
          </button>
          {bioError && <ErrorText message={bioError} />}
          {hasPin && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5625rem", margin: "14px 0 12px" }}>
              <span style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
              <span style={{ fontSize: "0.71875rem", letterSpacing: ".06em", color: "var(--color-neutral-500)" }}>OR</span>
              <span style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
            </div>
          )}
        </>
      )}

      {hasPin && (
        <form action={formAction}>
          <ErrorText message={state.error} />
          <label htmlFor={`${uid}-pin`} style={{ display: "block", fontSize: "0.71875rem", color: "var(--color-neutral-600)", marginBottom: "0.25rem" }}>
            PIN
          </label>
          <input
            id={`${uid}-pin`}
            className="input"
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            pattern="\d{4,8}"
            maxLength={8}
            required
            autoFocus={!bioAvailable}
            style={{ letterSpacing: ".3em", marginBottom: "0.625rem" }}
          />
          <SubmitButton style={{ width: "100%" }}>UNLOCK</SubmitButton>
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
