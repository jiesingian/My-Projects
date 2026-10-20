// Invite a family (20261020180000): a new household claims the referral link
// it came by; both households get Kin Plus days; the inviter's stop after
// five; one referral per household, in its first 14 days; never itself; a
// child cannot claim; the counts for Settings say how many, never who.
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";
const ANN = "10000000-0000-0000-0000-0000000000a1"; // organiser of A
const KID = "10000000-0000-0000-0000-0000000000a2"; // a child in A
const BEN = "10000000-0000-0000-0000-0000000000b1";
const NEW = (n) => `10000000-0000-0000-0000-0000000000e${n}`; // signed up, no household yet

export default async function ({ db, as, check, refused }) {
  // The live columns and helpers create_family uses, stood in (as chosen-plan.mjs does).
  await db.exec(`
    alter table members add column if not exists dob date, add column if not exists mobile text, add column if not exists is_organiser boolean not null default false;
    create or replace function public.generate_invite_code() returns text language sql as $$ select upper(substr(md5(random()::text), 1, 6)) $$;
    create table if not exists reminder_sends (key text primary key, sent_at timestamptz not null default now());
    update members set is_organiser = true where full_name in ('Ann A', 'Ben B', 'Cat C');
    update families set referral_code = 'AAAA1111' where id = '${A}';
    update families set referral_code = 'BBBB2222' where id = '${B}';
  `);
  const fam = async (who) => (await db.query("select f.* from families f join members m on m.family_id = f.id where m.auth_user_id = $1 and m.status = 'active'", [who])).rows[0];
  const awards = async (family) => (await db.query("select reason, days, source_family from kin_plus_awards where family_id = $1 order by created_at", [family])).rows;
  const stats = async (who) => (await as(who, "select * from referral_stats()"))[0];
  const expiresA0 = (await fam(ANN)).access_expires_at;

  await check("A new household claims the link it came by: it gets 7 days, and so does the inviting household", async () => {
    await as(NEW(1), "select create_family('The Cruz Family', 'Ana Cruz')");
    const name = (await as(NEW(1), "select claim_referral(' aaaa1111 ') as n"))[0].n;
    const cruz = await fam(NEW(1));
    const a = await awards(cruz.id);
    const aa = await awards(A);
    const pushed = new Date((await fam(ANN)).access_expires_at) - new Date(expiresA0) === 7 * 86400000;
    return (name === "House A" && cruz.referred_by === A && a.length === 1 && a[0].reason === "refer:welcome" && a[0].days === 7 && a[0].source_family === A && aa.some((x) => x.reason === "refer:join" && x.source_family === cruz.id) && pushed) || { name, cruz, a, aa };
  });
  await check("The newcomer's trial was pushed back 7 days too", async () => {
    const cruz = await fam(NEW(1));
    const days = Math.round((new Date(cruz.access_expires_at) - new Date(cruz.created_at)) / 86400000);
    return days === 14 || days;
  });
  await check("A household names who invited it once; a second code is refused", async () =>
    refused(() => as(NEW(1), "select claim_referral('BBBB2222')"), "already named"));
  await check("Nobody refers themselves, and a made-up code matches nobody", async () => {
    await as(NEW(2), "select create_family('The Reyes Family', 'Rey Reyes')");
    const self = await refused(() => as(NEW(2), "select claim_referral((select referral_code from families f join members m on m.family_id = f.id where m.auth_user_id = auth.uid()))"), "another family");
    const none = await refused(() => as(NEW(2), "select claim_referral('ZZZZ9999')"), "another family");
    return (self === true && none === true) || { self, none };
  });
  await check("A child cannot claim for the household; a stranger with no household cannot claim at all", async () => {
    const kid = await refused(() => as(KID, "select claim_referral('BBBB2222')"), "parent or another adult");
    const none = await refused(() => as(NEW(3), "select claim_referral('BBBB2222')"), "parent or another adult");
    return (kid === true && none === true) || { kid, none };
  });
  await check("After 14 days it is too late", async () => {
    await db.query("update families set created_at = now() - interval '15 days' where id = $1", [(await fam(NEW(2))).id]);
    return refused(() => as(NEW(2), "select claim_referral('BBBB2222')"), "first 14 days");
  });
  await check("Typing the code on Today (set_referrer) goes the same way", async () => {
    await db.query("update families set created_at = now() where id = $1", [(await fam(NEW(2))).id]);
    const name = (await as(NEW(2), "select set_referrer('bbbb2222') as n"))[0].n;
    const reyes = await fam(NEW(2));
    return (name === "House B" && reyes.referred_by === B && (await awards(reyes.id)).length === 1 && (await awards(B)).some((x) => x.reason === "refer:join")) || { name, reyes };
  });
  await check("Settings' counts: joined through us, rewarded, the cap -- for our own household only", async () => {
    const a = await stats(ANN);
    const b = await stats(BEN);
    const none = await stats(NEW(3));
    return (a.joined === 1 && a.rewarded === 1 && a.cap === 5 && b.joined === 1 && none.joined === 0) || { a, b, none };
  });
  await check("Five households earn the inviter days; the sixth still counts as joined but earns it nothing; each newcomer still gets its 7", async () => {
    // Four more households through A (one is in already).
    for (let i = 4; i <= 7; i++) {
      await db.query("insert into people (id, auth_user_id) values (gen_random_uuid(), $1) on conflict do nothing", [NEW(i)]);
      await as(NEW(i), `select create_family('Household ${i}', 'Person ${i}')`);
      await as(NEW(i), "select claim_referral('AAAA1111')");
    }
    const five = await stats(ANN);
    await db.query("insert into people (id, auth_user_id) values (gen_random_uuid(), $1) on conflict do nothing", [NEW(8)]);
    await as(NEW(8), "select create_family('Household 8', 'Person 8')");
    await as(NEW(8), "select claim_referral('AAAA1111')");
    const six = await stats(ANN);
    const eighth = await awards((await fam(NEW(8))).id);
    const inviter = (await awards(A)).filter((x) => x.reason === "refer:join").length;
    return (five.joined === 5 && five.rewarded === 5 && six.joined === 6 && six.rewarded === 5 && inviter === 5 && eighth.length === 1 && eighth[0].days === 7) || { five, six, eighth, inviter };
  });
  await check("A paying household banks the days instead of a trial", async () => {
    await db.query("update families set access_status = 'active', plus_credit_days = 0 where id = $1", [B]);
    await db.query("insert into people (id, auth_user_id) values (gen_random_uuid(), $1) on conflict do nothing", [NEW(9)]);
    await as(NEW(9), "select create_family('Household 9', 'Person 9')");
    await as(NEW(9), "select claim_referral('BBBB2222')");
    const b = (await db.query("select plus_credit_days from families where id = $1", [B])).rows[0];
    return b.plus_credit_days === 7 || b;
  });
  await check("Nobody calls these as anon, and referred_by is not readable across households", async () => {
    await db.exec("set role anon");
    let a;
    try {
      a = await refused(() => db.query("select claim_referral('AAAA1111')"));
    } finally {
      await db.exec("reset role");
    }
    const other = await as(BEN, "select referred_by from families where id = $1", [(await fam(NEW(1))).id]);
    return (a === true && other.length === 0) || { a, other };
  });
}
