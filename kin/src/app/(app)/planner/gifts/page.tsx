import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { DetailHeader } from "@/components/hub-header";
import { AddGiftPerson, GiftPersonCard } from "@/components/gift-list";
import { getGiftList } from "@/lib/queries/gift-list";
import { getMembers } from "@/lib/queries/family";
import { getAccounts } from "@/lib/queries/wealth";
import { listTotals } from "@/lib/gift-list";
import { formatCurrency } from "@/lib/format";
import { familyDay } from "@/lib/time";
import { householdZone } from "@/lib/household-zone";
import { isGrownUp } from "@/lib/roles";
import { isGone } from "@/lib/member-status";
import { inKidView } from "@/lib/kid-view";

/** Christmas gifts and aguinaldo (20261019170300): the grown-ups' list for
 * a year -- per person and per inaanak, a budget, ideas ticked when bought,
 * the totals against the budgets -- hidden from whoever each row is for. */
export default async function GiftsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  if (!isGrownUp(me.role)) redirect("/planner?seg=events");
  const thisYear = Number(familyDay(new Date(), await householdZone()).slice(0, 4));
  const asked = Number((await searchParams).year);
  const year = asked >= 2020 && asked <= thisYear + 1 ? asked : thisYear;
  const [{ people, recorded }, members, accounts] = await Promise.all([getGiftList(me.family_id, year), getMembers(me.family_id), inKidView(me) ? Promise.resolve([]) : getAccounts(me.family_id)]);
  const onList = new Set(people.map((p) => p.memberId).filter(Boolean));
  const household = members.filter((m) => m.id !== me.id && m.status !== "pending" && !isGone(m.status) && !onList.has(m.id)).map((m) => ({ id: m.id, name: m.full_name }));
  const pickable = accounts.filter((a) => a.is_joint || a.owner_member_id === me.id).map((a) => ({ id: a.id, name: a.name, institution: a.institution, linked_app_url: a.linked_app_url, balance: a.balance, is_joint: a.is_joint }));
  const t = listTotals(people);
  const money = (n: number) => formatCurrency(n, me.families.currency);
  const recordedIds = [...recorded];

  return (
    <div>
      <DetailHeader backHref="/planner?seg=events" eyebrow="Christmas gifts" />
      <div style={{ padding: "0 var(--gutter) 1.5rem" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", marginBottom: "0.25rem" }}>
          <h1 style={{ fontSize: "1.375rem", margin: 0, flex: 1 }}>Gifts and aguinaldo {year}</h1>
          <Link href={`/planner/gifts?year=${year - 1}`} style={{ fontSize: "0.8125rem" }}>
            {year - 1}
          </Link>
          {year < thisYear + 1 && (
            <Link href={`/planner/gifts?year=${year + 1}`} style={{ fontSize: "0.8125rem" }}>
              {year + 1}
            </Link>
          )}
        </div>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "0 0 0.75rem" }}>
          For the grown-ups only. Anyone on the list doesn&apos;t see their own row; children don&apos;t see the list at all.
        </p>
        {people.length > 0 && (
          <div className="kin-gift-card" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.25rem", textAlign: "center" }}>
            <div>
              <div style={{ fontWeight: 600 }}>{money(t.bought)}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>bought</div>
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>{money(t.planned)}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>planned</div>
            </div>
            <div>
              <div style={{ fontWeight: 600, color: t.budget > 0 && t.planned > t.budget ? "var(--color-accent-700)" : undefined }}>{t.budget > 0 ? money(t.budget) : "—"}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>budget</div>
            </div>
            <div style={{ gridColumn: "1 / -1", fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
              {t.done} of {t.people} done{t.aguinaldo > 0 ? ` · ${money(t.aguinaldo)} in aguinaldo` : ""}
            </div>
          </div>
        )}

        <AddGiftPerson year={year} household={household} />

        {people.map((p) => (
          <GiftPersonCard key={p.id} person={p} currency={me.families.currency} accounts={pickable} recorded={recordedIds.filter((id) => p.items.some((i) => i.id === id))} />
        ))}
      </div>
    </div>
  );
}
