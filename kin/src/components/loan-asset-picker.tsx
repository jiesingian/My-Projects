"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLiabilityAssetAction } from "@/lib/actions/wealth";

/** Which asset a loan paid for (20261023231000), changed in place on the
 * loan's row in A&L: the house a housing loan is on, the car a car loan
 * bought. The asset's row then shows its equity. */
export function LoanAssetPicker({ liabilityId, assetId, assets }: { liabilityId: string; assetId: string | null; assets: { id: string; name: string }[] }) {
  const [value, setValue] = useState(assetId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  if (assets.length === 0) return null;
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
      <span>Paid for</span>
      <select
        className="input"
        aria-label="What this loan paid for"
        value={value}
        disabled={pending}
        style={{ minHeight: "2rem", padding: "0 0.5rem", fontSize: "0.78125rem", width: "auto", maxWidth: "11rem" }}
        onChange={(e) => {
          const next = e.target.value;
          const before = value;
          setValue(next);
          setError(null);
          startTransition(async () => {
            const res = await setLiabilityAssetAction(liabilityId, next || null);
            if (res.error) {
              setValue(before);
              setError(res.error);
            } else router.refresh();
          });
        }}
      >
        <option value="">Nothing in particular</option>
        {assets.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      {error && <span role="alert" style={{ color: "var(--color-accent-700)" }}>{error}</span>}
    </label>
  );
}
