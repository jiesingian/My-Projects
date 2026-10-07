import { householdZone } from "@/lib/household-zone";
import "server-only";
import type { CurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getTodayBriefing } from "@/lib/queries/today";
import { getRoutinesNeedingAttention } from "@/lib/queries/routines";
import { getBuyItems } from "@/lib/queries/household";
import { getWeekAgenda } from "@/lib/queries/planner";
import { getChatThread, getChatMembers } from "@/lib/queries/chat";
import { getChatThreads } from "@/lib/queries/chat-threads";
import { getFamilyRoom, getDirectThread, getGroupRoom, type RoomMessage } from "@/lib/queries/chat-rooms";
import { getEmergencyContacts, getMembers } from "@/lib/queries/family";
import { weekStartOf } from "@/lib/week";
import { isForMe } from "@/lib/for-me";
import { inKidView } from "@/lib/kid-view";
import { isGone } from "@/lib/member-status";
import { activeOn } from "@/lib/health-plan";
import { mediaSummary } from "@/lib/chat-media";
import { familyDay, familyClock } from "@/lib/time";
import {
  SNAPSHOT_VERSION,
  type OfflineConversation,
  type OfflineEmergencyCard,
  type OfflineMessage,
  type OfflineSnapshot,
  type OfflineTodayItem,
} from "@/lib/offline/types";

/** Messages kept per conversation, and how many conversations besides the
 * household's own. */
const MESSAGES = 50;
const OTHER_CONVERSATIONS = 3;

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const words = (body: string, files: number) => mediaSummary(body) ?? (body || (files > 0 ? "Sent an attachment" : ""));

/** Everything offline Kin shows, for this member, read in their own session
 * so row-level security decides what is in it exactly as it does on the page.
 * Each part fails on its own: a snapshot with no Planner is still worth
 * saving, and one slow query must not cost the whole thing. */
export async function buildSnapshot(me: CurrentMember, userId: string): Promise<OfflineSnapshot> {
  const tz = await householdZone();
  const kid = inKidView(me);
  const day = familyDay(new Date(), tz);
  const soft = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);

  const [today, shopping, planner, conversations, emergency] = await Promise.all([
    soft(todayItems(me), []),
    kid ? Promise.resolve(null) : soft(shoppingList(me.family_id), null),
    soft(plannerWeek(me), []),
    soft(recentConversations(me), []),
    kid ? Promise.resolve(null) : soft(emergencyCards(me.family_id, day), null),
  ]);

  return {
    version: SNAPSHOT_VERSION,
    userId,
    memberId: me.id,
    firstName: me.full_name.split(" ")[0],
    familyName: me.families.name,
    savedAt: new Date().toISOString(),
    day,
    kidView: kid,
    today,
    shopping,
    planner,
    conversations,
    emergency,
  };
}

/** Today's one list, in the order today/page.tsx gives it. */
async function todayItems(me: CurrentMember): Promise<OfflineTodayItem[]> {
  const tz = await householdZone();
  const [brief, tasks] = await Promise.all([
    getTodayBriefing(me.family_id, me.families.currency, me),
    getRoutinesNeedingAttention(me.family_id).then((all) => all.filter((r) => isForMe(me, r.appliesToAll, r.members))),
  ]);
  const minutes = (hhmm: string | null | undefined) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? "");
    return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
  };
  const ranked: { item: OfflineTodayItem; group: number; at: number }[] = [
    ...brief
      .filter((b) => !b.id.startsWith("meal-") && b.action)
      .map((b) => ({
        item: {
          key: b.id,
          title: b.title,
          meta: b.meta,
          urgent: !!b.urgent,
          markable: b.action === "done" && /^(activity|health)-/.test(b.id),
          mark: b.mark ?? null,
        },
        group: b.mark ? 2 : b.urgent ? 0 : 1,
        at: b.at != null ? minutes(familyClock(new Date(b.at), tz)) : -1,
      })),
    ...tasks
      .filter((t) => t.today)
      .map((t) => ({
        item: {
          key: `chore-${t.id}`,
          title: t.title,
          meta: [t.timeOfDay?.slice(0, 5), t.today?.assignee?.name.split(" ")[0]].filter(Boolean).join(" · ") || "Chore",
          urgent: false,
          markable: true,
          mark: t.today?.status ?? null,
          date: t.today!.date,
        },
        group: t.today?.status ? 2 : 1,
        at: minutes(t.timeOfDay),
      })),
  ];
  return ranked.sort((a, b) => a.group - b.group || a.at - b.at).map((r) => r.item);
}

async function shoppingList(familyId: string) {
  const { groups } = await getBuyItems(familyId);
  return groups.map((g) => ({
    name: g.name,
    items: g.items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, unit: i.unit, checked: i.checked })),
  }));
}

async function plannerWeek(me: CurrentMember) {
  const tz = await householdZone();
  const { days } = await getWeekAgenda(me.family_id, undefined, new Date(), undefined, 0, weekStartOf(me.families.week_start));
  return days.map((d) => ({
    date: iso(d.date),
    isToday: d.isToday,
    items: d.activities.map((a) => ({
      id: `${a.table}-${a.id}`,
      title: a.title,
      time: a.allDay ? null : familyClock(a.date, tz),
      who: a.who,
      location: a.location,
    })),
  }));
}

function fromRoom(messages: RoomMessage[]): OfflineMessage[] {
  return messages.slice(-MESSAGES).map((m) => ({
    id: m.id,
    author: m.mine ? "You" : m.authorName.split(" ")[0],
    mine: m.mine,
    body: words(m.body, m.photos.length),
    at: m.createdAt,
    files: m.photos.length,
  }));
}

async function recentConversations(me: CurrentMember): Promise<OfflineConversation[]> {
  const [thread, members, summaries] = await Promise.all([
    getChatThread(me.family_id, MESSAGES),
    getChatMembers(me.family_id),
    getChatThreads({ id: me.id, family_id: me.family_id, person_id: me.person_id, familyName: me.families.name }),
  ]);
  const nameOf = new Map(members.map((m) => [m.id, m.first]));
  const household: OfflineConversation = {
    key: "household",
    title: me.families.name,
    canSend: true,
    messages: thread
      .filter((m) => !m.deleted)
      .map((m) => ({
        id: m.id,
        author: m.memberId === me.id ? "You" : nameOf.get(m.memberId ?? "") ?? "Someone",
        mine: m.memberId === me.id,
        body: words(m.body, m.attachments.length) || (m.poll ? `Poll: ${m.poll.question}` : ""),
        at: m.createdAt,
        files: m.attachments.length,
      })),
  };

  const others = summaries
    .filter((s) => s.kind !== "household" && s.kind !== "link" && s.last)
    .sort((a, b) => (b.last!.at > a.last!.at ? 1 : -1))
    .slice(0, OTHER_CONVERSATIONS);
  const rest = await Promise.all(
    others.map(async (s): Promise<OfflineConversation | null> => {
      if (s.kind === "family") {
        const room = await getFamilyRoom(me);
        return { key: s.key, title: s.title, canSend: false, messages: fromRoom(room.messages) };
      }
      if (s.kind === "dm") {
        const t = await getDirectThread(me.person_id, s.key.slice("dm:".length));
        return t ? { key: s.key, title: s.title, canSend: false, messages: fromRoom(t.messages) } : null;
      }
      const g = await getGroupRoom(me.person_id, s.key.slice("group:".length));
      return g ? { key: s.key, title: s.title, canSend: false, messages: fromRoom(g.messages) } : null;
    }).map((p) => p.catch(() => null)),
  );
  return [household, ...rest.filter((c): c is OfflineConversation => c !== null)];
}

/** The card members/[id]/emergency shows, for everyone in the household:
 * a card is for when the phone is all anyone has. */
async function emergencyCards(familyId: string, day: string): Promise<OfflineEmergencyCard[]> {
  const supabase = await createClient();
  const [members, contacts] = await Promise.all([getMembers(familyId), getEmergencyContacts(familyId)]);
  const here = members.filter((m) => !isGone(m.status));
  const ids = here.map((m) => m.id);
  const [{ data: medicines }, { data: conditions }] = await Promise.all([
    supabase.from("health_medicines").select("member_id, name, dose, times, start_date, end_date").in("member_id", ids),
    supabase.from("health_conditions").select("member_id, name, status").in("member_id", ids),
  ]);
  return here.map((member) => {
    const current = (medicines ?? []).filter((m) => m.member_id === member.id && activeOn(m, day));
    const ongoing = (conditions ?? []).filter((c) => c.member_id === member.id && !/resolved|past|healed/i.test(c.status));
    const parents = here.filter((m) => (m.role === "parent" || m.role === "adult") && m.id !== member.id && m.mobile?.trim());
    return {
      memberId: member.id,
      name: member.full_name,
      born: member.dob,
      facts: [
        ["Blood type", member.blood_type],
        ["Allergies", member.allergies],
        ["Medicines now", current.map((m) => `${m.name}${m.dose ? ` ${m.dose}` : ""}${m.times.length ? ` (${m.times.join(", ")})` : ""}`).join("; ") || null],
        ["Conditions", ongoing.map((c) => c.name).join(", ") || null],
        ["Doctor", member.physician_name],
        ["Insurance", member.insurance_info],
      ],
      calls: [
        ...parents.map((p) => ({ name: p.full_name, relationship: p.relationship ?? p.role, phone: p.mobile!.trim() })),
        ...contacts.map((c) => ({ name: c.name, relationship: c.relationship, phone: c.phone })),
      ],
    };
  });
}
