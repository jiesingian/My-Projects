import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getPaluwagan } from "@/lib/queries/utang";
import { DetailHeader } from "@/components/hub-header";
import { Blueprint, Tag } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { isGrownUp } from "@/lib/roles";
import { familyDay } from "@/lib/time";
import { FREQUENCY_LABEL, currentRound, paluwaganReminder, pot, roundDate } from "@/lib/utang";
import { PaluwaganOptions, PaidTick } from "./paluwagan-client";

/** One paluwagan, round by round: the date, whose pot it is, and each
 * member's hulog ticked in as it arrives. Not found, rather than empty, for
 * a group the caller may not see -- another grown-up's "just me" one. */
export default async function PaluwaganPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  if (!isGrownUp(me.role)) redirect("/wealth/utang");
  const { id } = await params;
  const g = await getPaluwagan(me.family_id, me.id, id);
  if (!g) notFound();

  const currency = me.families.currency;
  const today = familyDay(new Date(), me.families.time_zone || undefined);
  const rounds = g.members.length;
  const now = currentRound(g.startsOn, g.frequency, rounds, today);
  const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  const roundsList = Array.from({ length: rounds }, (_, i) => i + 1);

  return (
    <div>
      <DetailHeader backHref="/wealth/utang" eyebrow="Paluwagan" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <h3 style={{ fontSize: "2rem", margin: "0 0 0.25rem" }}>{g.name}</h3>
        <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginBottom: "0.75rem" }}>
          {formatCurrency(g.contribution, currency)} each · {FREQUENCY_LABEL[g.frequency].toLowerCase()} · {rounds} members · pot {formatCurrency(pot(g.contribution, rounds), currency)}
          {g.isPrivate ? " · " : ""}
          {g.isPrivate && <Tag variant="outline">JUST ME</Tag>}
        </div>
        <PaluwaganOptions groupId={g.id} remind={g.remind} isPrivate={g.isPrivate} mine={g.mine} />

        {roundsList.map((r) => {
          const taker = g.members.find((m) => m.turn === r);
          const date = roundDate(g.startsOn, g.frequency, r);
          const inCount = g.members.filter((m) => g.paid.has(`${m.id}:${r}`)).length;
          const isNow = r === now;
          const due = r <= now;
          return (
            <Blueprint key={r} style={{ padding: "0.75rem", marginBottom: "0.5rem", outline: isNow ? "2px solid var(--color-accent-700)" : undefined }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                <span style={{ fontWeight: 600 }}>Round {r}</span>
                <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>{day(date)}</span>
                <span style={{ marginLeft: "auto", fontSize: "0.8125rem" }}>
                  {inCount}/{rounds} in
                </span>
              </div>
              <div style={{ fontSize: "0.8125rem", margin: "0.25rem 0 0.375rem" }}>
                Pot to <b>{taker?.isUs ? "us" : (taker?.name ?? "—")}</b>
                {isNow ? " · this round" : ""}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
                {g.members.map((m) => (
                  <PaidTick
                    key={m.id}
                    groupId={g.id}
                    memberId={m.id}
                    round={r}
                    name={m.isUs ? "Us" : m.name}
                    paid={g.paid.has(`${m.id}:${r}`)}
                    reminder={
                      g.remind && due && !m.isUs && !g.paid.has(`${m.id}:${r}`)
                        ? paluwaganReminder({ memberName: m.name, groupName: g.name, round: r, contribution: g.contribution, dueOn: date, currency })
                        : null
                    }
                  />
                ))}
              </div>
            </Blueprint>
          );
        })}

        {g.note && <p style={{ fontSize: "0.8125rem", marginTop: "0.75rem" }}>{g.note}</p>}
        <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", lineHeight: 1.45, marginTop: "0.875rem" }}>
          A record only: Kin moves no money and never contacts anybody. A reminder is a message for you to send yourself.
        </p>
      </div>
    </div>
  );
}
