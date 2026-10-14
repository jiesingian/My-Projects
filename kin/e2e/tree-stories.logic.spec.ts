import { test, expect } from "@playwright/test";
import {
  parseStoryWhen,
  formatStoryWhen,
  storyWhenInput,
  storyFileKind,
  storyMark,
  storyCountLabel,
  tellerLabel,
  orderStories,
  canAddStories,
  storySafeFileName,
  STORY_FILE_TYPES,
} from "@/lib/tree-stories";

/** Stories on the tree (14 October): the parts that need no database. */
const TODAY = "2026-10-14";

test("a year is enough, and so is a decade", () => {
  expect(parseStoryWhen("1975", TODAY)).toEqual({ on: "1975-01-01", precision: "year" });
  expect(parseStoryWhen("about 1975", TODAY)).toEqual({ on: "1975-01-01", precision: "year" });
  expect(parseStoryWhen("c. 1975", TODAY)).toEqual({ on: "1975-01-01", precision: "year" });
  expect(parseStoryWhen("noong 1975", TODAY)).toEqual({ on: "1975-01-01", precision: "year" });
  expect(parseStoryWhen("the 1960s", TODAY)).toEqual({ on: "1960-01-01", precision: "decade" });
  expect(parseStoryWhen("mga 1960's", TODAY)).toEqual({ on: "1960-01-01", precision: "decade" });
  expect(parseStoryWhen("  ", TODAY)).toEqual({ on: null, precision: "year" });
});

test("a month and a year, or a whole date, kept as exactly that", () => {
  expect(parseStoryWhen("May 1975", TODAY)).toEqual({ on: "1975-05-01", precision: "month" });
  expect(parseStoryWhen("Disyembre 1944", TODAY)).toEqual({ on: "1944-12-01", precision: "month" });
  expect(parseStoryWhen("3 May 1975", TODAY)).toEqual({ on: "1975-05-03", precision: "day" });
  expect(parseStoryWhen("May 3, 1975", TODAY)).toEqual({ on: "1975-05-03", precision: "day" });
  expect(parseStoryWhen("1975-05-03", TODAY)).toEqual({ on: "1975-05-03", precision: "day" });
  expect(parseStoryWhen("Sept. 1972", TODAY)).toEqual({ on: "1972-09-01", precision: "month" });
});

test("what cannot be a story's date is said plainly", () => {
  expect(parseStoryWhen("2030", TODAY)).toHaveProperty("error");
  expect(parseStoryWhen("15 October 2026", TODAY)).toHaveProperty("error");
  expect(parseStoryWhen("November 2026", TODAY)).toHaveProperty("error");
  expect(parseStoryWhen("31 February 1975", TODAY)).toEqual({ error: "That date isn't a real date." });
  expect(parseStoryWhen("last summer", TODAY)).toHaveProperty("error");
  expect(parseStoryWhen("Smarch 1975", TODAY)).toHaveProperty("error");
  expect(parseStoryWhen("14 October 2026", TODAY)).toEqual({ on: "2026-10-14", precision: "day" });
});

test("said back the way a person says it, and read back the same", () => {
  expect(formatStoryWhen("1975-05-03", "day")).toBe("3 May 1975");
  expect(formatStoryWhen("1975-05-01", "month")).toBe("May 1975");
  expect(formatStoryWhen("1975-01-01", "year")).toBe("1975");
  expect(formatStoryWhen("1960-01-01", "decade")).toBe("the 1960s");
  expect(formatStoryWhen(null, "year")).toBe("");
  for (const [on, p] of [["1975-05-03", "day"], ["1975-05-01", "month"], ["1975-01-01", "year"], ["1960-01-01", "decade"]] as const) {
    expect(parseStoryWhen(storyWhenInput(on, p), TODAY)).toEqual({ on, precision: p });
  }
});

test("files: played, looked at, or opened; nothing else accepted", () => {
  expect(storyFileKind("audio/mp4")).toBe("audio");
  expect(storyFileKind("audio/webm")).toBe("audio");
  expect(storyFileKind("image/jpeg")).toBe("photo");
  expect(storyFileKind("application/pdf")).toBe("document");
  expect(storyFileKind("video/mp4")).toBeNull();
  expect(STORY_FILE_TYPES.test("video/mp4")).toBe(false);
  expect(STORY_FILE_TYPES.test("application/pdfx")).toBe(false);
  expect(storySafeFileName("Lola's letter (1952).jpg")).toBe("Lola_s_letter_1952_.jpg");
  expect(storySafeFileName("../../x.m4a")).not.toContain("..");
  expect(storySafeFileName("../../x.m4a")).not.toContain("/");
});

test("the mark on a tile stays one or two characters", () => {
  expect(storyMark(0)).toBe("");
  expect(storyMark(1)).toBe("1");
  expect(storyMark(9)).toBe("9");
  expect(storyMark(12)).toBe("9+");
  expect(storyCountLabel(0)).toBe("No stories yet");
  expect(storyCountLabel(1)).toBe("1 story");
  expect(storyCountLabel(4)).toBe("4 stories");
});

test("who told it", () => {
  expect(tellerLabel("Ann Singian", null)).toBe("Told by Ann Singian");
  expect(tellerLabel(null, "Lolo Ben, told to Mia")).toBe("Told by Lolo Ben, told to Mia");
  expect(tellerLabel(null, "  ")).toBe("");
});

test("in the order of a life, undated ones last", () => {
  const s = [
    { id: "a", happened_on: null, created_at: "2026-10-01" },
    { id: "b", happened_on: "1980-01-01", created_at: "2026-10-02" },
    { id: "c", happened_on: "1952-06-01", created_at: "2026-10-03" },
    { id: "d", happened_on: null, created_at: "2026-10-05" },
  ];
  expect(orderStories(s).map((x) => x.id)).toEqual(["c", "b", "d", "a"]);
});

test("grown-ups and teens with a login add stories; kid view does not", () => {
  expect(canAddStories({ role: "parent" })).toBe(true);
  expect(canAddStories({ role: "adult" })).toBe(true);
  expect(canAddStories({ role: "child_self", kid_view: false })).toBe(true);
  expect(canAddStories({ role: "child_self", kid_view: true })).toBe(false);
  expect(canAddStories({ role: "child_managed" })).toBe(false);
});
