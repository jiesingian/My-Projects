"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { transferOrganiserRoleAction } from "@/lib/actions/profile";

export function TransferOrganizerRole({ candidates }: { candidates: { id: string; full_name: string }[] }) {
  const [selected, setSelected] = useState(candidates[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  if (candidates.length === 0) {
    return <p style={{ fontSize: 11.5, color: "var(--color-neutral-600)" }}>No other adult members to transfer the role to yet.</p>;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)} style={{ minHeight: 40, flex: 1 }} disabled={busy}>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ minHeight: 40, fontSize: 12 }}
          disabled={busy}
          onClick={async () => {
            const name = candidates.find((c) => c.id === selected)?.full_name ?? "this member";
            if (!window.confirm(`Make ${name} the organizer? You'll no longer have organizer access yourself.`)) return;
            setBusy(true);
            const result = await transferOrganiserRoleAction(selected);
            setBusy(false);
            setError(result.error);
            if (!result.error) router.refresh();
          }}
        >
          {busy ? "…" : "TRANSFER"}
        </button>
      </div>
      {error && <p style={{ color: "var(--color-accent-700)", fontSize: 11.5 }}>{error}</p>}
    </div>
  );
}
