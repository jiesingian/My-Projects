// "Send me a test" (20261020210000): a grown-up samples each kind of push the
// database words, with their own first name; a child, kid view or not, and a
// signed-out visitor are refused; five a minute per person. The due_*()
// functions re-created to call the same words are pinned by their own probes
// (reminders-*.mjs, missed-dose-alerts.mjs, medicine-supply.mjs,
// remembrance.mjs, money-recap-push.mjs); here each sample is compared with
// the words function it should come from.
const ANN = "10000000-0000-0000-0000-0000000000a1"; // parent in A
const KID = "10000000-0000-0000-0000-0000000000a2"; // child in A, own login
const ABE = "10000000-0000-0000-0000-0000000000a4"; // adult in A
const ANN_M = "00000000-0000-0000-0000-0000000000a1";

export default async function ({ db, as, check, refused }) {
  const sample = async (who, kind) => (await as(who, "select * from sample_push($1)", [kind]))[0];
  const KINDS = ["dose", "missed_dose", "refill", "undas", "remembrance", "money_recap", "week_ahead", "plan"];

  await check("Kid cannot sample or be allowed a test", async () =>
    (await refused(() => sample(KID, "dose"), "grown-up")) === true &&
    (await refused(() => as(KID, "select push_test_allowed('dose')"), "grown-up")) === true);
  await check("Signed out, nothing", async () => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims', '{}', false)");
    await db.exec("set role anon");
    try {
      const a = await refused(() => db.query("select * from sample_push('dose')"));
      const b = await refused(() => db.query("select push_test_allowed('dose')"));
      return a === true && b === true;
    } finally {
      await db.exec("reset role");
    }
  });
  await check("Nobody reads or writes push_tests directly", async () =>
    (await refused(() => as(ANN, "select 1 from push_tests"))) === true &&
    (await refused(() => as(ANN, `insert into push_tests (member_id, kind) values ('${ANN_M}', 'x')`))) === true);
  await check("An unknown kind samples nothing, rather than failing", async () => (await as(ANN, "select * from sample_push('nope')")).length === 0);

  await check("Every kind the database words has a title, a body and a Kin link for Ann", async () => {
    for (const k of KINDS) {
      const s = await sample(ANN, k);
      if (!s || !s.title || !s.body || !s.url.startsWith("/") || s.tag !== `test:${k}`) return { k, s };
    }
    return true;
  });
  await check("The dose sample is the dose words, with Ann's own name and her own health page", async () => {
    const s = await sample(ANN, "dose");
    return (s.title === "Time for Ann's Losartan" && s.body === "50 mg · 08:00. Tap to tick it." && s.url === `/family/members/${ANN_M}?view=health&seg=medicines`) || s;
  });
  await check("The missed-dose sample follows the member's sex, as the real one does", async () => {
    await db.query("update members set sex = 'female' where id = $1", [ANN_M]);
    const her = await sample(ANN, "missed_dose");
    await db.query("update members set sex = null where id = $1", [ANN_M]);
    const neutral = await sample(ANN, "missed_dose");
    return (her.title === "Ann hasn't taken her 8:00 AM Losartan" && her.body === "Not ticked an hour after it was due. Tap to check."
      && neutral.title === "Ann's 8:00 AM Losartan isn't ticked") || { her, neutral };
  });
  await check("The refill sample: about 5 days, added to the list", async () => {
    const s = await sample(ANN, "refill");
    return (s.title === "Ann's Losartan runs out in about 5 days" && s.body === "Added to the list.") || s;
  });
  await check("The Undas sample names two and opens Today", async () => {
    const s = await sample(ANN, "undas");
    return (/^All Saints' Day is on (Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day$/.test(s.title) && s.body === "Remembering Lolo Pedro, Lola Remedios. Time to plan the visit: candles and flowers." && s.url === "/today") || s;
  });
  await check("The remembrance sample is a 40th day", async () => {
    const s = await sample(ANN, "remembrance");
    return (s.title === "Remembering Lola Remedios" && s.body === "Today is the 40th day since their passing." && s.url === "/today") || s;
  });
  await check("The money recap sample names last month and opens its page", async () => {
    const s = await sample(ANN, "money_recap");
    const m = (await db.query("select to_char(date_trunc('month', (now() at time zone 'Asia/Manila')::date) - interval '1 month', 'FMMonth') as mon, to_char(date_trunc('month', (now() at time zone 'Asia/Manila')::date) - interval '1 month', 'YYYY-MM') as ym")).rows[0];
    return (s.title === `Your ${m.mon} money recap` && s.url === `/wealth/recap?month=${m.ym}`) || { s, m };
  });
  await check("The week ahead and plan samples read as the real ones do", async () => {
    const w = await sample(ANN, "week_ahead");
    const p = await sample(ANN, "plan");
    return (w.title === "The week ahead" && w.url === "/today/week" && p.title === "In 30 minutes: School pick-up" && p.body === "At Ateneo Grade School. Time to get going." && p.url === "/planner") || { w, p };
  });
  await check("push_test_caller(), the helper behind both, cannot be called directly", async () =>
    (await db.query(`select has_function_privilege('authenticated', 'public.push_test_caller()', 'execute') as a, has_function_privilege('anon', 'public.push_test_caller()', 'execute') as b`)).rows[0].a === false &&
    (await db.query(`select has_function_privilege('anon', 'public.push_test_caller()', 'execute') as b`)).rows[0].b === false &&
    (await refused(() => as(ANN, "select * from push_test_caller()"))) === true);
  await check("The words functions are not for the browser; the samples and the gate are", async () => {
    const r = await db.query(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname like 'push_words_%'
         and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))`,
    );
    const open = (await db.query(`select has_function_privilege('authenticated', 'public.sample_push(text)', 'execute') as a, has_function_privilege('authenticated', 'public.push_test_allowed(text)', 'execute') as b, has_function_privilege('anon', 'public.sample_push(text)', 'execute') as c`)).rows[0];
    return (r.rows.length === 0 && open.a && open.b && !open.c) || { leaked: r.rows, open };
  });

  await check("Abe, an adult, may send five tests a minute; the sixth is refused; Ann's count is her own", async () => {
    for (let i = 0; i < 5; i++) await as(ABE, "select push_test_allowed('dose')");
    const sixth = await refused(() => as(ABE, "select push_test_allowed('undas')"), "few a minute");
    const annOk = (await as(ANN, "select push_test_allowed('dose') as ok"))[0].ok === true;
    const rows = (await db.query("select count(*)::int as n from push_tests")).rows[0].n;
    return (sixth === true && annOk && rows === 6) || { sixth, annOk, rows };
  });
  await check("A minute later Abe may again, and yesterday's rows are swept", async () => {
    await db.query("update push_tests set sent_at = sent_at - interval '2 minutes'");
    await db.query("insert into push_tests (member_id, kind, sent_at) values ($1, 'old', now() - interval '2 days')", ["00000000-0000-0000-0000-0000000000a4"]);
    const ok = (await as(ABE, "select push_test_allowed('sos') as ok"))[0].ok === true;
    const old = (await db.query("select count(*)::int as n from push_tests where kind = 'old'")).rows[0].n;
    return (ok && old === 0) || { ok, old };
  });
}
