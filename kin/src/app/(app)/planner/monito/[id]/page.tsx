import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { DetailHeader } from "@/components/hub-header";
import { DrawSetup, MyPick, WishListEditor } from "@/components/gift-draw";
import { getDraw } from "@/lib/queries/gift-draw";
import { capLine, drawProblem } from "@/lib/gift-draw";
import { familyDate } from "@/lib/format-family";
import { UUID } from "@/lib/ids";

/** One monito-monita draw (20261019170200): who is in, the household's own
 * controls, and -- once drawn -- the viewer's pick (and their managed
 * children's) with that person's wish list, and their own wish list. On the
 * day, if the draw reveals, everyone's. */
export default async function DrawPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const draw = await getDraw(id, me);
  if (!draw) notFound();
  const fmt = await familyDate();
  const own = draw.picks.filter((k) => !draw.revealOnDay || !draw.onTheDay || draw.myLists.some((l) => l.person.id === k.giver.id));
  const revealed = draw.revealOnDay && draw.onTheDay ? draw.picks : [];
  const first = (n: string) => n.split(" ")[0];

  return (
    <div>
      <DetailHeader backHref="/planner/monito" eyebrow="Monito-monita" />
      <div style={{ padding: "0 var(--gutter) 1.5rem" }}>
        <h1 style={{ fontSize: "1.375rem", margin: "0 0 0.25rem" }}>{draw.title}</h1>
        <p style={{ fontSize: "0.875rem", color: "var(--color-neutral-600)", margin: "0 0 1rem" }}>
          {fmt(draw.exchangeDate)} · {capLine(draw.priceCap, draw.currency)} · {draw.mine ? "your household's draw" : `${draw.hostName} household's draw`}
        </p>

        {draw.drawn && own.length > 0 && (
          <section style={{ marginBottom: "1.25rem" }}>
            {own.map((k) => (
              <MyPick key={k.giver.id} giverName={k.giver.name} receiverName={k.receiver.name} receiverHousehold={k.receiver.householdName} wishes={k.wishes} own={k.giver.memberId === me.id} />
            ))}
          </section>
        )}
        {draw.drawn && own.length === 0 && draw.myLists.length === 0 && (
          <p style={{ fontSize: "0.875rem", margin: "0 0 1rem" }}>The names are drawn. You&apos;re not in this one.</p>
        )}
        {!draw.drawn && (
          <p style={{ fontSize: "0.875rem", margin: "0 0 1rem", color: "var(--color-neutral-600)" }}>
            Not drawn yet. {draw.mine ? "A grown-up here draws once everyone is in." : `${draw.hostName} household draws once everyone is in.`}
          </p>
        )}

        {revealed.length > 0 && (
          <section style={{ marginBottom: "1.25rem" }}>
            <div className="kin-eyebrow" style={{ marginBottom: "0.5rem" }}>
              WHO PICKED WHOM
            </div>
            {revealed.map((k) => (
              <div key={k.giver.id} style={{ fontSize: "0.875rem", padding: "0.25rem 0" }}>
                {first(k.giver.name)} → {first(k.receiver.name)}
              </div>
            ))}
          </section>
        )}

        {draw.myLists.length > 0 && (
          <section style={{ marginBottom: "1.25rem" }}>
            <div className="kin-eyebrow" style={{ marginBottom: "0.5rem" }}>
              WISH LISTS
            </div>
            {draw.myLists.map((l) => (
              <WishListEditor key={l.person.id} drawId={draw.id} personId={l.person.id} name={l.person.name} wishes={l.wishes} own={l.person.memberId === me.id} />
            ))}
          </section>
        )}

        <section>
          <div className="kin-eyebrow" style={{ marginBottom: "0.5rem" }}>
            WHO&apos;S IN · {draw.people.length}
          </div>
          <DrawSetup
            drawId={draw.id}
            drawn={draw.drawn}
            mine={draw.mine}
            grownUp={draw.grownUp}
            notOwnHousehold={draw.notOwnHousehold}
            revealOnDay={draw.revealOnDay}
            people={draw.people}
            households={draw.households}
            canPutIn={draw.canPutIn}
            canAsk={draw.canAsk}
            myFamilyId={me.family_id}
            meId={me.id}
            problem={drawProblem(draw.people, draw.notOwnHousehold)}
          />
        </section>
      </div>
    </div>
  );
}
