"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { copyLastWeekMealsAction, generateGroceryListAction } from "@/lib/actions/household";

/** `weekOf` is any day in the week to build from — the one the meal plan is
 * showing. Without it the list would always be built from this week, however
 * far ahead the plan had been scrolled. */
export function GenerateGroceryButton({ weekOf }: { weekOf?: string }) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div style={{ marginTop: "1.125rem" }}>
      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ minHeight: "2.875rem", fontSize: "0.875rem", letterSpacing: ".04em" }}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const { error } = await generateGroceryListAction(weekOf);
            setFailed(error);
            // Only go and look at the list if there is something on it. This
            // used to navigate either way, so a list that had failed to write
            // was indistinguishable from a week with nothing planned.
            if (!error) router.push("/household?seg=buy");
          })
        }
      >
        {pending ? "Generating…" : "Generate grocery list"}
      </button>
      {failed && (
        <p role="alert" style={{ fontSize: "0.8125rem", color: "var(--color-accent-700)", marginTop: "0.5rem" }}>
          {failed}
        </p>
      )}
    </div>
  );
}

/** Last week's meals, day for day, into the week being looked at: a family
 * that eats the same week twice plans it once. */
export function CopyLastWeekButton({ weekOf }: { weekOf?: string }) {
  const [pending, startTransition] = useTransition();
  const [said, setSaid] = useState<{ text: string; error: boolean } | null>(null);
  const router = useRouter();
  return (
    <div>
      <button
        type="button"
        className="btn btn-secondary btn-block"
        style={{ minHeight: "2.75rem", fontSize: "0.875rem" }}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const { error, copied } = await copyLastWeekMealsAction(weekOf);
            setSaid(
              error
                ? { text: error, error: true }
                : { text: copied ? `Copied ${copied} meal${copied === 1 ? "" : "s"} from last week.` : "Last week's meals are already here.", error: false },
            );
            if (copied) router.refresh();
          })
        }
      >
        {pending ? "Copying…" : "Copy last week's meals"}
      </button>
      {said && (
        <p role={said.error ? "alert" : "status"} style={{ fontSize: "0.8125rem", color: said.error ? "var(--color-accent-700)" : "var(--color-neutral-600)", marginTop: "0.5rem" }}>
          {said.text}
        </p>
      )}
    </div>
  );
}
