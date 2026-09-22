"use client";

import { useActionState, useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Blueprint } from "@/components/ui";
import { SubmitButton, ErrorText } from "@/components/form";
import { confirm } from "@/components/confirm-sheet";
import {
  setDocumentsPinAction,
  removeDocumentsPinAction,
  lockDocumentsAction,
  beginBiometricSetupAction,
  finishBiometricSetupAction,
  removeBiometricCredentialAction,
} from "@/lib/actions/security";
import { b64urlToBytes, bytesToB64, deviceLabel, hasPlatformAuthenticator } from "@/lib/security/browser";
import type { ActionState } from "@/lib/actions/auth";

const initialState: ActionState = { error: null };

export type EnrolledDevice = { id: string; label: string | null; createdAt: string; lastUsedAt: string | null };

/** Setting the lock up, and taking it off. Lives under the documents rather
 * than in Settings because this is the only thing it protects, and a lock
 * whose switch is three screens away from the door is one nobody finds. */
export function DocumentsLockSettings({
  hasPin,
  devices,
  unlocked,
}: {
  hasPin: boolean;
  devices: EnrolledDevice[];
  unlocked: boolean;
}) {
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(setDocumentsPinAction, initialState);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    hasPlatformAuthenticator().then(setBioAvailable);
  }, []);

  const configured = hasPin || devices.length > 0;

  const addDevice = () => {
    setBioError(null);
    startTransition(async () => {
      try {
        const options = await beginBiometricSetupAction();
        const credential = (await navigator.credentials.create({
          publicKey: {
            challenge: b64urlToBytes(options.challenge),
            rp: { id: options.rpId, name: "Kin" },
            user: {
              // The member id, not the email: this identifies the profile
              // the credential unlocks, and it must not carry anything the
              // authenticator would display to somebody else.
              id: b64urlToBytes(btoa(options.memberId).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")),
              name: options.memberName,
              displayName: options.memberName,
            },
            pubKeyCredParams: [
              { alg: -7, type: "public-key" },
              { alg: -257, type: "public-key" },
            ],
            authenticatorSelection: {
              // The phone's own face, fingerprint or passcode -- not a
              // roaming key, which would be a different feature.
              authenticatorAttachment: "platform",
              residentKey: "preferred",
              userVerification: "required",
            },
            excludeCredentials: options.excludeIds.map((id) => ({ id: b64urlToBytes(id), type: "public-key" as const })),
            timeout: 60_000,
            attestation: "none",
          },
        })) as PublicKeyCredential | null;
        if (!credential) {
          setBioError("That didn't complete. Try again.");
          return;
        }
        const response = credential.response as AuthenticatorAttestationResponse;
        const spki = response.getPublicKey?.();
        if (!spki) {
          setBioError("This browser didn't hand over the key in a form we can store. A PIN will still work.");
          return;
        }
        const result = await finishBiometricSetupAction({
          credentialId: credential.id,
          publicKeySpkiBase64: bytesToB64(spki),
          alg: response.getPublicKeyAlgorithm?.() ?? -7,
          clientDataJSON: bytesToB64(response.clientDataJSON),
          label: deviceLabel(),
        });
        if (result.error) setBioError(result.error);
        else router.refresh();
      } catch {
        setBioError("Setup didn't finish. You can try again, or just set a PIN.");
      }
    });
  };

  const run = (fn: () => Promise<ActionState>) =>
    startTransition(async () => {
      const result = await fn();
      if (result.error) setBioError(result.error);
      router.refresh();
    });

  // Unused when nothing is set up and the person has not opened the panel --
  // a household that does not want a lock should not have to look at one.
  if (!configured && !open) {
    return (
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => setOpen(true)}
        style={{ marginTop: 18, fontSize: 12.5, gap: 5, padding: "0 8px", minHeight: 30 }}
      >
        <Icon name="keyRound" size={13} />
        Lock these documents
      </button>
    );
  }

  return (
    <Blueprint style={{ padding: 14, marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Icon name="keyRound" size={15} style={{ color: "var(--color-accent-700)" }} />
        <span style={{ font: "600 14px/1 var(--font-heading)" }}>Lock on these documents</span>
        {configured && unlocked && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={pending}
            onClick={() => run(lockDocumentsAction)}
            style={{ marginLeft: "auto", minHeight: 26, fontSize: 12, padding: "0 8px" }}
          >
            Lock now
          </button>
        )}
      </div>
      <p style={{ fontSize: 12.5, lineHeight: 1.45, color: "var(--color-neutral-600)", margin: "0 0 12px" }}>
        This is a door on a room inside your own house: it stops someone holding your unlocked phone from browsing the
        family&rsquo;s papers. It is not a second password on your account.
      </p>

      {bioError && <ErrorText message={bioError} />}

      <div style={{ fontSize: 11.5, letterSpacing: ".05em", color: "var(--color-neutral-500)", marginBottom: 6 }}>
        FACE, FINGERPRINT OR DEVICE PASSCODE
      </div>
      {devices.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 8 }}>
          {devices.map((d) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <Icon name="shieldCheck" size={14} style={{ color: "var(--color-accent-700)" }} />
              <span style={{ flex: 1 }}>
                {d.label ?? "A device"}
                <span style={{ color: "var(--color-neutral-600)" }}>
                  {d.lastUsedAt ? " · used recently" : " · not used yet"}
                </span>
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={pending}
                onClick={async () => {
                  if (
                    !(await confirm({
                      title: `Forget ${d.label ?? "this device"}?`,
                      description: hasPin
                        ? "You'll still be able to unlock with your PIN."
                        : "This is your only way in. Set a PIN first, or you'll be locked out on this device.",
                      confirmLabel: "Forget it",
                    }))
                  )
                    return;
                  run(() => removeBiometricCredentialAction(d.id));
                }}
                style={{ minHeight: 26, fontSize: 12, padding: "0 7px" }}
              >
                Forget
              </button>
            </div>
          ))}
        </div>
      )}
      {bioAvailable ? (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          onClick={addDevice}
          style={{ minHeight: 32, fontSize: 12.5, padding: "0 12px", gap: 5, marginBottom: 14 }}
        >
          <Icon name="plus" size={13} />
          {devices.length === 0 ? "Use this device" : "Add this device"}
        </button>
      ) : (
        <p style={{ fontSize: 12.5, color: "var(--color-neutral-600)", margin: "0 0 14px" }}>
          This browser has no fingerprint reader, face camera or device passcode Kin can use. A PIN works everywhere.
        </p>
      )}

      <div style={{ fontSize: 11.5, letterSpacing: ".05em", color: "var(--color-neutral-500)", marginBottom: 6 }}>
        {hasPin ? "CHANGE YOUR PIN" : "SET A PIN"}
      </div>
      <form action={formAction}>
        <ErrorText message={state.error} />
        {hasPin && (
          <input
            className="input"
            name="current_pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Current PIN"
            maxLength={8}
            required
            style={{ marginBottom: 6 }}
          />
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <input
            id={`${uid}-pin`}
            className="input"
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="New PIN"
            pattern="\d{4,8}"
            maxLength={8}
            required
            style={{ flex: 1, minWidth: 110 }}
          />
          <input
            className="input"
            name="pin_confirm"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Again"
            maxLength={8}
            required
            style={{ flex: 1, minWidth: 110 }}
          />
          <SubmitButton style={{ minHeight: 40, fontSize: 13, padding: "0 12px" }}>SAVE</SubmitButton>
        </div>
      </form>

      {hasPin && (
        <button
          type="button"
          className="btn btn-ghost"
          disabled={pending}
          onClick={async () => {
            if (
              !(await confirm({
                title: "Remove your PIN?",
                description:
                  devices.length > 0
                    ? "You'll still be able to unlock with your face or fingerprint on a device you've added."
                    : "Nothing will be locked after this — the documents go back to opening straight away.",
                confirmLabel: "Remove it",
              }))
            )
              return;
            run(removeDocumentsPinAction);
          }}
          style={{ marginTop: 8, minHeight: 28, fontSize: 12, padding: "0 8px", color: "var(--color-neutral-700)" }}
        >
          Remove PIN
        </button>
      )}
    </Blueprint>
  );
}
