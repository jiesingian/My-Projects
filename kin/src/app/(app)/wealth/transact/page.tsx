import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getAccounts } from "@/lib/queries/wealth";
import { DetailHeader } from "@/components/hub-header";
import { TransactForm } from "./transact-form";

export default async function TransactPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { mode } = await searchParams;
  const accounts = await getAccounts(me.family_id);

  return (
    <div>
      <DetailHeader backHref="/wealth" eyebrow="HUB 05 · MOVE MONEY" />
      <div style={{ padding: "0 22px 22px" }}>
        <h3 style={{ fontSize: 32, margin: "0 0 14px" }}>Move money</h3>
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
        />
      </div>
    </div>
  );
}
