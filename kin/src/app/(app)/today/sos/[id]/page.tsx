import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getEmergencyContacts } from "@/lib/queries/family";
import { DetailHeader } from "@/components/hub-header";
import { SosAlertActions } from "@/components/sos-alert-actions";
import { FAMILY_TZ } from "@/lib/time";
import { clockIn, isTimeZone, mapLink, sinceLabel, zoneCity } from "@/lib/member-card";
import { isGone } from "@/lib/member-status";

export const dynamic = "force-dynamic";

/** Where an SOS push lands (approved 30 September): who, when, where if their
 * phone allowed, who is dealing with it, and every number worth calling.
 *
 * Readable by the person who sent it and by the household's grown-ups --
 * sos_alerts' own policy; anybody else gets "not found". */
export default async function SosAlertPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data: alert } = await supabase.from("sos_alerts").select("*").eq("id", id).eq("family_id", me.family_id).maybeSingle();
  if (!alert) notFound();

  const [{ data: household }, contacts] = await Promise.all([
    supabase.from("members").select("id, full_name, role, status, mobile, timezone").eq("family_id", me.family_id),
    getEmergencyContacts(me.family_id),
  ]);
  const people = household ?? [];
  const sender = people.find((m) => m.id === alert.member_id);
  const handler = alert.handled_by ? people.find((m) => m.id === alert.handled_by) : null;
  const mine = alert.member_id === me.id;
  const name = sender?.full_name ?? "Someone";
  const first = name.split(" ")[0];
  const tz = isTimeZone(sender?.timezone) ? sender!.timezone! : FAMILY_TZ;
  const at = new Date(alert.created_at);
  const open = !alert.resolved_at;

  // Them first, then the other grown-ups, then the household's emergency
  // numbers -- the order somebody would ring in.
  const calls = [
    ...(!mine && sender?.mobile?.trim() ? [{ key: sender.id, name: sender.full_name, note: "sent the SOS", phone: sender.mobile.trim() }] : []),
    ...people
      .filter((m) => m.id !== me.id && m.id !== alert.member_id && (m.role === "parent" || m.role === "adult") && !isGone(m.status) && m.mobile?.trim())
      .map((m) => ({ key: m.id, name: m.full_name, note: m.role === "parent" ? "parent" : "grown-up", phone: m.mobile!.trim() })),
    ...contacts.map((c) => ({ key: c.id, name: c.name, note: c.relationship, phone: c.phone })),
  ];

  const facts: [string, React.ReactNode, boolean][] = [
    ["When", `${clockIn(tz, at)} in ${zoneCity(tz)} · ${sinceLabel(alert.created_at)}`, false],
    [
      "Where",
      alert.lat !== null && alert.lng !== null ? (
        <a href={mapLink(alert.lat, alert.lng)} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
          Open in Maps{alert.accuracy_m ? ` · within about ${alert.accuracy_m < 1000 ? `${alert.accuracy_m} m` : `${Math.round(alert.accuracy_m / 1000)} km`}` : ""} ›
        </a>
      ) : (
        "Their phone didn't share a location"
      ),
      alert.lat === null,
    ],
    [
      "Now",
      !open
        ? `${mine ? "You" : first} said ${mine ? "you were" : "they were"} safe · ${sinceLabel(alert.resolved_at)}`
        : handler
          ? `${handler.id === me.id ? "You are" : `${handler.full_name.split(" ")[0]} is`} responding · ${sinceLabel(alert.handled_at)}`
          : alert.notified > 0
            ? `Sent to ${alert.notified} phone${alert.notified === 1 ? "" : "s"} · nobody has said they're on it yet`
            : "No phone could be reached by notification · call",
      false,
    ],
  ];

  return (
    <div>
      <DetailHeader backHref="/today" eyebrow="Emergency SOS" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <div className="kin-sos">
          <div className="kin-sos-head" style={open ? undefined : { background: "var(--color-neutral-600)" }}>
            <span className="kin-sos-badge">{open ? "SOS" : "SOS · OVER"}</span>
            <div className="kin-sos-name">{mine ? "Your SOS" : open ? `${first} needs help` : `${first} is safe`}</div>
            <div className="kin-sos-sub">{name}</div>
          </div>
          <dl className="kin-sos-facts">
            {facts.map(([k, v, empty]) => (
              <div key={k} data-empty={empty || undefined}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {calls.length > 0 && (
            <div className="kin-sos-calls">
              <div className="kin-sos-calls-title">Call</div>
              {calls.map((c) => (
                <a key={c.key} href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="kin-sos-call">
                  <span>
                    <b>{c.name}</b> · {c.note}
                  </span>
                  <span>{c.phone}</span>
                </a>
              ))}
            </div>
          )}
        </div>
        <SosAlertActions
          id={alert.id}
          callMemberId={mine ? null : alert.member_id}
          callName={first}
          canSafe={mine && open}
          canHandle={!mine && open && !alert.handled_by && (me.role === "parent" || me.role === "adult")}
        />
        <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.875rem" }}>
          {mine ? "Only you and the grown-ups at home can see this alert." : `Only ${first} and the grown-ups at home can see this alert.`} In a life-threatening emergency, call your local emergency number first.
        </p>
      </div>
    </div>
  );
}
