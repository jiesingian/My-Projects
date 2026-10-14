import { PRIORITY_LABELS, topThree, type Answers } from "@/lib/check-up";
import type { Priority } from "@/lib/first-open";

/** The Family Digital Blueprint on the check-up's results page (Janine,
 * 14 October): one of six profiles, a few lines on why it fits, and three
 * to five Kin features to start with. Worked out here in the browser from
 * the answers; nothing is sent. The profile never changes the score.
 *
 * Question 3 (the top 3) decides the profile. The daily check-in and the
 * family-chat question, with questions 4 and 5, only refine it: they break
 * a tie between the profiles the top 3 points to, and add a line to the
 * explanation. They are never read as who a family is. */

export type ProfileId = "organized" | "planning" | "prepared" | "connected" | "memories" | "allInOne";

export type Profile = { id: ProfileId; name: string; tagline: string; cta: string; why: string; features: FeatureId[] };

export type FeatureId =
  | "profiles"
  | "calendar"
  | "reminders"
  | "household"
  | "money"
  | "trips"
  | "goals"
  | "health"
  | "medicines"
  | "emergency"
  | "vault"
  | "chat"
  | "location"
  | "journal"
  | "occasions";

export type Feature = { id: FeatureId; title: string; line: string; plus?: boolean; for: Priority[] };

/** Only what Kin has today, in the words of plan-features.ts. `plus` as
 * there, so nobody meets Kin Plus later as a surprise. `for` is the
 * priorities each one answers, which puts it higher in the list. */
export const FEATURES: Record<FeatureId, Feature> = {
  profiles: { id: "profiles", title: "Family profiles", line: "A profile for each person, with birthdays and the dates that matter to them.", for: ["memories", "plans"] },
  calendar: { id: "calendar", title: "One family calendar", line: "School, work and plans in one place everyone shares, synced with Google Calendar.", for: ["plans", "together"] },
  reminders: { id: "reminders", title: "Appointments and reminders", line: "Doctor’s visits, school events and appointments, with a reminder before each one.", for: ["plans", "health"] },
  household: { id: "household", title: "Household lists and chores", line: "A shared shopping list, the pantry, meal plans, and chores the kids earn stars for.", for: ["meals"] },
  money: { id: "money", title: "Budgets and bills", line: "Wealth: accounts, budgets, and bills with reminders before each one is due.", plus: true, for: ["money"] },
  trips: { id: "trips", title: "Trip planning", line: "Who’s going, a packing list, and the budget beside what was spent.", for: ["travel"] },
  goals: { id: "goals", title: "Family goals", line: "Goals the family works toward together, with the progress where everyone can see it.", for: ["money", "plans"] },
  health: { id: "health", title: "Health profiles", line: "Allergies, blood type, doctor, PhilHealth and insurance on each person’s profile.", for: ["health", "emergency"] },
  medicines: { id: "medicines", title: "Medicines and readings", line: "Medicines with dose reminders, the illness log and vitals, kept per person.", plus: true, for: ["health"] },
  emergency: { id: "emergency", title: "The emergency card", line: "Emergency contacts, blood type and allergies on one screen that reads at arm’s length.", for: ["emergency", "health"] },
  vault: { id: "vault", title: "The document vault", line: "Birth certificates, passports and policies, behind Face ID or a PIN.", plus: true, for: ["documents"] },
  chat: { id: "chat", title: "Family chat", line: "Messages, polls, and voice and video calls, right beside the plans they’re about.", for: ["together"] },
  location: { id: "location", title: "Location sharing", line: "Each person switches it on for themselves, so you can see who’s home without calling.", for: ["kids"] },
  journal: { id: "journal", title: "The family journal", line: "Photos, milestones and first days, shared with the relatives you choose.", for: ["memories", "travel"] },
  occasions: { id: "occasions", title: "Birthdays and milestones", line: "Birthdays and anniversaries remembered, with a reminder before each one.", for: ["memories"] },
};

export const PROFILES: Record<ProfileId, Profile> = {
  organized: {
    id: "organized",
    name: "The Organized Family",
    tagline: "Your family’s world, in order.",
    cta: "Explore your family hub",
    why: "Keeping schedules, appointments and the running of the house in one shared place looks like it would help your household most.",
    features: ["profiles", "calendar", "reminders", "household"],
  },
  planning: {
    id: "planning",
    name: "The Planning Family",
    tagline: "Always thinking one step ahead.",
    cta: "Plan your family’s next chapter",
    why: "Budgets, plans and what’s coming next seem to be on your mind, so seeing them together could make the planning lighter.",
    features: ["money", "household", "reminders", "trips", "goals"],
  },
  prepared: {
    id: "prepared",
    name: "The Prepared Family",
    tagline: "Peace of mind starts with being prepared.",
    cta: "Organize what matters",
    why: "Keeping health details, emergency contacts and important papers organized seems to matter to your household, so they’re easier to find when you need them.",
    features: ["health", "medicines", "emergency", "vault"],
  },
  connected: {
    id: "connected",
    name: "The Connected Family",
    tagline: "Everyone on the same page.",
    cta: "Bring your family together",
    why: "Keeping everyone informed and in step looks important to your household. Explore ways to bring your family’s updates, plans and shared information together.",
    features: ["chat", "calendar", "household", "location"],
  },
  memories: {
    id: "memories",
    name: "The Memory-Keeping Family",
    tagline: "Every moment is part of your story.",
    cta: "Create your family space",
    why: "The moments, milestones and adventures you share seem to matter most, so keeping them together could make them easier to look back on.",
    features: ["occasions", "journal", "trips", "profiles"],
  },
  allInOne: {
    id: "allInOne",
    name: "The All-in-One Family",
    tagline: "One family. One connected space.",
    cta: "Build your family hub",
    why: "Your priorities reach across several parts of family life, so one place for all of it may suit your household best.",
    features: ["profiles", "health", "vault", "money", "trips", "chat", "journal"],
  },
};

/** Which profile each priority favours (Janine's guidance). Kids’ safety
 * and location is knowing where everyone is, so it sits with staying in
 * step rather than with health. */
export const PRIORITY_PROFILE: Record<Priority, Exclude<ProfileId, "allInOne">> = {
  plans: "organized",
  meals: "organized",
  money: "planning",
  travel: "planning",
  health: "prepared",
  emergency: "prepared",
  documents: "prepared",
  together: "connected",
  kids: "connected",
  memories: "memories",
};

/** The other answers as small nudges toward a profile: what keeps coming
 * up in the daily check-in, what the family would use in a chat, and
 * whether health details or papers are hard to find today. */
const BUSY_PROFILE: Record<string, ProfileId> = { meals: "organized", chores: "organized", school: "organized", bills: "planning", savings: "planning" };
const CHAT_PROFILE: Record<string, ProfileId> = { albums: "memories", journal: "memories", polls: "connected", calls: "connected" };

function nudges(answers: Answers): Partial<Record<ProfileId, number>> {
  const n: Partial<Record<ProfileId, number>> = {};
  const add = (p: ProfileId | undefined) => {
    if (p) n[p] = (n[p] ?? 0) + 1;
  };
  for (const b of answers.busy ?? []) add(BUSY_PROFILE[b]);
  for (const c of answers.chat ?? []) add(CHAT_PROFILE[c]);
  if (["ask", "cant"].includes(answers.sick?.[0] ?? "")) add("prepared");
  if (["photos", "scattered"].includes(answers.papers?.[0] ?? "")) add("prepared");
  return n;
}

/** The primary profile. Two or more of the top 3 pointing the same way
 * decide it. When they point different ways, the other answers break the
 * tie between those profiles; if that still doesn't single one out, the
 * family's priorities are spread wide, and it is The All-in-One Family. */
export function blueprintProfile(answers: Answers): ProfileId {
  const top = topThree(answers);
  if (!top.length) return "allInOne";
  const count: Partial<Record<ProfileId, number>> = {};
  for (const p of top) count[PRIORITY_PROFILE[p]] = (count[PRIORITY_PROFILE[p]] ?? 0) + 1;
  const ranked = (Object.entries(count) as [ProfileId, number][]).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 1 || ranked[0][1] > ranked[1][1]) return ranked[0][0];

  const n = nudges(answers);
  const tied = ranked.filter(([, c]) => c === ranked[0][1]).map(([p]) => p);
  const best = Math.max(...tied.map((p) => n[p] ?? 0));
  const leaders = tied.filter((p) => (n[p] ?? 0) === best);
  return best > 0 && leaders.length === 1 ? leaders[0] : "allInOne";
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const BUSY_WORDS: Record<string, string> = {
  meals: "groceries and meals",
  chores: "chores",
  school: "school and schedules",
  bills: "bills and the budget",
  savings: "savings goals",
};

/** Why this profile, from this family's own answers: their top 3 by name,
 * what keeps coming up day to day, and then the profile's own sentence. */
export function blueprintWhy(answers: Answers, profile: ProfileId): string {
  const top = topThree(answers).map((p) => lower(PRIORITY_LABELS[p]));
  const busy = (answers.busy ?? []).map((b) => BUSY_WORDS[b]).filter(Boolean);
  const parts: string[] = [];
  if (top.length) parts.push(`You put ${list(top)} at the top of your list.`);
  if (busy.length) parts.push(`${busy.length === 1 ? "It sounds like" : "And"} ${list(busy)} ${busy.length === 1 ? "comes" : "come"} up a lot in your family conversations.`);
  parts.push(PROFILES[profile].why);
  return parts.join(" ");
}

/** Three to five features: the profile's own, the ones that answer the
 * family's top 3 first (first choice first), then the rest in order. Four
 * for most profiles, five for All-in-One, which spans the most. */
export function blueprintFeatures(answers: Answers, profile: ProfileId): Feature[] {
  const top = topThree(answers);
  const rank = (f: Feature) => {
    const r = Math.min(...f.for.map((p) => (top.includes(p) ? top.indexOf(p) : top.length)));
    return Number.isFinite(r) ? r : top.length;
  };
  const own = PROFILES[profile].features.map((id) => FEATURES[id]);
  const sorted = own.map((f, i) => ({ f, i, r: rank(f) })).sort((a, b) => a.r - b.r || a.i - b.i);
  return sorted.slice(0, profile === "allInOne" ? 5 : 4).map((x) => x.f);
}
