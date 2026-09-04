import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getAccountDetail } from "@/lib/queries/wealth";
import { DetailHeader } from "@/components/hub-header";
import { Blueprint, Tag } from "@/components/ui";
import { PendingEntryActions, DeleteEntryButton, RemoveButton } from "@/components/money-actions";
import { AccountEditForm } from "./account-edit-form";
import { formatCurrency, formatDate } from "@/lib/format";
import { ACCOUNT_TYPE_LABELS, type AccountType } from "@/lib/wealth";

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { id } = await params;
  const { account, entries } = await getAccountDetail(me.family_id, id);
  if (!account) notFound();

  const currency = me.families.currency;
  const pending = entries.filter((e) => e.status === "pending");
  const confirmed = entries.filter((e) => e.status === "confirmed");

  return (
    <div>
      <DetailHeader backHref={`/wealth?seg=${account.is_joint ? "joint" : "mine"}`} eyebrow="HUB 05 · ACCOUNT" />
      <div style={{ padding: "0 22px 22px" }}>
        <Blueprint style={{ padding: 15, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ font: "600 10px/1 var(--font-heading)", letterSpacing: ".14em", color: "var(--color-neutral-600)" }}>
              {ACCOUNT_TYPE_LABELS[account.account_type as AccountType] ?? account.account_type}
              {account.institution ? ` · ${account.institution}` : ""}
            </span>
            <Tag variant={account.is_joint ? "accent" : "neutral"} className="ml-auto">
              {account.is_joint ? "JOINT" : "PRIVATE"}
            </Tag>
          </div>
          <h3 style={{ fontSize: 26, margin: "8px 0 2px" }}>{account.name}</h3>
          <div style={{ font: "600 34px/1.05 var(--font-heading)", letterSpacing: "-.02em", marginTop: 8 }}>{formatCurrency(account.balance, currency)}</div>
          <div style={{ fontSize: 11, color: "var(--color-neutral-600)", marginTop: 5 }}>
            Opened at {formatCurrency(Number(account.opening_balance), currency)} · {confirmed.length} movement{confirmed.length === 1 ? "" : "s"} since
          </div>
        </Blueprint>

        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <Link href="/wealth/transact?mode=in" className="btn btn-secondary" style={{ flex: 1, minHeight: 40, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
            MONEY IN
          </Link>
          <Link href="/wealth/transact?mode=out" className="btn btn-secondary" style={{ flex: 1, minHeight: 40, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
            MONEY OUT
          </Link>
          <Link href="/wealth/transact?mode=transfer" className="btn btn-secondary" style={{ flex: 1, minHeight: 40, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
            TRANSFER
          </Link>
        </div>

        {account.linked_app_url && (
          <a
            href={account.linked_app_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-block"
            style={{ minHeight: 44, fontSize: 12.5, letterSpacing: ".04em", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            OPEN {(account.institution ?? account.name).toUpperCase()}
          </a>
        )}

        {pending.length > 0 && (
          <>
            <SectionLabel>WAITING ON CONFIRMATION</SectionLabel>
            {pending.map((p) => (
              <Blueprint key={p.id} style={{ padding: 12, marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 14 }}>{p.particulars}</span>
                  <span style={{ marginLeft: "auto", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13 }}>
                    {p.direction === "in" ? "+" : "−"}
                    {formatCurrency(Number(p.amount), currency)}
                  </span>
                </div>
                <div style={{ fontSize: 10.5, color: "var(--color-neutral-600)", marginTop: 3 }}>
                  Started {formatDate(p.occurred_at)} · not counted in the balance yet
                </div>
                <PendingEntryActions transactionId={p.id} />
              </Blueprint>
            ))}
          </>
        )}

        <SectionLabel>HISTORY</SectionLabel>
        {confirmed.length === 0 && <p style={{ fontSize: 12, color: "var(--color-neutral-600)" }}>Nothing has moved through this account yet.</p>}
        {confirmed.map((e) => (
          <div key={e.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "11px 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 14, display: "block" }}>{e.particulars}</span>
              <span style={{ fontSize: 10.5, color: "var(--color-neutral-600)" }}>
                {formatDate(e.occurred_at)}
                {e.category ? ` · ${e.category}` : ""}
                {e.recordedByName ? ` · ${e.recordedByName.split(" ")[0]}` : ""}
              </span>
            </span>
            <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13, flex: "none", color: e.direction === "in" ? "var(--color-accent-700)" : "inherit" }}>
              {e.direction === "in" ? "+" : "−"}
              {formatCurrency(Number(e.amount), currency)}
            </span>
            <DeleteEntryButton transactionId={e.id} />
          </div>
        ))}

        <AccountEditForm account={account} />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
          <RemoveButton id={account.id} kind="account" label={`Archive "${account.name}"? Its history stays, but it drops off your totals`} />
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ font: "600 10px/1 var(--font-heading)", letterSpacing: ".16em", color: "var(--color-neutral-600)", margin: "20px 0 8px" }}>{children}</div>
  );
}
