import { redirect } from "next/navigation";
import { keepKidViewOut } from "@/lib/kid-view";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getEmergencyContacts, getMembers } from "@/lib/queries/family";
import { DetailHeader } from "@/components/hub-header";
import { EmergencyCardActions } from "@/components/emergency-card-actions";
import { formatAge } from "@/lib/format";
import { familyDay } from "@/lib/time";
import { activeOn } from "@/lib/health-plan";

/** Everything a doctor or a stranger helping in an emergency needs, on one
 * screen that reads at arm's length (26 September): blood type, allergies,
 * the medicines being taken now, ongoing conditions, the doctor, insurance,
 * and who to call. Everything here is already in Health; this only gathers
 * it. Share sends it as text, and Print makes a wallet card. */
export default async function EmergencyCardPage({ params }: { params: Promise<{ id: string }> }) {
  await keepKidViewOut();
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { id } = await params;
  const supabase = await createClient();
  const today = familyDay();
  const [{ data: member }, { data: medicines }, { data: conditions }, contacts, members] = await Promise.all([
    supabase.from("members").select("*").eq("id", id).eq("family_id", me.family_id).maybeSingle(),
    supabase.from("health_medicines").select("name, dose, times, start_date, end_date").eq("member_id", id),
    supabase.from("health_conditions").select("name, status").eq("member_id", id),
    getEmergencyContacts(me.family_id),
    getMembers(me.family_id),
  ]);
  if (!member) redirect("/family?seg=health");

  const current = (medicines ?? []).filter((m) => activeOn(m, today));
  const ongoing = (conditions ?? []).filter((c) => !/resolved|past|healed/i.test(c.status));
  // The grown-ups of the house come first: they are who a hospital rings.
  const parents = members.filter((m) => (m.role === "parent" || m.role === "adult") && m.id !== member.id && m.mobile?.trim() && m.status !== "removed");
  const calls = [...parents.map((p) => ({ name: p.full_name, relationship: p.relationship ?? p.role, phone: p.mobile!.trim() })), ...contacts.map((c) => ({ name: c.name, relationship: c.relationship, phone: c.phone }))];

  const facts: [string, string | null][] = [
    ["Blood type", member.blood_type],
    ["Allergies", member.allergies],
    ["Medicines now", current.map((m) => `${m.name}${m.dose ? ` ${m.dose}` : ""}${m.times.length ? ` (${m.times.join(", ")})` : ""}`).join("; ") || null],
    ["Conditions", ongoing.map((c) => c.name).join(", ") || null],
    ["Doctor", member.physician_name],
    ["Insurance", member.insurance_info],
  ];
  const text = [
    `EMERGENCY CARD: ${member.full_name}${member.dob ? `, born ${member.dob}` : ""}`,
    ...facts.map(([k, v]) => `${k}: ${v ?? "not recorded"}`),
    ...calls.map((c) => `Call ${c.name} (${c.relationship}): ${c.phone}`),
  ].join("\n");

  return (
    <div>
      <DetailHeader backHref={`/family/members/${id}?view=health`} eyebrow="Emergency card" />
      <div style={{ padding: "0 1.375rem 1.375rem" }}>
        <div className="kin-sos">
          <div className="kin-sos-head">
            <span className="kin-sos-badge">EMERGENCY</span>
            <div className="kin-sos-name">{member.full_name}</div>
            <div className="kin-sos-sub">
              {member.dob ? `Born ${member.dob} · ${formatAge(member.dob)}` : formatAge(member.dob)}
            </div>
          </div>
          <dl className="kin-sos-facts">
            {facts.map(([k, v]) => (
              <div key={k} data-empty={!v || undefined} data-alert={(k === "Allergies" && v) || undefined}>
                <dt>{k}</dt>
                <dd>{v ?? "Not recorded"}</dd>
              </div>
            ))}
          </dl>
          {calls.length > 0 && (
            <div className="kin-sos-calls">
              <div className="kin-sos-calls-title">Who to call</div>
              {calls.map((c) => (
                <a key={`${c.name}-${c.phone}`} href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="kin-sos-call">
                  <span>
                    <b>{c.name}</b> · {c.relationship}
                  </span>
                  <span>{c.phone}</span>
                </a>
              ))}
            </div>
          )}
        </div>
        <EmergencyCardActions title={`${member.full_name}: emergency card`} text={text} />
        <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.75rem" }}>
          Missing something? Blood type, allergies, doctor and insurance are on {member.full_name.split(" ")[0]}&apos;s profile; medicines and conditions are in Health; numbers to call are in Family, Links.
        </p>
      </div>
    </div>
  );
}
