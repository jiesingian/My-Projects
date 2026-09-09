"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setMemberRoleAction, type MemberRole } from "@/lib/actions/family";

/** Whether a member counts as a parent, edited where the rest of their details
 * are edited.
 *
 * This began as a MAKE PARENT / MAKE ADULT button on every row of the family
 * list, which was wrong twice over: it is a decision made about once per
 * person, and the list is the one place everybody looks every day. A standing
 * button for a rare action is clutter, and clutter next to Remove is worse
 * than clutter.
 *
 * It sits beside Relationship instead, in the same shape: a line of text until
 * you choose to change it. The family row already links here, so the role
 * shown there stays plain text and tapping the person is how you reach this —
 * rather than a second, smaller tap target hidden inside a link.
 */
export function RoleEditor({ memberId, fullName, role }: { memberId: string; fullName: string; role: string }) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [value, setValue] = useState<MemberRole>(role === "parent" ? "parent" : "adult");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  if (mode === "view") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <span style={{ fontSize: 14, flex: 1 }}>{role === "parent" ? "Parent" : "Adult"}</span>
        <button type="button" className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => setMode("edit")}>
          Edit
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <select
          className="input"
          aria-label={`Role for ${fullName}`}
          value={value}
          onChange={(e) => setValue(e.target.value as MemberRole)}
          style={{ minHeight: 40, flex: 1 }}
          disabled={busy}
        >
          <option value="adult">Adult</option>
          <option value="parent">Parent</option>
        </select>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ minHeight: 40, fontSize: 13.5 }}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const result = await setMemberRoleAction(memberId, value);
            setBusy(false);
            setError(result.error);
            if (!result.error) {
              setMode("view");
              router.refresh();
            }
          }}
        >
          {busy ? "…" : "SAVE"}
        </button>
      </div>
      {/* Said here rather than in a confirm box, because it is the whole point
          of the setting and a person choosing should read it before saving,
          not after clicking. */}
      <p style={{ fontSize: 12.5, color: "var(--color-neutral-600)", margin: "8px 0 0" }}>
        A parent can see and add health records and documents marked “Parents only”. An adult can do everything else.
      </p>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ fontSize: 13, marginTop: 6 }}
        disabled={busy}
        onClick={() => {
          setValue(role === "parent" ? "parent" : "adult");
          setError(null);
          setMode("view");
        }}
      >
        Cancel
      </button>
      {error && <p style={{ color: "var(--color-accent-700)", fontSize: 13, margin: "6px 0 0" }}>{error}</p>}
    </div>
  );
}
