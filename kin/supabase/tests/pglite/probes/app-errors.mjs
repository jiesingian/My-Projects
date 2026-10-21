// Error capture (20261021010000): anyone may report an error through
// log_app_error, scrubbed and grouped by fingerprint with a count; nobody
// reads or writes app_errors or app_error_minutes directly; only the two QA
// accounts the weekly check signs in as can read the digest; the sweep is
// the database's own.
const ANN = "10000000-0000-0000-0000-0000000000a1";
const QA = "10000000-0000-0000-0000-0000000000f1";
const FP = "0123456789abcdef";

export default async function ({ db, as, check, refused }) {
  await db.query("insert into auth.users (id, email) values ($1, 'kin-dev-qa@example.com') on conflict (id) do nothing", [QA]);
  const anon = async (sql, params = []) => {
    await db.exec("reset role");
    await db.exec("set role anon");
    try {
      return (await db.query(sql, params)).rows;
    } finally {
      await db.exec("reset role");
    }
  };
  const rows = async () => (await db.query("select * from app_errors order by fingerprint")).rows;

  await check("Someone signed out can report an error, and a repeat counts instead of adding a row", async () => {
    await anon("select log_app_error($1, 'client', '/login', 'TypeError: x is undefined', 'abc1234')", [FP]);
    await anon("select log_app_error($1, 'client', '/login', 'TypeError: x is undefined', 'abc1234')", [FP]);
    const r = await rows();
    return (r.length === 1 && r[0].count === 2 && r[0].route === "/login") || r;
  });
  await check("A signed-in member can report too", async () => {
    await as(ANN, "select log_app_error('fedcba9876543210', 'server', 'action /family', 'Error: boom', 'abc1234')");
    return (await rows()).length === 2;
  });
  await check("Nothing personal survives: email, id, query string, long number and token are scrubbed", async () => {
    await anon(
      "select log_app_error('1111111111111111', 'client', '/family/members/2b1c9a52-8c1e-4f0e-9d3a-1c2b3c4d5e6f?email=ann@x.com#top', $1, 'v1')",
      ["Failed for ann.cruz@gmail.com member 2b1c9a52-8c1e-4f0e-9d3a-1c2b3c4d5e6f at https://kin.app/x?token=secret phone 09171234567 key abcdefghijklmnopqrstuvwxyz012345"],
    );
    const r = (await db.query("select route, message from app_errors where fingerprint = '1111111111111111'")).rows[0];
    const bad = /ann|2b1c9a52|secret|0917|abcdefghijklmnop|\?/.test(r.route + r.message);
    return (!bad && r.route === "/family/members/[id]") || r;
  });
  await check("A malformed fingerprint or kind is ignored", async () => {
    await anon("select log_app_error('not-hex', 'client', '/', 'x', 'v')");
    await anon("select log_app_error('2222222222222222', 'admin', '/', 'x', 'v')");
    return (await rows()).length === 3;
  });
  await check("More than 120 reports in a minute are dropped", async () => {
    for (let i = 0; i < 130; i++) await anon("select log_app_error($1, 'client', '/', 'flood', 'v')", ["3333333333333333"]);
    const n = (await db.query("select count from app_errors where fingerprint = '3333333333333333'")).rows[0].count;
    return n < 120 || n;
  });
  await check("anon cannot read app_errors", () => refused(() => anon("select * from app_errors")));
  await check("a member cannot read app_errors", () => refused(() => as(ANN, "select * from app_errors")));
  await check("a member cannot write app_errors directly", () => refused(() => as(ANN, "insert into app_errors (fingerprint, kind, route, message) values ('4444444444444444', 'client', '/', 'x')")));
  await check("a member cannot delete from app_errors", () => refused(() => as(ANN, "delete from app_errors")));
  await check("nobody touches app_error_minutes", () => refused(() => as(ANN, "select * from app_error_minutes")));
  await check("a member cannot read the digest", () => refused(() => as(ANN, "select * from app_error_digest(7)")));
  await check("anon cannot read the digest", () => refused(() => anon("select * from app_error_digest(7)")));
  await check("the weekly check's QA account reads the digest, most frequent first", async () => {
    const r = await as(QA, "select fingerprint, count from app_error_digest(7)");
    return (r.length === 4 && r[0].fingerprint === "3333333333333333" && r[1].fingerprint === FP) || r;
  });
  await check("a member cannot run the sweep", () => refused(() => as(ANN, "select sweep_app_errors()")));
  await check("anon cannot run the sweep", () => refused(() => anon("select sweep_app_errors()")));
  await check("the sweep removes rows older than 30 days and holds the table to 5,000", async () => {
    await db.exec("update app_errors set last_seen = now() - interval '31 days' where fingerprint = '1111111111111111'");
    await db.exec("insert into app_errors (fingerprint, kind, route, message, last_seen) select lpad(to_hex(g), 16, '0'), 'client', '/', 'x', now() - (g || ' seconds')::interval from generate_series(1, 5005) g on conflict do nothing");
    await db.exec("select sweep_app_errors()");
    const n = Number((await db.query("select count(*) n from app_errors")).rows[0].n);
    const old = (await db.query("select 1 from app_errors where fingerprint = '1111111111111111'")).rows.length;
    return (n === 5000 && old === 0) || { n, old };
  });
  await check("at the cap a new fingerprint waits, an existing one still counts", async () => {
    await anon("select log_app_error('5555555555555555', 'client', '/', 'new', 'v')");
    const fresh = (await db.query("select 1 from app_errors where fingerprint = '5555555555555555'")).rows.length;
    return fresh === 0 || fresh;
  });
}
