import Link from "next/link";
import { Icon } from "@/components/icons";
import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getAccountDetail, getAccountHistory, getAccountNumbers, getAccountQr, getAccountViewers, getAccounts, getAttributableTargets, getTransferLegs } from "@/lib/queries/wealth";
import { toPickable } from "@/lib/account-picker";
import { getMembers } from "@/lib/queries/family";
import { isGone } from "@/lib/member-status";
import { AccountNumber } from "@/components/account-number";
import { AccountQr } from "@/components/account-qr";
import { isGrownUp } from "@/lib/roles";
import { CashTrendLine } from "@/components/wealth-charts";
import { PickButton } from "@/components/pick-button";
import { DetailHeader } from "@/components/hub-header";
import { Blueprint, Tag, Empty } from "@/components/ui";
import { PendingRows, DeleteEntryButton, EditEntryButton, RestoreAccountButton, DeleteAccountButton, AccountPrivacyToggle, PayCardControl } from "@/components/money-actions";
import { entryFor } from "@/lib/entry-for";
import { AccountEditForm } from "./account-edit-form";
import { OpenAppButton } from "./open-app-button";
import { formatCurrency, shortNames } from "@/lib/format";
import { ACCOUNT_TYPE_LABELS, categoryLabel, CASH_FLOW_RANGES, CASH_FLOW_RANGE_LABELS, cashBalanceTrend, pendingRows, type AccountType, type CashFlowRange } from "@/lib/wealth";
import { familyDate, householdDateFormat } from "@/lib/format-family";

export default async function AccountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ range?: string; pay?: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { id } = await params;
  const sp = await searchParams;
  const range: CashFlowRange = (CASH_FLOW_RANGES as readonly string[]).includes(sp.range ?? "") ? (sp.range as CashFlowRange) : "month";
  const [{ account, entries }, history, numbers, qr, viewers, members, allAccounts, targets] = await Promise.all([
    getAccountDetail(me.family_id, id),
    getAccountHistory(me.family_id, id, range),
    getAccountNumbers(me.family_id, [id]),
    getAccountQr(me.family_id, id),
    getAccountViewers(me.family_id),
    getMembers(me.family_id),
    getAccounts(me.family_id),
    // What an entry can be re-tied to from Edit: a loan, an asset, a goal.
    getAttributableTargets(me.family_id),
  ]);
  if (!account) notFound();
  // Where an entry can be moved to from Edit: joint and the member's own,
  // as every money form offers them.
  const pickable = toPickable(allAccounts, me.id);
  // Who else this account can be shown to, as on the Accounts tab.
  const others = members.filter((m) => m.status !== "pending" && !isGone(m.status) && m.id !== me.id);
  const otherNames = shortNames(others.map((m) => m.full_name));
  const people = others.map((m, i) => ({ id: m.id, label: otherNames[i], grownUp: isGrownUp(m.role), hasLogin: m.role !== "child_managed" }));
  const number = numbers.get(account.id) ?? null;
  const canNumber = account.is_joint ? isGrownUp(me.role) : account.owner_member_id === me.id;
  // The Accounts tab's cash trend, for this account alone: the same line,
  // walked back from this account's balance instead of the combined total.
  const trend = cashBalanceTrend(history, account.balance);

  const currency = me.families.currency;
  const [fmtDate, dateFormat] = await Promise.all([familyDate(), householdDateFormat()]);
  const pending = entries.filter((e) => e.status === "pending");
  // A pending transfer's other side, so the row can name it (27 October).
  const otherLegs = await getTransferLegs(me.family_id, [...new Set(pending.map((p) => p.transfer_group_id).filter((g): g is string => !!g))]);
  const pendingList = pendingRows([...pending, ...otherLegs.filter((l) => l.account_id !== account.id)]);
  const appUrls = Object.fromEntries(pendingList.map((r) => [r.id, allAccounts.find((a) => a.id === (r.from?.id ?? r.account?.id ?? r.to?.id))?.linked_app_url ?? null]));
  const confirmed = entries.filter((e) => e.status === "confirmed");

  return (
    <div>
      <DetailHeader backHref={`/wealth?seg=accounts&who=${account.is_joint || !account.owner_member_id ? "all" : account.owner_member_id}`} eyebrow="Wealth" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <Blueprint style={{ padding: "0.9375rem", marginBottom: "0.875rem" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
            <span style={{ font: "600 0.8125rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-neutral-600)" }}>
              {ACCOUNT_TYPE_LABELS[account.account_type as AccountType] ?? account.account_type}
              {account.institution ? ` · ${account.institution}` : ""}
            </span>
            <span className="ml-auto" style={{ display: "inline-flex", gap: "0.375rem" }}>
              {account.is_archived && <Tag variant="outline">ARCHIVED</Tag>}
              {account.is_joint ? (
                <Tag variant="accent">JOINT</Tag>
              ) : (
                <AccountPrivacyToggle
                  accountId={account.id}
                  isPrivate={account.is_private}
                  isJoint={false}
                  ownerId={account.owner_member_id}
                  canChange={account.owner_member_id === me.id}
                  viewers={viewers.get(account.id) ?? []}
                  people={people}
                  me={me.id}
                />
              )}
            </span>
          </div>
          <h3 style={{ fontSize: "1.625rem", margin: "8px 0 2px" }}>{account.name}</h3>
          <div style={{ font: "600 2.125rem/1.05 var(--font-heading)", letterSpacing: "-.02em", marginTop: "0.5rem" }}>{formatCurrency(account.balance, currency)}</div>
          <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginTop: "0.3125rem" }}>
            Opened at {formatCurrency(Number(account.opening_balance), currency)} · {confirmed.length} movement{confirmed.length === 1 ? "" : "s"} since
          </div>
          {(number || qr || canNumber) && (
            <div style={{ marginTop: "0.75rem", paddingTop: "0.625rem", borderTop: "1px solid var(--color-divider)" }}>
              {number && <AccountNumber number={number} />}
              {/* Its QR to receive money (Janine, 27 October): set by whoever may set the number. */}
              <AccountQr accountId={account.id} accountName={account.name} image={qr} canSet={canNumber} />
            </div>
          )}
        </Blueprint>

        <CashTrendLine trend={trend} currency={currency} periodNoun={CASH_FLOW_RANGE_LABELS[range].toLowerCase().replace(/s$/, "")} />
        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", margin: "-0.25rem 0 0.875rem" }}>
          <PickButton
            title="Graph range"
            icon="calendarDays"
            label={CASH_FLOW_RANGE_LABELS[range]}
            options={CASH_FLOW_RANGES.map((r) => ({ label: CASH_FLOW_RANGE_LABELS[r], href: `/wealth/accounts/${account.id}?range=${r}`, active: range === r }))}
          />
          <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>Balance at the end of each {CASH_FLOW_RANGE_LABELS[range].toLowerCase().replace(/s$/, "")}</span>
        </div>

        {/* A credit card with something owed: one tap to pay it (28 October);
            Today's Pay row lands here with ?pay=1 and opens the sheet. */}
        {account.account_type === "credit" && account.balance < 0 && (
          <PayCardControl
            cardId={account.id}
            cardName={account.name}
            owed={Math.round(-account.balance * 100) / 100}
            minimum={account.card_min_payment == null ? null : Number(account.card_min_payment)}
            accounts={pickable}
            currency={currency}
            autoOpen={sp.pay === "1"}
          />
        )}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <Link href={`/wealth/transact?mode=in&account=${account.id}`} className="btn btn-secondary" style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.8125rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
            Money in
          </Link>
          <Link href={`/wealth/transact?mode=out&account=${account.id}`} className="btn btn-secondary" style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.8125rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
            Money out
          </Link>
          <Link href={`/wealth/transact?mode=transfer&account=${account.id}`} className="btn btn-secondary" style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.8125rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
            Transfer
          </Link>
        </div>

        <OpenAppButton
          linkedAppUrl={account.linked_app_url}
          appStoreUrl={account.app_store_url}
          playStoreUrl={account.play_store_url}
          institution={account.institution}
          country={me.families.country}
          label={(account.institution ?? account.name).toUpperCase()}
        />

        {/* A bank or GCash CSV, read on the device (20261019120000). Offered
            to whoever may write to the account: grown-ups on a joint one,
            the owner on their own. */}
        {!account.is_archived && (account.is_joint ? isGrownUp(me.role) : account.owner_member_id === me.id) && (
          <Link
            href={`/wealth/accounts/${account.id}/import`}
            className="btn btn-ghost"
            style={{ minHeight: "2.25rem", fontSize: "0.8125rem", gap: "0.375rem", marginBottom: "0.5rem" }}
          >
            <Icon name="upload" size={15} /> Import a statement (CSV)
          </Link>
        )}

        {pendingList.length > 0 && (
          <>
            <SectionLabel>WAITING ON CONFIRMATION</SectionLabel>
            <PendingRows rows={pendingList} accounts={pickable} appUrls={appUrls} currency={currency} dateFormat={dateFormat} />
          </>
        )}

        <SectionLabel>HISTORY</SectionLabel>
        {confirmed.length === 0 && (
          <Empty icon={<Icon name="wallet" size={26} />} title="Nothing has moved through this account yet" line="Money in and out will appear here as it happens, newest first." />
        )}
        {confirmed.map((e) => (
          <div key={e.id} style={{ display: "flex", gap: "0.625rem", alignItems: "center", padding: "0.6875rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: "0.875rem", display: "block" }}>{e.particulars}</span>
              <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
                {fmtDate(e.occurred_at)}
                {e.category ? ` · ${categoryLabel(e.category)}` : ""}
                {e.recordedByName ? ` · ${e.recordedByName.split(" ")[0]}` : ""}
              </span>
            </span>
            <span style={{ fontFamily: "var(--font-numeric)", fontSize: "0.8125rem", flex: "none", color: e.direction === "in" ? "var(--color-accent-700)" : "inherit" }}>
              {e.direction === "in" ? "+" : "−"}
              {formatCurrency(Number(e.amount), currency)}
            </span>
            {/* A transfer is two entries that must agree: removed, not edited. */}
            {!e.transfer_group_id && (
              <EditEntryButton
                entry={{ id: e.id, particulars: e.particulars, amount: Number(e.amount), occurredOn: e.occurred_at.slice(0, 10), category: e.category, direction: e.direction, accountId: e.account_id, accountName: e.accountName, ...entryFor(e), principal: e.principal_amount == null ? null : Number(e.principal_amount), confirmed: e.status === "confirmed" }}
                accounts={pickable}
                targets={targets}
                currency={currency}
              />
            )}
            <DeleteEntryButton transactionId={e.id} />
          </div>
        ))}

        <AccountEditForm account={account} number={number} canNumber={canNumber} />
        {/* Delete Account, the same width as Edit account. Archive is one of
            its choices, not a button of its own: archiving is a rare,
            deliberate step, not an everyday one. */}
        {account.is_archived && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.625rem" }}>
            <RestoreAccountButton accountId={account.id} />
          </div>
        )}
        <DeleteAccountButton
          accountId={account.id}
          accountName={account.name}
          balance={account.balance}
          movementCount={account.movementCount}
          pendingCount={account.pendingCount}
          archived={account.is_archived}
          currency={currency}
          dateFormat={dateFormat}
          afterDelete="/wealth?seg=accounts"
        />
        {account.is_archived && (
          <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.625rem", lineHeight: 1.45 }}>
            Archived: left out of every list and balance total; its entries still count in the months they happened. Restore puts it back.
          </p>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="kin-eyebrow" style={{ margin: "20px 0 8px" }}>{children}</div>
  );
}
