import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { isGrownUp } from "@/lib/roles";
import { keepKidViewOut } from "@/lib/kid-view";
import { DetailHeader } from "@/components/hub-header";
import { Blueprint, Empty, Tag } from "@/components/ui";
import { Icon } from "@/components/icons";
import { formatCurrency } from "@/lib/format";
import { familyDate } from "@/lib/format-family";
import { familyDay } from "@/lib/time";
import { shareLabel } from "@/lib/shared-costs";
import { getSharedPot } from "@/lib/queries/shared-costs";
import { AddEntryForm, DeletePotButton, RemoveEntryButton, ShareEditor } from "../shared-costs-client";

/** One shared pot: who owes whom, each household's share, and every cost and
 * payment. Nothing here for a child, or once a link in the pot is revoked --
 * RLS returns no pot, and this is a 404. */
export default async function SharedPotPage({ params }: { params: Promise<{ id: string }> }) {
  await keepKidViewOut();
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  if (!isGrownUp(me.role)) redirect("/family/shared-costs");
  const { id } = await params;
  const [pot, fmtDate] = await Promise.all([getSharedPot(id, me.family_id), familyDate()]);
  if (!pot) notFound();

  const currency = me.families.currency;
  const today = familyDay(new Date(), me.families.time_zone || undefined);
  const others = pot.households.filter((h) => h.familyId !== me.family_id);
  const shares = pot.households.map((h) => h.share);

  return (
    <div>
      <DetailHeader backHref="/family/shared-costs" eyebrow="Shared costs" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <h3 style={{ fontSize: "1.75rem", margin: "0 0 0.25rem", overflowWrap: "anywhere" }}>{pot.title}</h3>
        {pot.note && <p style={{ fontSize: "0.84375rem", color: "var(--color-neutral-700)", margin: "0 0 0.75rem" }}>{pot.note}</p>}

        <div className="kin-eyebrow" style={{ margin: "0.875rem 0 0.5rem" }}>TO SETTLE</div>
        {pot.settlements.length === 0 ? (
          <p style={{ fontSize: "0.875rem", margin: "0 0 0.75rem" }}>Everyone is square.</p>
        ) : (
          pot.settlements.map((s) => (
            <Blueprint key={`${s.fromFamilyId}-${s.toFamilyId}`} style={{ padding: "0.75rem", marginBottom: "0.5rem", display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: "0.9375rem" }}>
                <strong>{s.fromFamilyId === me.family_id ? "We" : s.fromName}</strong> {s.fromFamilyId === me.family_id ? "owe" : "owes"}{" "}
                <strong>{s.toFamilyId === me.family_id ? "us" : s.toName}</strong>
              </span>
              <span style={{ fontFamily: "var(--font-numeric)", fontSize: "0.9375rem" }}>{formatCurrency(s.amount, currency)}</span>
            </Blueprint>
          ))
        )}

        <AddEntryForm potId={pot.id} today={today} others={others.map((o) => ({ familyId: o.familyId, name: o.name }))} />

        <div className="kin-eyebrow" style={{ margin: "1rem 0 0.375rem" }}>EACH HOUSEHOLD</div>
        {pot.balances.map((b, i) => (
          <div key={b.familyId} style={{ display: "flex", gap: "0.625rem", alignItems: "baseline", padding: "0.5rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: "0.9375rem", display: "block" }}>
                {b.name}
                {b.familyId === me.family_id ? " (us)" : ""}
              </span>
              <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
                Paid {formatCurrency(b.paid, currency)} · share {shareLabel(shares[i], shares)}, {formatCurrency(b.fairShare, currency)}
              </span>
            </span>
            {Math.abs(b.net) >= 0.01 ? <Tag variant={b.net > 0 ? "accent" : "neutral"}>{b.net > 0 ? `OWED ${formatCurrency(b.net, currency)}` : `OWES ${formatCurrency(-b.net, currency)}`}</Tag> : <Tag variant="outline">SQUARE</Tag>}
          </div>
        ))}
        <ShareEditor potId={pot.id} households={pot.households} />

        <div className="kin-eyebrow" style={{ margin: "1.25rem 0 0.375rem" }}>COSTS AND PAYMENTS</div>
        {pot.entries.length === 0 && <Empty icon={<Icon name="wallet" size={26} />} title="Nothing recorded yet" line="Add what your household paid; the others add theirs." />}
        {pot.entries.map((e) => (
          <div key={e.id} style={{ display: "flex", gap: "0.625rem", alignItems: "center", padding: "0.5625rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: "0.9375rem", display: "block", overflowWrap: "anywhere" }}>
                {e.kind === "cost" ? e.description : `Paid ${e.toFamilyName ?? "a household"}${e.description ? ` · ${e.description}` : ""}`}
              </span>
              <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
                {fmtDate(e.spentOn)} · {e.familyName}
                {e.authorName ? ` (${e.authorName.split(" ")[0]})` : ""}
              </span>
            </span>
            <span style={{ fontFamily: "var(--font-numeric)", fontSize: "0.84375rem", flex: "none" }}>{formatCurrency(e.amount, currency)}</span>
            {e.ours && <RemoveEntryButton potId={pot.id} entryId={e.id} what={e.kind === "cost" ? e.description : "this payment"} />}
          </div>
        ))}

        {pot.startedByUs && !pot.othersRecorded && <DeletePotButton potId={pot.id} title={pot.title} />}
        <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", marginTop: "1rem" }}>
          Only the grown-ups of these households see this pot, and only while the households stay linked. A record of who paid what: Kin moves no money.
        </p>
      </div>
    </div>
  );
}
