import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getJointWealth, getMyWealth, getGoals } from "@/lib/queries/wealth";
import { HubHeader } from "@/components/hub-header";
import { Blueprint, Tag } from "@/components/ui";
import { AddAccountForm, SetBudgetControl, SetTargetControl } from "@/components/wealth-controls";
import { formatCurrency } from "@/lib/format";

const SEGMENTS = ["joint", "mine", "goals"] as const;
type Seg = (typeof SEGMENTS)[number];
const SEGMENT_LABELS: Record<Seg, string> = { joint: "Joint", mine: "Mine", goals: "Goals" };

export default async function WealthPage({
  searchParams,
}: {
  searchParams: Promise<{ seg?: string }>;
}) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const sp = await searchParams;
  const seg: Seg = (SEGMENTS as readonly string[]).includes(sp.seg ?? "") ? (sp.seg as Seg) : "joint";

  const segments = SEGMENTS.map((s) => ({
    label: SEGMENT_LABELS[s],
    href: `/wealth?seg=${s}`,
    active: s === seg,
  }));

  return (
    <div>
      <HubHeader n="05" title="Wealth" segments={segments} />
      <div style={{ padding: "0 22px 22px" }}>
        {seg === "joint" && <JointPane familyId={me.family_id} currency={me.families.currency} />}
        {seg === "mine" && <MinePane familyId={me.family_id} memberId={me.id} currency={me.families.currency} />}
        {seg === "goals" && <GoalsPane familyId={me.family_id} currency={me.families.currency} />}
      </div>
    </div>
  );
}

async function GoalsPane({ familyId, currency }: { familyId: string; currency: string }) {
  const goals = await getGoals(familyId);
  return (
    <>
      {goals.length === 0 && <p style={{ fontSize: 12, color: "var(--color-neutral-600)" }}>No goals yet.</p>}
      {goals.map((g) => {
        const pct = g.target_amount ? Math.min(100, Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100)) : 0;
        return (
          <Blueprint key={g.id} style={{ padding: 13, marginBottom: 13 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ font: "600 18px/1.05 var(--font-heading)" }}>{g.title}</span>
              <Tag variant={g.is_joint ? "accent" : "neutral"} className="ml-auto">
                {g.is_joint ? "JOINT" : (g.owner as unknown as { full_name: string } | null)?.full_name?.split(" ")[0]?.toUpperCase() ?? "MINE"}
              </Tag>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--color-neutral-600)", margin: "4px 0 9px" }}>{g.sub_note}</div>
            <div style={{ height: 8, border: "1px solid var(--color-divider)", background: "var(--color-bg)" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: "var(--color-accent)" }} />
            </div>
            <div style={{ display: "flex", fontSize: 10.5, color: "var(--color-neutral-600)", marginTop: 5 }}>
              <span>
                {g.target_unit
                  ? `${g.current_amount} of ${g.target_amount} ${g.target_unit}`
                  : `${formatCurrency(Number(g.current_amount), currency)} of ${formatCurrency(Number(g.target_amount ?? 0), currency)}`}
              </span>
              <span style={{ marginLeft: "auto" }}>{pct}%</span>
            </div>
            {g.target_date && (
              <div style={{ fontSize: 10.5, color: "var(--color-neutral-600)", marginTop: 5 }}>
                Target date: {new Date(`${g.target_date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </div>
            )}
          </Blueprint>
        );
      })}
      <Link href="/wealth/add" className="btn btn-primary btn-block" style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em", marginTop: 16 }}>
        + ADD GOAL
      </Link>
    </>
  );
}

async function JointPane({ familyId, currency }: { familyId: string; currency: string }) {
  const { period, accounts, month, year } = await getJointWealth(familyId);
  const spent = period ? Number(period.spent_amount) : 0;
  const budget = period ? Number(period.budget_amount) : 0;
  const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  const monthLabel = new Date(year, month - 1, 1).toLocaleString("en-PH", { month: "long", year: "numeric" });

  return (
    <>
      <Blueprint style={{ padding: 15, marginBottom: 16 }}>
        <div style={{ font: "600 10px/1 var(--font-heading)", letterSpacing: ".14em", color: "var(--color-neutral-600)" }}>
          {monthLabel.toUpperCase()} · SPENT OF BUDGET
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "8px 0 10px" }}>
          <span style={{ font: "600 38px/1 var(--font-heading)", letterSpacing: "-.02em" }}>{formatCurrency(spent, currency)}</span>
          <span style={{ fontSize: 13, color: "var(--color-neutral-600)" }}>of {formatCurrency(budget, currency)}</span>
        </div>
        <div style={{ height: 10, border: "1px solid var(--color-divider)" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: "var(--color-accent)" }} />
        </div>
      </Blueprint>

      <SetBudgetControl familyId={familyId} month={month} year={year} current={budget} />

      {(period?.budget_allocations ?? []).length > 0 && (
        <>
          <div style={{ font: "600 10px/1 var(--font-heading)", letterSpacing: ".16em", color: "var(--color-neutral-600)", marginBottom: 8 }}>ALLOCATION</div>
          {(period?.budget_allocations ?? []).map((a) => {
            const p = budget > 0 ? Math.round((Number(a.amount) / budget) * 100) : 0;
            return (
              <div key={a.id} style={{ marginBottom: 11 }}>
                <div style={{ display: "flex", fontSize: 12, marginBottom: 4 }}>
                  <span>{a.category}</span>
                  <span style={{ marginLeft: "auto", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11 }}>{formatCurrency(Number(a.amount), currency)}</span>
                </div>
                <div style={{ height: 7, background: "var(--color-neutral-200)" }}>
                  <div style={{ height: "100%", width: `${p}%`, background: "var(--color-accent)" }} />
                </div>
              </div>
            );
          })}
        </>
      )}

      <div style={{ font: "600 10px/1 var(--font-heading)", letterSpacing: ".16em", color: "var(--color-neutral-600)", margin: "20px 0 4px" }}>JOINT ACCOUNTS</div>
      {accounts.length === 0 && <p style={{ fontSize: 12, color: "var(--color-neutral-600)" }}>No joint accounts yet.</p>}
      {accounts.map((a) => (
        <div key={a.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "11px 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ font: "600 16px/1.1 var(--font-heading)", display: "block" }}>{a.name}</span>
            <span style={{ fontSize: 11, color: "var(--color-neutral-600)" }}>{a.sub_note}</span>
          </span>
          <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13 }}>{formatCurrency(Number(a.balance), currency)}</span>
        </div>
      ))}
      <AddAccountForm isJoint={true} />
    </>
  );
}

async function MinePane({ familyId, memberId, currency }: { familyId: string; memberId: string; currency: string }) {
  const { target, accounts, month, year } = await getMyWealth(familyId, memberId);
  const targetAmount = target ? Number(target.target_amount) : 0;
  const currentAmount = target ? Number(target.current_amount) : 0;
  const pct = targetAmount > 0 ? Math.min(100, Math.round((currentAmount / targetAmount) * 100)) : 0;
  const monthLabel = new Date(year, month - 1, 1).toLocaleString("en-PH", { month: "long" }).toUpperCase();

  return (
    <>
      <Blueprint style={{ padding: 15, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <span style={{ font: "600 10px/1 var(--font-heading)", letterSpacing: ".14em", color: "var(--color-neutral-600)" }}>
            MY REVENUE TARGET · {monthLabel}
          </span>
          <Tag variant="outline" className="ml-auto">
            PRIVATE
          </Tag>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "8px 0 10px" }}>
          <span style={{ font: "600 38px/1 var(--font-heading)", letterSpacing: "-.02em" }}>{formatCurrency(currentAmount, currency)}</span>
          <span style={{ fontSize: 13, color: "var(--color-neutral-600)" }}>of {formatCurrency(targetAmount, currency)}</span>
        </div>
        <div style={{ height: 10, border: "1px solid var(--color-divider)" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: "var(--color-accent)" }} />
        </div>
      </Blueprint>

      <SetTargetControl memberId={memberId} familyId={familyId} month={month} year={year} current={targetAmount} />

      <div style={{ font: "600 10px/1 var(--font-heading)", letterSpacing: ".16em", color: "var(--color-neutral-600)", marginBottom: 4 }}>MY ACCOUNTS</div>
      {accounts.length === 0 && <p style={{ fontSize: 12, color: "var(--color-neutral-600)" }}>No personal accounts yet.</p>}
      {accounts.map((a) => (
        <div key={a.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "11px 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ font: "600 16px/1.1 var(--font-heading)", display: "block" }}>{a.name}</span>
            <span style={{ fontSize: 11, color: "var(--color-neutral-600)" }}>{a.sub_note}</span>
          </span>
          <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13 }}>{formatCurrency(Number(a.balance), currency)}</span>
        </div>
      ))}
      <AddAccountForm isJoint={false} />
      <div style={{ fontSize: 11.5, color: "var(--color-neutral-600)", marginTop: 12 }}>
        Nothing on this tab appears in the joint view. Sharing a record is a per-record choice.
      </div>
    </>
  );
}
