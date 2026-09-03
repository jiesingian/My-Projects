"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateMemberRelationshipAction } from "@/lib/actions/family";

export function RelationshipEditor({ memberId, relationship }: { memberId: string; relationship: string | null }) {
  const [value, setValue] = useState(relationship ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

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
          style={{ minHeight: 40, fontSize: 12 }}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const result = await updateMemberRelationshipAction(memberId, value);
            setBusy(false);
            setError(result.error);
            if (!result.error) router.refresh();
          }}
        >
          {busy ? "…" : "SAVE"}
        </button>
      </div>
      {error && <p style={{ color: "var(--color-accent-700)", fontSize: 11.5, margin: "6px 0 0" }}>{error}</p>}
    </div>
  );
}
