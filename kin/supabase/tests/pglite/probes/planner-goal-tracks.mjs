// 🎯 "Make it a goal" on Wealth (20261029234000): a money goal follows one
// thing of this household's that the member can see -- never another
// household's, never a private account of someone else's -- once per person.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const M = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const JOINT = "a4000000-0000-0000-0000-000000000001";
const ANN_GCASH = "a4000000-0000-0000-0000-000000000002";
const DAN_BANK = "d4000000-0000-0000-0000-000000000001";
const HOUSE = "a5000000-0000-0000-0000-000000000001";
const LOAN = "a6000000-0000-0000-0000-000000000001";
const DAN_LOAN = "d6000000-0000-0000-0000-000000000001";

export default async function ({ as, check, refused }) {
  const ann = U("a1"), abe = U("a4"), dan = U("d1");
  const follow = (who, by, tracks, id, { category = null, owner = null, kind = "money", onTime = false } = {}) =>
    as(
      who,
      `insert into planner_goals (family_id, title, kind, target, period, created_by, owner_member_id, tracks, tracks_id, tracks_category, watch_on_time)
       values ($1, 'Goal', $2, 1000, 'month', $3, $4, $5, $6, $7, $8) returning id`,
      [A, kind, by, owner, tracks, id, category, onTime],
    );

  await check("Ann follows the joint account, the house loan and the house", async () => {
    const a = await follow(ann, M("a1"), "account", JOINT);
    const l = await follow(ann, M("a1"), "loan", LOAN);
    const h = await follow(ann, M("a1"), "asset", HOUSE);
    return a.length === 1 && l.length === 1 && h.length === 1;
  });
  await check("Ann follows her own private GCash", async () => (await follow(ann, M("a1"), "account", ANN_GCASH, { owner: M("a1") })).length === 1);
  await check("Abe can't follow Ann's private GCash: he can't see it", async () => (await refused(() => follow(abe, M("a4"), "account", ANN_GCASH, { owner: M("a4") }))) === true);
  await check("Nobody follows another household's account or loan", async () => {
    const a = await refused(() => follow(ann, M("a1"), "account", DAN_BANK, { owner: M("a1") }));
    const b = await refused(() => follow(ann, M("a1"), "loan", DAN_LOAN, { owner: M("a1") }));
    return (a === true && b === true) || { a, b };
  });
  await check("An expense limit names its category, and only that", async () => {
    const ok = await follow(ann, M("a1"), "expense", null, { category: "Dining out" });
    const noCat = await refused(() => follow(ann, M("a1"), "expense", null, { owner: M("a1") }));
    const withId = await refused(() => follow(ann, M("a1"), "expense", JOINT, { category: "Groceries" }));
    return (ok.length === 1 && noCat === true && withId === true) || { ok, noCat, withId };
  });
  await check("Only money goals follow things; on-time is for income only", async () => {
    const water = await refused(() => follow(ann, M("a1"), "account", JOINT, { kind: "water", owner: M("a1") }));
    const onTime = await refused(() => follow(ann, M("a1"), "loan", LOAN, { onTime: true, owner: M("a1") }));
    const bad = await refused(() => follow(ann, M("a1"), "shoes", JOINT, { owner: M("a4") }));
    return (water === true && onTime === true && bad === true) || { water, onTime, bad };
  });
  await check("One goal per thing per person", async () => {
    const twice = await refused(() => follow(ann, M("a1"), "account", JOINT));
    const forAbe = await follow(ann, M("a1"), "account", JOINT, { owner: M("a4") });
    return (twice === true && forAbe.length === 1) || { twice, forAbe };
  });
  await check("A goal can't be moved onto another household's thing", async () =>
    (await refused(() => as(ann, `update planner_goals set tracks_id = $1 where tracks = 'loan'`, [DAN_LOAN]))) === true);
  await check("Dan sees none of it", async () => (await as(dan, "select 1 from planner_goals where tracks is not null")).length === 0);
}
