"use server";

import { cookies } from "next/headers";
import { requireCurrentMember } from "@/lib/session";
import { PLUS_TRIAL_CARD_COOKIE } from "@/lib/queries/plus-trial";

/** Hides the Kin Plus trial card on this phone (queries/plus-trial.ts). The
 * cookie names the household, so a member who moves to another household
 * sees that household's card. It outlives any trial, so nothing re-shows it. */
export async function hidePlusTrialCardAction(): Promise<void> {
  const me = await requireCurrentMember();
  (await cookies()).set(PLUS_TRIAL_CARD_COOKIE, me.family_id, {
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
  });
}
