"use client";

import { useTransition } from "react";
import { toggleOmronAction } from "@/lib/actions/health";

export function OmronToggle({
  memberId,
  familyId,
  connected,
}: {
  memberId: string;
  familyId: string;
  connected: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className={`btn ${connected ? "btn-secondary" : "btn-primary"} btn-block`}
      style={{ minHeight: 42, fontSize: 12.5, letterSpacing: ".04em" }}
      disabled={pending}
      onClick={() => startTransition(() => toggleOmronAction(memberId, familyId, !connected))}
    >
      {pending ? "…" : connected ? "DISCONNECT DEVICE" : "CONNECT OMRON CONNECT"}
    </button>
  );
}
