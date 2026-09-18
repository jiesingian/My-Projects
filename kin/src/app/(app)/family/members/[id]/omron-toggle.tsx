"use client";

import { useState, useTransition } from "react";
import { toggleOmronAction } from "@/lib/actions/health";

export function OmronToggle({ memberId, connected }: { memberId: string; connected: boolean }) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className={`btn ${connected ? "btn-secondary" : "btn-primary"} btn-block`}
        style={{ minHeight: 42, fontSize: 14, letterSpacing: ".04em" }}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const { error } = await toggleOmronAction(memberId, !connected);
            setFailed(error);
          })
        }
      >
        {pending ? "…" : connected ? "DISCONNECT DEVICE" : "CONNECT OMRON CONNECT"}
      </button>
      {failed && (
        <p role="alert" style={{ fontSize: 13, color: "var(--color-accent-700)", marginTop: 6 }}>
          {failed}
        </p>
      )}
    </>
  );
}
