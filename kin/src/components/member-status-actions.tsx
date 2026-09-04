"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { removeMemberAction, reinstateMemberAction } from "@/lib/actions/family";

export function RemoveMemberButton({ memberId, fullName, variant = "inline" }: { memberId: string; fullName: string; variant?: "inline" | "block" }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  return (
    <button
      type="button"
      className={variant === "block" ? "btn btn-secondary btn-block" : "btn btn-ghost"}
      style={
        variant === "block"
          ? { minHeight: 46, fontSize: 13.5, letterSpacing: ".04em", color: "var(--color-accent-700)", borderColor: "var(--color-accent-700)", marginTop: 20 }
          : { fontSize: 13, flex: "none" }
      }
      disabled={busy}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!window.confirm(`Remove ${fullName} from the household? They'll lose access immediately — their past journal entries and records stay, and you can reinstate them later.`)) return;
        setBusy(true);
        const result = await removeMemberAction(memberId);
        setBusy(false);
        if (result.error) {
          window.alert(result.error);
          return;
        }
        router.refresh();
      }}
    >
      {busy ? "…" : variant === "block" ? "REMOVE FROM HOUSEHOLD" : "Remove"}
    </button>
  );
}

export function ReinstateMemberButton({ memberId }: { memberId: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  return (
    <button
      type="button"
      className="btn btn-secondary"
      style={{ fontSize: 13, minHeight: 30, padding: "0 12px", flex: "none" }}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const result = await reinstateMemberAction(memberId);
        setBusy(false);
        if (result.error) {
          window.alert(result.error);
          return;
        }
        router.refresh();
      }}
    >
      {busy ? "…" : "REINSTATE"}
    </button>
  );
}
