import { test, expect } from "@playwright/test";
import { visibilityOptions, explainVisibilityRefusal, VISIBILITY_OPTIONS } from "@/lib/visibility";

/** Who may pick "Parents only".
 *
 * Six row-level policies grant a `parents` row to `current_member_role() =
 * 'parent'` and nobody else, and every create in the app asks for its row
 * back. So for anyone else the option is not a weaker setting, it is a
 * guaranteed failure that loses what they typed. Measured on 9 September
 * against the throwaway household, as role `adult`:
 *
 *   'family',  asking for the row back  -> 201, saved
 *   'parents', asking for the row back  -> 403, nothing saved
 *   'parents', not asking for it back   -> 201, saved
 *
 * The value of pinning it here is that the menu and the policy can drift
 * apart silently -- nothing in TypeScript knows what the database will
 * accept, and a browser test would only catch it by filing a health record
 * and failing.
 */

test("a parent is offered all three", () => {
  expect(visibilityOptions("parent").map((o) => o.value)).toEqual(["family", "parents", "private"]);
});

test("an adult is not offered the one that would fail", () => {
  // The role every member who joins by invite code is given, so this is the
  // common case rather than the edge one.
  expect(visibilityOptions("adult").map((o) => o.value)).toEqual(["family", "private"]);
});

test("nobody else is offered it either, including a member with no role at all", () => {
  for (const role of ["child_managed", "", null, undefined]) {
    expect(visibilityOptions(role).map((o) => o.value)).toEqual(["family", "private"]);
  }
});

test("the two that always work are never taken away", () => {
  // Filtering too eagerly would be its own bug: "Just me" and "Whole family"
  // are reachable by every role the policies allow to write at all.
  for (const role of ["parent", "adult", "child_managed", null]) {
    const values = visibilityOptions(role).map((o) => o.value);
    expect(values).toContain("family");
    expect(values).toContain("private");
  }
});

test("the labels are left alone -- this filters, it does not rewrite", () => {
  expect(visibilityOptions("parent")).toEqual([...VISIBILITY_OPTIONS]);
});

test("a policy refusal is turned into something a person can act on", () => {
  const raw = 'new row violates row-level security policy for table "health_conditions"';
  const shown = explainVisibilityRefusal(raw);
  expect(shown).not.toContain("row-level security");
  expect(shown).not.toContain("health_conditions");
  expect(shown).toContain("Parents only");
});

test("any other error is passed through untouched", () => {
  // Guessing at an unrelated failure would hide it, which is the mistake this
  // whole sweep exists to undo.
  const other = "duplicate key value violates unique constraint";
  expect(explainVisibilityRefusal(other)).toBe(other);
});
