"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateGroceryListAction } from "@/lib/actions/household";

export function GenerateGroceryButton({ familyId, memberId }: { familyId: string; memberId: string }) {
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
          await generateGroceryListAction(familyId, memberId);
          router.push("/household?seg=buy");
        })
      }
    >
      {pending ? "GENERATING…" : "GENERATE GROCERY LIST"}
    </button>
  );
}
