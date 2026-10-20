import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getMembers } from "@/lib/queries/family";
import { createClient } from "@/lib/supabase/server";
import { AddPlannerForm } from "./add-planner-form";
import { getAccounts } from "@/lib/queries/wealth";
import { LogSpendControl } from "@/components/money-actions";
import { kinAiReady } from "@/lib/kin-ai";
import { sentIdFrom } from "@/lib/send-to-kin";
import { readAccess } from "@/lib/access";
import { inKidView } from "@/lib/kid-view";
import { EventPhotos } from "@/components/event-photos";
import { getSignedUrls } from "@/lib/storage";
import { EventRsvp } from "@/components/event-rsvp";
import { EventThread, type EventComment } from "@/components/event-thread";
import { EventPotluck } from "@/components/event-potluck";
import { getPotluck, type Potluck } from "@/lib/queries/potluck";
import { isGrownUp } from "@/lib/roles";
import { askedMembers, canAnswerFor, eventTakesRsvps, rsvpOpen, summarizeRsvps, type RsvpAnswer } from "@/lib/event-rsvp";
import { householdZone } from "@/lib/household-zone";
import { familyDay } from "@/lib/time";

export default async function AddPlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; id?: string; date?: string; title?: string; notes?: string; sent?: string }>;
}) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { type: rawType, id, date, title, notes, sent } = await searchParams;
  // "activity" was the old name for what is now a one-off task. Links out in
  // the wild -- a bookmark, a Google Calendar description, a chat message --
  // still carry it, and they should keep working.
  const type = rawType === "activity" ? "task" : rawType;
  const members = await getMembers(me.family_id);

  let editActivity = null;
  let editEvent = null;
  if (id && type === "task") {
    const supabase = await createClient();
    const { data } = await supabase.from("activities").select("*, activity_members(member_id)").eq("id", id).eq("family_id", me.family_id).maybeSingle();
    if (data) editActivity = { ...data, who: (data.activity_members ?? []).map((m) => m.member_id) };
  } else if (id && type === "event") {
    const supabase = await createClient();
    const { data } = await supabase
      .from("events")
      .select("*, event_members(member_id)")
      .eq("id", id)
      .eq("family_id", me.family_id)
      .maybeSingle();
    if (data) editEvent = { ...data, memberIds: (data.event_members ?? []).map((em) => em.member_id) };
  }

  // A trip's spending is logged from the trip itself now; it used to live on
  // the big trip card at the top of the Planner, which is gone (26 September).
  // Money, so never in kid view (lib/kid-view.ts).
  const isTrip = editEvent?.kind === "travel" && !inKidView(me);
  const pickable = isTrip
    ? (await getAccounts(me.family_id))
        .filter((a) => a.is_joint || a.owner_member_id === me.id)
        .map((a) => ({ id: a.id, name: a.name, institution: a.institution, linked_app_url: a.linked_app_url, balance: a.balance, is_joint: a.is_joint }))
    : [];

  // An existing event's photos (20260926150000_event_photos.sql).
  let eventPhotos: { id: string; url: string }[] = [];
  if (editEvent) {
    const supabase = await createClient();
    const { data: rows } = await supabase.from("event_photos").select("id, storage_path").eq("event_id", editEvent.id).order("created_at");
    const urls = await getSignedUrls("journal", (rows ?? []).map((r) => r.storage_path));
    eventPhotos = (rows ?? []).filter((r) => urls[r.storage_path]).map((r) => ({ id: r.id, url: urls[r.storage_path] }));
  }

  // Who's coming (20261014090000_event_rsvps.sql): one-off events and trips
  // only; a yearly one has no single date to answer for.
  let rsvp: React.ComponentProps<typeof EventRsvp> | null = null;
  const rsvpEvent = editEvent && {
    event_date: editEvent.event_date,
    end_date: editEvent.end_date,
    recurs_yearly: editEvent.recurs_yearly,
    applies_to_whole_family: editEvent.applies_to_whole_family,
  };
  if (editEvent && rsvpEvent && eventTakesRsvps(rsvpEvent)) {
    const supabase = await createClient();
    const { data: answers } = await supabase.from("event_rsvps").select("member_id, answer").eq("event_id", editEvent.id);
    const asked = askedMembers(rsvpEvent, editEvent.memberIds as string[], members);
    const summary = summarizeRsvps(asked, answers ?? []);
    const answerOf = new Map((answers ?? []).map((a) => [a.member_id, a.answer as RsvpAnswer]));
    const person = (m: (typeof members)[number]) => ({ id: m.id, name: m.full_name });
    rsvp = {
      eventId: editEvent.id,
      open: rsvpOpen(rsvpEvent, familyDay(new Date(), await householdZone())),
      mine: asked.filter((m) => canAnswerFor(me, m)).map((m) => ({ ...person(m), answer: answerOf.get(m.id) ?? null })),
      groups: { going: summary.going.map(person), maybe: summary.maybe.map(person), no: summary.no.map(person), waiting: summary.waiting.map(person) },
    };
  }

  // The event's thread (20261014100000_event_comments.sql), oldest first.
  let thread: EventComment[] = [];
  if (editEvent) {
    const supabase = await createClient();
    const { data: rows } = await supabase
      .from("event_comments")
      .select("id, body, created_at, edited_at, member_id, members(full_name)")
      .eq("event_id", editEvent.id)
      .order("created_at", { ascending: true })
      .limit(300);
    thread = (rows ?? []).map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.created_at,
      edited: !!c.edited_at,
      author: c.member_id === me.id ? "You" : ((c.members as unknown as { full_name: string } | null)?.full_name ?? "Someone").split(" ")[0],
      mine: c.member_id === me.id,
    }));
  }

  // Who brings what (20261019233100_event_potluck.sql): one-off events only.
  const potluck: Potluck | null = editEvent && !editEvent.recurs_yearly ? await getPotluck(editEvent.id, me) : null;

  return (
    <>
    <AddPlannerForm
      members={members}
      defaultType={type ?? "task"}
      defaultDate={date}
      editActivity={editActivity}
      editEvent={editEvent}
      // Trimmed to the fields' own limits here rather than trusted: this
      // arrives in a URL, and a URL is something anybody can type.
      prefill={id ? undefined : { title: title?.slice(0, 150), notes: notes?.slice(0, 1000) }}
      householdCurrency={me.families.currency}
      // Whether the photo scanner can run: it reads the photo with Claude,
      // which needs ANTHROPIC_API_KEY in Vercel (docs/SETUP_FOR_JONATHAN.md).
      scanReady={kinAiReady()}
      // "Send it to Kin" (lib/send-to-kin.ts): a screenshot waiting to be read.
      sentScreenshot={sentIdFrom(sent)}
      plus={readAccess(me.families).plus}
    />
    {rsvp && (
      <div style={{ padding: "0 var(--gutter) 1.25rem" }}>
        <div className="kin-eyebrow" style={{ marginBottom: "0.5rem" }}>
          WHO&apos;S COMING
        </div>
        <EventRsvp {...rsvp} />
      </div>
    )}
    {potluck && (
      <div id="potluck" style={{ padding: "0 var(--gutter) 1.25rem" }}>
        <div className="kin-eyebrow" style={{ marginBottom: "0.5rem" }}>
          WHO BRINGS WHAT
        </div>
        <EventPotluck
          eventId={potluck.eventId}
          lines={potluck.lines}
          open={potluck.open}
          canList={!inKidView(me)}
          canAskRelatives={isGrownUp(me.role)}
          relatives={potluck.relatives}
        />
      </div>
    )}
    {editEvent && (
      <div style={{ padding: "0 var(--gutter) 1.25rem" }}>
        <div className="kin-eyebrow" style={{ marginBottom: "0.5rem" }}>
          THREAD
        </div>
        {/* eslint-disable-next-line react-hooks/purity -- the server's "now", passed down so the client's ages match it */}
        <EventThread eventId={editEvent.id} comments={thread} now={Date.now()} />
      </div>
    )}
    {editEvent && (
      <div style={{ padding: "0 var(--gutter) 1.25rem" }}>
        <div className="kin-eyebrow" style={{ marginBottom: "0.5rem" }}>
          PHOTOS
        </div>
        <EventPhotos eventId={editEvent.id} photos={eventPhotos} />
      </div>
    )}
    {isTrip && editEvent && (
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <LogSpendControl
          accounts={pickable}
          currency={editEvent.budget_currency ?? me.families.currency}
          particulars={`${editEvent.title} · travel`}
          category="Travel"
          sourceTable="events"
          sourceId={editEvent.id}
          label="Log trip spend"
        />
      </div>
    )}
    </>
  );
}
