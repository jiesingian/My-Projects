import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { isGrownUp } from "@/lib/roles";
import { DetailHeader } from "@/components/hub-header";
import { Empty } from "@/components/ui";
import { Icon } from "@/components/icons";
import { formatCurrency } from "@/lib/format";
import { familyDay } from "@/lib/time";
import { categoryLabel, LIABILITY_KIND_LABELS, type LiabilityKind } from "@/lib/wealth";
import { buildStatements, birSummary } from "@/lib/statements";
import { getNetWorth, getNetWorthAtMonthEnd, getStatementEntries } from "@/lib/queries/wealth";

// Rows may wrap at 320px with Simple Kin's larger text, as on the recap.
const row = { display: "flex", flexWrap: "wrap", columnGap: "0.625rem", rowGap: "0.125rem", alignItems: "baseline", padding: "0.4375rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" } as const;
const label = { flex: "1 1 8rem", minWidth: 0, fontSize: "0.875rem" } as const;
const sub = { fontSize: "0.78125rem", color: "var(--color-neutral-600)" } as const;
const num = { fontFamily: "var(--font-numeric)", fontSize: "0.84375rem", flex: "none" } as const;
const total = { ...row, fontWeight: 600, borderBottom: "2px solid color-mix(in srgb, var(--color-text) 25%, transparent)" } as const;

function Heading({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div style={{ margin: "1.5rem 0 0.375rem" }}>
      <div className="kin-eyebrow">{children}</div>
      {note && <div style={{ ...sub, marginTop: "0.25rem" }}>{note}</div>}
    </div>
  );
}

/** Month "YYYY-MM" or year "YYYY", checked; anything else is this month. */
function periodOf(asked: string, today: string): { key: string; start: string; end: string; isYear: boolean; label: string; current: boolean } {
  const thisMonth = today.slice(0, 7);
  const ok = /^\d{4}(-(0[1-9]|1[0-2]))?$/.test(asked) && asked <= thisMonth && asked >= "2020";
  const key = ok ? asked : thisMonth;
  const isYear = key.length === 4;
  const [y, m] = [Number(key.slice(0, 4)), isYear ? 1 : Number(key.slice(5, 7))];
  const start = `${key.slice(0, 4)}-${String(m).padStart(2, "0")}-01`;
  const endDate = isYear ? new Date(Date.UTC(y + 1, 0, 1)) : new Date(Date.UTC(y, m, 1));
  const label = isYear ? key : new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
  return { key, start, end: endDate.toISOString().slice(0, 10), isYear, label, current: isYear ? key === today.slice(0, 4) : key === thisMonth };
}

/** The family's financial statements (Janine, 23 October): income and
 * expenses, where the cash went, net worth in the SALN's shape, how it
 * changed, and for a year a BIR-ready income summary. lib/statements.ts
 * says what counts as what. Grown-ups only; read as the viewer, so only
 * what they can see. */
export default async function StatementsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  if (!isGrownUp(me.role)) {
    return (
      <div>
        <DetailHeader backHref="/wealth" eyebrow="Wealth" />
        <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
          <Empty icon={<Icon name="wallet" size={26} />} title="For grown-ups" line="The family statements are for the grown-ups in the household." />
        </div>
      </div>
    );
  }

  const today = familyDay(new Date(), me.families.time_zone || undefined);
  const p = periodOf((await searchParams).period ?? "", today);
  const money = (n: number) => formatCurrency(n, me.families.currency);
  const lastMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  const startMonthBefore = new Date(Date.UTC(Number(p.start.slice(0, 4)), Number(p.start.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);

  const [entries, nw, startNetWorth] = await Promise.all([
    getStatementEntries(me.family_id, p.start, p.end),
    getNetWorth(me.family_id, "all", today),
    p.current ? getNetWorthAtMonthEnd(me.id, startMonthBefore) : Promise.resolve(null),
  ]);
  const s = buildStatements(entries);
  const bir = p.isYear ? birSummary(s.income) : null;
  const cashChange = s.cash.dayToDay + s.cash.things + s.cash.borrowing - s.cash.saved;

  const choices = [
    { key: today.slice(0, 7), label: "This month" },
    { key: lastMonth, label: "Last month" },
    { key: today.slice(0, 4), label: "This year" },
    { key: String(Number(today.slice(0, 4)) - 1), label: "Last year" },
  ];

  return (
    <div>
      <DetailHeader backHref="/wealth" eyebrow="Wealth" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <h3 style={{ fontSize: "2rem", margin: "0 0 4px" }}>Family statements</h3>
        <p style={{ ...sub, margin: "0 0 12px" }}>{p.label} · in the shape an annual report or the SALN uses, kept simple for the family.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
          {choices.map((c) => (
            <Link key={c.key} href={`/wealth/statements?period=${c.key}`} className="chip" data-active={c.key === p.key} style={{ textDecoration: "none" }}>
              {c.label}
            </Link>
          ))}
        </div>

        <Heading note="What came in, less what it cost to live and to borrow. Paying a loan down, buying or adding to an asset, and saving into a goal are not costs: the money is still the family's, in another form.">
          INCOME &amp; EXPENSES
        </Heading>
        {s.income.map((i) => (
          <div key={`in-${i.category}`} style={row}>
            <span style={label}>{categoryLabel(i.category)}</span>
            <span style={num}>{money(i.amount)}</span>
          </div>
        ))}
        <div style={total}>
          <span style={label}>Total income</span>
          <span style={num}>{money(s.incomeTotal)}</span>
        </div>
        {s.living.map((l) => (
          <div key={`out-${l.category}`} style={row}>
            <span style={label}>{categoryLabel(l.category)}</span>
            <span style={num}>−{money(l.amount)}</span>
          </div>
        ))}
        {s.interest > 0 && (
          <div style={row}>
            <span style={label}>Loan interest</span>
            <span style={num}>−{money(s.interest)}</span>
          </div>
        )}
        <div style={total}>
          <span style={label}>{s.surplus >= 0 ? "Left over (saved)" : "Spent more than came in"}</span>
          <span style={{ ...num, color: s.surplus < 0 ? "var(--color-accent-700)" : undefined }}>{money(s.surplus)}</span>
        </div>

        <Heading note="Every peso that moved, in the three groups a cash flow statement uses.">WHERE THE CASH WENT</Heading>
        <div style={row}>
          <span style={label}>Day to day<span style={{ ...sub, display: "block" }}>Income less living costs and loan interest</span></span>
          <span style={num}>{money(s.cash.dayToDay)}</span>
        </div>
        <div style={row}>
          <span style={label}>
            Buying and selling things
            <span style={{ ...sub, display: "block" }}>{money(s.cash.bought)} into assets · {money(s.cash.sold)} from selling</span>
          </span>
          <span style={num}>{money(s.cash.things)}</span>
        </div>
        <div style={row}>
          <span style={label}>
            Borrowing and lending
            <span style={{ ...sub, display: "block" }}>{money(s.cash.debtPaid)} paid off loans · {money(s.cash.utangBack)} utang paid back to us</span>
          </span>
          <span style={num}>{money(s.cash.borrowing)}</span>
        </div>
        <div style={row}>
          <span style={label}>Set aside into savings goals</span>
          <span style={num}>{money(-s.cash.saved)}</span>
        </div>
        <div style={total}>
          <span style={label}>Cash in accounts went {cashChange >= 0 ? "up" : "down"}</span>
          <span style={num}>{money(cashChange)}</span>
        </div>

        <Heading note={`As of ${today}. Like the SALN: each property at what it cost and what it is worth now, each debt with its lender.`}>NET WORTH</Heading>
        <div style={row}>
          <span style={label}>Cash and savings accounts</span>
          <span style={num}>{money(nw.cashTotal)}</span>
        </div>
        {nw.goalTotal > 0 && (
          <div style={row}>
            <span style={label}>Savings goals</span>
            <span style={num}>{money(nw.goalTotal)}</span>
          </div>
        )}
        {nw.assets.map((a) => (
          <div key={a.id} style={row}>
            <span style={label}>
              {a.name}
              <span style={{ ...sub, display: "block" }}>
                {a.acquired_on ? `Acquired ${a.acquired_on.slice(0, 4)} · ` : ""}cost {money(a.worth.putIn)}
              </span>
            </span>
            <span style={num}>{money(a.worth.total)}</span>
          </div>
        ))}
        {nw.receivables > 0 && (
          <div style={row}>
            <span style={label}>Utang and paluwagan owed to us</span>
            <span style={num}>{money(nw.receivables)}</span>
          </div>
        )}
        <div style={total}>
          <span style={label}>Total owned</span>
          <span style={num}>{money(nw.cashTotal + nw.goalTotal + nw.assetTotal + nw.receivables)}</span>
        </div>
        {nw.liabilities.map((l) => (
          <div key={l.id} style={row}>
            <span style={label}>
              {l.name}
              <span style={{ ...sub, display: "block" }}>
                {LIABILITY_KIND_LABELS[l.kind as LiabilityKind] ?? l.kind}
                {l.lender ? ` · ${l.lender}` : ""}
                {l.interest_rate != null ? ` · ${Number(l.interest_rate)}% a year` : ""}
              </span>
            </span>
            <span style={num}>−{money(Number(l.balance))}</span>
          </div>
        ))}
        {nw.payables > 0 && (
          <div style={row}>
            <span style={label}>Utang and paluwagan we owe</span>
            <span style={num}>−{money(nw.payables)}</span>
          </div>
        )}
        <div style={total}>
          <span style={label}>Net worth</span>
          <span style={num}>{money(nw.netWorth)}</span>
        </div>

        {p.current && (
          <>
            <Heading note="From the end of the period before to today.">HOW NET WORTH CHANGED</Heading>
            {startNetWorth === null ? (
              <p style={sub}>Kin keeps a net worth point each month from when Wealth is opened; there is none for the start of this period yet.</p>
            ) : (
              <>
                <div style={row}>
                  <span style={label}>At the start</span>
                  <span style={num}>{money(startNetWorth)}</span>
                </div>
                <div style={row}>
                  <span style={label}>Left over from income</span>
                  <span style={num}>{money(s.surplus)}</span>
                </div>
                <div style={row}>
                  <span style={label}>
                    Values and other changes
                    <span style={{ ...sub, display: "block" }}>Property and items gaining or losing value, balances set by hand</span>
                  </span>
                  <span style={num}>{money(nw.netWorth - startNetWorth - s.surplus)}</span>
                </div>
                <div style={total}>
                  <span style={label}>Now</span>
                  <span style={num}>{money(nw.netWorth)}</span>
                </div>
              </>
            )}
          </>
        )}

        {bir && (
          <>
            <Heading note="Income grouped the way the BIR's annual income tax return groups it. For your reference only: it is not a return, and an accountant has the last word. Employees with one employer are usually covered by the employer's BIR Form 2316 (substituted filing).">
              BIR-READY INCOME SUMMARY · {p.key}
            </Heading>
            {bir.groups.map((g) => (
              <div key={g.key} style={{ ...row, display: "block" }}>
                <div style={{ display: "flex", gap: "0.625rem", alignItems: "baseline" }}>
                  <span style={{ ...label, fontWeight: 600 }}>{g.label}</span>
                  <span style={num}>{money(g.total)}</span>
                </div>
                {g.lines.map((l) => (
                  <div key={l.category} style={{ display: "flex", gap: "0.625rem", ...sub }}>
                    <span style={{ flex: 1 }}>{categoryLabel(l.category)}</span>
                    <span style={{ fontFamily: "var(--font-numeric)" }}>{money(l.amount)}</span>
                  </div>
                ))}
                <div style={{ ...sub, marginTop: "0.25rem" }}>{g.note}</div>
              </div>
            ))}
            {bir.otherTotal > 0 && (
              <div style={row}>
                <span style={label}>Other income<span style={{ ...sub, display: "block" }}>Ask an accountant how these are reported.</span></span>
                <span style={num}>{money(bir.otherTotal)}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
