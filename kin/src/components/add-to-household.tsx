"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addEntryToHouseholdAction } from "@/lib/actions/journal";
import { confirm } from "@/components/confirm-sheet";
import { toast } from "@/components/toast";

/** On a personal entry (Mine): put it in the household journal, photos and
 * all. It stays yours; the household can see it from then on. */
export function AddToHouseholdButton({ entryId, title }: { entryId: string; title: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <button
      type="button"
      className="kin-linkbtn"
      disabled={busy}
      onClick={async () => {
        const yes = await confirm({
          title: `Add "${title}" to the household journal?`,
          description: "Everyone in the household will see it and its photos. It stays yours, and you can share it on to relatives from there.",
          confirmLabel: "Add to household",
        });
        if (!yes) return;
        setBusy(true);
        const result = await addEntryToHouseholdAction(entryId);
        setBusy(false);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success("Added to the household journal.");
        router.refresh();
      }}
    >
      {busy ? "Adding…" : "Add to household"}
    </button>
  );
}
