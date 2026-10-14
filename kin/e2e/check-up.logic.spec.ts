import { test, expect } from "@playwright/test";
import { PRIORITIES } from "@/lib/first-open";
import { QUESTIONS, type Answers, PRIORITY_IN_KIN, answerTip, answered, oneAppLine, wantsPrivacyFirst, areaScores, questionsFor, readinessScore, scoreCategory, toggle, topThree } from "@/lib/check-up";
import { FEATURES, PRIORITY_PROFILE, PROFILES, blueprintFeatures, blueprintProfile } from "@/lib/blueprint";

const q = (id: string) => QUESTIONS.find((x) => x.id === id)!;

test("nine questions, and question 6 only when there are kids under 18 at home", () => {
  expect(QUESTIONS).toHaveLength(9);
  expect(questionsFor({}).map((x) => x.id)).not.toContain("kids");
  expect(questionsFor({ home: ["partner", "parents"] })).toHaveLength(8);
  expect(questionsFor({ home: ["kids"] })).toHaveLength(9);
  // Grown-up kids don't bring the "when the kids are out" question.
  expect(questionsFor({ home: ["grown", "siblings"] })).toHaveLength(8);
});

test("question 1 is Janine's household list, and the helper answer lives on as 'Other household members'", () => {
  const home = q("home");
  expect(home.title).toBe("Who makes up your household?");
  expect(home.options.map((o) => o.label)).toEqual([
    "Just me",
    "My Spouse or Partner",
    "My Kids under 18",
    "My Kids 18y/o up",
    "My Siblings",
    "My Parents",
    "Other relatives",
    "Other household members",
  ]);
  expect(home.options.find((o) => o.id === "helper")?.label).toBe("Other household members");
  expect(home.alone).toBe("solo");
  expect(answerTip("home", { home: ["helper"] })?.line).toMatch(/shopping list/);
});

test("the top 3 rank in the order tapped, and stop at three", () => {
  const top = q("top3");
  let picked: string[] = [];
  for (const p of ["money", "health", "travel", "meals"]) picked = toggle(top, picked, p);
  expect(picked).toEqual(["money", "health", "travel"]);
  // Taking one back closes the gap: the rest move up a place.
  picked = toggle(top, picked, "money");
  expect(picked).toEqual(["health", "travel"]);
  expect(topThree({ top3: [...picked, "nonsense"] })).toEqual(["health", "travel"]);
});

test("a single answer replaces, and 'Just me' and the other 'none' answers stand alone", () => {
  expect(toggle(q("sick"), ["minute"], "cant")).toEqual(["cant"]);
  expect(toggle(q("tools"), ["chat", "paper"], "none")).toEqual(["none"]);
  expect(toggle(q("busy"), ["meals"], "smooth")).toEqual(["smooth"]);
  expect(toggle(q("chat"), ["nothing"], "polls")).toEqual(["polls"]);
  const home = q("home");
  expect(toggle(home, ["partner", "kids"], "solo")).toEqual(["solo"]);
  expect(toggle(home, ["solo"], "partner")).toEqual(["partner"]);
  expect(toggle(home, ["siblings", "parents", "helper"], "solo")).toEqual(["solo"]);
  expect(toggle(home, ["solo"], "grown")).toEqual(["grown"]);
});

test("the categories change at 40, 60 and 80", () => {
  expect(scoreCategory(0).name).toBe("The Fresh Start");
  expect(scoreCategory(39).name).toBe("The Fresh Start");
  expect(scoreCategory(40).name).toBe("The Work in Progress");
  expect(scoreCategory(59).name).toBe("The Work in Progress");
  expect(scoreCategory(60).name).toBe("The Connected Path");
  expect(scoreCategory(79).name).toBe("The Connected Path");
  expect(scoreCategory(80).name).toBe("The Well-Organized Family");
  expect(scoreCategory(100).name).toBe("The Well-Organized Family");
  // Encouraging at every level: nothing that talks down to a family.
  for (const v of [0, 40, 60, 80]) expect(scoreCategory(v).line).not.toMatch(/fail|bad|poor|behind/i);
});

test("every score and bar stays within 0-100, whatever the answers", () => {
  const extremes: Answers[] = [
    {},
    {
      home: ["solo"],
      tools: ["calendar"],
      top3: ["memories"],
      sick: ["minute"],
      papers: ["cloud"],
      busy: ["smooth"],
      chat: ["nothing"],
      ai: ["ready"],
    },
    {
      home: ["kids", "grown", "parents", "relatives", "helper"],
      tools: ["none"],
      top3: ["kids", "health", "documents"],
      sick: ["cant"],
      papers: ["scattered"],
      kids: ["worry"],
      busy: ["meals", "chores", "bills"],
      chat: ["albums", "polls", "calls", "journal", "ai"],
      ai: ["no"],
    },
  ];
  for (const a of extremes) {
    const s = readinessScore(a);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
    for (const v of Object.values(areaScores(a))) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  }
});

test("the score is questions 2, 4 and 5 only, a quarter each, divided by three quarters", () => {
  // Best answer to all three: 100. Worst: 0. Every category can be reached.
  expect(readinessScore({ tools: ["calendar"], sick: ["minute"], papers: ["cloud"] })).toBe(100);
  expect(readinessScore({ tools: ["none"], sick: ["cant"], papers: ["scattered"] })).toBe(0);
  // (75 × 0.25 + 67 × 0.25 + 75 × 0.25) / 0.75 = 72.33 -> 72
  expect(readinessScore({ tools: ["chat", "calendar"], sick: ["look"], papers: ["safe"] })).toBe(72);
  // Questions 1, 3, 6, 7 (and the kids and AI questions) change nothing.
  const base = { tools: ["notes"], sick: ["ask"], papers: ["folder"] };
  const others: Answers = {
    home: ["kids", "parents"],
    top3: ["health", "travel", "documents"],
    kids: ["worry"],
    busy: ["meals", "chores", "bills"],
    chat: ["albums", "polls"],
    ai: ["no"],
  };
  expect(readinessScore({ ...base, ...others })).toBe(readinessScore(base));
  expect(readinessScore({ ...base, ...others, top3: ["memories"], ai: ["ready"] })).toBe(readinessScore(base));
});

test("a family that says it's organised reaches the top category; one starting out, The Fresh Start", () => {
  expect(scoreCategory(readinessScore({ tools: ["calendar"], sick: ["minute"], papers: ["safe"] })).name).toBe("The Well-Organized Family");
  expect(scoreCategory(readinessScore({ tools: ["chat", "notes", "sheet", "paper"], sick: ["cant"], papers: ["scattered"] })).name).toBe("The Fresh Start");
});

test("no kids at home: no kids bar is saved", () => {
  expect(areaScores({ home: ["partner"], kids: ["worry"] }).kids).toBeUndefined();
});

test("question 9 doesn't change the score", () => {
  const a = { sick: ["look"], papers: ["folder"] };
  expect(readinessScore({ ...a, ai: ["ready"] })).toBe(readinessScore({ ...a, ai: ["no"] }));
});

test("results: 'one place' follows question 2, and the privacy line follows question 9", () => {
  expect(oneAppLine({ tools: ["chat", "notes", "paper"] })).toBe("3 places to keep track in today. In Kin, it’s one.");
  expect(oneAppLine({ tools: ["calendar", "memory"] })).toMatch(/^Already one place\?/);
  expect(oneAppLine({ tools: ["memory"] })).toMatch(/^Less to carry in your heads/);
  expect(oneAppLine({ tools: ["none"] })).toMatch(/^One place to start/);
  expect(wantsPrivacyFirst({ ai: ["privacy"] })).toBe(true);
  expect(wantsPrivacyFirst({ ai: ["ready"] })).toBe(false);
  for (const p of PRIORITIES) expect(PRIORITY_IN_KIN[p].line.length).toBeGreaterThan(0);
});

test("no question can be skipped, and every question has an answer for the family it doesn't fit", () => {
  for (const x of QUESTIONS) {
    expect(answered(x, {})).toBe(false);
    expect(answered(x, { [x.id]: [] })).toBe(false);
    expect(answered(x, { [x.id]: [x.options[0].id] })).toBe(true);
  }
  // The ones that ask "which" have a "none" that stands alone.
  for (const id of ["home", "tools", "busy", "chat"]) expect(q(id).alone).toBeTruthy();
});

test("answering 'none' isn't scored as the middle: a family with nothing in place scores low", () => {
  const nothing = {
    home: ["solo"],
    tools: ["none"],
    top3: ["health"],
    sick: ["cant"],
    papers: ["scattered"],
    busy: ["meals", "chores", "bills"],
    chat: ["albums", "polls", "calls"],
    ai: ["no"],
  };
  expect(readinessScore(nothing)).toBeLessThan(40);
});

test("every answer to every question shows what Kin does about it, in English", () => {
  for (const x of QUESTIONS) {
    for (const o of x.options) {
      const a: Answers = { [x.id]: [o.id] };
      const tip = answerTip(x.id, a);
      expect(tip, `${x.id}: ${o.id}`).not.toBeNull();
      expect(tip!.line.length).toBeGreaterThan(20);
    }
  }
  expect(answerTip("sick", {})).toBeNull();
  // English only: none of the Tagalog the first draft had.
  const words = JSON.stringify(QUESTIONS);
  for (const w of ["Walang", "sagot", "Kasambahay", "yaya", "Lolo", "bunso", "Sulit"]) expect(words).not.toContain(w);
});

test("questions 3 to 6 are Janine's wording, and question 4 keeps its scores fastest first", () => {
  expect(q("top3").title).toBe("What are your family’s top 3 priorities?");
  expect(q("top3").options.map((o) => o.label)).toEqual([
    "Family health and wellness",
    "Financial planning and budgeting",
    "Important documents and records",
    "Schedules, appointments and events",
    "Travel and family adventures",
    "Family memories and milestones",
    "Household management",
    "Family connection and quality time",
    "Emergency information",
    "Kids’ safety and location",
  ]);
  expect(q("sick").title).toBe("If a medical emergency happened today, how quickly can you access your family’s health history and records?");
  expect(q("sick").options.map((o) => o.label)).toEqual([
    "In seconds—we have everything organized and ready",
    "Within a few minutes—we know where to look",
    "It would take some searching—I need to ask someone",
    "We’re not sure where everything is",
  ]);
  expect(q("papers").title).toBe("Where’s that document?");
  expect(q("papers").hint).toBe("Think birth certificates, passports, insurance policies, IDs and other records.");
  expect(q("busy").title).toBe("The Daily Check-In");
  expect(q("busy").hint).toBe("What’s always coming up in your family conversations?");
  const health = q("sick").options.map((o) => areaScores({ sick: [o.id] }).health!);
  expect([...health].sort((a, b) => b - a)).toEqual(health);
});

test("the profile follows the top 3: two pointing the same way decide it", () => {
  expect(blueprintProfile({ top3: ["plans", "meals", "health"] })).toBe("organized");
  expect(blueprintProfile({ top3: ["money", "travel", "memories"] })).toBe("planning");
  expect(blueprintProfile({ top3: ["health", "documents", "together"] })).toBe("prepared");
  expect(blueprintProfile({ top3: ["emergency", "health", "documents"] })).toBe("prepared");
  expect(blueprintProfile({ top3: ["together", "kids", "money"] })).toBe("connected");
  expect(blueprintProfile({ top3: ["memories"] })).toBe("memories");
  // Every priority favours one of the five, never All-in-One.
  for (const p of PRIORITIES) expect(PRIORITY_PROFILE[p]).not.toBe("allInOne");
});

test("spread priorities: the other answers break the tie, and if they can't, All-in-One", () => {
  const spread = { top3: ["health", "money", "memories"] };
  expect(blueprintProfile(spread)).toBe("allInOne");
  // Photo albums and the shared journal lean to the memories.
  expect(blueprintProfile({ ...spread, chat: ["albums", "journal"] })).toBe("memories");
  // Bills and savings keep coming up: planning.
  expect(blueprintProfile({ ...spread, busy: ["bills", "savings"] })).toBe("planning");
  // A pull both ways evenly is still a tie.
  expect(blueprintProfile({ ...spread, busy: ["bills"], chat: ["albums"] })).toBe("allInOne");
  // A nudge toward a profile the top 3 didn't name doesn't count.
  expect(blueprintProfile({ ...spread, chat: ["polls", "calls"] })).toBe("allInOne");
  // The other answers never change the score.
  const a: Answers = { tools: ["notes"], sick: ["look"], papers: ["folder"], ...spread };
  expect(readinessScore({ ...a, chat: ["albums"] })).toBe(readinessScore(a));
});

test("the hub is three to five of the profile's features, theirs first", () => {
  const a: Answers = { top3: ["travel", "money", "plans"], busy: ["bills"] };
  const p = blueprintProfile(a);
  expect(p).toBe("planning");
  const hub = blueprintFeatures(a, p);
  expect(hub[0].id).toBe("trips");
  for (const id of Object.keys(PROFILES) as (keyof typeof PROFILES)[]) {
    const n = blueprintFeatures({}, id).length;
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(5);
    for (const f of PROFILES[id].features) expect(FEATURES[f]).toBeTruthy();
  }
  // The Prepared Family never promises to make anyone safe.
  const prepared = JSON.stringify([PROFILES.prepared, ...PROFILES.prepared.features.map((f) => FEATURES[f])]);
  expect(prepared).not.toMatch(/guarantee|always ready|instant|never miss/i);
});
