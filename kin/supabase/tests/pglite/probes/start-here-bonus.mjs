const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";
const D = "d0000000-0000-0000-0000-000000000000";
// Start here bonus: 7 more days of Plus for every first step done within a
// day, once, checked from the records (20261013160000).
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), ben = U("b1"), dan = U("d1");
  const expiry = async (f) => (await db.query("select access_expires_at::text e, access_status s, plus_credit_days c from families where id = $1", [f])).rows[0];
  const awards = async (f) => (await db.query("select days from kin_plus_awards where family_id = $1 and reason = 'start:bonus'", [f])).rows;
  const done = async (f) => (await db.query("select public.start_bonus_done($1) d", [f])).rows[0].d;
  const claim = async (who) => (await as(who, "select public.claim_start_bonus() n"))[0].n;
  // House A: Ann, Kid (a login) and Baby (a profile) -- invited and kids done.
  const stepsFor = async (who, f) => {
    await as(who, "insert into events (family_id) values ($1)", [f]);
    await as(who, "insert into routines (family_id, title) values ($1, 'Feed the cat')", [f]);
    await as(who, "insert into buy_items (family_id, name) values ($1, 'Rice')", [f]);
  };

  await check("Nothing done yet: Ann's claim gives nothing", async () => {
    const before = await expiry(A);
    const n = await claim(ann);
    return (n === 0 && (await awards(A)).length === 0 && (await expiry(A)).e === before.e) || { n };
  });

  await stepsFor(ann, A);

  await check("Every step done, but Kid (a child) claims: nothing", async () => {
    const before = await expiry(A);
    const n = await claim(kid);
    return (n === 0 && (await awards(A)).length === 0 && (await expiry(A)).e === before.e) || { n };
  });

  await check("Ben, another household, claims: nothing for A or for B", async () => {
    const a = await expiry(A), b = await expiry(B);
    const n = await claim(ben);
    return (n === 0 && (await awards(A)).length === 0 && (await awards(B)).length === 0 && (await expiry(A)).e === a.e && (await expiry(B)).e === b.e) || { n };
  });

  await check("Nobody signed in can call the checker or grant days directly", async () => {
    const chk = await refused(() => as(ben, "select public.start_bonus_done($1)", [A]));
    const grant = await refused(() => as(ann, "select public.grant_plus_days($1, 30, 'start:bonus')", [A]));
    const award = await refused(() => as(ann, "insert into kin_plus_awards (family_id, reason, days) values ($1, 'start:bonus', 7)", [A]));
    return (chk && grant && award && (await awards(A)).length === 0) || { chk, grant, award };
  });

  await check("Ann claims: 7 days added to the trial, written once", async () => {
    const before = new Date((await expiry(A)).e).getTime();
    const n = await claim(ann);
    const after = new Date((await expiry(A)).e).getTime();
    const days = Math.round((after - before) / 86400000);
    return (n === 7 && days === 7 && (await awards(A)).length === 1) || { n, days };
  });

  await check("Twice: the second claim gives nothing", async () => {
    const before = await expiry(A);
    const n = await claim(ann);
    return (n === 0 && (await awards(A)).length === 1 && (await expiry(A)).e === before.e) || { n };
  });

  await check("After 24h: records made on day 2 don't count; made on day 1 they do", async () => {
    await db.query("update families set created_at = now() - interval '30 hours' where id = $1", [D]);
    // House D: Dan and Dee (a login), both from the start.
    await db.query("update members set created_at = now() - interval '30 hours' where family_id = $1", [D]);
    await stepsFor(dan, D);
    const late = await done(D);
    const n = await claim(dan);
    await db.query("update events set created_at = now() - interval '20 hours' where family_id = $1", [D]);
    await db.query("update routines set created_at = now() - interval '20 hours' where family_id = $1", [D]);
    await db.query("update buy_items set created_at = now() - interval '20 hours' where family_id = $1", [D]);
    const inTime = await done(D);
    return (late === false && n === 0 && inTime === true && (await awards(D)).length === 0) || { late, n, inTime };
  });

  await check("A household from before the bonus existed can't claim it after the fact", async () => {
    await db.query("update families set created_at = '2026-10-01' where id = $1", [D]);
    for (const t of ["events", "routines", "buy_items", "members"]) await db.query(`update ${t} set created_at = '2026-10-01 06:00' where family_id = $1`, [D]);
    const ready = await done(D);
    const n = await claim(dan);
    return (ready === true && n === 0 && (await awards(D)).length === 0) || { ready, n };
  });

  // House B: Ben, a pending invite and a child profile, and the three rows.
  await db.query("insert into members (family_id, full_name, role, status) values ($1, 'Bea B', 'adult', 'pending'), ($1, 'Bo B', 'child_managed', 'managed')", [B]);
  await stepsFor(ben, B);

  await check("Free (trial over): nothing", async () => {
    await db.query("update families set access_expires_at = now() - interval '1 hour' where id = $1", [B]);
    const n = await claim(ben);
    return (n === 0 && (await awards(B)).length === 0 && (await expiry(B)).s === "trialing") || { n };
  });

  await check("Comped: nothing, and no days banked", async () => {
    await db.query("update families set access_status = 'comped', access_expires_at = null where id = $1", [B]);
    const n = await claim(ben);
    return (n === 0 && (await awards(B)).length === 0 && (await expiry(B)).c === 0) || { n };
  });

  await check("Paying: nothing", async () => {
    await db.query("update families set access_status = 'active', access_source = 'subscription', access_expires_at = now() + interval '30 days' where id = $1", [B]);
    const n = await claim(ben);
    return (n === 0 && (await awards(B)).length === 0 && (await expiry(B)).c === 0) || { n };
  });

  await check("The same household back on a live trial earns it (the setup was right)", async () => {
    await db.query("update families set access_status = 'trialing', access_source = null, access_expires_at = now() + interval '3 days' where id = $1", [B]);
    const n = await claim(ben);
    return (n === 7 && (await awards(B)).length === 1) || { n };
  });
}
