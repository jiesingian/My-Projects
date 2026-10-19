import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { DetailHeader } from "@/components/hub-header";
import { NewDrawForm } from "@/components/gift-draw";
import { getMyDraws } from "@/lib/queries/gift-draw";
import { familyDate } from "@/lib/format-family";
import { familyDay } from "@/lib/time";
import { householdZone } from "@/lib/household-zone";
import { isGrownUp } from "@/lib/roles";

/** Monito-monita (20261019170200): the draws the household is in, its own
 * and linked households', and a grown-up's way to start one. */
export default async function MonitoPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const [draws, fmt] = await Promise.all([getMyDraws(), familyDate()]);
  const today = familyDay(new Date(), await householdZone());
  // Christmas Eve by default, or a week out once it has passed.
  const year = Number(today.slice(0, 4));
  const defaultDate = today <= `${year}-12-24` ? `${year}-12-24` : `${year + 1}-12-24`;

  return (
    <div>
      <DetailHeader backHref="/planner?seg=events" eyebrow="Monito-monita" />
      <div style={{ padding: "0 var(--gutter) 1.5rem" }}>
        {draws.length > 0 && (
          <section style={{ marginBottom: "1.5rem" }}>
            <div className="kin-eyebrow" style={{ marginBottom: "0.5rem" }}>
              DRAWS
            </div>
            {draws.map((d) => (
              <Link key={d.id} href={`/planner/monito/${d.id}`} className="kin-potluck-invite">
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 600 }}>{d.title}</span>
                  <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
                    {fmt(d.exchangeDate)} · {d.mine ? "your household" : `${d.hostName} household`} · {d.people} in{d.drawn ? " · drawn" : ""}
                    {!d.mine && d.ours === 0 ? " · put your people in" : ""}
                  </span>
                </span>
              </Link>
            ))}
          </section>
        )}
        {isGrownUp(me.role) ? (
          <section>
            <div className="kin-eyebrow" style={{ marginBottom: "0.5rem" }}>
              START A DRAW
            </div>
            <p style={{ fontSize: "0.84375rem", color: "var(--color-neutral-600)", margin: "0 0 0.75rem" }}>
              Kin draws the names. Everyone sees only who they picked, and the wish list of the one they picked. Ask linked households in, too.
            </p>
            <NewDrawForm defaultDate={defaultDate} />
          </section>
        ) : (
          draws.length === 0 && <p style={{ fontSize: "0.875rem", color: "var(--color-neutral-600)" }}>No draw yet. A grown-up can start one here.</p>
        )}
      </div>
    </div>
  );
}
