// Christmas on Today (20261020212000): a household switch on families, on by
// default, the organizer's to change, readable like the rest of the row.
const A = "a0000000-0000-0000-0000-000000000000";
const ANN = "10000000-0000-0000-0000-0000000000a1";
const KID = "10000000-0000-0000-0000-0000000000a2";
const BEN = "10000000-0000-0000-0000-0000000000b1";

export default async function ({ db, as, check }) {
  // The organizer-only update policy on families, stood in as chosen-plan.mjs does.
  await db.exec(`
    alter table members add column if not exists is_organiser boolean not null default false;
    update members set is_organiser = true where full_name in ('Ann A', 'Ben B', 'Cat C');
    drop policy if exists families_update on families;
    create policy families_update on families for update using (id = current_family_id() and exists (select 1 from members m where m.auth_user_id = auth.uid() and m.is_organiser and m.family_id = families.id));
    grant update on families to authenticated;
  `);
  const value = async (who) => (await as(who, "select christmas_on_today from families where id = $1", [A]))[0]?.christmas_on_today;

  await check("On by default, and the household reads it", async () => (await value(ANN)) === true && (await value(KID)) === true);
  await check("A child cannot turn it off; another household cannot touch it", async () => {
    const kid = await as(KID, "update families set christmas_on_today = false where id = $1 returning id", [A]);
    const ben = await as(BEN, "update families set christmas_on_today = false where id = $1 returning id", [A]);
    return (kid.length === 0 && ben.length === 0 && (await value(ANN)) === true) || { kid, ben };
  });
  await check("The organizer turns it off, and on again", async () => {
    await as(ANN, "update families set christmas_on_today = false where id = $1", [A]);
    const off = await value(KID);
    await as(ANN, "update families set christmas_on_today = true where id = $1", [A]);
    return (off === false && (await value(ANN)) === true) || { off };
  });
}
