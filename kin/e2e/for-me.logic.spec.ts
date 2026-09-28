import { test, expect } from "@playwright/test";
import { isForMe, taggedFrom, whoseFor } from "@/lib/for-me";

/** Today and the reminders show a person what is theirs: the whole family's,
 * their own, and for a grown-up the children's -- not another grown-up's. */

const jonathan = { id: "j", role: "parent" };
const janine = { id: "n", role: "parent" };
const erynne = { id: "e", role: "child_self" };

test("whole family, or nobody tagged: everyone's", () => {
  expect(isForMe(jonathan, true, [{ id: "n", role: "parent" }])).toBe(true);
  expect(isForMe(jonathan, false, [])).toBe(true);
  expect(isForMe(erynne, true, [])).toBe(true);
});

test("another grown-up's own plan is not mine", () => {
  const career = [{ id: "n", role: "parent" }];
  expect(isForMe(jonathan, false, career)).toBe(false);
  expect(isForMe(janine, false, career)).toBe(true);
  expect(isForMe(erynne, false, career)).toBe(false);
});

test("a child's plan: the child and every grown-up", () => {
  const fieldtrip = [{ id: "e", role: "child_self" }];
  expect(isForMe(jonathan, false, fieldtrip)).toBe(true);
  expect(isForMe(janine, false, fieldtrip)).toBe(true);
  expect(isForMe(erynne, false, fieldtrip)).toBe(true);
  expect(isForMe({ id: "k", role: "child_managed" }, false, fieldtrip)).toBe(false);
});

test("taggedFrom reads PostgREST's nested rows", () => {
  expect(taggedFrom([{ member_id: "n", members: { role: "parent" } }, { member_id: "e", members: null }])).toEqual([
    { id: "n", role: "parent" },
    { id: "e", role: null },
  ]);
  expect(taggedFrom(null)).toEqual([]);
});

test("Coming up pages: whole family or untagged is Family, tagged to me is Mine, anyone else's is Others", () => {
  expect(whoseFor(jonathan, true, [{ id: "n" }])).toBe("family");
  expect(whoseFor(jonathan, false, [])).toBe("family");
  expect(whoseFor(jonathan, false, [{ id: "j" }, { id: "n" }])).toBe("mine");
  expect(whoseFor(jonathan, false, [{ id: "n", role: "parent" }])).toBe("others");
  expect(whoseFor(jonathan, false, [{ id: "e", role: "child_self" }])).toBe("others");
});
