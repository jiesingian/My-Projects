import { test, expect } from "@playwright/test";
import { confirmMatches, deletionDay, handoverPlan, planSentence, DELETE_GRACE_DAYS, type HandoverMember } from "@/lib/account-deletion";
import { zipPathFor } from "@/lib/export/my-files";

/** Delete my account (21 October): the hand-over rules and the confirm
 * words. The database holds the same rules for itself
 * (supabase/tests/pglite/probes/delete-my-account.mjs). No database. */

const m = (id: string, role: string, extra: Partial<HandoverMember> = {}): HandoverMember => ({
  id,
  role,
  status: "active",
  is_organiser: false,
  created_at: `2026-01-0${id.length}T00:00:00Z`,
  ...extra,
});

test("7 days to change your mind, confirmed by typing the words", () => {
  expect(DELETE_GRACE_DAYS).toBe(7);
  expect(confirmMatches("delete my account")).toBe(true);
  expect(confirmMatches("  Delete   My Account ")).toBe(true);
  expect(confirmMatches("delete account")).toBe(false);
  expect(confirmMatches("")).toBe(false);
});

test("the last grown-up organizer hands the household to another grown-up, a parent before an adult", () => {
  const ann = m("ann", "parent", { is_organiser: true });
  const abe = m("abe", "adult", { created_at: "2025-01-01T00:00:00Z" });
  const pia = m("pia", "parent", { created_at: "2026-06-01T00:00:00Z" });
  const kid = m("kid", "child_self");
  expect(handoverPlan(ann, [ann, abe, kid])).toEqual({ kind: "handover", to_member: "abe" });
  expect(handoverPlan(ann, [ann, abe, pia, kid])).toEqual({ kind: "handover", to_member: "pia" });
});

test("between two of the same role, whoever joined first", () => {
  const ann = m("ann", "parent", { is_organiser: true });
  const later = m("later", "adult", { created_at: "2026-05-01T00:00:00Z" });
  const first = m("first", "adult", { created_at: "2026-02-01T00:00:00Z" });
  expect(handoverPlan(ann, [ann, later, first])).toEqual({ kind: "handover", to_member: "first" });
});

test("nobody is handed anything by someone who is not the organizer, or while another grown-up organizer stays", () => {
  const ann = m("ann", "parent", { is_organiser: true });
  const abe = m("abe", "adult", { is_organiser: true });
  expect(handoverPlan(m("kid", "child_self"), [ann, m("kid", "child_self")])).toEqual({ kind: "none" });
  expect(handoverPlan(m("bo", "adult"), [ann, m("bo", "adult")])).toEqual({ kind: "none" });
  expect(handoverPlan(ann, [ann, abe])).toEqual({ kind: "none" });
});

test("with no other active grown-up the household is deleted; children, removed members and others leaving don't count", () => {
  const ann = m("ann", "parent", { is_organiser: true });
  const household = [
    ann,
    m("kid", "child_self"),
    m("baby", "child_managed", { status: "managed" }),
    m("gone", "adult", { status: "removed" }),
    m("asked", "parent", { leaving: true }),
  ];
  expect(handoverPlan(ann, household)).toEqual({ kind: "delete_household" });
  expect(handoverPlan(ann, [ann])).toEqual({ kind: "delete_household" });
});

test("the screen says what happens to the household", () => {
  expect(planSentence({ kind: "handover", to_member: "abe" }, "Abe")).toBe("Abe will become the household's organizer.");
  expect(planSentence({ kind: "delete_household" })).toContain("children's profiles included");
  expect(planSentence({ kind: "none" })).toBeNull();
  expect(deletionDay("2026-10-28T03:00:00Z")).toBe("28 October");
});

test("a downloaded file's place in the ZIP keeps to safe characters and never climbs out", () => {
  expect(zipPathFor("journal", "person/abc/photo 1.jpg")).toBe("mine/files/journal/person/abc/photo_1.jpg");
  expect(zipPathFor("documents", "a/../../etc/passwd")).not.toContain("..");
});
