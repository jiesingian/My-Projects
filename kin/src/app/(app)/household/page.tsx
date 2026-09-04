import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getBuyItems, getMeals } from "@/lib/queries/household";
import { getAccounts } from "@/lib/queries/wealth";
import { HubHeader } from "@/components/hub-header";
import { BuyList } from "@/components/buy-list";
import { Tag } from "@/components/ui";
import { GenerateGroceryButton } from "@/components/generate-grocery-button";

const SEGMENTS = ["buy", "meals"] as const;
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
        {seg === "buy" && <BuyPane familyId={me.family_id} memberId={me.id} currency={me.families.currency} />}
        {seg === "meals" && <MealsPane familyId={me.family_id} memberId={me.id} />}
      </div>
    </div>
  );
}

async function BuyPane({ familyId, memberId, currency }: { familyId: string; memberId: string; currency: string }) {
  const [{ groups, openCount, doneCount }, accounts] = await Promise.all([getBuyItems(familyId), getAccounts(familyId)]);
  return (
    <>
      <BuyList
        groups={groups}
        openCount={openCount}
        doneCount={doneCount}
        familyId={familyId}
        currency={currency}
        accounts={accounts
          .filter((a) => a.is_joint || a.owner_member_id === memberId)
          .map((a) => ({ id: a.id, name: a.name, institution: a.institution, linked_app_url: a.linked_app_url, balance: a.balance, is_joint: a.is_joint }))}
      />
      <Link href="/wealth?seg=bills" style={{ display: "block", fontSize: 13, color: "var(--color-neutral-600)", marginTop: 14 }}>
        Bills now live in Wealth, where they are paid from an account →
      </Link>
    </>
  );
}

async function MealsPane({ familyId, memberId }: { familyId: string; memberId: string }) {
  const meals = await getMeals(familyId);
  return (
    <>
      {meals.length === 0 && <p style={{ fontSize: 13.5, color: "var(--color-neutral-600)" }}>No meals planned this week yet.</p>}
      {meals.map((m) => (
        <div key={m.id} style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "11px 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
          <span style={{ font: "600 13px/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-accent-700)", width: 70, flex: "none" }}>
            {new Date(m.plan_date).toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase()}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 14, display: "block" }}>{m.dish}</span>
            {m.note && <span style={{ fontSize: 12.5, color: "var(--color-neutral-600)" }}>{m.note}</span>}
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
