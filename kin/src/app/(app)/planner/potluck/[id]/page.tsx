import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { DetailHeader } from "@/components/hub-header";
import { EventPotluck } from "@/components/event-potluck";
import { getPotluck } from "@/lib/queries/potluck";
import { familyDate } from "@/lib/format-family";
import { UUID } from "@/lib/ids";

/** One potluck on its own (20261019140000): how a linked household that is
 * asked sees the host's list and claims on it -- the event's name, date and
 * host, nothing else of it. The host's own household reaches the same list
 * on the event's screen; here it is the same, for a link that lands here. */
export default async function PotluckPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const potluck = await getPotluck(id, me);
  if (!potluck) notFound();
  if (potluck.mine) redirect(`/planner/add?type=event&id=${id}#potluck`);
  const fmt = await familyDate();
  const when = potluck.endDate && potluck.endDate !== potluck.eventDate ? `${fmt(potluck.eventDate)} – ${fmt(potluck.endDate)}` : fmt(potluck.eventDate);

  return (
    <div>
      <DetailHeader backHref="/planner?seg=events" eyebrow="Potluck" />
      <div style={{ padding: "0 var(--gutter) 1.5rem" }}>
        <h1 style={{ fontSize: "1.375rem", margin: "0 0 0.25rem" }}>{potluck.title}</h1>
        <p style={{ fontSize: "0.875rem", color: "var(--color-neutral-600)", margin: "0 0 1rem" }}>
          {when} · {potluck.hostName} household asks: who brings what?
        </p>
        <div className="kin-eyebrow" style={{ marginBottom: "0.5rem" }}>
          WHO BRINGS WHAT
        </div>
        <EventPotluck eventId={potluck.eventId} lines={potluck.lines} open={potluck.open} canList={false} canAskRelatives={false} relatives={potluck.relatives} />
      </div>
    </div>
  );
}
