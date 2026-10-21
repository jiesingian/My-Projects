"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { toast } from "@/components/toast";
import { seedHouseholdTreeAction } from "@/lib/actions/family";

/** One tap puts the household on the tree. `summary` is the plan as a
 * sentence (lib/tree-seed describeSeedPlan), shown before the tap so nobody
 * is surprised by who became whose spouse; the page only renders this when
 * the plan has something in it. */
export function SeedHouseholdTreeButton({ summary }: { summary: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div style={{ marginTop: "0.625rem" }}>
      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ minHeight: "2.75rem", fontSize: "0.84375rem", letterSpacing: ".04em" }}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await seedHouseholdTreeAction();
          setBusy(false);
          if (result.error) {
            setError(result.error);
            return;
          }
          toast.success(result.added ? `${result.added} added to the tree.` : "The household is on the tree.");
          router.refresh();
        }}
      >
        <Icon name="users" size="1rem" /> {busy ? "Adding…" : "ADD MY HOUSEHOLD TO THE TREE"}
      </button>
      <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "0.375rem 0 0", lineHeight: 1.4 }}>
        {summary} Anything that isn&rsquo;t right can be changed under Manage people.
      </p>
      {error && <p style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: "8px 0 0" }}>{error}</p>}
    </div>
  );
}
