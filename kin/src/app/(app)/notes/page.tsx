import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { DetailHeader } from "@/components/hub-header";
import { NotesBoard } from "@/components/notes-board";

/** My notes: the person's private notes, newest change first. Only ever
 * theirs -- row-level security returns nobody else's, so there is no filter
 * here to forget. ?new=1 (Today's Note button) opens with the box ready. */
export default async function NotesPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const supabase = await createClient();
  const { data: notes } = await supabase
    .from("personal_notes")
    .select("id, body, updated_at")
    .order("updated_at", { ascending: false })
    .limit(500);

  return (
    <div>
      <DetailHeader backHref="/today" eyebrow="My notes" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <NotesBoard
          notes={(notes ?? []).map((n) => ({ id: n.id, body: n.body, updatedAt: n.updated_at }))}
          startWriting={(await searchParams).new === "1"}
          tz={me.families.time_zone}
        />
      </div>
    </div>
  );
}
