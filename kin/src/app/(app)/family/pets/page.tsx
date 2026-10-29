import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { DetailHeader } from "@/components/hub-header";
import { PetsManager } from "@/components/pets";

/** Family -> Pets (29 October): each pet with its next vaccine and vet
 * visit (Today reminds), its vet, and its food (one tap to To-Buy).
 * Feeding is a chore the household takes turns at, in Planner. */
export default async function PetsPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const supabase = await createClient();
  const { data: pets } = await supabase.from("pets").select("id, name, kind, birthday, food, vet, next_vaccine_on, next_vet_on, notes").eq("family_id", me.family_id).order("created_at");
  return (
    <div>
      <DetailHeader backHref="/family" eyebrow="Pets" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <p style={{ fontSize: "0.9375rem", lineHeight: 1.45, color: "var(--color-neutral-700)", margin: "0 0 0.875rem" }}>
          Vaccines and vet visits are reminded on Today the week before. For feeding,{" "}
          <Link href="/planner/routines/new" style={{ color: "var(--color-accent-700)", fontWeight: 500 }}>
            add a daily chore
          </Link>{" "}
          and let everyone take turns.
        </p>
        <PetsManager pets={pets ?? []} />
      </div>
    </div>
  );
}
