const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";
// Which meals put what on the shopping list (20261008100000).
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), ben = U("b1");
  const [annItem] = (await db.query(`insert into buy_items (family_id, name, quantity, unit) values ('${A}', 'Garlic', 0.15, 'kg') returning id`)).rows;
  const [annMeal] = (await db.query(`insert into meal_plans (family_id, dish) values ('${A}', 'Chicken adobo') returning id`)).rows;
  const [benItem] = (await db.query(`insert into buy_items (family_id, name) values ('${B}', 'Onion') returning id`)).rows;
  const [benMeal] = (await db.query(`insert into meal_plans (family_id, dish) values ('${B}', 'Tinola') returning id`)).rows;

  await check("Ann links her household's line to her household's meal", async () =>
    (await as(ann, "insert into buy_item_meals (buy_item_id, meal_plan_id, family_id, quantity) values ($1, $2, $3, 0.1) returning quantity", [annItem.id, annMeal.id, A])).length === 1);
  await check("Her household reads it (Kid too); Ben's household doesn't", async () =>
    (await as(kid, "select 1 from buy_item_meals")).length === 1 && (await as(ben, "select 1 from buy_item_meals")).length === 0);
  await check("Nobody files a link under another household, or joins another household's line or meal", async () =>
    (await refused(() => as(ben, "insert into buy_item_meals (buy_item_id, meal_plan_id, family_id) values ($1, $2, $3)", [benItem.id, benMeal.id, A]))) === true &&
    (await refused(() => as(ann, "insert into buy_item_meals (buy_item_id, meal_plan_id, family_id) values ($1, $2, $3)", [benItem.id, annMeal.id, A]))) === true &&
    (await refused(() => as(ann, "insert into buy_item_meals (buy_item_id, meal_plan_id, family_id) values ($1, $2, $3)", [annItem.id, benMeal.id, A]))) === true &&
    (await refused(() => as(ben, "insert into buy_item_meals (buy_item_id, meal_plan_id, family_id) values ($1, $2, $3)", [annItem.id, annMeal.id, B]))) === true);
  await check("Ben can't change or delete Ann's link, nor move one into his household", async () => {
    await as(ben, "update buy_item_meals set quantity = 9");
    await as(ben, "delete from buy_item_meals");
    const r = (await db.query("select quantity from buy_item_meals")).rows;
    const moved = await refused(() => as(ann, "update buy_item_meals set family_id = $1", [B]));
    return (r.length === 1 && Number(r[0].quantity) === 0.1 && moved === true) || { r, moved };
  });
  await check("Removing the meal takes its links with it", async () => {
    await as(ann, "delete from meal_plans where id = $1", [annMeal.id]);
    return (await db.query("select 1 from buy_item_meals")).rows.length === 0;
  });
}
