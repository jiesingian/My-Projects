import { redirect } from "next/navigation";
import { keepKidViewOut } from "@/lib/kid-view";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getSignedUrls } from "@/lib/storage";
import { DetailHeader } from "@/components/hub-header";
import { VisitNotes, VisitPhotos } from "@/components/health-visit";
import { familyDateTime } from "@/lib/time";

/** One doctor's visit: when and where, what was said, and photos of what came
 * home from it (26 September). */
export default async function VisitPage({ params }: { params: Promise<{ id: string; appt: string }> }) {
  await keepKidViewOut();
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { id, appt } = await params;
  const supabase = await createClient();
  const [{ data: member }, { data: visit }, { data: rows }] = await Promise.all([
    supabase.from("members").select("id, full_name").eq("id", id).eq("family_id", me.family_id).maybeSingle(),
    supabase.from("health_appointments").select("*").eq("id", appt).eq("member_id", id).maybeSingle(),
    supabase.from("health_visit_photos").select("id, storage_path").eq("appointment_id", appt).order("created_at"),
  ]);
  if (!member || !visit) redirect(`/family/members/${id}?view=health`);
  const urls = await getSignedUrls("journal", (rows ?? []).map((r) => r.storage_path));
  const photos = (rows ?? []).filter((r) => urls[r.storage_path]).map((r) => ({ id: r.id, url: urls[r.storage_path] }));
  const back = `/family/members/${id}?view=health`;

  return (
    <div>
      <DetailHeader backHref={back} eyebrow="Visit" trail={[{ label: "Family", href: "/family?seg=health" }, { label: member.full_name, href: back }, { label: visit.what }]} />
      <div style={{ padding: "0 1.375rem 1.375rem" }}>
        <h2 style={{ fontSize: "1.5rem", margin: "0.25rem 0 0.25rem" }}>{visit.what}</h2>
        <p style={{ fontSize: "0.875rem", color: "var(--color-neutral-600)", margin: "0 0 1.125rem" }}>
          {member.full_name.split(" ")[0]} · {familyDateTime(new Date(visit.when_at))}
          {visit.where_text ? ` · ${visit.where_text}` : ""}
        </p>
        <div className="kin-eyebrow">NOTES</div>
        <VisitNotes appointmentId={visit.id} memberId={member.id} initial={visit.notes ?? ""} />
        <div className="kin-eyebrow" style={{ marginTop: "1.375rem" }}>
          PHOTOS
        </div>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "0 0 0.625rem" }}>The prescription, lab results, the doctor&apos;s note. Seen only by your household.</p>
        <VisitPhotos familyId={me.family_id} appointmentId={visit.id} memberId={member.id} photos={photos} />
      </div>
    </div>
  );
}
