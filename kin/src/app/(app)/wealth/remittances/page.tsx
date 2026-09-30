import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getAccounts, getRemittances, type RemittanceWithAllocations } from "@/lib/queries/wealth";
import { getMembers } from "@/lib/queries/family";
import { DetailHeader } from "@/components/hub-header";
import { Blueprint, Empty, Tag } from "@/components/ui";
import { Icon } from "@/components/icons";
import { RemoveButton } from "@/components/money-actions";
import { formatCurrency, shortNames, selfLabel } from "@/lib/format";
import { isGrownUp } from "@/lib/roles";
import { REMITTANCE_CHANNEL_LABELS, monthKey, remittancesByMonth, type RemittanceChannel } from "@/lib/wealth";

/** Money sent home from abroad, month by month. Grown-ups only: the
 * database gives a child nothing here, and the page says so rather than
 * showing an empty list as if there were none. */
export default async function RemittancesPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");

  if (!isGrownUp(me.role)) {
    return (
      <div>
        <DetailHeader backHref="/wealth" eyebrow="Wealth" />
        <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
          <Empty icon={<Icon name="wallet" size={26} />} title="For grown-ups" line="Remittances are kept by the grown-ups in the household." />
        </div>
      </div>
    );
  }

  const [remittances, members, accounts] = await Promise.all([getRemittances(me.family_id), getMembers(me.family_id), getAccounts(me.family_id)]);
  const labels = shortNames(members.map((m) => m.full_name)).map((l, i) => selfLabel(l, members[i].id === me.id));
  const nameOf = new Map(members.map((m, i) => [m.id, labels[i]]));
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const months = remittancesByMonth(remittances);
  const thisMonth = monthKey(new Date());
  const current = months.find((m) => m.key === thisMonth);
  const previous = months.find((m) => m.key < thisMonth);

  return (
    <div>
      <DetailHeader backHref="/wealth" eyebrow="Wealth" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <h3 style={{ fontSize: "2rem", margin: "0 0 14px" }}>Remittances</h3>

        <Blueprint style={{ padding: "0.9375rem", marginBottom: "0.875rem" }}>
          <div className="kin-eyebrow">CAME HOME THIS MONTH</div>
          <div style={{ font: "600 min(2.375rem, 10vw)/1.05 var(--font-heading)", letterSpacing: "-.02em", margin: "9px 0 0", fontVariantNumeric: "tabular-nums" }}>
            {formatCurrency(current?.total ?? 0)}
          </div>
          <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginTop: "0.375rem" }}>
            {current ? `${current.rows.length} remittance${current.rows.length === 1 ? "" : "s"}` : "Nothing logged yet this month"}
            {previous ? ` · ${monthLabel(previous.key)}: ${formatCurrency(previous.total)}` : ""}
          </div>
        </Blueprint>

        <Link href="/wealth/remittances/new" className="btn btn-primary btn-block" style={{ minHeight: "2.75rem", fontSize: "0.84375rem", letterSpacing: ".04em", marginBottom: "1.25rem" }}>
          + LOG A REMITTANCE
        </Link>

        {months.length === 0 && (
          <Empty
            icon={<Icon name="wallet" size={26} />}
            title="No remittances yet"
            line="When someone abroad sends money home, log it here: what was sent, what arrived in pesos, and what it went to."
          />
        )}

        {months.map((month) => (
          <section key={month.key} aria-label={monthLabel(month.key)} style={{ marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "baseline", margin: "0 0 6px" }}>
              <span className="kin-eyebrow">{monthLabel(month.key).toUpperCase()}</span>
              <span style={{ marginLeft: "auto", fontFamily: "var(--font-numeric)", fontSize: "0.875rem", fontWeight: 600 }}>{formatCurrency(month.total)}</span>
            </div>
            {month.rows.map((r) => (
              <RemittanceRow key={r.id} r={r} nameOf={nameOf} accountName={accountName} />
            ))}
          </section>
        ))}

        <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", lineHeight: 1.45, marginTop: "0.875rem" }}>
          The reference value uses the European Central Bank&rsquo;s rate for that day, from Frankfurter. Remittance centres and wallets pay out at their own
          rate, so the pesos that arrived are what the totals count. A remittance marked Just me is seen only by whoever logged it.
        </p>
      </div>
    </div>
  );
}

function RemittanceRow({ r, nameOf, accountName }: { r: RemittanceWithAllocations; nameOf: Map<string, string>; accountName: Map<string, string> }) {
  const from = r.sender_member_id ? (nameOf.get(r.sender_member_id) ?? "Someone who left") : (r.sender_name ?? "Someone abroad");
  const to = r.receiver_member_id ? nameOf.get(r.receiver_member_id) : null;
  const received = Number(r.php_received);
  const reference = r.ecb_rate !== null ? Number(r.amount) * Number(r.ecb_rate) : null;
  const gap = reference !== null ? reference - received : null;
  const channel = REMITTANCE_CHANNEL_LABELS[r.channel as RemittanceChannel] ?? r.channel;
  const day = new Date(`${r.sent_on}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" });

  return (
    <div style={{ padding: "0.75rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
      <div style={{ display: "flex", gap: "0.625rem", alignItems: "baseline" }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ font: "600 1rem/1.15 var(--font-heading)", display: "block" }}>
            {from}
            {to ? ` → ${to}` : ""}
          </span>
          <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
            {day} · {channel}
            {r.channel_name ? ` (${r.channel_name})` : ""}
            {r.account_id ? ` · into ${accountName.get(r.account_id) ?? "an account"}` : ""}
          </span>
        </span>
        <span style={{ textAlign: "right", flex: "none" }}>
          <span style={{ fontFamily: "var(--font-numeric)", fontSize: "0.9375rem", fontWeight: 600, display: "block", color: "var(--color-accent-700)" }}>
            +{formatCurrency(received)}
          </span>
          <span style={{ fontFamily: "var(--font-numeric)", fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
            {r.currency} {Number(r.amount).toLocaleString("en-PH", { maximumFractionDigits: 2 })}
          </span>
        </span>
      </div>

      {gap !== null && Math.abs(gap) >= 1 && (
        <div style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.3125rem" }}>
          Reference {formatCurrency(Math.round(reference!))}
          {r.rate_source === "usd_peg" ? " (via the dollar peg)" : ""} ·{" "}
          {gap > 0 ? `${formatCurrency(Math.round(gap))} lost to fees and rate` : `${formatCurrency(Math.round(-gap))} above the reference`}
        </div>
      )}

      {r.allocations.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0.5rem 0 0", display: "grid", gap: "0.25rem" }}>
          {r.allocations.map((a) => (
            <li key={a.id} style={{ display: "flex", fontSize: "0.8125rem" }}>
              <span>{a.purpose}</span>
              <span style={{ marginLeft: "auto", fontFamily: "var(--font-numeric)" }}>{formatCurrency(Number(a.amount))}</span>
            </li>
          ))}
        </ul>
      )}
      {r.note && <div style={{ fontSize: "0.8125rem", marginTop: "0.375rem" }}>{r.note}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem" }}>
        {r.is_private && <Tag variant="outline">JUST ME</Tag>}
        <span style={{ marginLeft: "auto" }}>
          <RemoveButton id={r.id} kind="remittance" label={r.account_id ? `Remove this remittance and its money-in` : `Remove this remittance`} />
        </span>
      </div>
    </div>
  );
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-PH", { month: "long", year: "numeric" });
}
