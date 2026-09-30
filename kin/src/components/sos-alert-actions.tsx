"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { useCalls } from "@/components/call-provider";
import { sosAction } from "@/lib/actions/sos";
import styles from "./member-card.module.css";

/** The buttons on an SOS alert's page: a Kin call to the person who sent it,
 * and "I'm on it" (a grown-up) or "I'm safe now" (the sender). */
export function SosAlertActions({ id, callMemberId, callName, canSafe, canHandle }: { id: string; callMemberId: string | null; callName: string; canSafe: boolean; canHandle: boolean }) {
  const calls = useCalls();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inApp = callMemberId && calls?.members.find((m) => m.id === callMemberId)?.callable && !calls.busy;

  const act = (action: "safe" | "handling") =>
    startTransition(async () => {
      setError(null);
      const res = await sosAction(id, action);
      if (res.error) setError(res.error);
      else router.refresh();
    });

  if (!inApp && !canSafe && !canHandle) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.875rem" }}>
      {inApp && (
        <button type="button" className="btn btn-primary btn-block" onClick={() => calls!.start(callMemberId!, false)}>
          <Icon name="phone" size={16} /> Call {callName} in Kin
        </button>
      )}
      {canHandle && (
        <button type="button" className={`btn btn-secondary btn-block ${styles.cancel}`} disabled={pending} onClick={() => act("handling")}>
          I&rsquo;m on it
        </button>
      )}
      {canSafe && (
        <button type="button" className={`btn btn-secondary btn-block ${styles.cancel}`} disabled={pending} onClick={() => act("safe")}>
          I&rsquo;m safe now
        </button>
      )}
      {error && (
        <p role="alert" style={{ margin: 0, fontSize: "0.8125rem", color: "#d13438" }}>
          {error}
        </p>
      )}
    </div>
  );
}
