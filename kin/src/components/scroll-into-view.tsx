"use client";

import { useEffect } from "react";
import { scrollBehavior } from "@/lib/motion";

/** Brings the element with `targetId` into the middle of the screen once,
 * when it first appears -- for landing back on a list with the row just
 * saved picked out, rather than wherever the page happened to scroll. */
export function ScrollIntoView({ targetId }: { targetId: string }) {
  useEffect(() => {
    document.getElementById(targetId)?.scrollIntoView({ block: "center", behavior: scrollBehavior() });
  }, [targetId]);
  return null;
}
