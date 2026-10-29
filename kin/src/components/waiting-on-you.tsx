import Link from "next/link";
import { getWaiting, type WaitingAction, type WaitingEntry, type WaitingTab } from "@/lib/queries/waiting";
import { getAccounts, getAttributableTargets } from "@/lib/queries/wealth";
import { getMembers } from "@/lib/queries/family";
import { toPickable } from "@/lib/account-picker";
import { householdDateFormat } from "@/lib/format-family";
import { householdZone } from "@/lib/household-zone";
import { familyDay } from "@/lib/time";
import { formatCurrency, shortNames } from "@/lib/format";
import { isGone } from "@/lib/member-status";
import {
  AddRunningCostControl,
  EditSavingsGoalButton,
  FundPaidControl,
  GoalContributeControl,
  LoanAssetPicker,
  PayBillControl,
  PendingRows,
  ReceiveIncomeControl,
  RepriceLoanControl,
  SetBalanceButton,
} from "@/components/waiting-actions";
import { RemindButton, WaitingRow } from "@/components/waiting-row";

/** "Waiting on you" on any of the pages it belongs on (Jonathan, 29
 * October). The list is built once (lib/queries/waiting.ts); each page shows
 * the items that are its own, and every item opens the same sheet: what it
 * is, how it stands -- for a shared deposit, who has put in -- and the
 * action owed on it, with a way to the thing itself on its page. `openId`
 * opens one item's sheet on arrival (Today's Confirm). */
export async function WaitingOnYou({ me, tab, currency, openId = null }: { me: { id: string; family_id: string; grownUp: boolean }; tab: WaitingTab; currency: string; openId?: string | null }) {
  const [dateFormat, tz] = await Promise.all([householdDateFormat(), householdZone()]);
  const today = familyDay(new Date(), tz);
  const entries = (await getWaiting(me.id, me.family_id, me.grownUp, currency)).filter((e) => e.tabs.includes(tab));
  if (entries.length === 0) return null;
  const [accounts, targets, members] = await Promise.all([getAccounts(me.family_id), getAttributableTargets(me.family_id), getMembers(me.family_id)]);
  const active = members.filter((m) => m.status !== "pending" && !isGone(m.status));
  const names = shortNames(active.map((m) => m.full_name));
  const owners = new Map(active.filter((m) => m.id !== me.id).map((m) => [m.id, names[active.indexOf(m)]]));
  const pickable = toPickable(accounts, me.id);
  const goalPickable = toPickable(accounts, me.id, { everyone: true, owners });

  const act = (a: WaitingAction, key: number) => {
    switch (a.kind) {
      case "pending":
        return <PendingRows key={key} bare rows={[a.row]} accounts={pickable} appUrls={{ [a.row.id]: a.appUrl }} currency={currency} dateFormat={dateFormat} />;
      case "bill":
        return <PayBillControl key={key} billId={a.billId} amount={a.amount} accounts={pickable} currency={currency} defaultAccountId={a.accountId} due={a.due} loan={a.loanId ? (targets.loans.find((l) => l.id === a.loanId) ?? null) : null} />;
      case "income":
        return <ReceiveIncomeControl key={key} scheduleId={a.scheduleId} amount={a.amount} accounts={pickable} currency={currency} defaultAccountId={a.accountId} />;
      case "goal":
        return <GoalContributeControl key={key} compact goalId={a.goalId} accounts={goalPickable} currency={currency} linkedAccountId={a.linkedAccountId} fromAccountId={a.fromAccountId} fromAccount2Id={a.fromAccount2Id} fromAmount={a.fromAmount} from2Amount={a.from2Amount} />;
      case "reprice":
        return <RepriceLoanControl key={key} id={a.loanId} balance={a.balance} paymentsLeft={a.paymentsLeft} currentRate={a.rate} currentPayment={a.payment} currency={currency} />;
      case "running-cost":
        return <AddRunningCostControl key={key} assetId={a.assetId} assetName={a.assetName} kind={a.assetKind} whose={a.whose} currency={currency} today={today} />;
      case "set-balance":
        return <SetBalanceButton key={key} id={a.loanId} value={a.value} currency={currency} paymentsLeft={a.paymentsLeft} />;
      case "asset-picker":
        return <LoanAssetPicker key={key} liabilityId={a.loanId} assetId={null} assets={a.assets} />;
      case "edit-goal":
        return <EditSavingsGoalButton key={key} goal={a.goal} currency={currency} />;
      case "fund-paid":
        return <FundPaidControl key={key} goalId={a.goalId} title={a.title} accounts={pickable} currency={currency} saved={a.saved} target={a.target} linkedAccountId={a.linkedAccountId} repeatsYearly={a.repeatsYearly} />;
      case "remind":
        return <RemindButton key={key} goalId={a.goalId} memberId={a.memberId} name={a.name} />;
      case "link":
        return (
          <Link key={key} href={a.href} className="btn btn-primary" style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.6875rem", display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
            {a.label}
          </Link>
        );
    }
  };

  const sheet = (e: WaitingEntry) => (
    <div style={{ display: "grid", gap: "0.625rem", alignContent: "start" }}>
      <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
        {e.meta}
        {e.amount != null ? ` · ${formatCurrency(e.amount, currency)}` : ""}
      </div>
      {e.lines.map((l, i) => (
        <p key={i} style={{ fontSize: "0.875rem", margin: 0, lineHeight: 1.45 }}>
          {l}
        </p>
      ))}
      {e.people && (
        <div style={{ border: "1px solid var(--color-divider)", borderRadius: 10, padding: "0.375rem 0.75rem" }}>
          {e.people.map((p) => (
            <div key={p.name} style={{ display: "flex", gap: "0.5rem", padding: "0.3125rem 0", fontSize: "0.875rem" }}>
              <span aria-hidden="true" style={{ color: p.done ? "var(--color-accent-700)" : "var(--color-neutral-600)" }}>{p.done ? "✓" : "○"}</span>
              <span style={{ flex: 1 }}>{p.name}</span>
              <span style={{ color: "var(--color-neutral-600)", fontFamily: "var(--font-numeric)" }}>
                {p.amount ? `${formatCurrency(p.amount, currency)} · ` : ""}
                {p.done ? "put in" : "not yet"}
              </span>
            </div>
          ))}
        </div>
      )}
      {e.actions.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>{e.actions.map(act)}</div>}
      {e.open.tab !== tab && (
        <Link href={e.open.href} style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-accent-700)", textDecoration: "none" }}>
          {e.open.label} ›
        </Link>
      )}
    </div>
  );

  return (
    <>
      <div className="kin-eyebrow" style={{ margin: "20px 0 8px" }}>
        WAITING ON YOU · {entries.length}
      </div>
      {entries.map((e) => (
        <WaitingRow
          key={e.id}
          title={e.title}
          meta={e.meta}
          amount={e.amount}
          badge={e.people ? `${e.people.filter((p) => p.done).length} / ${e.people.length}` : undefined}
          currency={currency}
          autoOpen={e.id === openId}
          quick={e.quick ? act(e.quick, 0) : undefined}
          snoozeKey={e.snoozable ? e.id : undefined}
          sheet={sheet(e)}
        />
      ))}
    </>
  );
}
