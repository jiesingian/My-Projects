import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { DetailHeader } from "@/components/hub-header";
import { Blueprint } from "@/components/ui";
import { InviteFamily } from "@/components/invite-family";
import { keepKidViewOut } from "@/lib/kid-view";
import { REFERRAL_CAP, REFERRAL_DAYS, referralLine, referralRewardLine } from "@/lib/referral";

/** Settings -> Invite a family (20261020180000_invite_a_family.sql): the
 * family's referral link in a ready message, how many families joined
 * through it, and what each invite earns. Grown-ups and teens alike may
 * share it; never kid view. */
export default async function InviteFamilyPage() {
  await keepKidViewOut();
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const supabase = await createClient();
  const { data } = await supabase.rpc("referral_stats");
  const stats = data?.[0] ?? { joined: 0, rewarded: 0, cap: REFERRAL_CAP };

  return (
    <div>
      <DetailHeader backHref="/settings" eyebrow="Invite a family" />
      <div style={{ padding: "0 var(--gutter) 1.375rem", display: "flex", flexDirection: "column", gap: "1.125rem" }}>
        <Blueprint style={{ padding: "0.875rem" }}>
          <div style={{ font: "600 1.0625rem/1.2 var(--font-heading)" }}>{referralLine(stats.joined)}</div>
          <p style={{ fontSize: "0.84375rem", color: "var(--color-neutral-700)", margin: "0.375rem 0 0", lineHeight: 1.45 }}>{referralRewardLine(stats.rewarded, stats.cap)}</p>
          <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "0.5rem 0 0", lineHeight: 1.45 }}>
            The days are added when the family you invited finishes setting up Kin: a trial is pushed back, Kin Free gets a taste of Plus, a paying household keeps them for later. One invite counts per new family, and a family can&rsquo;t invite itself.
          </p>
        </Blueprint>
        <div>
          <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginBottom: "0.375rem" }}>Your message and link</div>
          <Blueprint style={{ padding: "0.875rem" }}>
            <InviteFamily householdName={me.families.name} code={me.families.referral_code} />
            <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "0.625rem 0 0" }}>
              Or they can type your family&rsquo;s code, <strong style={{ letterSpacing: ".08em" }}>{me.families.referral_code}</strong>, on their Today in their first {REFERRAL_DAYS * 2} days.
            </p>
          </Blueprint>
        </div>
      </div>
    </div>
  );
}
