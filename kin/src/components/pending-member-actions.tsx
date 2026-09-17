"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approveMemberAction, rejectMemberAction, type MemberRole } from "@/lib/actions/family";
import { confirm } from "@/components/confirm-sheet";
import { toast } from "@/components/toast";

/** Approving somebody is also the moment to say what they are joining as.
 *
 * Whoever joins by invite code arrives as an adult, and has to: the person
 * joining cannot be the one who decides whether they count as a parent. So
 * the decision has to sit with whoever lets them in, and this is where they
 * are already looking. Without it every member stays an adult until somebody
 * notices — which is how a parent of the children in this household ended up
 * unable to read a health record marked for parents.
 *
 * Adult is the default because approving without reading is the common case,
 * and the quieter answer should be the one that gives you. */
export function PendingMemberActions({ memberId, fullName }: { memberId: string; fullName: string }) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [role, setRole] = useState<MemberRole>("adult");
  const router = useRouter();

  async function run(action: "approve" | "reject") {
    if (action === "reject" && !(await confirm(`Reject ${fullName}'s request to join? They'll need a new invite code to try again.`))) return;
    setBusy(action);
    const result = action === "approve" ? await approveMemberAction(memberId, role) : await rejectMemberAction(memberId);
    setBusy(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div style={{ display: "flex", gap: 8, flex: "none", alignItems: "center" }}>
      <select
        className="input"
        aria-label={`Join ${fullName} as`}
        value={role}
        onChange={(e) => setRole(e.target.value as MemberRole)}
        disabled={!!busy}
        style={{ minHeight: 34, fontSize: 13, padding: "0 6px" }}
      >
        <option value="adult">Adult</option>
        <option value="parent">Parent</option>
      </select>
      <button type="button" className="btn btn-primary" style={{ minHeight: 34, fontSize: 13, padding: "0 12px" }} disabled={!!busy} onClick={() => run("approve")}>
        {busy === "approve" ? "…" : "APPROVE"}
      </button>
      <button type="button" className="btn btn-secondary" style={{ minHeight: 34, fontSize: 13, padding: "0 12px" }} disabled={!!busy} onClick={() => run("reject")}>
        {busy === "reject" ? "…" : "REJECT"}
      </button>
    </div>
  );
}
