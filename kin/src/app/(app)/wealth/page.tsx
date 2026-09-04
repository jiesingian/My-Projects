import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getWealthPane, getGoals, getBills, getNetWorth, getAccounts, type WealthScope, type LedgerEntry } from "@/lib/queries/wealth";
import { HubHeader } from "@/components/hub-header";
import { Blueprint, Tag } from "@/components/ui";
import { AddAccountForm, AddBillForm, SetBudgetControl, SetTargetControl, AllocationEditor } from "@/components/wealth-controls";
import {
  PayBillControl,
  GoalContributeControl,
  PendingEntryActions,
  ValueUpdateControl,
  RemoveButton,
  type PickableAccount,
} from "@/components/money-actions";
import { formatCurrency, formatDate } from "@/lib/format";
import { ACCOUNT_TYPE_LABELS, ASSET_KIND_LABELS, LIABILITY_KIND_LABELS, type AccountType, type AssetKind, type LiabilityKind } from "@/lib/wealth";

const SEGMENTS = ["joint", "mine", "goals", "bills", "assets"] as const;
type Seg = (typeof SEGMENTS)[number];
const SEGMENT_LABELS: Record<Seg, string> = { joint: "Joint", mine: "Mine", goals: "Goals", bills: "Bills", assets: "Assets" };

export default async function WealthPage({ searchParams }: { searchParams: Promise<{ seg?: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const sp = await searchParams;
  const seg: Seg = (SEGMENTS as readonly string[]).includes(sp.seg ?? "") ? (sp.seg as Seg) : "joint";

  const segments = SEGMENTS.map((s) => ({ label: SEGMENT_LABELS[s], href: `/wealth?seg=${s}`, active: s === seg }));
  const currency = me.families.currency;

  return (
    <div>
      <HubHeader n="05" title="Wealth" segments={segments} />
      <div style={{ padding: "0 22px 22px" }}>
        {(seg === "joint" || seg === "mine") && <ScopePane scope={seg} familyId={me.family_id} memberId={me.id} currency={currency} />}
        {seg === "goals" && <GoalsPane familyId={me.family_id} memberId={me.id} currency={currency} />}
        {seg === "bills" && <BillsPane familyId={me.family_id} memberId={me.id} currency={currency} />}
        {seg === "assets" && <AssetsPane familyId={me.family_id} memberId={me.id} currency={currency} />}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- shared bits */

function Hero({ label, amount, currency, caption }: { label: string; amount: number; currency: string; caption?: string }) {
  return (
    <Blueprint style={{ padding: 15, marginBottom: 14 }}>
      <div style={{ font: "600 13px/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-neutral-600)" }}>{label}</div>
      <div style={{ font: "600 38px/1.05 var(--font-heading)", letterSpacing: "-.02em", margin: "9px 0 0" }}>{formatCurrency(amount, currency)}</div>
      {caption && <div style={{ fontSize: 13, color: "var(--color-neutral-600)", marginTop: 6 }}>{caption}</div>}
    </Blueprint>
  );
}

function FlowRow({ income, expense, currency }: { income: number; expense: number; currency: string }) {
  const net = income - expense;
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      {[
        { k: "IN", v: income },
        { k: "OUT", v: expense },
        { k: "NET", v: net },
      ].map((cell) => (
        <div key={cell.k} style={{ flex: 1, border: "1px solid var(--color-divider)", padding: "9px 10px" }}>
          <div style={{ font: "600 9px/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-neutral-600)" }}>{cell.k}</div>
          <div style={{ fontFamily: "var(--font-numeric)", fontSize: 13, marginTop: 5 }}>
            {cell.k === "NET" && cell.v > 0 ? "+" : cell.k === "NET" && cell.v < 0 ? "−" : ""}
            {formatCurrency(Math.abs(cell.v), currency)}
          </div>
        </div>
      ))}
    </div>
  );
}

function Meter({ label, value, cap, currency, note }: { label: string; value: number; cap: number; currency: string; note?: string }) {
  const pct = cap > 0 ? Math.min(100, Math.round((value / cap) * 100)) : 0;
  const over = cap > 0 && value > cap;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: 5 }}>
        <span style={{ font: "600 13px/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-neutral-600)" }}>{label}</span>
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-numeric)", fontSize: 13 }}>
          {formatCurrency(value, currency)} of {formatCurrency(cap, currency)}
        </span>
      </div>
      <div style={{ height: 10, border: "1px solid var(--color-divider)" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: over ? "var(--color-accent-700)" : "var(--color-accent)" }} />
      </div>
      {(note || over) && (
        <div style={{ fontSize: 12.5, color: over ? "var(--color-accent-700)" : "var(--color-neutral-600)", marginTop: 4 }}>
          {over ? `Over by ${formatCurrency(value - cap, currency)}` : note}
        </div>
      )}
    </div>
  );
}

type HistoryPoint = { key: string; label: string; income: number; expense: number };

/** Six months of money in against money out. Two series, so each is named in
 * the legend and always sits in the same slot within its month — never told
 * apart by colour alone. */
function HistoryStrip({ history, currency }: { history: HistoryPoint[]; currency: string }) {
  const peak = Math.max(1, ...history.flatMap((h) => [h.income, h.expense]));
  const busiest = history.reduce((a, b) => (b.expense > a.expense ? b : a), history[0]);

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: 9 }}>
        <span style={{ font: "600 13px/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-neutral-600)" }}>LAST SIX MONTHS</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 12, fontSize: 12, color: "var(--color-neutral-600)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <i style={{ width: 8, height: 8, background: "var(--color-accent)", display: "inline-block" }} /> In
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <i style={{ width: 8, height: 8, background: "color-mix(in srgb, var(--color-text) 40%, transparent)", display: "inline-block" }} /> Out
          </span>
        </span>
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 62, borderBottom: "1px solid var(--color-divider)", paddingBottom: 1 }}>
        {history.map((h) => (
          <div key={h.key} style={{ flex: 1, display: "flex", gap: 2, alignItems: "flex-end", height: "100%" }}>
            <span
              title={`In ${formatCurrency(h.income, currency)}`}
              style={{
                flex: 1,
                height: `${Math.max(h.income > 0 ? 3 : 0, (h.income / peak) * 100)}%`,
                background: "var(--color-accent)",
                borderRadius: "3px 3px 0 0",
              }}
            />
            <span
              title={`Out ${formatCurrency(h.expense, currency)}`}
              style={{
                flex: 1,
                height: `${Math.max(h.expense > 0 ? 3 : 0, (h.expense / peak) * 100)}%`,
                background: "color-mix(in srgb, var(--color-text) 40%, transparent)",
                borderRadius: "3px 3px 0 0",
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 5 }}>
        {history.map((h) => (
          <div key={h.key} style={{ flex: 1, textAlign: "center", fontSize: 8.5, letterSpacing: ".06em", color: "var(--color-neutral-600)" }}>
            {h.label}
          </div>
        ))}
      </div>
      {busiest && busiest.expense > 0 && (
        <div style={{ fontSize: 12.5, color: "var(--color-neutral-600)", marginTop: 7 }}>
          Heaviest spend was {busiest.label} at {formatCurrency(busiest.expense, currency)}.
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ font: "600 13px/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-neutral-600)", margin: "20px 0 8px" }}>{children}</div>
  );
}

function EntryRow({ entry, currency, showAccount }: { entry: LedgerEntry; currency: string; showAccount?: boolean }) {
  const isIn = entry.direction === "in";
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "10px 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 14, display: "block" }}>{entry.particulars}</span>
        <span style={{ fontSize: 12.5, color: "var(--color-neutral-600)" }}>
          {formatDate(entry.occurred_at)}
          {entry.category ? ` · ${entry.category}` : ""}
          {showAccount && entry.accountName ? ` · ${entry.accountName}` : ""}
        </span>
      </span>
      <span style={{ fontFamily: "var(--font-numeric)", fontSize: 13, flex: "none", color: isIn ? "var(--color-accent-700)" : "inherit" }}>
        {isIn ? "+" : "−"}
        {formatCurrency(Number(entry.amount), currency)}
      </span>
    </div>
  );
}

function PendingBlock({ pending, currency }: { pending: LedgerEntry[]; currency: string }) {
  if (pending.length === 0) return null;
  return (
    <>
      <SectionLabel>WAITING ON YOU</SectionLabel>
      {pending.map((p) => (
        <Blueprint key={p.id} style={{ padding: 12, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 14 }}>{p.particulars}</span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--font-numeric)", fontSize: 13 }}>
              {p.direction === "in" ? "+" : "−"}
              {formatCurrency(Number(p.amount), currency)}
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--color-neutral-600)", marginTop: 3 }}>
            {p.accountName} · started {formatDate(p.occurred_at)} · not counted yet
          </div>
          <PendingEntryActions transactionId={p.id} />
        </Blueprint>
      ))}
    </>
  );
}

function QuickActions() {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
      {[
        { label: "MONEY IN", mode: "in" },
        { label: "MONEY OUT", mode: "out" },
        { label: "TRANSFER", mode: "transfer" },
      ].map((a) => (
        <Link
          key={a.mode}
          href={`/wealth/transact?mode=${a.mode}`}
          className="btn btn-secondary"
          style={{ flex: 1, minHeight: 40, fontSize: 13, letterSpacing: ".04em", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          {a.label}
        </Link>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------- joint & mine */

async function ScopePane({ scope, familyId, memberId, currency }: { scope: WealthScope; familyId: string; memberId: string; currency: string }) {
  const pane = await getWealthPane(familyId, memberId, scope);
  const isJoint = scope === "joint";
  const monthLabel = new Date(pane.year, pane.month - 1, 1).toLocaleString("en-PH", { month: "long", year: "numeric" }).toUpperCase();
  const categories = [...pane.allocations, ...pane.unbudgeted];

  return (
    <>
      <Hero
        label={isJoint ? "JOINT ACCOUNTS · COMBINED" : "MY ACCOUNTS · COMBINED"}
        amount={pane.total}
        currency={currency}
        caption={`${pane.accounts.length} account${pane.accounts.length === 1 ? "" : "s"} · ${monthLabel}`}
      />

      <QuickActions />
      <FlowRow income={pane.monthIncome} expense={pane.monthExpense} currency={currency} />

      {isJoint ? (
        <>
          <Meter label="SPENT OF BUDGET" value={pane.monthExpense} cap={pane.budgetAmount} currency={currency} note="Set the month's ceiling below." />
          <SetBudgetControl familyId={familyId} month={pane.month} year={pane.year} current={pane.budgetAmount} />
        </>
      ) : (
        <>
          <Meter label="EARNED OF TARGET" value={pane.monthIncome} cap={pane.budgetAmount} currency={currency} note="Your own revenue target this month." />
          <SetTargetControl memberId={memberId} familyId={familyId} month={pane.month} year={pane.year} current={pane.budgetAmount} />
        </>
      )}

      <HistoryStrip history={pane.history} currency={currency} />

      <SectionLabel>{isJoint ? "BUDGET VS SPEND BY CATEGORY" : "WHERE IT WENT THIS MONTH"}</SectionLabel>
      {categories.length === 0 && <p style={{ fontSize: 13.5, color: "var(--color-neutral-600)" }}>Nothing spent yet this month.</p>}
      {categories.map((c) => {
        const cap = c.amount > 0 ? c.amount : c.spent;
        const pct = cap > 0 ? Math.min(100, Math.round((c.spent / cap) * 100)) : 0;
        const over = c.amount > 0 && c.spent > c.amount;
        return (
          <div key={c.id} style={{ marginBottom: 11 }}>
            <div style={{ display: "flex", fontSize: 13.5, marginBottom: 4 }}>
              <span>{c.category}</span>
              {c.amount === 0 && <span style={{ fontSize: 12, color: "var(--color-neutral-600)", marginLeft: 6 }}>no budget</span>}
              <span style={{ marginLeft: "auto", fontFamily: "var(--font-numeric)", fontSize: 13 }}>
                {formatCurrency(c.spent, currency)}
                {c.amount > 0 ? ` / ${formatCurrency(c.amount, currency)}` : ""}
              </span>
            </div>
            <div style={{ height: 7, background: "var(--color-neutral-200)" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: over ? "var(--color-accent-700)" : "var(--color-accent)" }} />
            </div>
          </div>
        );
      })}
      {isJoint && <div style={{ marginTop: 12 }}><AllocationEditor budgeted={pane.allocations.map((a) => a.category)} /></div>}

      <PendingBlock pending={pane.pending} currency={currency} />

      <SectionLabel>{isJoint ? "JOINT ACCOUNTS" : "MY ACCOUNTS"}</SectionLabel>
      {pane.accounts.length === 0 && <p style={{ fontSize: 13.5, color: "var(--color-neutral-600)" }}>No accounts yet.</p>}
      {pane.accounts.map((a) => (
        <Link
          key={a.id}
          href={`/wealth/accounts/${a.id}`}
          style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)", textDecoration: "none", color: "inherit" }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ font: "600 16px/1.1 var(--font-heading)", display: "block" }}>{a.name}</span>
            <span style={{ fontSize: 13, color: "var(--color-neutral-600)" }}>
              {ACCOUNT_TYPE_LABELS[a.account_type as AccountType] ?? a.account_type}
              {a.institution ? ` · ${a.institution}` : ""}
              {a.sub_note ? ` · ${a.sub_note}` : ""}
            </span>
          </span>
          <span style={{ textAlign: "right", flex: "none" }}>
            <span style={{ fontFamily: "var(--font-numeric)", fontSize: 13, display: "block" }}>{formatCurrency(a.balance, currency)}</span>
            {a.pendingCount > 0 && <Tag variant="outline">{a.pendingCount} PENDING</Tag>}
          </span>
        </Link>
      ))}
      <AddAccountForm isJoint={isJoint} />

      {pane.recent.length > 0 && (
        <>
          <SectionLabel>RECENT ACTIVITY</SectionLabel>
          {pane.recent.map((e) => (
            <EntryRow key={e.id} entry={e} currency={currency} showAccount />
          ))}
        </>
      )}

      {!isJoint && (
        <div style={{ fontSize: 13, color: "var(--color-neutral-600)", marginTop: 14 }}>
          Nothing on this tab appears in the joint view. Sharing a record is a per-record choice.
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ goals */

async function GoalsPane({ familyId, memberId, currency }: { familyId: string; memberId: string; currency: string }) {
  const [goals, accounts] = await Promise.all([getGoals(familyId), getAccounts(familyId)]);
  const pickable = toPickable(accounts, memberId);
  const saved = goals.reduce((sum, g) => sum + Number(g.current_amount), 0);
  const targeted = goals.reduce((sum, g) => sum + Number(g.target_amount ?? 0), 0);

  return (
    <>
      <Hero
        label="SET ASIDE TOWARDS GOALS"
        amount={saved}
        currency={currency}
        caption={targeted > 0 ? `of ${formatCurrency(targeted, currency)} across ${goals.length} goal${goals.length === 1 ? "" : "s"}` : undefined}
      />
      {targeted > 0 && <Meter label="ALL GOALS" value={saved} cap={targeted} currency={currency} />}

      {goals.length === 0 && <p style={{ fontSize: 13.5, color: "var(--color-neutral-600)" }}>No goals yet.</p>}
      {goals.map((g) => {
        const target = Number(g.target_amount ?? 0);
        const current = Number(g.current_amount);
        const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
        const owner = (g.owner as unknown as { full_name: string } | null)?.full_name?.split(" ")[0]?.toUpperCase();
        return (
          <Blueprint key={g.id} style={{ padding: 13, marginBottom: 13 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ font: "600 18px/1.05 var(--font-heading)" }}>{g.title}</span>
              <Tag variant={g.is_joint ? "accent" : "neutral"} className="ml-auto">
                {g.is_joint ? "JOINT" : owner ?? "MINE"}
              </Tag>
            </div>
            {g.sub_note && <div style={{ fontSize: 13, color: "var(--color-neutral-600)", margin: "4px 0 9px" }}>{g.sub_note}</div>}
            <div style={{ height: 8, border: "1px solid var(--color-divider)", background: "var(--color-bg)", marginTop: 8 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: "var(--color-accent)" }} />
            </div>
            <div style={{ display: "flex", fontSize: 12.5, color: "var(--color-neutral-600)", marginTop: 5 }}>
              <span>
                {formatCurrency(current, currency)} of {formatCurrency(target, currency)}
              </span>
              <span style={{ marginLeft: "auto" }}>{pct}%</span>
            </div>
            {g.target_date && (
              <div style={{ fontSize: 12.5, color: "var(--color-neutral-600)", marginTop: 5 }}>
                Target date {formatDate(g.target_date)}
                {target > current ? ` · ${formatCurrency(target - current, currency)} to go` : " · funded"}
              </div>
            )}
            <GoalContributeControl goalId={g.id} accounts={pickable} currency={currency} />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
              <RemoveButton id={g.id} kind="goal" label={`Delete "${g.title}"`} />
            </div>
          </Blueprint>
        );
      })}

      <Link href="/wealth/add" className="btn btn-primary btn-block" style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em", marginTop: 16 }}>
        + ADD GOAL
      </Link>
    </>
  );
}

/* ------------------------------------------------------------------ bills */

async function BillsPane({ familyId, memberId, currency }: { familyId: string; memberId: string; currency: string }) {
  const [bills, accounts] = await Promise.all([getBills(familyId), getAccounts(familyId)]);
  const pickable = toPickable(accounts, memberId);
  const open = bills.filter((b) => b.status !== "paid");
  const settled = bills.filter((b) => b.status === "paid");
  const dueTotal = open.reduce((sum, b) => sum + Number(b.amount), 0);

  return (
    <>
      <Hero label="STILL TO SETTLE" amount={dueTotal} currency={currency} caption={`${open.length} open bill${open.length === 1 ? "" : "s"}`} />

      {open.length === 0 && <p style={{ fontSize: 13.5, color: "var(--color-neutral-600)" }}>Everything is settled.</p>}
      {open.map((b) => (
        <div key={b.id} style={{ padding: "12px 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
          <div style={{ display: "flex", gap: 11, alignItems: "baseline" }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ font: "600 17px/1.1 var(--font-heading)", display: "block" }}>{b.name}</span>
              <span style={{ fontSize: 13, color: "var(--color-neutral-600)" }}>
                {b.category ?? "Utilities"}
                {b.due_date ? ` · due ${formatDate(b.due_date)}` : ""}
              </span>
            </span>
            <span style={{ textAlign: "right", flex: "none" }}>
              <span style={{ font: "600 16px/1 var(--font-heading)", display: "block" }}>{formatCurrency(Number(b.amount), currency)}</span>
              <Tag variant={b.status === "scheduled" ? "outline" : "accent"}>{b.status.toUpperCase()}</Tag>
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <PayBillControl billId={b.id} amount={Number(b.amount)} accounts={pickable} currency={currency} />
            <span style={{ marginLeft: "auto" }}>
              <RemoveButton id={b.id} kind="bill" label={`Delete "${b.name}"`} />
            </span>
          </div>
        </div>
      ))}

      <AddBillForm />

      {settled.length > 0 && (
        <>
          <SectionLabel>SETTLED</SectionLabel>
          {settled.slice(0, 12).map((b) => (
            <div key={b.id} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "10px 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 14, display: "block" }}>{b.name}</span>
                <span style={{ fontSize: 12.5, color: "var(--color-neutral-600)" }}>
                  {b.paid_at ? `paid ${formatDate(b.paid_at)}` : "paid"}
                  {b.paidFromName ? ` from ${b.paidFromName}` : ""}
                </span>
              </span>
              <span style={{ fontFamily: "var(--font-numeric)", fontSize: 13 }}>{formatCurrency(Number(b.amount), currency)}</span>
            </div>
          ))}
        </>
      )}
    </>
  );
}

/* ----------------------------------------------------------------- assets */

async function AssetsPane({ familyId, memberId, currency }: { familyId: string; memberId: string; currency: string }) {
  const { assets, liabilities, assetTotal, liabilityTotal, cashTotal, netWorth } = await getNetWorth(familyId, memberId);

  return (
    <>
      <Hero
        label="NET WORTH"
        amount={netWorth}
        currency={currency}
        caption={`${formatCurrency(cashTotal, currency)} in accounts + ${formatCurrency(assetTotal, currency)} owned − ${formatCurrency(liabilityTotal, currency)} owed`}
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <Link href="/wealth/assets/new?kind=asset" className="btn btn-secondary" style={{ flex: 1, minHeight: 40, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>
          + ASSET
        </Link>
        <Link href="/wealth/assets/new?kind=liability" className="btn btn-secondary" style={{ flex: 1, minHeight: 40, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>
          + LIABILITY
        </Link>
      </div>

      <SectionLabel>WHAT THE HOUSEHOLD OWNS</SectionLabel>
      {assets.length === 0 && <p style={{ fontSize: 13.5, color: "var(--color-neutral-600)" }}>No property or other assets recorded yet.</p>}
      {assets.map((a) => (
        <div key={a.id} style={{ padding: "12px 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ font: "600 16px/1.1 var(--font-heading)", display: "block" }}>{a.name}</span>
              <span style={{ fontSize: 13, color: "var(--color-neutral-600)" }}>
                {ASSET_KIND_LABELS[a.kind as AssetKind] ?? a.kind}
                {a.acquired_on ? ` · since ${formatDate(a.acquired_on)}` : ""}
                {a.note ? ` · ${a.note}` : ""}
              </span>
            </span>
            <span style={{ fontFamily: "var(--font-numeric)", fontSize: 13, flex: "none" }}>{formatCurrency(Number(a.value), currency)}</span>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 7 }}>
            <ValueUpdateControl id={a.id} current={Number(a.value)} kind="asset" />
            <RemoveButton id={a.id} kind="asset" label={`Remove "${a.name}"`} />
          </div>
        </div>
      ))}

      <SectionLabel>WHAT THE HOUSEHOLD OWES</SectionLabel>
      {liabilities.length === 0 && <p style={{ fontSize: 13.5, color: "var(--color-neutral-600)" }}>Nothing owed on record.</p>}
      {liabilities.map((l) => (
        <div key={l.id} style={{ padding: "12px 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ font: "600 16px/1.1 var(--font-heading)", display: "block" }}>{l.name}</span>
              <span style={{ fontSize: 13, color: "var(--color-neutral-600)" }}>
                {LIABILITY_KIND_LABELS[l.kind as LiabilityKind] ?? l.kind}
                {l.lender ? ` · ${l.lender}` : ""}
                {l.monthly_payment ? ` · ${formatCurrency(Number(l.monthly_payment), currency)}/mo` : ""}
              </span>
            </span>
            <span style={{ fontFamily: "var(--font-numeric)", fontSize: 13, flex: "none", color: "var(--color-accent-700)" }}>
              −{formatCurrency(Number(l.balance), currency)}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 7 }}>
            <ValueUpdateControl id={l.id} current={Number(l.balance)} kind="liability" />
            <RemoveButton id={l.id} kind="liability" label={`Remove "${l.name}"`} />
          </div>
        </div>
      ))}

      <div style={{ fontSize: 13, color: "var(--color-neutral-600)", marginTop: 16 }}>
        Net worth counts every account balance plus what you own, less what you owe. Update a value whenever it changes.
      </div>
    </>
  );
}

function toPickable(accounts: Awaited<ReturnType<typeof getAccounts>>, memberId: string): PickableAccount[] {
  return accounts
    .filter((a) => a.is_joint || a.owner_member_id === memberId)
    .map((a) => ({
      id: a.id,
      name: a.name,
      institution: a.institution,
      linked_app_url: a.linked_app_url,
      balance: a.balance,
      is_joint: a.is_joint,
    }));
}
