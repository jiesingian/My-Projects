import { createClient } from "@/lib/supabase/server";
import { isOfferCode, type OfferCode } from "@/lib/offers";

export type KinOffer = { id: string; code: OfferCode; days: number; status: "offered" | "accepted"; expiresAt: string; daysLeft: number };
export type KinOfferState = { offer: KinOffer | null; earned: { code: OfferCode; days: number }[] };

/** Kin's offer for this household on Today. First credits any taken offer the
 * household has since done (check_kin_offers), then asks for the live offer,
 * which the database chooses when it is time (next_kin_offer). Grown-ups
 * only: accepting Plus is a household decision. */
export async function getKinOffer(role: string): Promise<KinOfferState> {
  if (role !== "parent" && role !== "adult") return { offer: null, earned: [] };
  const supabase = await createClient();
  const { data: earned } = await supabase.rpc("check_kin_offers");
  const { data: offers } = await supabase.rpc("next_kin_offer");
  const o = (offers ?? [])[0];
  return {
    offer: o && isOfferCode(o.code) ? { id: o.id, code: o.code, days: o.days, status: o.status as KinOffer["status"], expiresAt: o.expires_at, daysLeft: Math.max(0, Math.ceil((new Date(o.expires_at).getTime() - Date.now()) / 86_400_000)) } : null,
    earned: (earned ?? []).filter((e) => isOfferCode(e.code)).map((e) => ({ code: e.code as OfferCode, days: e.days })),
  };
}
