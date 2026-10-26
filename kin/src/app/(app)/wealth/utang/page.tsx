import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getPaluwagans, getUtang } from "@/lib/queries/utang";
import { DetailHeader } from "@/components/hub-header";
import { Blueprint, Empty, Tag } from "@/components/ui";
import { Icon } from "@/components/icons";
import { formatCurrency } from "@/lib/format";
import { isGrownUp } from "@/lib/roles";
import { familyDay } from "@/lib/time";
import { FREQUENCY_LABEL, currentRound, pot, roundDate, utangReminder } from "@/lib/utang";
import { AddPaluwaganForm, AddUtangForm, UtangRow } from "./utang-client";

/** Utang and paluwagan: money lent to and borrowed from relatives, and the
 * rotating savings groups the household is in. Grown-ups only -- a child is
 * shown why rather than an empty page -- and each entry is either the
 * household grown-ups' or the recorder's alone. */
export default async function UtangPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");

  if (!isGrownUp(me.role)) {
    return (
      <div>
        <DetailHeader backHref="/wealth" eyebrow="Wealth" />
        <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
          <Empty icon={<Icon name="wallet" size={26} />} title="For grown-ups" line="Lending and savings circles are kept by the grown-ups in the household." />
        </div>
      </div>
    );
  }

  const [utang, groups] = await Promise.all([getUtang(me.family_id, me.id), getPaluwagans(me.family_id, me.id)]);
  const currency = me.families.currency;
  const today = familyDay(new Date(), me.families.time_zone || undefined);
  const open = utang.filter((u) => !u.settled);
  const owedToUs = open.filter((u) => u.direction === "lent").reduce((n, u) => n + u.left, 0);
  const weOwe = open.filter((u) => u.direction === "borrowed").reduce((n, u) => n + u.left, 0);

  return (
    <div>
      <DetailHeader backHref="/wealth" eyebrow="Wealth" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <h3 style={{ fontSize: "2rem", margin: "0 0 14px" }}>Lending &amp; savings circles</h3>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.5rem", marginBottom: "0.875rem" }}>
          <Blueprint style={{ padding: "0.8125rem" }}>
            <div className="kin-eyebrow">OWED TO US</div>
            <div style={{ font: "600 1.5rem/1.1 var(--font-heading)", marginTop: "0.375rem", overflowWrap: "anywhere" }}>{formatCurrency(owedToUs, currency)}</div>
          </Blueprint>
          <Blueprint style={{ padding: "0.8125rem" }}>
            <div className="kin-eyebrow">WE OWE</div>
            <div style={{ font: "600 1.5rem/1.1 var(--font-heading)", marginTop: "0.375rem", overflowWrap: "anywhere" }}>{formatCurrency(weOwe, currency)}</div>
          </Blueprint>
        </div>

        <section aria-label="Lending" style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "baseline", margin: "0 0 0.5rem" }}>
            <span className="kin-eyebrow">LENDING</span>
          </div>
          <AddUtangForm today={today} />
          {utang.length === 0 ? (
            <Empty icon={<Icon name="wallet" size={26} />} title="No IOUs recorded" line="Money lent to a relative, or borrowed from one, and every bit paid back." />
          ) : (
            utang.map((u) => (
              <UtangRow
                key={u.id}
                u={u}
                currency={currency}
                today={today}
                reminder={u.remind ? utangReminder({ direction: u.direction, personName: u.personName, amount: u.amount, paid: u.paid, left: u.left, dueOn: u.dueOn, currency }) : null}
              />
            ))
          )}
        </section>

        <section aria-label="Savings circles">
          <div className="kin-eyebrow" style={{ margin: "0 0 0.5rem" }}>SAVINGS CIRCLES</div>
          <AddPaluwaganForm today={today} />
          {groups.length === 0 && (
            <Empty icon={<Icon name="users" size={26} />} title="No savings circles yet" line="Everyone puts in the same each round, and each round one member takes the pot. Keep track of turns and who has paid." />
          )}
          {groups.map((g) => {
            const rounds = g.members.length;
            const now = currentRound(g.startsOn, g.frequency, rounds, today);
            const ours = g.members.find((m) => m.isUs);
            const unpaid = now > 0 ? g.members.filter((m) => !g.paid.has(`${m.id}:${now}`)).length : 0;
            return (
              <Link key={g.id} href={`/wealth/paluwagan/${g.id}`} style={{ textDecoration: "none", color: "inherit", display: "block", marginBottom: "0.5625rem" }}>
                <Blueprint style={{ padding: "0.8125rem" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                    <span style={{ font: "600 1.0625rem/1.2 var(--font-heading)", flex: 1 }}>{g.name}</span>
                    {g.isPrivate && <Tag variant="outline">JUST ME</Tag>}
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginTop: "0.25rem" }}>
                    {formatCurrency(g.contribution, currency)} each · {FREQUENCY_LABEL[g.frequency].toLowerCase()} · pot {formatCurrency(pot(g.contribution, rounds), currency)}
                  </div>
                  <div style={{ fontSize: "0.8125rem", marginTop: "0.25rem" }}>
                    {now === 0
                      ? `Starts ${roundDate(g.startsOn, g.frequency, 1)}`
                      : `Round ${now} of ${rounds} · ${g.members.find((m) => m.turn === now)?.name ?? "—"} takes the pot${unpaid > 0 ? ` · ${unpaid} not in yet` : " · all in"}`}
                    {ours ? ` · our turn: round ${ours.turn} (${roundDate(g.startsOn, g.frequency, ours.turn)})` : ""}
                  </div>
                </Blueprint>
              </Link>
            );
          })}
        </section>

        <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", lineHeight: 1.45, marginTop: "1rem" }}>
          A record only: Kin moves no money and never contacts anybody. Where a reminder is switched on, Kin writes a polite message for you to send yourself.
          An entry marked Just me is seen only by whoever recorded it; children never see any of this.
        </p>
      </div>
    </div>
  );
}
