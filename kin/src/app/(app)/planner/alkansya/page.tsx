import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getChildrenAlkansya } from "@/lib/queries/alkansya";
import { DetailHeader } from "@/components/hub-header";
import { Blueprint, Empty } from "@/components/ui";
import { Icon } from "@/components/icons";
import { formatCurrency } from "@/lib/format";
import { isGrownUp } from "@/lib/roles";
import { ALKANSYA_DISCLAIMER, JARS, JAR_LABEL, WEEKDAYS } from "@/lib/alkansya";

/** Every child's alkansya, for the grown-ups who keep it. A child is sent
 * straight to their own: a sibling's jars are not theirs to look at. */
export default async function AlkansyaPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  if (!isGrownUp(me.role)) redirect(`/planner/alkansya/${me.id}`);

  const children = await getChildrenAlkansya(me.family_id);
  const currency = me.families.currency;

  return (
    <div>
      <DetailHeader backHref="/planner?seg=goals&g=shop" eyebrow="Shop" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <h3 style={{ fontSize: "2rem", margin: "0 0 0.375rem" }}>Alkansya</h3>
        <p style={{ fontSize: "0.84375rem", color: "var(--color-neutral-600)", margin: "0 0 1rem", lineHeight: 1.45 }}>
          Each child&rsquo;s weekly baon and the points they change into pesos, split into gastos, ipon and bigay. {ALKANSYA_DISCLAIMER}
        </p>

        {children.length === 0 && (
          <Empty icon={<Icon name="wallet" size={26} />} title="No children yet" line="Add a child on Family, and their alkansya starts here." />
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
          {children.map((c) => (
            <Link key={c.memberId} href={`/planner/alkansya/${c.memberId}`} style={{ textDecoration: "none", color: "inherit" }}>
              <Blueprint style={{ padding: "0.875rem" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                  <span style={{ font: "600 1.0625rem/1.2 var(--font-heading)", flex: 1 }}>{c.name.split(" ")[0]}</span>
                  <span style={{ fontFamily: "var(--font-numeric)", fontWeight: 600 }}>{formatCurrency(c.balances.total, currency)}</span>
                </div>
                <div style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.25rem" }}>
                  {c.plan && c.plan.active && c.plan.weeklyAmount > 0
                    ? `${formatCurrency(c.plan.weeklyAmount, currency)} every ${WEEKDAYS[c.plan.payWeekday]}`
                    : c.plan
                      ? "No weekly baon"
                      : "Not set up yet"}
                </div>
                <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.375rem", fontSize: "0.78125rem" }}>
                  {JARS.map((j) => (
                    <span key={j}>
                      {JAR_LABEL[j].name} <b style={{ fontFamily: "var(--font-numeric)" }}>{formatCurrency(c.balances[j], currency)}</b>
                    </span>
                  ))}
                </div>
              </Blueprint>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
