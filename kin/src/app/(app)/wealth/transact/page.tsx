import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getAccounts, getAttributableTargets } from "@/lib/queries/wealth";
import { DetailHeader } from "@/components/hub-header";
import { TransactForm } from "./transact-form";

export default async function TransactPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { mode } = await searchParams;
  const [accounts, targets] = await Promise.all([getAccounts(me.family_id), getAttributableTargets(me.family_id)]);

  return (
    <div>
      <DetailHeader backHref="/wealth" eyebrow="HUB 05 · MOVE MONEY" />
      <div style={{ padding: "0 1.375rem 1.375rem" }}>
        <h3 style={{ fontSize: "2rem", margin: "0 0 14px" }}>Move money</h3>
        <TransactForm
          accounts={accounts.map((a) => ({
            id: a.id,
            name: a.name,
            linked_app_url: a.linked_app_url,
            institution: a.institution,
            balance: a.balance,
            is_joint: a.is_joint,
          }))}
          currency={me.families.currency}
          defaultMode={mode ?? "in"}
          assets={targets.assets}
          goals={targets.goals}
        />
      </div>
    </div>
  );
}
