"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { transferOrganiserRoleAction } from "@/lib/actions/profile";
import { confirm } from "@/components/confirm-sheet";

export function TransferOrganizerRole({ candidates }: { candidates: { id: string; full_name: string }[] }) {
  const [selected, setSelected] = useState(candidates[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  if (candidates.length === 0) {
    return <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>There is no one to hand this to yet. Once another adult joins and is approved, you can pass the organizer role to them here.</p>;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}
            aria-label="New organizer" style={{ minHeight: "2.5rem", flex: 1 }} disabled={busy}>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ minHeight: "2.5rem", fontSize: "0.84375rem" }}
          disabled={busy}
          onClick={async () => {
            const name = candidates.find((c) => c.id === selected)?.full_name ?? "this member";
            if (!(await confirm(`Make ${name} the organizer? You'll no longer have organizer access yourself.`))) return;
            setBusy(true);
            const result = await transferOrganiserRoleAction(selected);
            setBusy(false);
            setError(result.error);
            if (!result.error) router.refresh();
          }}
        >
          {busy ? "…" : "Transfer"}
        </button>
      </div>
      {error && <p style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem" }}>{error}</p>}
    </div>
  );
}
