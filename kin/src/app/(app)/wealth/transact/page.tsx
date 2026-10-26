import Link from "next/link";
import { redirect } from "next/navigation";
import { familyDay } from "@/lib/time";
import { getCurrentMember } from "@/lib/session";
import { toPickable } from "@/lib/account-picker";
import { getAccounts, getAttributableTargets, getAccountNumbers } from "@/lib/queries/wealth";
import { DetailHeader } from "@/components/hub-header";
import { TransactForm } from "./transact-form";
import { getMembers } from "@/lib/queries/family";
import { isGone } from "@/lib/member-status";
import { shortNames } from "@/lib/format";
import { whoseOptions } from "@/lib/wealth";

export default async function TransactPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; note?: string; amount?: string; account?: string; against?: string }>;
}) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { mode, note, amount: rawAmount, account: fromAccount, against } = await searchParams;
  // From a URL, so parsed rather than trusted: a positive, finite number with
  // at most two decimals, or nothing at all.
  const parsed = Number(rawAmount);
  const amount = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : undefined;
  const [accounts, targets, numbers, members] = await Promise.all([getAccounts(me.family_id), getAttributableTargets(me.family_id), getAccountNumbers(me.family_id), getMembers(me.family_id)]);
  const household = members.filter((m) => m.status !== "pending" && !isGone(m.status));
  const names = shortNames(household.map((m) => m.full_name));

  return (
    <div>
      {/* Opened from one account (its row's Move money icon, or its own
          page), so back returns to the Accounts list rather than Cash Flow. */}
      <DetailHeader backHref={fromAccount ? "/wealth?seg=accounts" : "/wealth"} eyebrow="Wealth" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <h3 style={{ fontSize: "2rem", margin: "0 0 6px" }}>Move money</h3>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "0 0 14px" }}>
          Got a receipt or a payment screenshot? <Link href="/wealth/scan">Snap it</Link> and Kin fills this in.
        </p>
        <TransactForm
          accounts={toPickable(accounts, me.id, { everyone: true })}
          currency={me.families.currency}
          defaultMode={mode ?? "in"}
          defaultAccountId={fromAccount}
          accountNumbers={Object.fromEntries(numbers)}
          assets={targets.assets}
          goals={targets.goals}
          loans={targets.loans}
          defaultAgainst={against}
          whose={whoseOptions(household.map((m, i) => ({ id: m.id, label: names[i] })), me.id)}
          defaultParticulars={note?.slice(0, 200)}
          defaultAmount={amount}
          today={familyDay(new Date(), me.families.time_zone || undefined)}
        />
      </div>
    </div>
  );
}
