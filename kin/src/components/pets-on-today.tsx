import Link from "next/link";
import { Icon } from "@/components/icons";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { householdZone } from "@/lib/household-zone";
import { familyDay } from "@/lib/time";
import { petDueLine, petsDue } from "@/lib/pets";

/** Pets on Today (29 October): a vaccine or vet visit from overdue to a week
 * ahead, one line each, opening Family -> Pets. Its own fetch, like
 * HolidayLine; nothing shows when nothing is near. */
export async function PetsOnToday() {
  const me = await getCurrentMember();
  if (!me) return null;
  const supabase = await createClient();
  const { data: pets } = await supabase.from("pets").select("id, name, next_vaccine_on, next_vet_on").eq("family_id", me.family_id).or("next_vaccine_on.not.is.null,next_vet_on.not.is.null");
  const due = petsDue(pets ?? [], familyDay(new Date(), await householdZone())).slice(0, 3);
  if (due.length === 0) return null;
  return (
    <div style={{ display: "grid", gap: "0.25rem", margin: "0 0 0.625rem" }}>
      {due.map((d) => (
        <Link key={`${d.petId}-${d.what}`} href="/family/pets" style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.84375rem", color: "inherit", textDecoration: "none" }}>
          <Icon name="activity" size={16} style={{ color: d.inDays <= 0 ? "var(--color-accent-700)" : "var(--cal-schedule-ink)" }} />
          <span>{petDueLine(d)}</span>
        </Link>
      ))}
    </div>
  );
}
