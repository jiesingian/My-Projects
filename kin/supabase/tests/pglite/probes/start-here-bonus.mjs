const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";
const C = "c0000000-0000-0000-0000-000000000000";
const D = "d0000000-0000-0000-0000-000000000000";
const STEPS = ["plans", "list", "chat", "journal", "health", "vault", "wealth", "ai"];
// Start here bonus: 7 more days of Plus for trying every part of Kin in the
// first 5 days, once, checked from the records; Kin's offers wait meanwhile
// (20261013160000, then 20261013180000).
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), ben = U("b1"), cat = U("c1"), dan = U("d1");
  const sql = async (q, p = []) => (await db.query(q, p)).rows;
  const expiry = async (f) => (await sql("select access_expires_at::text e, access_status s, plus_credit_days c from families where id = $1", [f]))[0];
  const awards = async (f) => sql("select days from kin_plus_awards where family_id = $1 and reason = 'start:bonus'", [f]);
  const done = async (f) => (await sql("select public.start_bonus_done($1) d", [f]))[0].d;
  const claim = async (who) => (await as(who, "select public.claim_start_bonus() n"))[0].n;
  const progress = async (who) => (await as(who, "select public.start_bonus_progress() p"))[0].p;
  // One row per part of Kin, written as the app would (the checklist reads
  // the records, not who wrote them). `at` dates them; default now.
  const ROWS = {
    plans: "insert into events (family_id, created_at) values ($1, $2)",
    list: "insert into buy_items (family_id, name, created_at) values ($1, 'Rice', $2)",
    chat: "insert into family_messages (family_id, body, created_at) values ($1, 'Hi', $2)",
    journal: "insert into journal_entries (family_id, created_at) values ($1, $2)",
    health: "insert into health_medicines (family_id, created_at) values ($1, $2)",
    // Kept private by its keeper: still counts.
    vault: "insert into doc_entries (family_id, visibility, created_at) values ($1, 'private', $2)",
    wealth: "insert into bills (family_id, name, created_at) values ($1, 'Meralco', $2)",
    ai: "insert into ai_usage (family_id, month, uses) values ($1, date_trunc('month', $2::timestamptz)::date, 1) on conflict (family_id, month) do update set uses = 1",
  };
  const add = async (f, steps, at = null) => {
    for (const s of steps) await sql(ROWS[s], [f, at ?? new Date().toISOString()]);
  };

  // base.sql already gives House A and B a journal entry or a bill; the rest
  // of the eight start empty.
  const FRESH = ["plans", "list", "chat", "health", "vault", "ai"];
  await check("A new household: open, not done, and the claim gives nothing", async () => {
    const p = await progress(ann);
    const n = await claim(ann);
    return (p.open === true && FRESH.every((s) => p.steps[s] === false) && n === 0 && (await awards(A)).length === 0) || { p, n };
  });

  await add(A, STEPS.filter((s) => s !== "ai"));

  await check("Seven of eight: the checklist shows them, the claim still gives nothing", async () => {
    const p = await progress(ann);
    const n = await claim(ann);
    const ticked = STEPS.filter((s) => p.steps[s]);
    return (ticked.length === 7 && !p.steps.ai && n === 0 && (await awards(A)).length === 0) || { ticked, n };
  });

  await check("A private document counts though Ann can't see it", async () => {
    const seen = (await as(ann, "select 1 from doc_entries")).length;
    return (seen === 0 && (await progress(ann)).steps.vault === true) || { seen };
  });

  await add(A, ["ai"]);

  await check("All eight, but Kid (a child) claims: nothing", async () => {
    const before = await expiry(A);
    const n = await claim(kid);
    return (n === 0 && (await awards(A)).length === 0 && (await expiry(A)).e === before.e) || { n };
  });

  await check("Ben, another household, claims: nothing for A; his checklist is his own", async () => {
    const a = await expiry(A);
    const n = await claim(ben);
    const p = await progress(ben);
    return (n === 0 && (await awards(A)).length === 0 && (await expiry(A)).e === a.e && FRESH.every((s) => p.steps[s] === false)) || { n, p };
  });

  await check("Nobody signed in can call the checkers or grant days directly", async () => {
    const r = await Promise.all([
      refused(() => as(ben, "select public.start_bonus_done($1)", [A])),
      refused(() => as(ben, "select public.start_bonus_progress_of($1)", [A])),
      refused(() => as(ben, "select public.start_bonus_open($1)", [A])),
      refused(() => as(ann, "select public.grant_plus_days($1, 30, 'start:bonus')", [A])),
      refused(() => as(ann, "insert into kin_plus_awards (family_id, reason, days) values ($1, 'start:bonus', 7)", [A])),
    ]);
    return (r.every(Boolean) && (await awards(A)).length === 0) || r;
  });

  await check("Ann claims: 7 days added to the trial, written once; the checklist closes", async () => {
    const before = new Date((await expiry(A)).e).getTime();
    const n = await claim(ann);
    const days = Math.round((new Date((await expiry(A)).e).getTime() - before) / 86400000);
    return (n === 7 && days === 7 && (await awards(A)).length === 1 && (await progress(ann)).open === false) || { n, days };
  });

  await check("Twice: the second claim gives nothing", async () => {
    const before = await expiry(A);
    const n = await claim(ann);
    return (n === 0 && (await awards(A)).length === 1 && (await expiry(A)).e === before.e) || { n };
  });

  await check("After 5 days: records from day 6 don't count, from day 4 they do", async () => {
    await sql("update families set created_at = now() - interval '6 days' where id = $1", [D]);
    await add(D, STEPS);
    const late = await done(D);
    const open = (await sql("select public.start_bonus_open($1) o", [D]))[0].o;
    const n = await claim(dan);
    for (const t of ["events", "buy_items", "family_messages", "journal_entries", "health_medicines", "doc_entries", "bills"]) {
      await sql(`update ${t} set created_at = now() - interval '2 days' where family_id = $1`, [D]);
    }
    const inTime = await done(D);
    return (late === false && open === false && n === 0 && inTime === true && (await awards(D)).length === 0) || { late, open, n, inTime };
  });

  await check("A household from before the bonus existed can't claim it after the fact", async () => {
    await sql("update families set created_at = '2026-10-01' where id = $1", [D]);
    for (const t of ["events", "buy_items", "family_messages", "journal_entries", "health_medicines", "doc_entries", "bills"]) {
      await sql(`update ${t} set created_at = '2026-10-02' where family_id = $1`, [D]);
    }
    await sql("update ai_usage set month = '2026-10-01' where family_id = $1", [D]);
    const ready = await done(D);
    const n = await claim(dan);
    return (ready === true && n === 0 && (await awards(D)).length === 0) || { ready, n };
  });

  // House B: Ben alone tries everything -- no partner or kids needed.
  await add(B, STEPS);

  await check("Free (trial over): nothing", async () => {
    await sql("update families set access_expires_at = now() - interval '1 hour' where id = $1", [B]);
    const n = await claim(ben);
    return (n === 0 && (await awards(B)).length === 0) || { n };
  });

  await check("Comped: nothing, and no days banked", async () => {
    await sql("update families set access_status = 'comped', access_expires_at = null where id = $1", [B]);
    const n = await claim(ben);
    return (n === 0 && (await awards(B)).length === 0 && (await expiry(B)).c === 0) || { n };
  });

  await check("Paying: nothing", async () => {
    await sql("update families set access_status = 'active', access_source = 'subscription', access_expires_at = now() + interval '30 days' where id = $1", [B]);
    const n = await claim(ben);
    return (n === 0 && (await awards(B)).length === 0 && (await expiry(B)).c === 0) || { n };
  });

  await check("A household of one, back on a live trial, earns it", async () => {
    await sql("update families set access_status = 'trialing', access_source = null, access_expires_at = now() + interval '3 days' where id = $1", [B]);
    const n = await claim(ben);
    return (n === 7 && (await awards(B)).length === 1) || { n };
  });

  await check("Kin's offers wait while the checklist is open, and come back once it's earned", async () => {
    // House C on its third day: old enough for an offer, checklist still open.
    // Until 15 October no real household is both, so move the start date.
    await sql("create or replace function public.start_bonus_from() returns timestamptz language sql immutable set search_path = '' as $$ select timestamptz '2000-01-01 00:00:00+00' $$");
    await sql("update families set created_at = now() - interval '2 days' where id = $1", [C]);
    const waiting = await as(cat, "select code from public.next_kin_offer()");
    const none = (await sql("select 1 from household_offers where family_id = $1", [C])).length;
    await sql("insert into kin_plus_awards (family_id, reason, days) values ($1, 'start:bonus', 7)", [C]);
    const back = await as(cat, "select code from public.next_kin_offer()");
    return (waiting.length === 0 && none === 0 && back.length === 1) || { waiting, none, back };
  });
}
