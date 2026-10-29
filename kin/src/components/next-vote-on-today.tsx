import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isGrownUp } from "@/lib/roles";
import { inKidView } from "@/lib/kid-view";
import { NextVoteCard } from "@/components/next-vote";

/** "What should Kin do next?" on Today (29 October), for a grown-up who
 * hasn't answered yet. Its own fetch: one row of their own. */
export async function NextVoteOnToday() {
  const me = await getCurrentMember();
  if (!me || !isGrownUp(me.role) || inKidView(me)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("feature_votes").select("choice").eq("member_id", me.id).maybeSingle();
  return data ? null : <NextVoteCard />;
}
