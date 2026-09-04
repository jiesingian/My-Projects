import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getAccounts } from "@/lib/queries/wealth";
import { DetailHeader } from "@/components/hub-header";
import { AddGoalForm } from "./add-goal-form";

export default async function AddGoalPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const accounts = await getAccounts(me.family_id);

  return (
    <div>
      <DetailHeader backHref="/wealth?seg=goals" eyebrow="HUB 05 · NEW" />
      <div style={{ padding: "0 22px 22px" }}>
        <h3 style={{ fontSize: 32, margin: "0 0 14px" }}>Add Goal</h3>
        <AddGoalForm
          accounts={accounts
            .filter((a) => a.is_joint || a.owner_member_id === me.id)
            .map((a) => ({
              id: a.id,
              name: a.name,
              institution: a.institution,
              linked_app_url: a.linked_app_url,
              balance: a.balance,
              is_joint: a.is_joint,
            }))}
          currency={me.families.currency}
        />
      </div>
    </div>
  );
}
