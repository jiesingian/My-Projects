import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { DetailHeader } from "@/components/hub-header";
import { MoveHousehold } from "@/components/move-household";
import { keepKidViewOut } from "@/lib/kid-view";

/** Starting a household of your own, or moving into another -- and taking
 * your personal space with you (kin/docs/PERSONAL_SPACE.md). */
export default async function MoveHouseholdPage() {
  await keepKidViewOut();
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");

  let blocker: string | null = null;
  if (me.is_organiser) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("family_id", me.family_id)
      .in("status", ["active", "managed"])
      .neq("id", me.id);
    blocker = (count ?? 0) > 0
      ? `You organize ${me.families.name}. Hand that role to another grown-up first, on the Household page, and then come back here.`
      : `${me.families.name} is already your own household. To bring your spouse in, share its invite code from the Household page.`;
  }

  return (
    <div>
      <DetailHeader backHref="/settings/household" eyebrow="Your own household" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <p style={{ fontSize: "0.875rem", lineHeight: 1.5, color: "var(--color-neutral-700)", margin: "0 0 1rem" }}>
          Your profile, your own journal, notes and personal goals are yours, not the household&apos;s. When you
          start a household of your own or move into someone else&apos;s, they come with you.
        </p>
        <MoveHousehold
          currentHousehold={me.families.name}
          canStart={me.role === "parent" || me.role === "adult"}
          blocker={blocker}
        />
      </div>
    </div>
  );
}
