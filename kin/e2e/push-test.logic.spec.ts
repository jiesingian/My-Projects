import { test, expect } from "@playwright/test";
import { PUSH_TEST_KINDS, PUSH_TESTS_PER_MINUTE, isPushTestKind, testTitle } from "@/lib/push-test";
import { arrivedWords, helperListWords, pushPayload, sosWords, treeStoryWords } from "@/lib/push-words";
import { checkInAskPush } from "@/lib/member-card";

/** "Send me a test" per kind of push (20261020190000): the kinds, the words
 * the app's own senders and the tests share, and the "Test: " mark. The
 * kinds worded in the database are sampled by sample_push(), proved in
 * supabase/tests/pglite/probes/push-test-rows.mjs. */

test("every kind Kin sends has a row, each key once, and unknown keys are refused", () => {
  const keys = PUSH_TEST_KINDS.map((k) => k.key);
  expect(keys).toEqual(["dose", "missed_dose", "refill", "undas", "remembrance", "money_recap", "week_ahead", "plan", "tree_story", "helper_line", "arrived", "sos", "checkin"]);
  expect(new Set(keys).size).toBe(keys.length);
  expect(isPushTestKind("undas")).toBe(true);
  expect(isPushTestKind("chat")).toBe(false);
  expect(PUSH_TESTS_PER_MINUTE).toBe(5);
});

test("a test is the real title marked Test:, never past the title's 80 characters", () => {
  expect(testTitle("Time for Lola's Losartan")).toBe("Test: Time for Lola's Losartan");
  expect(testTitle("x".repeat(100))).toHaveLength(80);
});

test("the tree story, helper line, arrival and SOS words are what the senders put in the payload", () => {
  expect(treeStoryWords({ id: "s1", personId: "p1", ours: true, title: "The fiesta", writerFirst: "Ann", personFirst: "Lola" })).toEqual({
    title: "Ann added a story about Lola",
    body: "The fiesta",
    url: "/family/stories/p1",
    tag: "tree-story:s1",
  });
  expect(treeStoryWords({ id: "s1", personId: "p2", ours: false, title: "The fiesta", writerFirst: "Ann", personFirst: "Lola" }).title).toBe("Ann shared a story about Lola");
  expect(helperListWords({ familyId: "f1", name: "Itlog", by: "Ann" })).toEqual({ title: "Added to the list", body: "Itlog · by Ann", url: "/helper?h=f1", tag: "helper-list-f1" });
  expect(arrivedWords({ title: "Ann is at Home", body: "Ann is at Home, 3:40 PM" }, "m1")).toEqual({ title: "Ann is at Home", body: "Ann is at Home, 3:40 PM", url: "/chat/household", tag: "arrived-m1" });
  const sos = sosWords({ id: "x1", first: "Ann", where: false, icon: "/avatars/ann.jpg" });
  expect(sos.title).toBe("SOS from Ann");
  expect(sos.body).toContain("didn't share a location");
  expect(sos.urgent).toBe(true);
  expect(sosWords({ id: "x1", first: "Ann", where: true, icon: null }).body).toContain("where they are");
  expect(checkInAskPush("Ann A", "m2", "c1").title).toBe("Ann asks: are you okay?");
});

test("the payload keeps the flags and drops an icon that is not Kin's own or https", () => {
  const p = JSON.parse(pushPayload(sosWords({ id: "x1", first: "Ann", where: true, icon: "javascript:alert(1)" })));
  expect(p.urgent).toBe(true);
  expect(p.icon).toBeUndefined();
  expect(p.url).toBe("/today/sos/x1");
  const q = JSON.parse(pushPayload({ title: "t", body: "b", url: "https://elsewhere.example", tag: "x" }));
  expect(q.url).toBe("/today");
});
