"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approveMemberAction, rejectMemberAction } from "@/lib/actions/family";

export function PendingMemberActions({ memberId, fullName }: { memberId: string; fullName: string }) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const router = useRouter();

  async function run(action: "approve" | "reject") {
    if (action === "reject" && !window.confirm(`Reject ${fullName}'s request to join? They'll need a new invite code to try again.`)) return;
    setBusy(action);
    const result = action === "approve" ? await approveMemberAction(memberId) : await rejectMemberAction(memberId);
    setBusy(null);
    if (result.error) {
      window.alert(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div style={{ display: "flex", gap: 8, flex: "none" }}>
      <button type="button" className="btn btn-primary" style={{ minHeight: 34, fontSize: 13, padding: "0 12px" }} disabled={!!busy} onClick={() => run("approve")}>
        {busy === "approve" ? "…" : "APPROVE"}
      </button>
      <button type="button" className="btn btn-secondary" style={{ minHeight: 34, fontSize: 13, padding: "0 12px" }} disabled={!!busy} onClick={() => run("reject")}>
        {busy === "reject" ? "…" : "REJECT"}
      </button>
    </div>
  );
}
