import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getBuyItems, getMeals, getBills } from "@/lib/queries/household";
import { HubHeader } from "@/components/hub-header";
import { BuyList } from "@/components/buy-list";
import { Tag } from "@/components/ui";
import { AddBillForm } from "@/components/add-bill-form";
import { MarkPaidButton } from "@/components/mark-paid-button";
import { GenerateGroceryButton } from "@/components/generate-grocery-button";
import { formatCurrency, formatDate } from "@/lib/format";

const SEGMENTS = ["buy", "meals", "bills"] as const;
type Seg = (typeof SEGMENTS)[number];

export default async function HouseholdPage({
  searchParams,
}: {
  searchParams: Promise<{ seg?: string }>;
}) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const sp = await searchParams;
  const seg: Seg = (SEGMENTS as readonly string[]).includes(sp.seg ?? "") ? (sp.seg as Seg) : "buy";

  const segments = SEGMENTS.map((s) => ({
    label: s === "buy" ? "To-buy" : s[0].toUpperCase() + s.slice(1),
    href: `/household?seg=${s}`,
    active: s === seg,
  }));

  return (
    <div>
      <HubHeader n="04" title="Household" segments={segments} />
      <div style={{ padding: "0 22px 22px" }}>
        {seg === "buy" && <BuyPane familyId={me.family_id} />}
        {seg === "meals" && <MealsPane familyId={me.family_id} memberId={me.id} />}
        {seg === "bills" && <BillsPane familyId={me.family_id} currency={me.families.currency} />}
      </div>
    </div>
  );
}

async function BuyPane({ familyId }: { familyId: string }) {
  const { groups, openCount, doneCount } = await getBuyItems(familyId);
  return <BuyList groups={groups} openCount={openCount} doneCount={doneCount} familyId={familyId} />;
}

async function MealsPane({ familyId, memberId }: { familyId: string; memberId: string }) {
  const meals = await getMeals(familyId);
  return (
    <>
      {meals.length === 0 && <p style={{ fontSize: 12, color: "var(--color-neutral-600)" }}>No meals planned this week yet.</p>}
      {meals.map((m) => (
        <div key={m.id} style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "11px 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
          <span style={{ font: "600 10px/1 var(--font-heading)", letterSpacing: ".1em", color: "var(--color-accent-700)", width: 70, flex: "none" }}>
            {new Date(m.plan_date).toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase()}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 14, display: "block" }}>{m.dish}</span>
            {m.note && <span style={{ fontSize: 10.5, color: "var(--color-neutral-600)" }}>{m.note}</span>}
          </span>
          <Tag variant={m.missing === 0 ? "accent" : "neutral"}>{m.missing === 0 ? "all bought" : `${m.missing} to buy`}</Tag>
        </div>
      ))}
      <Link href="/household/meals/new" className="btn btn-secondary btn-block" style={{ minHeight: 44, fontSize: 13, marginTop: 14 }}>
        + ADD MEAL
      </Link>
      <GenerateGroceryButton familyId={familyId} memberId={memberId} />
    </>
  );
}

async function BillsPane({ familyId, currency }: { familyId: string; currency: string }) {
  const bills = await getBills(familyId);
  return (
    <>
      {bills.length === 0 && <p style={{ fontSize: 12, color: "var(--color-neutral-600)" }}>No bills tracked yet.</p>}
      {bills.map((b) => (
        <div key={b.id} style={{ display: "flex", gap: 11, alignItems: "center", padding: "12px 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ font: "600 17px/1.1 var(--font-heading)", display: "block" }}>{b.name}</span>
            <span style={{ fontSize: 11, color: "var(--color-neutral-600)" }}>
              {b.category ?? ""} {b.due_date ? `· due ${formatDate(b.due_date)}` : ""}
            </span>
          </span>
          <span style={{ textAlign: "right", flex: "none" }}>
            <span style={{ font: "600 16px/1 var(--font-heading)", display: "block" }}>{formatCurrency(Number(b.amount), currency)}</span>
            <Tag variant={b.status === "unpaid" || b.status === "overdue" ? "accent" : b.status === "scheduled" ? "outline" : "neutral"}>
              {b.status.toUpperCase()}
            </Tag>
            {b.status !== "paid" && <MarkPaidButton billId={b.id} />}
          </span>
        </div>
      ))}
      <AddBillForm />
    </>
  );
}
