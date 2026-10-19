"use client";

import { useSyncExternalStore } from "react";
import { dynamicTypeScale, effectiveTextScale, textScaleCss } from "@/lib/text-scale";

/** iOS Dynamic Type, where the phone offers it (lib/text-scale).
 *
 * The server writes the member's own text size before anything paints. Here,
 * on an iPhone or iPad whose text size is set larger than that, the same
 * stylesheet is written again at the phone's size -- the root size and the
 * three layout switches together, so the tab bar and the glance tiles still
 * change shape at the right widths. A later <style> with the same selectors
 * wins, so nothing else needs to know.
 *
 * Elsewhere `-apple-system-body` is not a font at all, CSS.supports says so,
 * and this renders nothing. */
/** Measured once per page load. A change made in the phone's Settings while
 * Kin is open arrives with the next load, as Kin's own slider's does. */
let measured: number | null | undefined;
function phoneScale(): number | null {
  if (measured !== undefined) return measured;
  measured = null;
  if (typeof CSS === "undefined" || !CSS.supports("font", "-apple-system-body")) return measured;
  const probe = document.createElement("span");
  probe.style.cssText = "font:-apple-system-body;position:absolute;visibility:hidden;pointer-events:none";
  probe.textContent = "A";
  document.body.appendChild(probe);
  measured = dynamicTypeScale(parseFloat(getComputedStyle(probe).fontSize));
  probe.remove();
  return measured;
}
const noSubscribe = () => () => {};

export function DynamicType({ scale }: { scale: number }) {
  // Null on the server and in the first client render, so hydration matches.
  const phone = useSyncExternalStore(noSubscribe, phoneScale, () => null);
  const effective = effectiveTextScale(scale, phone);
  if (effective === effectiveTextScale(scale, null)) return null;
  return <style>{textScaleCss(effective)}</style>;
}
