import Link from "next/link";
import { Icon } from "@/components/icons";
import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getAccountDetail } from "@/lib/queries/wealth";
import { DetailHeader } from "@/components/hub-header";
import { Blueprint, Tag, Empty } from "@/components/ui";
import { PendingEntryActions, DeleteEntryButton, RemoveButton } from "@/components/money-actions";
import { AccountEditForm } from "./account-edit-form";
import { GetAppButton } from "./get-app-button";
import { formatCurrency } from "@/lib/format";
import { ACCOUNT_TYPE_LABELS, type AccountType } from "@/lib/wealth";
import { familyDate } from "@/lib/format-family";

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { id } = await params;
  const { account, entries } = await getAccountDetail(me.family_id, id);
  if (!account) notFound();

  const currency = me.families.currency;
  const fmtDate = await familyDate();
  const pending = entries.filter((e) => e.status === "pending");
  const confirmed = entries.filter((e) => e.status === "confirmed");

  return (
    <div>
      <DetailHeader backHref={`/wealth?seg=accounts&who=${account.is_joint || !account.owner_member_id ? "all" : account.owner_member_id}`} eyebrow="Wealth" />
      <div style={{ padding: "0 1.375rem 1.375rem" }}>
        <Blueprint style={{ padding: "0.9375rem", marginBottom: "0.875rem" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
            <span style={{ font: "600 0.8125rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-neutral-600)" }}>
              {ACCOUNT_TYPE_LABELS[account.account_type as AccountType] ?? account.account_type}
              {account.institution ? ` · ${account.institution}` : ""}
            </span>
            <Tag variant={account.is_joint ? "accent" : "neutral"} className="ml-auto">
              {account.is_joint ? "JOINT" : "PRIVATE"}
            </Tag>
          </div>
          <h3 style={{ fontSize: "1.625rem", margin: "8px 0 2px" }}>{account.name}</h3>
          <div style={{ font: "600 2.125rem/1.05 var(--font-heading)", letterSpacing: "-.02em", marginTop: "0.5rem" }}>{formatCurrency(account.balance, currency)}</div>
          <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginTop: "0.3125rem" }}>
            Opened at {formatCurrency(Number(account.opening_balance), currency)} · {confirmed.length} movement{confirmed.length === 1 ? "" : "s"} since
          </div>
        </Blueprint>

        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <Link href="/wealth/transact?mode=in" className="btn btn-secondary" style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.8125rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
            Money in
          </Link>
          <Link href="/wealth/transact?mode=out" className="btn btn-secondary" style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.8125rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
            Money out
          </Link>
          <Link href="/wealth/transact?mode=transfer" className="btn btn-secondary" style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.8125rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
            Transfer
          </Link>
        </div>

        {account.linked_app_url && (
          <a
            href={account.linked_app_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-block"
            style={{ minHeight: "2.75rem", fontSize: "0.875rem", letterSpacing: ".04em", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            Open {(account.institution ?? account.name).toUpperCase()}
          </a>
        )}

        <GetAppButton
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
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.625rem" }}>
          <RemoveButton id={account.id} kind="account" label={`Archive "${account.name}"? Its history stays, but it drops off your totals`} />
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="kin-eyebrow" style={{ margin: "20px 0 8px" }}>{children}</div>
  );
}
