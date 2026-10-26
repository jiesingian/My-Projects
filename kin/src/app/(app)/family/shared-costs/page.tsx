import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { isGrownUp } from "@/lib/roles";
import { keepKidViewOut } from "@/lib/kid-view";
import { DetailHeader } from "@/components/hub-header";
import { Blueprint, Empty, Tag } from "@/components/ui";
import { Icon } from "@/components/icons";
import { formatCurrency } from "@/lib/format";
import { getLinkedFamilies } from "@/lib/queries/tree-links";
import { getSharedPots } from "@/lib/queries/shared-costs";
import { NewPotForm } from "./shared-costs-client";

/** Shared costs with linked households (19 October): siblings sharing a
 * parent's costs. Grown-ups only; a pot shows only while every household in
 * it is still linked with ours (20261019153000_shared_costs.sql). */
export default async function SharedCostsPage() {
  await keepKidViewOut();
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");

  if (!isGrownUp(me.role)) {
    return (
      <div>
        <DetailHeader backHref="/family" eyebrow="Family" />
        <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
          <Empty icon={<Icon name="users" size={26} />} title="For grown-ups" line="Costs shared with other households are kept by the grown-ups." />
        </div>
      </div>
    );
  }

  const [pots, linked] = await Promise.all([getSharedPots(me.family_id), getLinkedFamilies(me.family_id)]);
  const currency = me.families.currency;

  return (
    <div>
      <DetailHeader backHref="/family" eyebrow="Family" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <h3 style={{ fontSize: "2rem", margin: "0 0 0.375rem" }}>Shared costs</h3>
        <p style={{ fontSize: "0.84375rem", lineHeight: 1.5, color: "var(--color-neutral-700)", margin: "0 0 0.875rem" }}>
          Costs you share with a linked household — Grandma&apos;s medicines, her check-ups. Each household records what it paid; Kin works out each one&apos;s share and who owes whom. Only the grown-ups of the households in a pot see it.
        </p>

        {pots.length === 0 && <Empty icon={<Icon name="users" size={26} />} title="No shared pots yet" line="Start one below with a household you're linked to." />}
        {pots.map((p) => (
          <Link key={p.id} href={`/family/shared-costs/${p.id}`} style={{ textDecoration: "none", color: "inherit", display: "block", marginBottom: "0.625rem" }}>
            <Blueprint style={{ padding: "0.8125rem" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                <span style={{ font: "600 1.125rem/1.1 var(--font-heading)", flex: 1, minWidth: 0 }}>{p.title}</span>
                {p.ours && Math.abs(p.ours.net) >= 0.01 ? (
                  <Tag variant={p.ours.net > 0 ? "accent" : "neutral"}>{p.ours.net > 0 ? `OWED ${formatCurrency(p.ours.net, currency)}` : `WE OWE ${formatCurrency(-p.ours.net, currency)}`}</Tag>
                ) : (
                  <Tag variant="outline">SQUARE</Tag>
                )}
              </div>
              <div style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.3125rem" }}>
                {p.households.map((h) => h.name).join(" · ")} · {formatCurrency(p.totalCost, currency)} in all
              </div>
            </Blueprint>
          </Link>
        ))}

        <div className="kin-eyebrow" style={{ margin: "1.25rem 0 0.5rem" }}>START A POT</div>
        {linked.length === 0 ? (
          <p style={{ fontSize: "0.84375rem", color: "var(--color-neutral-700)" }}>
            Link with a sibling&apos;s household first: share your household code from <Link href="/family?seg=tree">Family → Tree</Link>, and they ask to link.
          </p>
        ) : (
          <NewPotForm linked={linked} />
        )}
      </div>
    </div>
  );
}
