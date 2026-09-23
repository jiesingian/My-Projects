"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { confirm } from "@/components/confirm-sheet";
import { setEntrySharedAction } from "@/lib/actions/family-links";

/** Per entry, opt-in, and reversible. Sits on the memory itself rather than
 * in a settings screen, because "should the other grandparents see this one"
 * is a question about this entry and is answered while looking at it. */
export function EntryShareToggle({
  entryId,
  shared,
  linkedCount,
}: {
  entryId: string;
  shared: boolean;
  linkedCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (next: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await setEntrySharedAction(entryId, next);
      if (result.error) setError(result.error);
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={pending}
        onClick={async () => {
          if (shared) {
            run(false);
            return;
          }
          if (
            !(await confirm({
              title: "Put this in the Family Feed?",
              description:
                linkedCount > 0
                  ? `The ${linkedCount === 1 ? "household" : `${linkedCount} households`} you're linked with will see its title, date and note. Photos and tagged names stay here. You can take it back at any time.`
                  : "It'll appear in your own Family Feed. Nobody outside your household sees it until you link with one.",
              confirmLabel: "Share it",
            }))
          )
            return;
          run(true);
        }}
        style={{ minHeight: "1.625rem", fontSize: "0.78125rem", padding: "0 0.4375rem", gap: "0.25rem", color: shared ? "var(--color-accent-700)" : "var(--color-neutral-700)" }}
      >
        <Icon name={shared ? "users" : "plus"} size={13} />
        {shared ? "Shared" : "Share"}
      </button>
      {error && <span style={{ fontSize: "0.75rem", color: "var(--cal-occasion)" }}>{error}</span>}
    </>
  );
}
