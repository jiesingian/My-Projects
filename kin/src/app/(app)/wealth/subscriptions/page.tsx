import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getSubscriptions } from "@/lib/queries/subscriptions";
import { DetailHeader } from "@/components/hub-header";
import { Blueprint, Empty, Tag } from "@/components/ui";
import { Icon } from "@/components/icons";
import { formatCurrency } from "@/lib/format";
import { familyDate } from "@/lib/format-family";
import { REPEAT_LABELS, type Subscription } from "@/lib/subscriptions";

/** Everything that repeats, and what it comes to in a year: the bills that
 * come round every month, quarter or year, and the income that does. Read
 * only -- each row is still added, paid and deleted in Cash Flow. */
export default async function SubscriptionsPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const currency = me.families.currency;
  const [subs, fmtDate] = await Promise.all([getSubscriptions(me.family_id), familyDate()]);

  return (
    <div>
      <DetailHeader backHref="/wealth?seg=cashflow" eyebrow="Wealth" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <h3 style={{ fontSize: "2rem", margin: "0 0 14px" }}>Subscriptions</h3>

        <Blueprint style={{ padding: "0.9375rem", marginBottom: "0.875rem" }}>
          <div className="kin-eyebrow">COSTS A YEAR</div>
          <div style={{ font: "600 min(2.375rem, 10vw)/1.05 var(--font-heading)", letterSpacing: "-.02em", margin: "9px 0 0", fontVariantNumeric: "tabular-nums" }}>
            {formatCurrency(subs.chargesPerYear, currency)}
          </div>
          <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginTop: "0.375rem" }}>
            {subs.charges.length === 0
              ? "Nothing repeating yet"
              : `${formatCurrency(subs.chargesPerYear / 12, currency)} a month · ${subs.charges.length} repeating charge${subs.charges.length === 1 ? "" : "s"}`}
          </div>
        </Blueprint>

        {subs.charges.length === 0 && (
          <Empty
            icon={<Icon name="receipt" size={26} />}
            title="No repeating charges"
            line="An expense set to repeat every month, quarter or year shows here — Netflix, Meralco, the internet, insurance — with what it costs a year."
          />
        )}
        {subs.charges.map((s) => (
          <Row key={s.id} s={s} currency={currency} fmtDate={fmtDate} />
        ))}

        {subs.income.length > 0 && (
          <section aria-label="Repeating income" style={{ marginTop: "1.5rem" }}>
            <div style={{ display: "flex", alignItems: "baseline", margin: "0 0 6px" }}>
              <span className="kin-eyebrow">COMES IN EVERY YEAR</span>
              <span style={{ marginLeft: "auto", fontFamily: "var(--font-numeric)", fontSize: "0.875rem", fontWeight: 600 }}>{formatCurrency(subs.incomePerYear, currency)}</span>
            </div>
            {subs.income.map((s) => (
              <Row key={s.id} s={s} currency={currency} fmtDate={fmtDate} income />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

function Row({ s, currency, fmtDate, income }: { s: Subscription; currency: string; fmtDate: (d: string) => string; income?: boolean }) {
  const when = s.next ? `${s.overdue ? "overdue since" : income ? "next expected" : "next charge"} ${fmtDate(s.next)}` : "no date set";
  return (
    <div style={{ display: "flex", gap: "0.6875rem", alignItems: "baseline", padding: "0.75rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ font: "600 1.0625rem/1.1 var(--font-heading)", display: "block", overflowWrap: "anywhere" }}>{s.name}</span>
        <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
          {REPEAT_LABELS[s.repeat]}
          {s.category ? ` · ${s.category}` : ""} · {when}
        </span>
      </span>
      <span style={{ textAlign: "right", flex: "none", fontVariantNumeric: "tabular-nums" }}>
        <span style={{ font: "600 1rem/1 var(--font-heading)", display: "block", color: income ? "var(--color-accent-700)" : undefined }}>
          {formatCurrency(s.monthly, currency)}
          <span style={{ fontSize: "0.75rem", fontWeight: 400, color: "var(--color-neutral-600)" }}> /mo</span>
        </span>
        <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>{formatCurrency(s.yearly, currency)} a year</span>
        {s.overdue && (
          <span style={{ display: "block", marginTop: "0.25rem" }}>
            <Tag variant="accent">OVERDUE</Tag>
          </span>
        )}
      </span>
    </div>
  );
}
