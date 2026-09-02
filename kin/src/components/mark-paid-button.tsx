"use client";

import { useTransition } from "react";
import { markBillPaidAction } from "@/lib/actions/household";

export function MarkPaidButton({ billId }: { billId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-ghost"
      style={{ fontSize: 10.5 }}
      disabled={pending}
      onClick={() => startTransition(() => markBillPaidAction(billId))}
    >
      {pending ? "…" : "Mark paid"}
    </button>
  );
}
