import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { isGrownUp } from "@/lib/roles";
import { DetailHeader } from "@/components/hub-header";
import { Blueprint, Empty } from "@/components/ui";
import { Icon } from "@/components/icons";
import { formatCurrency } from "@/lib/format";
import { categoryLabel } from "@/lib/wealth";
import { familyDay } from "@/lib/time";
import { getYearReview } from "@/lib/queries/year-review";

const row = { display: "flex", flexWrap: "wrap", columnGap: "0.625rem", rowGap: "0.125rem", alignItems: "baseline", padding: "0.5rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" } as const;
const sub = { fontSize: "0.78125rem", color: "var(--color-neutral-600)" } as const;
const num = { fontFamily: "var(--font-numeric)", fontSize: "0.84375rem", flex: "none" } as const;

/** A year's money in one page (29 October), for planning the next one:
 * lib/year-review.ts. Grown-ups only, read in their own session, as the
 * monthly recap is. The year so far until it ends. */
export default async function YearReviewPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  if (!isGrownUp(me.role)) {
    return (
      <div>
        <DetailHeader backHref="/wealth" eyebrow="Wealth" />
        <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
          <Empty icon={<Icon name="wallet" size={26} />} title="For grown-ups" line="The year in review is for the grown-ups in the household." />
        </div>
      </div>
    );
  }
  const tz = me.families.time_zone || "Asia/Manila";
  const thisYear = Number(familyDay(new Date(), tz).slice(0, 4));
  const asked = Number((await searchParams).year);
  const year = Number.isInteger(asked) && asked >= 2000 && asked <= thisYear ? asked : thisYear;
  const r = await getYearReview(me, year, tz);
  const money = (n: number) => formatCurrency(n, me.families.currency);
  const empty = r.spent === 0 && r.income === 0 && r.saved === 0;
  const line = (label: string, amount: number, note?: string) => (
    <div style={row}>
      <span style={{ flex: "1 1 8rem", minWidth: 0 }}>
        <span style={{ fontSize: "0.9375rem", display: "block" }}>{label}</span>
        {note && <span style={sub}>{note}</span>}
      </span>
      <span style={num}>{money(amount)}</span>
    </div>
  );

  return (
    <div>
      <DetailHeader backHref="/wealth/recap" eyebrow="Wealth" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.875rem" }}>
          <Link href={`/wealth/year?year=${year - 1}`} className="btn btn-secondary" aria-label="The year before" style={{ minHeight: "2.25rem", padding: "0 0.625rem" }}>
            ‹
          </Link>
          <h3 style={{ fontSize: "min(1.75rem, 8vw)", margin: 0, flex: 1, textAlign: "center" }}>
            {year}
            {year === thisYear ? " so far" : ""}
          </h3>
          {year < thisYear ? (
            <Link href={`/wealth/year?year=${year + 1}`} className="btn btn-secondary" aria-label="The year after" style={{ minHeight: "2.25rem", padding: "0 0.625rem" }}>
              ›
            </Link>
          ) : (
            <span style={{ width: "2.25rem" }} />
          )}
        </div>

        {empty ? (
          <Empty icon={<Icon name="wallet" size={26} />} title="Nothing recorded that year" line="Spending, income and savings recorded on Wealth add up here." />
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.5rem", marginBottom: "0.875rem" }}>
              <Blueprint style={{ padding: "0.8125rem" }}>
                <div className="kin-eyebrow">SPENT</div>
                <div style={{ font: "600 min(1.375rem, 5.75vw)/1.1 var(--font-heading)", marginTop: "0.375rem", overflowWrap: "anywhere" }}>{money(r.spent)}</div>
              </Blueprint>
              <Blueprint style={{ padding: "0.8125rem" }}>
                <div className="kin-eyebrow">CAME IN</div>
                <div style={{ font: "600 min(1.375rem, 5.75vw)/1.1 var(--font-heading)", marginTop: "0.375rem", overflowWrap: "anywhere" }}>{money(r.income)}</div>
              </Blueprint>
            </div>

            <div className="kin-eyebrow" style={{ margin: "1rem 0 0.375rem" }}>WHERE IT WENT</div>
            {r.categories.slice(0, 8).map((c) => line(categoryLabel(c.category), c.spent))}

            <div className="kin-eyebrow" style={{ margin: "1rem 0 0.375rem" }}>BORROWING AND OWNING</div>
            {r.interest > 0 && line("Interest on loans", r.interest, "what borrowing cost, from payments recorded with their split")}
            {r.paidDown > 0 && line("Loans paid down", r.paidDown)}
            {r.upkeep > 0 && line("Upkeep on what you own", r.upkeep, "dues, repairs, tax, fuel recorded against an asset")}
            {r.insurance > 0 && line("Insurance", r.insurance)}
            {r.interest + r.paidDown + r.upkeep + r.insurance === 0 && <p style={sub}>No loan payments, upkeep or insurance recorded this year.</p>}
            {r.bought > 0 && line("Bought or added to what you own", r.bought, "a house, a car, an aircon: not spending, it is on A&L")}

            <div className="kin-eyebrow" style={{ margin: "1rem 0 0.375rem" }}>SAVINGS AND NET WORTH</div>
            {r.saved !== 0 && line("Put into goals", r.saved)}
            {r.netWorth ? (
              <div style={row}>
                <span style={{ flex: "1 1 8rem", minWidth: 0, fontSize: "0.9375rem" }}>
                  Net worth {money(r.netWorth.start)} → {money(r.netWorth.end)}
                </span>
                <span style={num}>
                  {r.netWorth.change >= 0 ? "+" : "−"}
                  {money(Math.abs(r.netWorth.change))}
                </span>
              </div>
            ) : (
              <p style={sub}>Net worth shows once Kin has kept it on two days of the year, from your visits to Wealth.</p>
            )}
          </>
        )}
        <p style={{ ...sub, marginTop: "1.25rem" }}>Worked out from what is recorded on Wealth, by the monthly recap&apos;s rules: only the accounts you can see count, transfers are not spending, money put into a goal is savings. Buying something you own is counted apart from spending.</p>
      </div>
    </div>
  );
}
