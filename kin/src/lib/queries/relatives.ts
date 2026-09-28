import { createClient } from "@/lib/supabase/server";

/** A relative in a linked household, as this household may see them
 * (20260929013000_relative_profile.sql): name, photo, cover, their
 * household and where they are on the shared tree -- nothing from About. */
export type RelativeProfile = {
  memberId: string;
  fullName: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  householdName: string;
  /** The conversation this household already has with theirs. */
  linkId: string | null;
  /** Their node on this household's tree chart, when they sit in a joined
   * branch: the branch to open and the chart id to select. */
  tree: { matchId: string; chartId: string } | null;
  moments: { id: string; kind: "entry" | "milestone"; title: string; date: string }[];
};

export async function getRelativeProfile(memberId: string, ourMatches: { matchId: string; ourPersonId: string }[]): Promise<RelativeProfile | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("relative_profile", { p_member_id: memberId });
  const r = data?.[0];
  if (!r) return null;

  // Their shared memories and milestones: the policies that let linked
  // households read shared ones decide, exactly as on the family feed.
  const [{ data: entries }, { data: milestones }] = await Promise.all([
    supabase
      .from("journal_entries")
      .select("id, title, entry_date")
      .eq("created_by", memberId)
      .not("shared_at", "is", null)
      .order("entry_date", { ascending: false })
      .limit(8),
    supabase
      .from("milestones")
      .select("id, title, milestone_date")
      .eq("member_id", memberId)
      .not("shared_at", "is", null)
      .order("milestone_date", { ascending: false })
      .limit(8),
  ]);
  const moments = [
    ...(entries ?? []).map((e) => ({ id: e.id, kind: "entry" as const, title: e.title, date: e.entry_date })),
    ...(milestones ?? []).map((m) => ({ id: m.id, kind: "milestone" as const, title: m.title, date: m.milestone_date })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  // The chart gives a joined branch's people ids of their own
  // (lib/tree-merge), except the one person the two trees share, who is this
  // household's own node.
  let tree: RelativeProfile["tree"] = null;
  if (r.match_id && r.tree_person_id) {
    const ours = ourMatches.find((m) => m.matchId === r.match_id);
    tree = { matchId: r.match_id, chartId: r.is_shared_person && ours ? ours.ourPersonId : `x:${r.match_id}:${r.tree_person_id}` };
  }

  return {
    memberId: r.member_id,
    fullName: r.full_name,
    avatarUrl: r.avatar_url,
    coverUrl: r.cover_path ? supabase.storage.from("avatars").getPublicUrl(r.cover_path).data.publicUrl : null,
    householdName: r.household_name,
    linkId: r.link_id,
    tree,
    moments,
  };
}
