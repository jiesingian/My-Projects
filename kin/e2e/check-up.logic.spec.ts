import { test, expect } from "@playwright/test";
import { AREAS, PRIORITIES } from "@/lib/first-open";
import { QUESTIONS, type Answers, PRIORITY_IN_KIN, answerTip, answered, areaLine, oneAppLine, wantsPrivacyFirst, areaScores, areaWeights, questionsFor, readinessScore, scoreLabel, toggle, topThree } from "@/lib/check-up";

const q = (id: string) => QUESTIONS.find((x) => x.id === id)!;

test("nine questions, and question 6 only when there are kids or teens at home", () => {
  expect(QUESTIONS).toHaveLength(9);
  expect(questionsFor({}).map((x) => x.id)).not.toContain("kids");
  expect(questionsFor({ home: ["partner", "lolo"] })).toHaveLength(8);
  expect(questionsFor({ home: ["kids"] })).toHaveLength(9);
  expect(questionsFor({ home: ["teens"] })).toHaveLength(9);
});

test("the top 3 rank in the order tapped, and stop at three", () => {
  const top = q("top3");
  let picked: string[] = [];
  for (const p of ["money", "health", "kids", "meals"]) picked = toggle(top, picked, p);
  expect(picked).toEqual(["money", "health", "kids"]);
  // Taking one back closes the gap: the rest move up a place.
  picked = toggle(top, picked, "money");
  expect(picked).toEqual(["health", "kids"]);
  expect(topThree({ top3: [...picked, "nonsense"] })).toEqual(["health", "kids"]);
});

test("a single answer replaces, and 'Just me for now' and the other 'none' answers stand alone", () => {
  expect(toggle(q("sick"), ["minute"], "cant")).toEqual(["cant"]);
  expect(toggle(q("tools"), ["chat", "paper"], "none")).toEqual(["none"]);
  expect(toggle(q("busy"), ["meals"], "smooth")).toEqual(["smooth"]);
  expect(toggle(q("chat"), ["nothing"], "polls")).toEqual(["polls"]);
  const home = q("home");
  expect(toggle(home, ["partner", "kids"], "solo")).toEqual(["solo"]);
  expect(toggle(home, ["solo"], "partner")).toEqual(["partner"]);
});

test("labels change at 40 and 70", () => {
  expect(scoreLabel(0)).toBe("Getting started");
  expect(scoreLabel(39)).toBe("Getting started");
  expect(scoreLabel(40)).toBe("On the way");
  expect(scoreLabel(69)).toBe("On the way");
  expect(scoreLabel(70)).toBe("Well connected");
  expect(scoreLabel(100)).toBe("Well connected");
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
      home: ["kids", "abroad"],
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

test("a family that has it together scores well connected; one that doesn't, getting started", () => {
  const organised = {
    home: ["partner", "kids"],
    tools: ["calendar"],
    top3: ["health", "kids", "money"],
    sick: ["minute"],
    papers: ["safe"],
    kids: ["app"],
    busy: ["smooth"],
    chat: ["polls"],
    ai: ["ready"],
  };
  const scattered = {
    home: ["partner", "kids", "abroad"],
    tools: ["chat", "notes", "sheet", "paper"],
    top3: ["health", "kids", "documents"],
    sick: ["cant"],
    papers: ["scattered"],
    kids: ["worry"],
    busy: ["meals", "chores", "bills"],
    chat: ["albums", "polls", "calls", "journal"],
    ai: ["privacy"],
  };
  expect(scoreLabel(readinessScore(organised))).toBe("Well connected");
  expect(scoreLabel(readinessScore(scattered))).toBe("Getting started");
});

test("no kids at home: no kids bar, and it doesn't count", () => {
  const a = { home: ["partner"], kids: ["worry"], sick: ["minute"] };
  expect(areaScores(a).kids).toBeUndefined();
  // An answer left over from before Q1 changed is ignored, not scored.
  expect(readinessScore(a)).toBe(readinessScore({ home: ["partner"], sick: ["minute"] }));
});

test("the top 3 weigh most, first choice heaviest", () => {
  expect(areaWeights({ top3: ["health", "documents", "memories"] })).toEqual({
    health: 4,
    documents: 3,
    close: 2,
    kids: 1,
    home: 1,
  });
  // Emergency info is part of Health & safety, so it adds to the same bar.
  expect(areaWeights({ top3: ["emergency", "health"] }).health).toBe(6);
  // The same answers, but health first rather than last: a weak health bar
  // pulls the score down further.
  const base = {
    sick: ["cant"],
    papers: ["cloud"],
    tools: ["calendar"],
    busy: ["smooth"],
    chat: ["nothing"],
  };
  expect(readinessScore({ ...base, top3: ["health", "documents", "money"] })).toBeLessThan(readinessScore({ ...base, top3: ["documents", "money", "health"] }));
});

test("question 9 doesn't change the score", () => {
  const a = { sick: ["look"], papers: ["folder"] };
  expect(readinessScore({ ...a, ai: ["ready"] })).toBe(readinessScore({ ...a, ai: ["no"] }));
});

test("results: no bar's line talks down to the family, and 'one place' follows question 2", () => {
  for (const a of AREAS) {
    for (const v of [0, 20, 69, 70, 100]) expect(areaLine(a, v)).not.toMatch(/easy win|fail/i);
    expect(areaLine(a, 20)).not.toBe(areaLine(a, 70));
  }
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
