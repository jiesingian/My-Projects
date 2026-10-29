"use client";

import { useEffect, useState } from "react";
import { kinAiLeftAction } from "@/lib/actions/kin-ai-left";
import { FREE_AI_PER_MONTH } from "@/lib/access";

/** "3 of 5 Kin AI uses left this month" under a screen that spends one
 * (29 October), on Kin Free only; Plus sees nothing. Read when shown and
 * again whenever `refresh` changes, so it follows a scan just made. Ask Kin
 * keeps its own copy, updated from each answer. */
export function KinAiLeft({ refresh = 0 }: { refresh?: number }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    kinAiLeftAction()
      .then(setLeft)
      .catch(() => {});
  }, [refresh]);
  if (left === null) return null;
  return (
    <p style={{ fontSize: "0.75rem", color: left === 0 ? "var(--color-accent-700)" : "var(--color-neutral-600)", margin: "4px 0 0", lineHeight: 1.45 }}>
      {left} of {FREE_AI_PER_MONTH} Kin AI uses left this month. Flyer scans and Ask Kin questions share them.
    </p>
  );
}
