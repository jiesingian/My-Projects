import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getAccounts, getAttributableTargets } from "@/lib/queries/wealth";
import { DetailHeader } from "@/components/hub-header";
import { TransactForm } from "./transact-form";

export default async function TransactPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; note?: string; amount?: string; account?: string }>;
}) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { mode, note, amount: rawAmount, account: fromAccount } = await searchParams;
  // From a URL, so parsed rather than trusted: a positive, finite number with
  // at most two decimals, or nothing at all.
  const parsed = Number(rawAmount);
  const amount = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : undefined;
  const [accounts, targets] = await Promise.all([getAccounts(me.family_id), getAttributableTargets(me.family_id)]);

  return (
    <div>
      {/* Opened from one account (its row's Move money icon, or its own
          page), so back returns to the Accounts list rather than Cash Flow. */}
      <DetailHeader backHref={fromAccount ? "/wealth?seg=accounts" : "/wealth"} eyebrow="Wealth" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
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
          defaultAccountId={fromAccount}
          assets={targets.assets}
          goals={targets.goals}
          defaultParticulars={note?.slice(0, 200)}
          defaultAmount={amount}
        />
      </div>
    </div>
  );
}
