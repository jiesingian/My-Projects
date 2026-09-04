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
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <span style={{ fontSize: 14, flex: 1 }}>{relationship ?? "Not set"}</span>
        <button type="button" className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => setMode("edit")}>
          Edit
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="input"
          placeholder="e.g. Mother, Son, Daughter"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={{ minHeight: 40, flex: 1 }}
          disabled={busy}
        />
        <button
          type="button"
          className="btn btn-secondary"
          style={{ minHeight: 40, fontSize: 13.5 }}
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
          {busy ? "…" : "SAVE"}
        </button>
      </div>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ fontSize: 13, marginTop: 6 }}
        disabled={busy}
        onClick={() => {
          setValue(relationship ?? "");
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
