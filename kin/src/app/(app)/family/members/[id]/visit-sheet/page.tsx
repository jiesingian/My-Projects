import { redirect } from "next/navigation";
import { keepKidViewOut, inKidView } from "@/lib/kid-view";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { householdZone } from "@/lib/household-zone";
import { DetailHeader } from "@/components/hub-header";
import { Empty } from "@/components/ui";
import { Icon } from "@/components/icons";
import { EmergencyCardActions } from "@/components/emergency-card-actions";
import { formatAge } from "@/lib/format";
import { familyDate } from "@/lib/format-family";
import { familyDay } from "@/lib/time";
import { activeOn, addDays } from "@/lib/health-plan";
import { guideApplies, vaccineGuide } from "@/lib/vaccine-schedule";
import { maySeeSheet, recentIllness, recentVitals, sheetText, vaccineLines } from "@/lib/visit-sheet";
import { VisitQuestions } from "./visit-questions";

/** Before a check-up (19 October): one page for the doctor -- medicines and
 * doses, allergies, the latest readings, recent illness, a child's vaccines,
 * and the family's questions -- to print or share. Everything but the
 * questions is already in Health; every row is read as the viewer, so a
 * private or parents-only record is on it only for someone allowed to see
 * it. Grown-ups and the person themself; another child is refused, and kid
 * view never gets here. */
export default async function VisitSheetPage({ params }: { params: Promise<{ id: string }> }) {
  await keepKidViewOut();
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { id } = await params;

  if (!maySeeSheet({ id: me.id, role: me.role, kidView: inKidView(me) }, id)) {
    return (
      <div>
        <DetailHeader backHref={`/family/members/${id}`} eyebrow="Doctor-visit sheet" />
        <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
          <Empty icon={<Icon name="shieldCheck" size={26} />} title="For grown-ups" line="A grown-up keeps this sheet. You can open your own." />
        </div>
      </div>
    );
  }

  const tz = await householdZone();
  const today = familyDay(new Date(), tz);
  const supabase = await createClient();
  const [{ data: member }, { data: medicines }, { data: conditions }, { data: vitals }, { data: illness }, { data: labs }, { data: questions }, fmtDate] = await Promise.all([
    supabase.from("members").select("*").eq("id", id).eq("family_id", me.family_id).maybeSingle(),
    supabase.from("health_medicines").select("name, dose, times, start_date, end_date, notes").eq("member_id", id).order("name"),
    supabase.from("health_conditions").select("name, status, meta_note, health_condition_entries(entry_date)").eq("member_id", id),
    supabase.from("health_vitals").select("vital_type, reading_date, value_text, unit").eq("member_id", id).gte("reading_date", addDays(today, -90)),
    supabase.from("health_illness_logs").select("logged_at, temperature_c, symptoms, given, note").eq("member_id", id).gte("logged_at", `${addDays(today, -61)}T00:00:00Z`),
    supabase.from("health_labs").select("name, result, flag, test_date").eq("member_id", id).gte("test_date", addDays(today, -180)).order("test_date", { ascending: false }),
    supabase.from("health_visit_questions").select("id, body, done").eq("member_id", id).order("created_at"),
    familyDate(),
  ]);
  if (!member) redirect("/family");

  const first = member.full_name.split(" ")[0];
  const meds = (medicines ?? []).filter((m) => activeOn(m, today)).map((m) => `${m.name}${m.dose ? ` ${m.dose}` : ""}${m.times.length ? ` at ${m.times.join(", ")}` : " as needed"}${m.notes?.trim() ? ` (${m.notes.trim()})` : ""}`);
  const ongoing = (conditions ?? []).filter((c) => c.status !== "routine" && !/resolved|past|healed/i.test(c.status)).map((c) => `${c.name}${c.meta_note ? ` (${c.meta_note})` : ""}`);
  const vitalLines = recentVitals(vitals ?? [], today);
  const illnessLines = recentIllness(illness ?? [], today, (iso) => familyDay(new Date(iso), tz));
  const labLines = (labs ?? []).map((l) => `${l.name}: ${l.result ?? "result not recorded"}${l.flag ? ` (${l.flag})` : ""}, ${l.test_date}`);
  const vaccines =
    guideApplies(member.role, member.dob, today) && member.dob
      ? vaccineLines(
          vaccineGuide(
            member.dob,
            (conditions ?? []).filter((c) => c.status === "routine").map((c) => ({ name: c.name, dates: (c.health_condition_entries ?? []).map((e) => e.entry_date) })),
            today,
          ),
        )
      : null;
  const open = (questions ?? []).filter((q) => !q.done).map((q) => q.body);
  const text = sheetText({
    name: member.full_name,
    born: member.dob,
    allergies: member.allergies,
    bloodType: member.blood_type,
    doctor: member.physician_name,
    medicines: meds,
    conditions: ongoing,
    vitals: vitalLines,
    illness: illnessLines,
    labs: labLines,
    vaccines,
    questions: open,
  });

  return (
    <div>
      <DetailHeader backHref={`/family/members/${id}?view=health`} eyebrow="Doctor-visit sheet" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <article className="kin-visit-sheet">
          <header className="kin-visit-head">
            <div className="kin-eyebrow">FOR THE DOCTOR · {fmtDate(today)}</div>
            <h3>{member.full_name}</h3>
            <div className="kin-visit-sub">
              {member.dob ? `Born ${fmtDate(member.dob)} · ${formatAge(member.dob)}` : formatAge(member.dob)}
              {member.blood_type ? ` · Blood type ${member.blood_type}` : ""}
              {member.physician_name ? ` · Usual doctor ${member.physician_name}` : ""}
            </div>
          </header>
          <section className="kin-visit-section" data-alert={member.allergies?.trim() ? true : undefined}>
            <h4>Allergies</h4>
            <p>{member.allergies?.trim() || "None recorded"}</p>
          </section>
          <Section title="Medicines now" lines={meds} none="None being taken" />
          <Section title="Conditions" lines={ongoing} none="None recorded" />
          <Section
            title="Recent readings (90 days)"
            lines={vitalLines.map((v) => `${v.label}: ${v.latest} on ${fmtDate(v.on)}${v.earlier.length ? ` · earlier ${v.earlier.join(", ")}` : ""}`)}
            none="No readings recorded"
          />
          <Section title="Recent illness (60 days)" lines={illnessLines.map((l) => `${fmtDate(l.day)}: ${l.text}`)} none="Nothing logged" />
          {labLines.length > 0 && <Section title="Lab results (6 months)" lines={labLines} none="" />}
          {vaccines && (
            <>
              <Section title="Vaccines due now" lines={vaccines.dueNow} none="None due" />
              <Section title="Vaccines given" lines={vaccines.given} none="None recorded yet" />
            </>
          )}
          <section className="kin-visit-section">
            <h4>Questions to ask</h4>
            <VisitQuestions memberId={id} questions={(questions ?? []).map((q) => ({ id: q.id, body: q.body, done: q.done }))} />
          </section>
        </article>
        <EmergencyCardActions title={`${member.full_name}: for the doctor`} text={text} />
        <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.75rem" }}>
          Missing something? Allergies, blood type and the usual doctor are on {first}&apos;s profile; medicines, readings, illness and vaccines are in Health. Ticked questions stay off the printout and the shared text.
        </p>
      </div>
    </div>
  );
}

function Section({ title, lines, none }: { title: string; lines: string[]; none: string }) {
  return (
    <section className="kin-visit-section">
      <h4>{title}</h4>
      {lines.length === 0 ? (
        <p className="kin-visit-none">{none}</p>
      ) : (
        <ul>
          {lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
