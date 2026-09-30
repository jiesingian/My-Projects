import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getAccounts } from "@/lib/queries/wealth";
import { getMembers } from "@/lib/queries/family";
import { DetailHeader } from "@/components/hub-header";
import { shortNames, selfLabel } from "@/lib/format";
import { isGrownUp } from "@/lib/roles";
import { isGone } from "@/lib/member-status";
import { REMITTANCE_CURRENCIES } from "@/lib/fx";
import { RemittanceForm } from "./remittance-form";

export default async function NewRemittancePage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  if (!isGrownUp(me.role)) redirect("/wealth");

  const [members, accounts] = await Promise.all([getMembers(me.family_id), getAccounts(me.family_id)]);
  const active = members.filter((m) => m.status !== "pending" && !isGone(m.status));
  const labels = shortNames(active.map((m) => m.full_name)).map((l, i) => selfLabel(l, active[i].id === me.id));

  return (
    <div>
      <DetailHeader backHref="/wealth/remittances" eyebrow="Remittances" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <h3 style={{ fontSize: "2rem", margin: "0 0 14px" }}>Log a remittance</h3>
        <RemittanceForm
          meId={me.id}
          members={active.map((m, i) => ({ id: m.id, label: labels[i] }))}
          // Only accounts this grown-up can pay into; the database refuses the
          // rest anyway, and offering them would only produce that refusal.
          accounts={accounts.filter((a) => a.is_joint || a.owner_member_id === me.id).map((a) => ({ id: a.id, name: a.name, isJoint: a.is_joint }))}
          currencies={REMITTANCE_CURRENCIES}
        />
      </div>
    </div>
  );
}
