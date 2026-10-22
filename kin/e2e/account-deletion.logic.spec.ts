import { test, expect } from "@playwright/test";
import { confirmMatches, deletionDay, handoverPlan, planSentence, DELETE_GRACE_DAYS, type HandoverMember } from "@/lib/account-deletion";
import { zipPathFor } from "@/lib/export/my-files";
import { removeFolder } from "@/lib/storage-sweep";

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

test("with no other active grown-up but children left, the household stays for them; it is deleted only with nobody left", () => {
  const ann = m("ann", "parent", { is_organiser: true });
  const gone = m("gone", "adult", { status: "removed" });
  const asked = m("asked", "parent", { leaving: true });
  expect(handoverPlan(ann, [ann, m("kid", "child_self"), gone, asked])).toEqual({ kind: "children_stay" });
  expect(handoverPlan(ann, [ann, m("baby", "child_managed", { status: "managed" }), gone])).toEqual({ kind: "children_stay" });
  expect(handoverPlan(ann, [ann, gone, asked, m("moved", "child_self", { status: "moved" })])).toEqual({ kind: "delete_household" });
  expect(handoverPlan(ann, [ann])).toEqual({ kind: "delete_household" });
});

test("the screen says what happens to the household", () => {
  expect(planSentence({ kind: "handover", to_member: "abe" }, "Abe")).toBe("Abe will become the household's organizer.");
  expect(planSentence({ kind: "children_stay" })).toContain("stays for the children");
  expect(planSentence({ kind: "delete_household" })).not.toContain("children");
  expect(planSentence({ kind: "none" })).toBeNull();
  expect(deletionDay("2026-10-28T03:00:00Z")).toBe("28 October");
});

test("a downloaded file's place in the ZIP keeps to safe characters and never climbs out", () => {
  expect(zipPathFor("journal", "person/abc/photo 1.jpg")).toBe("mine/files/journal/person/abc/photo_1.jpg");
  expect(zipPathFor("documents", "a/../../etc/passwd")).not.toContain("..");
});

test("their folder is emptied except the household's photos filed in it, however many come first", async () => {
  // A bucket in memory, listed by name as Storage lists it, 1000 at most.
  const files = new Set<string>();
  for (let i = 0; i < 2500; i++) files.add(`person/p/${String(i).padStart(4, "0")}.jpg`);
  files.add("person/p/videos/v.mp4");
  files.add("person/p/videos/mine.mp4");
  const keep = new Set([...files].filter((f) => f < "person/p/1200.jpg" || f === "person/p/videos/v.mp4"));
  const storage = {
    from: () => ({
      list: async (prefix: string, { limit, offset = 0 }: { limit: number; offset?: number }) => {
        const names = new Map<string, string | null>();
        for (const f of files) {
          if (!f.startsWith(`${prefix}/`)) continue;
          const rest = f.slice(prefix.length + 1);
          const slash = rest.indexOf("/");
          names.set(slash === -1 ? rest : rest.slice(0, slash), slash === -1 ? "id" : null);
        }
        const data = [...names].sort(([a], [b]) => a.localeCompare(b)).map(([name, id]) => ({ name, id }));
        return { data: data.slice(offset, offset + limit), error: null };
      },
      remove: async (paths: string[]) => ({ data: paths.filter((p) => files.delete(p)).map((name) => ({ name })), error: null }),
    }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const left = await removeFolder({ storage } as any, "journal", "person/p", 0, keep);
  expect(left).toBe(0);
  expect([...files].sort()).toEqual([...keep].sort());
});
