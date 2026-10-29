"use client";

import { useSyncExternalStore } from "react";
import { featurePlanLine } from "@/lib/feature-pages";
import { inAndroidApp } from "@/lib/native";

const noSubscribe = () => () => {};

/** A feature page's free or Plus line. The page is static, so the Kin
 * Android app's no-price version (Google Play's billing rule) is chosen in
 * the page. */
export function FeaturePlanLine({ plan }: { plan: "free" | "plus" }) {
  const android = useSyncExternalStore(noSubscribe, inAndroidApp, () => false);
  return <>{featurePlanLine(plan, { prices: !android })}</>;
}
