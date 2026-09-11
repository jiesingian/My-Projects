"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addTreeMemberAction } from "@/lib/actions/family";

export function AddMeToTreeButton({ memberId }: { memberId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div style={{ marginTop: 10 }}>
      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ minHeight: 44, fontSize: 13.5, letterSpacing: ".04em" }}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await addTreeMemberAction(memberId);
          setBusy(false);
          if (result.error) {
            setError(result.error);
            return;
          }
          router.refresh();
        }}
      >
        {busy ? "ADDING…" : "+ ADD ME TO THE TREE"}
      </button>
      {error && <p style={{ color: "var(--color-accent-700)", fontSize: 13, margin: "8px 0 0" }}>{error}</p>}
    </div>
  );
}
