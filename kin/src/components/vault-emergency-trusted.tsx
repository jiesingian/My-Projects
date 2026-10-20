"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Blueprint } from "@/components/ui";
import { requestEmergencyAccessAction } from "@/lib/actions/vault-emergency";
import { REASON_MAX, reasonProblem, waitLabel, type EmergencyStatus } from "@/lib/vault-emergency";

export type NamedByView = {
  familyId: string;
  /** "Emergency access to the Santos household's vault". */
  title: string;
  waitDays: number;
  /** The latest request to this household, if any, worded on the server. */
  latest: { id: string; status: EmergencyStatus; line: string } | null;
  /** The request whose access is open now, if any: the latest, or an older
   * one still running while a newer request to renew it waits. */
  open: { id: string; status: EmergencyStatus; line: string } | null;
};

/** Emergency access, the trusted person's side: the card for the household
 * that named them (their own, since 20261020170000). Asking needs a short
 * reason, which every other grown-up sees in the push. Once open, the card
 * leads to a read-only view of the vault, parents-only documents marked to
 * share included. */
export function VaultEmergencyTrusted({ households }: { households: NamedByView[] }) {
  return (
    <>
      {households.map((h) => (
        <Card key={h.familyId} h={h} />
      ))}
    </>
  );
}

function Card({ h }: { h: NamedByView }) {
  const router = useRouter();
  const uid = useId();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // One waiting request at a time (the database says the same). While
  // access is open, asking again is how it is renewed past its 30 days.
  const canAsk = h.latest?.status !== "waiting";

  const ask = () => {
    const problem = reasonProblem(reason);
    if (problem) {
      setError(problem);
      return;
    }
    startTransition(async () => {
      setError(null);
      const result = await requestEmergencyAccessAction(h.familyId, reason);
      if (result.error) setError(result.error);
      else setReason("");
      router.refresh();
    });
  };

  return (
    <Blueprint style={{ padding: "0.875rem", marginTop: "1.25rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
        <Icon name="shieldCheck" size={15} style={{ color: "var(--color-accent-700)" }} />
        <span style={{ font: "600 0.875rem/1.25 var(--font-heading)" }}>{h.title}</span>
      </div>

      {h.open && <p style={{ fontSize: "0.8125rem", lineHeight: 1.45, margin: "0 0 0.5rem" }}>{h.open.line}</p>}
      {h.latest && h.latest.id !== h.open?.id && <p style={{ fontSize: "0.8125rem", lineHeight: 1.45, margin: "0 0 0.5rem" }}>{h.latest.line}</p>}

      {h.open && (
        <Link href={`/settings/privacy/emergency/${h.open.id}`} className="btn btn-primary btn-block" style={{ minHeight: "2.5rem", fontSize: "0.875rem" }}>
          Open their vault (read-only)
        </Link>
      )}

      {canAsk && (
        <>
          <p style={{ fontSize: "0.8125rem", lineHeight: 1.45, color: "var(--color-neutral-700)", margin: h.open ? "0.75rem 0 0.625rem" : "0 0 0.625rem" }}>
            {h.open
              ? `Still need it after that? Ask again. The other grown-ups are told again and can say no, and if nobody does within ${waitLabel(h.waitDays)}, it runs another 30 days from then.`
              : `Only for when the parent who keeps the vault can't be reached. Every other grown-up here is told at once and can say no. If nobody does within ${waitLabel(h.waitDays)}, you can read the vault for 30 days, parents-only documents marked to share included, and they see each item you open.`}
          </p>
          <div className="kin-vault-form">
            <div className="field">
              <label htmlFor={`${uid}-why`}>Why you need it</label>
              <textarea
                id={`${uid}-why`}
                className="input"
                rows={2}
                maxLength={REASON_MAX}
                placeholder="Ate is in hospital and we need her PhilHealth card"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={pending}
              />
            </div>
            {error && <p className="kin-vault-error" role="alert">{error}</p>}
            <button type="button" className="btn btn-secondary btn-block" disabled={pending} onClick={ask}>
              {pending ? "Asking…" : "Request access"}
            </button>
          </div>
        </>
      )}
    </Blueprint>
  );
}
