const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const M = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const D = "d0000000-0000-0000-0000-000000000000";
const hash = (c) => c.repeat(43);
// Medicine doses as iPhone Clock alarms: the private read-only link the
// "Kin Alarms" Shortcut fetches (20261023237000).
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), ben = U("b1"), dan = U("d1"), stranger = U("ff");
  const anon = async (sql, params = []) => {
    await db.exec("set role anon");
    try {
      return (await db.query(sql, params)).rows;
    } finally {
      await db.exec("reset role");
    }
  };
  const feed = (h) => anon("select public.dose_alarms_by_link($1) as f", [h]).then((r) => r[0].f);
  const labels = (f) => (f?.alarms ?? []).map((a) => `${a.time} ${a.label}`);
  const med = (family, member, name, times, extra = {}) =>
    db.query(
      `insert into health_medicines (family_id, member_id, name, dose, times, start_date, end_date, visibility, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [family, member, name, extra.dose ?? null, times, extra.start ?? "2020-01-01", extra.end ?? null, extra.visibility ?? "family", extra.by ?? null],
    );

  await med(A, M("a1"), "Losartan", ["20:00", "08:00"], { dose: "50 mg" });
  await med(A, M("a2"), "Cetirizine", ["21:00"]);
  await med(A, M("a3"), "Paracetamol", ["09:00"], { visibility: "private", by: M("a2") });
  await med(A, M("a3"), "Zinc", ["07:30"], { visibility: "parents" });
  await med(A, M("a1"), "Amoxicillin", ["12:00"], { end: "2021-01-01" });
  await med(A, M("a1"), "Vitamin D", ["10:00"], { start: "2999-01-01" });
  await med(A, M("a1"), "As needed", []);
  await med(D, M("d2"), "Iron", ["06:00"], { visibility: "parents" });

  await check("Ann's link lists her doses today, and her children's shared with her, by time", async () => {
    await as(ann, "select public.set_dose_alarm_token($1)", [hash("a")]);
    const f = await feed(hash("a"));
    const want = ["07:30 Kin · Zinc · Baby", "08:00 Kin · Losartan 50 mg", "20:00 Kin · Losartan 50 mg", "21:00 Kin · Cetirizine · Kid"];
    return (JSON.stringify(labels(f)) === JSON.stringify(want) && f.name === "Ann" && f.alarms[1].hour === 8 && f.alarms[0].minute === 30) || labels(f);
  });
  await check("Ended, not yet started and as-needed medicines make no alarm", async () => {
    const l = labels(await feed(hash("a")));
    return !l.some((x) => /Amoxicillin|Vitamin D|As needed/.test(x)) || l;
  });
  await check("A child's private medicine added by someone else is not on a grown-up's link", async () =>
    !labels(await feed(hash("a"))).some((x) => x.includes("Paracetamol")));
  await check("A child's link lists only their own doses", async () => {
    await as(kid, "select public.set_dose_alarm_token($1)", [hash("k")]);
    const l = labels(await feed(hash("k")));
    return JSON.stringify(l) === JSON.stringify(["21:00 Kin · Cetirizine"]) || l;
  });
  await check("An adult (not a parent) doesn't get a child's medicine shared with parents", async () => {
    await as(dan, "select public.set_dose_alarm_token($1)", [hash("d")]);
    const f = await feed(hash("d"));
    return (f !== null && f.alarms.length === 0) || f;
  });
  await check("Ben's link never lists Ann's household", async () => {
    await as(ben, "select public.set_dose_alarm_token($1)", [hash("b")]);
    const f = await feed(hash("b"));
    return (f !== null && f.alarms.length === 0) || f;
  });
  await check("An unknown key, a malformed one and an empty one all get nothing", async () => {
    const r = [await feed(hash("z")), await feed("short"), await feed(hash("a") + "x"), await feed(null)];
    return r.every((f) => f === null) || r;
  });
  await check("Nobody reads or changes the keys directly, signed in or not", async () => {
    const a = await refused(() => anon("select * from dose_alarm_tokens"));
    const b = await refused(() => as(ann, "select * from dose_alarm_tokens"));
    const c = await refused(() => as(ann, "update dose_alarm_tokens set family_id = $1", [D]));
    return (a === true && b === true && c === true) || { a, b, c };
  });
  await check("Someone with no household can't make one, and anon can't at all", async () => {
    const s = await refused(() => as(stranger, "select public.set_dose_alarm_token($1)", [hash("s")]), "Sign in");
    const a = await refused(() => anon("select public.set_dose_alarm_token($1)", [hash("t")]));
    return (s === true && a === true) || { s, a };
  });
  await check("A badly shaped hash is refused when making a link", async () =>
    (await refused(() => as(ann, "select public.set_dose_alarm_token('not-a-hash')"), "shape")) === true);
  await check("Reading the link marks when it was last used; the state never shows the hash", async () => {
    const [s] = await as(ann, "select * from public.dose_alarm_link_state()");
    return (s && s.last_used_at !== null && !("token_hash" in s)) || s;
  });
  await check("A new link replaces the old one, which stops working", async () => {
    await as(ann, "select public.set_dose_alarm_token($1)", [hash("c")]);
    const old = await feed(hash("a"));
    const fresh = await feed(hash("c"));
    return (old === null && fresh !== null) || { old, fresh };
  });
  await check("Each member only turns off their own link", async () => {
    await as(ann, "select public.clear_dose_alarm_token()");
    const annState = await as(ann, "select * from public.dose_alarm_link_state()");
    const kidStill = await feed(hash("k"));
    return (annState.length === 0 && (await feed(hash("c"))) === null && kidStill !== null) || { annState, kidStill };
  });
  await check("Losing the login (account deletion keeps the row) deletes the key", async () => {
    await db.query("update members set auth_user_id = null where id = $1", [M("a2")]);
    const n = (await db.query("select count(*)::int as n from dose_alarm_tokens where member_id = $1", [M("a2")])).rows[0].n;
    return (n === 0 && (await feed(hash("k"))) === null) || { n };
  });
  await check("Being made inactive deletes the key too", async () => {
    await db.query("update members set status = 'removed' where id = $1", [M("d1")]);
    const n = (await db.query("select count(*)::int as n from dose_alarm_tokens where member_id = $1", [M("d1")])).rows[0].n;
    return (n === 0 && (await feed(hash("d"))) === null) || { n };
  });
}
