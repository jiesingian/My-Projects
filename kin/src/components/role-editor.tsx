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
      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "1.25rem" }}>
        <span style={{ fontSize: "0.875rem", flex: 1 }}>{role === "parent" ? "Parent" : "Adult"}</span>
        <button type="button" className="btn btn-ghost" style={{ fontSize: "0.8125rem" }} onClick={() => setMode("edit")}>
          Edit
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <select
          className="input"
          aria-label={`Role for ${fullName}`}
          value={value}
          onChange={(e) => setValue(e.target.value as MemberRole)}
          style={{ minHeight: "2.5rem", flex: 1 }}
          disabled={busy}
        >
          <option value="adult">Adult</option>
          <option value="parent">Parent</option>
        </select>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ minHeight: "2.5rem", fontSize: "0.84375rem" }}
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
          {busy ? "…" : "Save"}
        </button>
      </div>
      {/* Said here rather than in a confirm box, because it is the whole point
          of the setting and a person choosing should read it before saving,
          not after clicking. */}
      <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", margin: "8px 0 0" }}>
        A parent can see and add health records and documents marked “Parents only”. An adult can do everything else.
      </p>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ fontSize: "0.8125rem", marginTop: "0.375rem" }}
        disabled={busy}
        onClick={() => {
          setValue(role === "parent" ? "parent" : "adult");
          setError(null);
          setMode("view");
        }}
      >
        Cancel
      </button>
      {error && <p style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: "6px 0 0" }}>{error}</p>}
    </div>
  );
}
