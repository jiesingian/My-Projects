"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setMemberRoleAction } from "@/lib/actions/family";

/** Lets the organizer say who counts as a parent.
 *
 * Shown only to the organizer, and never on their own row or on a managed
 * child — the same three conditions the action checks and the database
 * enforces, so the button is not offered where it could only fail. That is
 * the lesson from "Parents only", which was offered to every member and
 * worked for one.
 *
 * It confirms first, because the effect is not visible from here: promoting
 * somebody opens every health record and document in the household that is
 * marked for parents, and demoting closes them again.
 */
export function MemberRoleToggle({ memberId, fullName, role }: { memberId: string; fullName: string; role: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const isParent = role === "parent";
  const next = isParent ? "adult" : "parent";

  async function run() {
    const question = isParent
      ? `Make ${fullName} an adult rather than a parent? They will no longer see health records and documents marked "Parents only".`
      : `Make ${fullName} a parent? They will be able to see and add health records and documents marked "Parents only".`;
    if (!window.confirm(question)) return;

    setBusy(true);
    const result = await setMemberRoleAction(memberId, next);
    setBusy(false);
    if (result.error) {
      window.alert(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <button
      type="button"
      className="btn btn-secondary"
      style={{ minHeight: 32, fontSize: 12, padding: "0 10px", flex: "none" }}
      disabled={busy}
      onClick={run}
      title={isParent ? `Make ${fullName} an adult` : `Make ${fullName} a parent`}
    >
      {busy ? "…" : isParent ? "MAKE ADULT" : "MAKE PARENT"}
    </button>
  );
}
