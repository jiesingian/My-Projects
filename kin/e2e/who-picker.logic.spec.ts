import { test, expect } from "@playwright/test";
import { inScope } from "@/lib/wealth";

/** The rule behind the Who picker, which is not the rule people expect.
 *
 * The picker narrows Accounts, Cash Flow and A&L to one person. What it does
 * NOT do is show that person everything they have a hand in: a joint account
 * belongs to the household rather than to either holder, so it stays under
 * "Everyone" even for the person who opened it.
 *
 * That asymmetry is the whole reason this file exists. Janine found it the
 * expensive way on 9 September: A&L's "+ PUT MONEY IN" control was built from
 * the scoped account list, so looking at anybody's tab -- your own included --
 * emptied the list of accounts to pay a goal from. Nothing was broken in the
 * scoping; the caller had simply assumed "my tab shows my accounts" and it
 * does not. Nothing pinned that, so nothing would have said if the rule
 * changed under a later refactor.
 *
 * `inScope` decides it for accounts, assets, liabilities and goals alike --
 * one predicate, four collections -- so these cases apply to all four.
 */

const ME = "member-jonathan";
const HER = "member-janine";

const myOwn = { is_joint: false, owner_member_id: ME };
const hers = { is_joint: false, owner_member_id: HER };
const jointOfMine = { is_joint: true, owner_member_id: ME };
const jointOwnerless = { is_joint: true, owner_member_id: null };
const unowned = { is_joint: false, owner_member_id: null };

test("Everyone shows everything already in reach", () => {
  // Including the accounts belonging to other members. This is not a privacy
  // decision -- RLS has already withheld whatever is not the viewer's to see,
  // so anything reaching this function is something they may look at.
  for (const row of [myOwn, hers, jointOfMine, jointOwnerless, unowned]) {
    expect(inScope(row, "all")).toBe(true);
  }
});

test("naming a person shows what is in their name and nothing else", () => {
  expect(inScope(myOwn, ME)).toBe(true);
  expect(inScope(hers, ME)).toBe(false);
  expect(inScope(myOwn, HER)).toBe(false);
  expect(inScope(hers, HER)).toBe(true);
});

test("a joint account stays under Everyone, even for the person who opened it", () => {
  // The surprising one, and the one the "+ PUT MONEY IN" bug turned on.
  expect(inScope(jointOfMine, "all")).toBe(true);
  expect(inScope(jointOfMine, ME)).toBe(false);
  expect(inScope(jointOfMine, HER)).toBe(false);
});

test("an unowned personal row belongs to nobody's tab", () => {
  // owner_member_id is nullable, so this is reachable -- an account created
  // before ownership was recorded, or one whose owner has been removed from
  // the household. It must not fall through to whoever is on screen.
  expect(inScope(unowned, "all")).toBe(true);
  expect(inScope(unowned, ME)).toBe(false);
  expect(inScope(unowned, HER)).toBe(false);
});

test("a member id is never confused for the Everyone sentinel", () => {
  // "all" is a magic string sitting in the same field a uuid does. If a
  // member could ever be identified as "all", their tab would quietly show
  // the whole household's money.
  expect(inScope(hers, "all")).toBe(true);
  expect(inScope({ is_joint: false, owner_member_id: "all" }, "all")).toBe(true);
  expect(inScope({ is_joint: false, owner_member_id: "all" }, ME)).toBe(false);
});

test("the four collections are narrowed by one rule, not four", () => {
  // Assets, liabilities and goals carry the same two columns and go through
  // the same predicate. Written out so that splitting them apart later shows
  // up here rather than as one collection quietly disagreeing with the rest.
  const asset = { is_joint: false, owner_member_id: ME };
  const liability = { is_joint: true, owner_member_id: ME };
  const goal = { is_joint: false, owner_member_id: HER };
  expect([asset, liability, goal].map((r) => inScope(r, ME))).toEqual([true, false, false]);
  expect([asset, liability, goal].map((r) => inScope(r, "all"))).toEqual([true, true, true]);
});
