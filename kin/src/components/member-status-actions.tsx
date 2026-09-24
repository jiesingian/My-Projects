"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { removeMemberAction, reinstateMemberAction } from "@/lib/actions/family";
import { confirm } from "@/components/confirm-sheet";
import { toast } from "@/components/toast";

export function RemoveMemberButton({ memberId, fullName, variant = "inline" }: { memberId: string; fullName: string; variant?: "inline" | "block" }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  return (
    <button
      type="button"
      className={variant === "block" ? "btn btn-secondary btn-block" : "btn btn-ghost"}
      style={
        variant === "block"
          ? { minHeight: "2.875rem", fontSize: "0.84375rem", letterSpacing: ".04em", color: "var(--color-accent-700)", borderColor: "var(--color-accent-700)", marginTop: "1.25rem" }
          : { fontSize: "0.8125rem", flex: "none" }
      }
      disabled={busy}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (
          !(await confirm({
            title: `Remove ${fullName} from the household?`,
            description: "They'll lose access immediately — their past journal entries and records stay, and you can reinstate them later.",
            confirmLabel: "Remove",
            danger: true,
          }))
        )
          return;
        setBusy(true);
        const result = await removeMemberAction(memberId);
        setBusy(false);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        router.refresh();
      }}
    >
      {busy ? "…" : variant === "block" ? "Remove from household" : "Remove"}
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
      style={{ fontSize: "0.8125rem", minHeight: "1.875rem", padding: "0 0.75rem", flex: "none" }}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const result = await reinstateMemberAction(memberId);
        setBusy(false);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        router.refresh();
      }}
    >
      {busy ? "…" : "Reinstate"}
    </button>
  );
}
