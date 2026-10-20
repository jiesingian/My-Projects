"use client";

import { useSyncExternalStore } from "react";
import { ShareMessage } from "@/components/share-message";
import { referralMessage, referralUrl } from "@/lib/referral";

const noop = () => () => {};

/** Settings -> Invite a family: the message with the family's referral link,
 * for the phone's share sheet or the clipboard (20261020180000). The link
 * carries this site's origin, read on the phone so a preview and production
 * each hand out their own. */
export function InviteFamily({ householdName, code }: { householdName: string; code: string }) {
  const origin = useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => "",
  );
  const url = referralUrl(origin || "https://kin-family-app.vercel.app", code);
  return <ShareMessage title="Invite a family to Kin" text={referralMessage(householdName, url)} />;
}
