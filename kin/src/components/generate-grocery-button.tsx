"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateGroceryListAction } from "@/lib/actions/household";

/** `weekOf` is any day in the week to build from — the one the meal plan is
 * showing. Without it the list would always be built from this week, however
 * far ahead the plan had been scrolled. */
export function GenerateGroceryButton({ familyId, memberId, weekOf }: { familyId: string; memberId: string; weekOf?: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn-primary btn-block"
      style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em", marginTop: 18 }}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await generateGroceryListAction(familyId, memberId, weekOf);
          router.push("/household?seg=buy");
        })
      }
    >
      {pending ? "GENERATING…" : "GENERATE GROCERY LIST"}
    </button>
  );
}
