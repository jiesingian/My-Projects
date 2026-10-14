import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { householdZone } from "@/lib/household-zone";
import { familyDay } from "@/lib/time";
import { UUID } from "@/lib/ids";
import { DetailHeader } from "@/components/hub-header";
import { Avatar } from "@/components/avatar";
import { TreeStories } from "@/components/tree-stories";
import { getMembers } from "@/lib/queries/family";
import { getPersonStories } from "@/lib/queries/tree-stories";
import { canAddStories, storyCountLabel } from "@/lib/tree-stories";
import { promptForWeek } from "@/lib/story-prompts";
import { isGrownUp } from "@/lib/roles";
import { isGone } from "@/lib/member-status";
import { initials } from "@/lib/format";

/** Stories about one person on the household's tree (14 October): a
 * relative who is only a name, somebody who has passed, or a member. Reached
 * from their panel on the tree, and from a member's profile -- two places,
 * so the crumbs say which (docs/PAGE_PATTERNS.md). The household's own:
 * nothing here is shown to a linked household. */
export default async function TreeStoriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ personId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { personId } = await params;
  const sp = await searchParams;
  if (!UUID.test(personId)) redirect("/family?seg=tree");

  const supabase = await createClient();
  const { data: person } = await supabase
    .from("family_tree_people")
    .select("id, family_id, member_id, full_name, dob")
    .eq("id", personId)
    .eq("family_id", me.family_id)
    .maybeSingle();
  if (!person) redirect("/family?seg=tree");

  const [stories, allMembers, tz] = await Promise.all([getPersonStories(person.id, me.family_id), getMembers(me.family_id), householdZone()]);
  const members = allMembers.filter((m) => m.status !== "pending" && !isGone(m.status));
  const member = person.member_id ? allMembers.find((m) => m.id === person.member_id) : undefined;
  const fullName = member?.full_name ?? person.full_name ?? "Unnamed";
  const firstName = fullName.split(" ")[0];
  const dob = member?.dob ?? person.dob;
  const today = familyDay(new Date(), tz);

  const fromProfile = sp.from === "member" && !!person.member_id;
  const backHref = fromProfile ? `/family/members/${person.member_id}` : "/family?seg=tree";
  const trail = [{ label: fromProfile ? fullName : "Tree", href: backHref }, { label: "Stories" }];

  return (
    <div>
      <DetailHeader backHref={backHref} eyebrow="HUB 01 · STORIES" trail={trail} />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <div className="kin-stories-head">
          <Avatar url={member?.avatar_url ?? null} initials={initials(fullName)} label={fullName} size={56} />
          <div style={{ minWidth: 0 }}>
            <h1 className="kin-stories-name">{fullName}</h1>
            <div className="kin-stories-meta">
              {[dob ? `Born ${dob.slice(0, 4)}` : null, stories ? storyCountLabel(stories.length) : null].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>
        <p className="kin-stories-note">Kept by your household and seen only by it. Recordings and photos count toward your Kin storage.</p>
        {stories === null ? (
          <p role="alert" className="kin-stories-empty">
            {firstName}&rsquo;s stories couldn&rsquo;t be loaded just now. Try again in a moment.
          </p>
        ) : (
          <TreeStories
            personId={person.id}
            firstName={firstName}
            stories={stories}
            members={members.map((m) => ({ id: m.id, fullName: m.full_name }))}
            meId={me.id}
            canAdd={canAddStories(me)}
            grownUp={isGrownUp(me.role)}
            prompt={promptForWeek()}
            today={today}
          />
        )}
      </div>
    </div>
  );
}
