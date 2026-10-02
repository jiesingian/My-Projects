import Link from "next/link";
import { Icon } from "@/components/icons";
import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getAccountDetail, getAccountHistory } from "@/lib/queries/wealth";
import { CashTrendLine } from "@/components/wealth-charts";
import { PickButton } from "@/components/pick-button";
import { DetailHeader } from "@/components/hub-header";
import { Blueprint, Tag, Empty } from "@/components/ui";
import { PendingEntryActions, DeleteEntryButton, RemoveButton, RestoreAccountButton, DeleteAccountButton } from "@/components/money-actions";
import { AccountEditForm } from "./account-edit-form";
import { OpenAppButton } from "./open-app-button";
import { formatCurrency } from "@/lib/format";
import { ACCOUNT_TYPE_LABELS, CASH_FLOW_RANGES, CASH_FLOW_RANGE_LABELS, cashBalanceTrend, type AccountType, type CashFlowRange } from "@/lib/wealth";
import { familyDate } from "@/lib/format-family";

export default async function AccountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ range?: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { id } = await params;
  const sp = await searchParams;
  const range: CashFlowRange = (CASH_FLOW_RANGES as readonly string[]).includes(sp.range ?? "") ? (sp.range as CashFlowRange) : "month";
  const [{ account, entries }, history] = await Promise.all([getAccountDetail(me.family_id, id), getAccountHistory(me.family_id, id, range)]);
  if (!account) notFound();
  // The Accounts tab's cash trend, for this account alone: the same line,
  // walked back from this account's balance instead of the combined total.
  const trend = cashBalanceTrend(history, account.balance);

  const currency = me.families.currency;
  const fmtDate = await familyDate();
  const pending = entries.filter((e) => e.status === "pending");
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
              <Tag variant={account.is_joint ? "accent" : "neutral"}>{account.is_joint ? "JOINT" : "PRIVATE"}</Tag>
            </span>
          </div>
          <h3 style={{ fontSize: "1.625rem", margin: "8px 0 2px" }}>{account.name}</h3>
          <div style={{ font: "600 2.125rem/1.05 var(--font-heading)", letterSpacing: "-.02em", marginTop: "0.5rem" }}>{formatCurrency(account.balance, currency)}</div>
          <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginTop: "0.3125rem" }}>
            Opened at {formatCurrency(Number(account.opening_balance), currency)} · {confirmed.length} movement{confirmed.length === 1 ? "" : "s"} since
          </div>
        </Blueprint>

        <CashTrendLine trend={trend} currency={currency} />
        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", margin: "-0.25rem 0 0.875rem" }}>
          <PickButton
            title="Graph range"
            icon="calendarDays"
            label={CASH_FLOW_RANGE_LABELS[range]}
            options={CASH_FLOW_RANGES.map((r) => ({ label: CASH_FLOW_RANGE_LABELS[r], href: `/wealth/accounts/${account.id}?range=${r}`, active: range === r }))}
          />
          <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>Balance at the end of each {CASH_FLOW_RANGE_LABELS[range].toLowerCase().replace(/s$/, "")}</span>
        </div>

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

        {pending.length > 0 && (
          <>
            <SectionLabel>WAITING ON CONFIRMATION</SectionLabel>
            {pending.map((p) => (
              <Blueprint key={p.id} style={{ padding: "0.75rem", marginBottom: "0.625rem" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.875rem" }}>{p.particulars}</span>
                  <span style={{ marginLeft: "auto", fontFamily: "var(--font-numeric)", fontSize: "0.8125rem" }}>
                    {p.direction === "in" ? "+" : "−"}
                    {formatCurrency(Number(p.amount), currency)}
                  </span>
                </div>
                <div style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.1875rem" }}>
                  Started {fmtDate(p.occurred_at)} · not counted in the balance yet
                </div>
                <PendingEntryActions transactionId={p.id} />
              </Blueprint>
            ))}
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
                {e.category ? ` · ${e.category}` : ""}
                {e.recordedByName ? ` · ${e.recordedByName.split(" ")[0]}` : ""}
              </span>
            </span>
            <span style={{ fontFamily: "var(--font-numeric)", fontSize: "0.8125rem", flex: "none", color: e.direction === "in" ? "var(--color-accent-700)" : "inherit" }}>
              {e.direction === "in" ? "+" : "−"}
              {formatCurrency(Number(e.amount), currency)}
            </span>
            <DeleteEntryButton transactionId={e.id} />
          </div>
        ))}

        <AccountEditForm account={account} />
        {/* Archive hides the account and keeps its history; Delete removes
            it for good, and only while it has no history to lose. */}
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-start", gap: "0.5rem", marginTop: "0.625rem" }}>
          {account.is_archived ? <RestoreAccountButton accountId={account.id} /> : <RemoveButton id={account.id} kind="account" label={`Archive "${account.name}"`} />}
          <DeleteAccountButton
            accountId={account.id}
            accountName={account.name}
            movementCount={account.movementCount}
            archived={account.is_archived}
            afterDelete="/wealth?seg=accounts"
          />
        </div>
        {account.is_archived && (
          <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.625rem", lineHeight: 1.45 }}>
            Archived: left out of every list and total, with its history kept. Restore puts it back.
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
