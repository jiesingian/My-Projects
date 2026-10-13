import { test, expect } from "@playwright/test";
import { AREAS, PRIORITIES } from "@/lib/first-open";
import { QUESTIONS, type Answers, PRIORITY_IN_KIN, areaLine, oneAppLine, wantsPrivacyFirst, areaScores, areaWeights, questionsFor, readinessScore, scoreLabel, toggle, topThree } from "@/lib/check-up";

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

test("a single answer replaces, and 'Just me for now' stands alone", () => {
  expect(toggle(q("apps"), ["one"], "lots")).toEqual(["lots"]);
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
      apps: ["one"],
      top3: ["memories"],
      sick: ["minute"],
      papers: ["cloud"],
      busy: [],
      chat: [],
      ai: ["ready"],
    },
    {
      home: ["kids", "abroad"],
      apps: ["lots"],
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
    apps: ["one"],
    top3: ["health", "kids", "money"],
    sick: ["minute"],
    papers: ["cloud"],
    kids: ["app"],
    busy: [],
    chat: ["polls"],
    ai: ["ready"],
  };
  const scattered = {
    home: ["partner", "kids", "abroad"],
    apps: ["lots"],
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
    apps: ["one"],
    busy: [],
    chat: [],
  };
  expect(readinessScore({ ...base, top3: ["health", "documents", "money"] })).toBeLessThan(readinessScore({ ...base, top3: ["documents", "money", "health"] }));
});

test("question 9 doesn't change the score", () => {
  const a = { sick: ["look"], papers: ["folder"] };
  expect(readinessScore({ ...a, ai: ["ready"] })).toBe(readinessScore({ ...a, ai: ["no"] }));
});

test("results: every bar's line is an easy win below 70, and 'one app instead of N' follows question 2", () => {
  for (const a of AREAS) {
    expect(areaLine(a, 20)).toMatch(/^The easy win/);
    expect(areaLine(a, 69)).toMatch(/^The easy win/);
    expect(areaLine(a, 70)).not.toMatch(/fail/i);
  }
  expect(oneAppLine({ apps: ["few"] })).toBe("One app instead of 3.");
  expect(oneAppLine({ apps: ["lots"] })).toBe("One app instead of 4 or more.");
  expect(oneAppLine({})).toBe("One app instead of five.");
  expect(wantsPrivacyFirst({ ai: ["privacy"] })).toBe(true);
  expect(wantsPrivacyFirst({ ai: ["ready"] })).toBe(false);
  for (const p of PRIORITIES) expect(PRIORITY_IN_KIN[p].line.length).toBeGreaterThan(0);
});
