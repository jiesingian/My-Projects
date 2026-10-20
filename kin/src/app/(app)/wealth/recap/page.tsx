import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { isGrownUp } from "@/lib/roles";
import { DetailHeader } from "@/components/hub-header";
import { Blueprint, Empty, Tag } from "@/components/ui";
import { Icon } from "@/components/icons";
import { formatCurrency } from "@/lib/format";
import { familyDate } from "@/lib/format-family";
import { familyDay } from "@/lib/time";
import { getMoneyRecap } from "@/lib/queries/money-recap";
import { isRecapMonth, monthBefore, monthLabel, recapMonthFor, type BillLine } from "@/lib/money-recap";

// A row may wrap, and its label keeps 8rem before it gives way: with Simple
// Kin's larger text at 320px, a label squeezed beside a tag and an amount
// broke mid-word ("Grocer / ies", "15/09/20 / 26").
const row = { display: "flex", flexWrap: "wrap", columnGap: "0.625rem", rowGap: "0.125rem", alignItems: "baseline", padding: "0.5rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" } as const;
const sub = { fontSize: "0.78125rem", color: "var(--color-neutral-600)" } as const;
const num = { fontFamily: "var(--font-numeric)", fontSize: "0.84375rem", flex: "none" } as const;

const OUTCOME: Record<BillLine["outcome"], string> = { on_time: "PAID ON TIME", late: "PAID LATE", unpaid_late: "NOT PAID", unpaid: "STILL DUE" };

/** Last month in one page (19 October), the page the push on the 1st opens.
 * Rule-based, no AI: lib/money-recap.ts. Grown-ups only; read in their own
 * session, so it holds only the accounts they can see. */
export default async function MoneyRecapPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");

  if (!isGrownUp(me.role)) {
    return (
      <div>
        <DetailHeader backHref="/wealth" eyebrow="Wealth" />
        <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
          <Empty icon={<Icon name="wallet" size={26} />} title="For grown-ups" line="The monthly money recap is for the grown-ups in the household." />
        </div>
      </div>
    );
  }

  const tz = me.families.time_zone || undefined;
  const today = familyDay(new Date(), tz);
  const asked = (await searchParams).month ?? "";
  const month = isRecapMonth(asked, today) ? asked : recapMonthFor(today);
  const [r, fmtDate] = await Promise.all([getMoneyRecap(me, month, today, tz ?? "Asia/Manila"), familyDate()]);
  const currency = me.families.currency;
  const money = (n: number) => formatCurrency(n, currency);
  const next = (() => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
    return isRecapMonth(d, today) ? d : null;
  })();
  const empty = r.spent === 0 && r.income === 0 && r.bills.length === 0 && r.saved === 0;

  return (
    <div>
      <DetailHeader backHref="/wealth?seg=cashflow" eyebrow="Wealth" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.875rem" }}>
          <Link href={`/wealth/recap?month=${monthBefore(month)}`} className="btn btn-secondary" aria-label="The month before" style={{ minHeight: "2.25rem", padding: "0 0.625rem" }}>
            ‹
          </Link>
          <h3 style={{ fontSize: "min(1.75rem, 8vw)", margin: 0, flex: 1, textAlign: "center" }}>{monthLabel(month)}</h3>
          {next ? (
            <Link href={`/wealth/recap?month=${next}`} className="btn btn-secondary" aria-label="The month after" style={{ minHeight: "2.25rem", padding: "0 0.625rem" }}>
              ›
            </Link>
          ) : (
            <span style={{ width: "2.25rem" }} />
          )}
        </div>

        {empty ? (
          <Empty icon={<Icon name="wallet" size={26} />} title="Nothing recorded that month" line="Spending, bills and savings recorded on Wealth show up here the month after." />
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.5rem", marginBottom: "0.875rem" }}>
              <Blueprint style={{ padding: "0.8125rem" }}>
                <div className="kin-eyebrow">SPENT</div>
                <div style={{ font: "600 min(1.375rem, 5.75vw)/1.1 var(--font-heading)", marginTop: "0.375rem", overflowWrap: "anywhere" }}>{money(r.spent)}</div>
                <div style={sub}>{r.budget > 0 ? `of ${money(r.budget)} budgeted` : "no budget set"}</div>
              </Blueprint>
              <Blueprint style={{ padding: "0.8125rem" }}>
                <div className="kin-eyebrow">CAME IN</div>
                <div style={{ font: "600 min(1.375rem, 5.75vw)/1.1 var(--font-heading)", marginTop: "0.375rem", overflowWrap: "anywhere" }}>{money(r.income)}</div>
                <div style={sub}>{r.spentLastMonth > 0 ? `spent ${money(r.spentLastMonth)} the month before` : " "}</div>
              </Blueprint>
            </div>

            {r.changes.length > 0 && (
              <>
                <div className="kin-eyebrow" style={{ margin: "1rem 0 0.375rem" }}>BIGGEST CHANGES FROM {monthLabel(monthBefore(month)).split(" ")[0].toUpperCase()}</div>
                {r.changes.map((c) => (
                  <div key={c.category} style={row}>
                    <span style={{ flex: "1 1 8rem", minWidth: 0, fontSize: "0.9375rem" }}>{c.category}</span>
                    <span style={sub}>
                      {c.kind === "new" ? "new this month" : c.kind === "gone" ? "nothing this month" : `${money(c.before)} → ${money(c.now)}`}
                    </span>
                    <span style={num}>
                      {c.change > 0 ? "+" : "−"}
                      {money(Math.abs(c.change))}
                    </span>
                  </div>
                ))}
              </>
            )}

            <div className="kin-eyebrow" style={{ margin: "1rem 0 0.375rem" }}>SPENT AGAINST BUDGET</div>
            {r.categories.length === 0 && <p style={sub}>No spending recorded.</p>}
            {r.categories.map((c) => {
              const pct = c.budget ? Math.min(100, Math.round((c.spent / c.budget) * 100)) : 0;
              return (
                <div key={c.category} style={{ padding: "0.5rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", columnGap: "0.5rem", alignItems: "baseline" }}>
                    <span style={{ flex: "1 1 8rem", minWidth: 0, fontSize: "0.9375rem" }}>{c.category}</span>
                    {c.over && <Tag variant="accent">OVER</Tag>}
                    <span style={num}>
                      {money(c.spent)}
                      {c.budget !== null ? ` / ${money(c.budget)}` : ""}
                    </span>
                  </div>
                  {c.budget !== null && c.budget > 0 && (
                    <div style={{ height: 6, border: "1px solid var(--color-divider)", background: "var(--color-bg)", marginTop: "0.3125rem" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: c.over ? "var(--color-accent-700)" : "var(--color-accent)" }} />
                    </div>
                  )}
                </div>
              );
            })}

            <div className="kin-eyebrow" style={{ margin: "1rem 0 0.375rem" }}>
              BILLS · {r.billCounts.onTime} ON TIME · {r.billCounts.late} LATE · {r.billCounts.unpaid} NOT PAID
            </div>
            {r.bills.length === 0 && <p style={sub}>No bills fell due that month.</p>}
            {r.bills.map((b, i) => (
              <div key={`${b.name}-${i}`} style={row}>
                <span style={{ flex: "1 1 8rem", minWidth: 0 }}>
                  <span style={{ fontSize: "0.9375rem", display: "block" }}>{b.name}</span>
                  <span style={sub}>
                    Due {fmtDate(b.dueDate)}
                    {b.paidDay ? ` · paid ${fmtDate(b.paidDay)}` : ""}
                  </span>
                </span>
                <Tag variant={b.outcome === "on_time" ? "outline" : b.outcome === "unpaid" ? "neutral" : "accent"}>{OUTCOME[b.outcome]}</Tag>
                <span style={num}>{money(b.amount)}</span>
              </div>
            ))}

            <div className="kin-eyebrow" style={{ margin: "1rem 0 0.375rem" }}>SAVINGS · {money(r.saved)} PUT BY</div>
            {r.goals.length === 0 && <p style={sub}>No savings goals yet.</p>}
            {r.goals.map((g) => (
              <div key={g.id} style={row}>
                <span style={{ flex: "1 1 8rem", minWidth: 0 }}>
                  <span style={{ fontSize: "0.9375rem", display: "block" }}>{g.title}</span>
                  <span style={sub}>
                    {money(g.current)} of {money(g.target)} now · {g.pct}%
                  </span>
                </span>
                <span style={num}>{g.putIn === 0 ? "—" : `${g.putIn > 0 ? "+" : "−"}${money(Math.abs(g.putIn))}`}</span>
              </div>
            ))}

            <div className="kin-eyebrow" style={{ margin: "1rem 0 0.375rem" }}>NET WORTH</div>
            {r.netWorth ? (
              <div style={row}>
                <span style={{ flex: "1 1 8rem", minWidth: 0, fontSize: "0.9375rem" }}>
                  {money(r.netWorth.start)} → {money(r.netWorth.end)}
                </span>
                <span style={num}>
                  {r.netWorth.change >= 0 ? "+" : "−"}
                  {money(Math.abs(r.netWorth.change))}
                </span>
              </div>
            ) : (
              <p style={sub}>Kin keeps your net worth from your visits to Wealth&apos;s Assets view; open it at least once a month and the change shows here.</p>
            )}
          </>
        )}

        <p style={{ ...sub, marginTop: "1.25rem" }}>
          Worked out from what is recorded on Wealth, by simple rules. Only the accounts you can see count{me.wealth_include_private === false ? ", and your own private accounts are left out, as you chose for All" : ""}. Transfers between accounts are not spending; money put into a goal is savings.
        </p>
      </div>
    </div>
  );
}
