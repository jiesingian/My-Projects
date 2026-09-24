"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateMemberRelationshipAction } from "@/lib/actions/family";

export function RelationshipEditor({ memberId, relationship }: { memberId: string; relationship: string | null }) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [value, setValue] = useState(relationship ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  if (mode === "view") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "1.25rem" }}>
        <span style={{ fontSize: "0.875rem", flex: 1 }}>{relationship ?? "Not set"}</span>
        <button type="button" className="btn btn-ghost" style={{ fontSize: "0.8125rem" }} onClick={() => setMode("edit")}>
          Edit
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          className="input"
          placeholder="e.g. Mother, Son, Daughter"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={{ minHeight: "2.5rem", flex: 1 }}
          disabled={busy}
        />
        <button
          type="button"
          className="btn btn-secondary"
          style={{ minHeight: "2.5rem", fontSize: "0.84375rem" }}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const result = await updateMemberRelationshipAction(memberId, value);
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
      <button
        type="button"
        className="btn btn-ghost"
        style={{ fontSize: "0.8125rem", marginTop: "0.375rem" }}
        disabled={busy}
        onClick={() => {
          setValue(relationship ?? "");
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
