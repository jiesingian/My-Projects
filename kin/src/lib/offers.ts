/** What each of Kin's offers asks, and where to do it
 * (20260929020000_kin_offers.sql holds the days and decides "done").
 *
 * Every offer points at something the household has not used yet: the
 * database only offers what kin_offer_done() says is still undone. */

export type OfferCode = "profile" | "emergency" | "grownup" | "water3" | "calendar" | "goal" | "ai" | "vault" | "refer";

export const OFFER_META: Record<OfferCode, { title: string; body: string; href: string; cta: string }> = {
  profile: { title: "Finish your profile", body: "Add your photo, birthday and mobile number.", href: "/settings", cta: "Open my profile" },
  emergency: { title: "Add the emergency card", body: "Emergency contacts, so anyone in the family can reach help fast.", href: "/family", cta: "Open Family" },
  grownup: { title: "Invite a second grown-up", body: "Kin works best with two adults: chores get approved, rewards get given.", href: "/family", cta: "Invite someone" },
  water3: { title: "Log water for 3 days", body: "Tap a glass on Today, any three days this week.", href: "/today", cta: "Go to Today" },
  calendar: { title: "Connect Google Calendar", body: "Plans and tasks reach everyone's phone, not just Kin.", href: "/settings", cta: "Open Settings" },
  goal: { title: "Set your first goal", body: "Eight glasses a day, three gym sessions a week — the ring fills itself.", href: "/planner/goals/new", cta: "Set a goal" },
  ai: { title: "Ask Kin AI something", body: "Plan the week's meals, or ask what's coming up.", href: "/today", cta: "Go to Today" },
  vault: { title: "Put a first document in the vault", body: "A passport, a policy, a birth certificate — safe and findable.", href: "/family/documents", cta: "Open the vault" },
  refer: {
    title: "Invite another family to Kin",
    body: "Earn 7 days when they join with your family's code, and 30 more if they subscribe to Kin Plus.",
    href: "",
    cta: "",
  },
};

export function isOfferCode(v: string): v is OfferCode {
  return v in OFFER_META;
}

/** A household may name who invited it once, in its first 14 days
 * (set_referrer() holds the same window). */
export function canNameReferrer(family: { referred_by: string | null; created_at: string }): boolean {
  return !family.referred_by && Date.now() - new Date(family.created_at).getTime() < 14 * 86_400_000;
}
