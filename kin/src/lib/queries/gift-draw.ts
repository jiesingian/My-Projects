import { createClient } from "@/lib/supabase/server";
import { familyDay } from "@/lib/time";
import { householdZone } from "@/lib/household-zone";
import { isGrownUp } from "@/lib/roles";
import { isGone } from "@/lib/member-status";
import { getLinkedFamilies } from "@/lib/queries/tree-links";

export type DrawSummary = { id: string; title: string; exchangeDate: string; hostName: string; mine: boolean; drawn: boolean; people: number; ours: number };

/** The draws the viewer's household is in, its own and linked households'
 * (20261019233200), soonest first; a month after the day they drop off. */
export async function getMyDraws(): Promise<DrawSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_gift_draws");
  return (data ?? []).map((d) => ({ id: d.draw_id, title: d.title, exchangeDate: d.exchange_date, hostName: d.host_name, mine: d.mine, drawn: d.drawn, people: d.people, ours: d.ours }));
}

export type DrawPersonView = { id: string; memberId: string; familyId: string; name: string; householdName: string };

export type DrawView = {
  id: string;
  title: string;
  priceCap: number | null;
  currency: string;
  exchangeDate: string;
  notOwnHousehold: boolean;
  revealOnDay: boolean;
  drawn: boolean;
  /** The viewer's household started it. */
  mine: boolean;
  /** The exchange day has come. */
  onTheDay: boolean;
  hostName: string;
  households: { familyId: string; name: string }[];
  people: DrawPersonView[];
  /** Picks the viewer may read: their own, their managed children's, and
   * everyone's once revealed on the day. */
  picks: { giver: DrawPersonView; receiver: DrawPersonView; wishes: string[] }[];
  /** People the viewer keeps a wish list for (themselves, their managed
   * children who are in), with what is on it. */
  myLists: { person: DrawPersonView; wishes: string[] }[];
  /** Grown-up of the viewer's household, for the controls. */
  grownUp: boolean;
  /** The viewer's household members who could be put in (not in yet). */
  canPutIn: { id: string; name: string }[];
  /** Linked households not asked yet (organizer's grown-ups only). */
  canAsk: { id: string; name: string }[];
};

/** One draw as the viewer may see it, or null. Names come from the rows
 * (set by the database from each person's own household), never from
 * reading another household's members. */
export async function getDraw(
  id: string,
  me: { id: string; family_id: string; role: string; families: { time_zone: string; name: string } },
): Promise<DrawView | null> {
  const supabase = await createClient();
  const { data: d } = await supabase.from("gift_draws").select("*").eq("id", id).maybeSingle();
  if (!d) return null;
  const [{ data: households }, { data: people }, { data: picks }, { data: wishes }, { data: members }] = await Promise.all([
    supabase.from("gift_draw_households").select("family_id, household_name").eq("draw_id", id),
    supabase.from("gift_draw_people").select("id, member_id, family_id, name, household_name").eq("draw_id", id).order("created_at"),
    supabase.from("gift_draw_picks").select("giver_id, receiver_id").eq("draw_id", id),
    supabase.from("gift_draw_wishes").select("person_id, body").eq("draw_id", id).order("created_at"),
    supabase.from("members").select("id, full_name, role, status").eq("family_id", me.family_id).order("created_at"),
  ]);
  const view = (p: { id: string; member_id: string; family_id: string; name: string; household_name: string }): DrawPersonView => ({
    id: p.id,
    memberId: p.member_id,
    familyId: p.family_id,
    name: p.name,
    householdName: p.household_name,
  });
  const all = (people ?? []).map(view);
  const byId = new Map(all.map((p) => [p.id, p]));
  const wishesOf = (personId: string) => (wishes ?? []).filter((w) => w.person_id === personId).map((w) => w.body);
  const grownUp = isGrownUp(me.role);
  const managed = new Set((members ?? []).filter((m) => m.role === "child_managed").map((m) => m.id));
  const speaksFor = (p: DrawPersonView) => p.memberId === me.id || (grownUp && p.familyId === me.family_id && managed.has(p.memberId));
  const mine = d.family_id === me.family_id;
  const ourDraw = mine || (households ?? []).some((h) => h.family_id === me.family_id);
  const hostName = mine ? me.families.name : ((await supabase.rpc("my_gift_draws")).data?.find((x) => x.draw_id === id)?.host_name ?? "");

  const inIds = new Set(all.map((p) => p.memberId));
  const canPutIn = ourDraw && !d.drawn_at
    ? (members ?? [])
        .filter((m) => m.status !== "pending" && !isGone(m.status) && !inIds.has(m.id) && (grownUp || m.id === me.id))
        .map((m) => ({ id: m.id, name: m.full_name }))
    : [];
  const asked = new Set((households ?? []).map((h) => h.family_id));
  const canAsk = mine && grownUp && !d.drawn_at ? (await getLinkedFamilies(me.family_id)).filter((f) => !asked.has(f.id)) : [];

  return {
    id: d.id,
    title: d.title,
    priceCap: d.price_cap,
    currency: d.currency,
    exchangeDate: d.exchange_date,
    notOwnHousehold: d.not_own_household,
    revealOnDay: d.reveal_on_day,
    drawn: !!d.drawn_at,
    mine,
    onTheDay: d.exchange_date <= familyDay(new Date(), await householdZone()),
    hostName,
    households: (households ?? []).map((h) => ({ familyId: h.family_id, name: h.household_name })),
    people: all,
    picks: (picks ?? [])
      .filter((k) => byId.has(k.giver_id) && byId.has(k.receiver_id))
      .map((k) => ({ giver: byId.get(k.giver_id)!, receiver: byId.get(k.receiver_id)!, wishes: wishesOf(k.receiver_id) }))
      // The viewer's own first, then their children's, then (revealed) everyone's.
      .sort((a, b) => Number(b.giver.memberId === me.id) - Number(a.giver.memberId === me.id) || Number(speaksFor(b.giver)) - Number(speaksFor(a.giver))),
    myLists: all.filter(speaksFor).map((p) => ({ person: p, wishes: wishesOf(p.id) })),
    grownUp,
    canPutIn,
    canAsk,
  };
}
