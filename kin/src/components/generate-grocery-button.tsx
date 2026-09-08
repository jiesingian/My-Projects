"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateGroceryListAction } from "@/lib/actions/household";

/** `weekOf` is any day in the week to build from — the one the meal plan is
 * showing. Without it the list would always be built from this week, however
 * far ahead the plan had been scrolled. */
export function GenerateGroceryButton({ weekOf }: { weekOf?: string }) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div style={{ marginTop: 18 }}>
      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em" }}
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
        {pending ? "GENERATING…" : "GENERATE GROCERY LIST"}
      </button>
      {failed && (
        <p role="alert" style={{ fontSize: 13, color: "var(--danger, #d33)", marginTop: 8 }}>
          {failed}
        </p>
      )}
    </div>
  );
}
