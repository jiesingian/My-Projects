import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { toPickable } from "@/lib/account-picker";
import { getAccounts } from "@/lib/queries/wealth";
import { DetailHeader } from "@/components/hub-header";
import { AddGoalForm } from "./add-goal-form";
import { familyDay } from "@/lib/time";
import { householdZone } from "@/lib/household-zone";
import { getMembers } from "@/lib/queries/family";
import { shortNames } from "@/lib/format";
import { isGrownUp } from "@/lib/roles";
import { isGone } from "@/lib/member-status";

export default async function AddGoalPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const [accounts, members] = await Promise.all([getAccounts(me.family_id), getMembers(me.family_id)]);
  // The household's children, for a grown-up to set a goal up for (Janine,
  // 26 October): between Joint and Mine.
  const active = members.filter((m) => m.status !== "pending" && !isGone(m.status));
  const names = shortNames(active.map((m) => m.full_name));
  const children = isGrownUp(me.role) ? active.flatMap((m, i) => (isGrownUp(m.role) ? [] : [{ id: m.id, label: names[i] }])) : [];

  return (
    <div>
      <DetailHeader backHref="/wealth?seg=assets" eyebrow="Wealth" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <h3 style={{ fontSize: "2rem", margin: "0 0 14px" }}>Add Goal</h3>
        <AddGoalForm
          accounts={toPickable(accounts, me.id)}
          currency={me.families.currency}
          kids={children}
          today={familyDay(new Date(), await householdZone())}
        />
      </div>
    </div>
  );
}
