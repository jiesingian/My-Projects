// A guest link on an event (20261020231000): a grown-up of the host
// household makes it; a relative with no account answers by name through
// it -- Who's coming with a headcount, the potluck, the draw -- and sees
// only the event; the household sees them marked as by link; forged,
// revoked and expired links answer with nothing; the caps hold.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const hash = (c) => c.repeat(43);

export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), ben = U("b1"), dan = U("d1");
  const anon = async (sql, params = []) => {
    await db.exec("set role anon");
    try {
      return (await db.query(sql, params)).rows;
    } finally {
      await db.exec("reset role");
    }
  };
  const today = "(select (now() at time zone 'Asia/Manila')::date)";
  const ev = async (family, offset = 3, extra = "") =>
    (await db.query(`insert into events (family_id, title, event_date${extra ? ", recurs_yearly" : ""}) values ($1, 'Christmas party', ${today} + ${offset}${extra}) returning id`, [family])).rows[0].id;
  const party = await ev(A);
  const over = await ev(A, -2);
  const yearly = await ev(A, 3, ", true");
  const link = hash("g");
  const event = (h) => anon("select * from guest_event($1)", [h]);
  const answer = (name, ans, n = 1, h = link) => anon("select guest_answer($1, $2, $3, $4) as s", [h, name, ans, n]).then((r) => r[0].s);
  const hello = (name, h = link) => anon("select guest_hello($1, $2) as s", [h, name]).then((r) => r[0].s);
  const claim = (name, item, qty, h = link) => anon("select guest_claim($1, $2, $3, $4) as s", [h, name, item, qty]).then((r) => r[0].s);
  const dish = (name, label, n, h = link) => anon("select guest_add_dish($1, $2, $3, $4) as s", [h, name, label, n]).then((r) => r[0].s);
  const joinDraw = (name, on, h = link) => anon("select guest_join_draw($1, $2, $3) as s", [h, name, on]).then((r) => r[0].s);

  await check("A grown-up of the host household makes the link; a child, another household, a yearly or a past event cannot", async () => {
    await as(ann, "select set_event_guest_link($1, $2)", [party, link]);
    const a = await refused(() => as(kid, "select set_event_guest_link($1, $2)", [party, hash("k")]), "grown-up");
    const b = await refused(() => as(ben, "select set_event_guest_link($1, $2)", [party, hash("b")]), "no longer there");
    const c = await refused(() => as(ann, "select set_event_guest_link($1, $2)", [yearly, hash("y")]), "yearly");
    const d = await refused(() => as(ann, "select set_event_guest_link($1, $2)", [over, hash("o")]), "over");
    const on = await as(ann, "select draw_id from event_guest_link($1)", [party]);
    return (a === true && b === true && c === true && d === true && on.length === 1 && on[0].draw_id === null) || { a, b, c, d, on };
  });
  await check("Nobody reads the keys, signed in or not; the household reads only whether a link is on", async () => {
    const a = await refused(() => anon("select * from event_guest_links"));
    const b = await refused(() => as(ann, "select * from event_guest_links"));
    const c = await refused(() => anon("select * from guest_link_live($1)", [link]));
    const d = await refused(() => as(ann, "select * from guest_row($1, 'x', true)", [link]));
    const e = (await as(ben, "select * from event_guest_link($1)", [party])).length === 0;
    // The inner helpers (guest_state, guest_clean_name) are for the link's functions only.
    const f = await refused(() => as(ann, "select guest_state(g, null) from event_guests g"));
    const g = await refused(() => anon("select guest_clean_name('x')"));
    return (a === true && b === true && c === true && d === true && e && f === true && g === true) || { a, b, c, d, e, f, g };
  });
  await check("The link shows the event's name, dates and host, and nothing to a wrong, short or made-up key", async () => {
    const e = (await event(link))[0];
    const wrong = await event(hash("z"));
    const short = await event("short");
    return (e?.title === "Christmas party" && e.host_name === "House A" && e.open === true && e.coming === 0 && e.draw_id === null && wrong.length === 0 && short.length === 0) || { e, wrong, short };
  });
  await check("Tita Baby answers Going for 4; the same name again, in any case, changes the answer rather than adding a person", async () => {
    const s1 = await answer("Tita Baby", "going", 4);
    const s2 = await answer("tita  baby ", "maybe", 2);
    const rows = (await db.query("select name, answer, headcount from event_guests where event_id = $1", [party])).rows;
    return (s1.answer === "going" && s1.headcount === 4 && s2.answer === "maybe" && rows.length === 1 && rows[0].name === "Tita Baby" && rows[0].headcount === 2) || { s1, s2, rows };
  });
  await check("The headcount counts: going again for 4 shows 4 coming; a household member going adds 1", async () => {
    await answer("Tita Baby", "going", 4);
    await as(ann, "insert into event_rsvps (event_id, member_id, family_id, answer, answered_by) values ($1, $2, $3, 'going', $2)", [party, P("a1"), A]);
    const e = (await event(link))[0];
    return e.coming === 5 || e;
  });
  await check("A name with HTML in it, an empty one, one over 40 letters, and a headcount of 21 are refused", async () => {
    const a = await refused(() => answer("<b>Tita</b>", "going", 1), "name");
    const b = await refused(() => answer("   ", "going", 1), "name");
    const c = await refused(() => answer("T".repeat(41), "going", 1), "name");
    const d = await refused(() => answer("Kuya Jun", "going", 21), "1 to 20");
    const e = await refused(() => answer("Kuya Jun", "coming", 1), "Choose");
    return (a === true && b === true && c === true && d === true && e === true) || { a, b, c, d, e };
  });
  await check("Hello by name gives their own state back, and nothing for a name that hasn't answered", async () => {
    const s = await hello("TITA BABY");
    const none = await hello("Nobody Yet");
    const rows = (await db.query("select count(*)::int as n from event_guests where event_id = $1", [party])).rows[0].n;
    return (s?.answer === "going" && s.headcount === 4 && none === null && rows === 1) || { s, none, rows };
  });

  // Potluck.
  const pancit = (await as(ann, "insert into potluck_items (event_id, family_id, label, wanted, created_by) values ($1, $2, 'Pancit', 2, $3) returning id", [party, A, P("a1")]))[0].id;
  await as(kid, "insert into potluck_claims (item_id, event_id, event_family_id, member_id, family_id, qty) values ($1, $2, $3, current_member_id(), current_family_id(), 1)", [pancit, party, A]);
  await check("A guest sees the list with counts, no names, and claims what is left but not more", async () => {
    const list = await anon("select * from guest_potluck($1)", [link]);
    const s = await claim("Tita Baby", pancit, 1);
    const more = await refused(() => claim("Tita Baby", pancit, 2), "Only 1 left");
    const row = (await db.query("select member_id, guest_id, member_name, household_name, family_id from potluck_claims where guest_id is not null")).rows[0];
    return (list.length === 1 && list[0].taken === 1 && Object.keys(list[0]).every((k) => !k.includes("name")) && s.claims[pancit] === 1 && more === true && row?.member_id === null && row.member_name === "Tita Baby" && row.household_name === "" && row.family_id === A) || { list, s, more, row };
  });
  await check("The household sees the guest's claim in her name; the item's wanted can't drop below it", async () => {
    const rows = await as(kid, "select member_name, guest_id from potluck_claims where item_id = $1 order by created_at", [pancit]);
    const r = await refused(() => as(ann, "update potluck_items set wanted = 1 where id = $1", [pancit]), "already claimed");
    return (rows.length === 2 && rows[1].member_name === "Tita Baby" && rows[1].guest_id !== null && r === true) || { rows, r };
  });
  await check("A guest adds a dish of her own and brings all of it; three at most; HTML in a dish is refused", async () => {
    const s = await dish("Tita Baby", "Leche  flan", 2);
    await dish("Tita Baby", "Buko salad", 1);
    await dish("Tita Baby", "Ube halaya", 1);
    const four = await refused(() => dish("Tita Baby", "Cassava cake", 1), "Three dishes");
    const html = await refused(() => dish("Tita Baby", "<img src=x>", 1), "Write what");
    const item = (await db.query("select label, wanted, guest_id, created_by from potluck_items where label = 'Leche flan'")).rows[0];
    return (s.dishes === 1 && four === true && html === true && item?.wanted === 2 && item.guest_id !== null && item.created_by === null) || { s, four, html, item };
  });
  await check("Nobody signed in writes a claim or a draw place as a guest", async () => {
    const g = (await db.query("select id from event_guests where name = 'Tita Baby'")).rows[0].id;
    const a = await refused(() => as(ann, "insert into potluck_claims (item_id, event_id, event_family_id, guest_id, family_id, qty) values ($1, $2, $3, $4, $3, 1)", [pancit, party, A, g]));
    const b = await refused(() => as(ann, "update event_guests set answer = 'no' where id = $1 returning id", [g]));
    const c = (await as(ann, "update event_guests set answer = 'no' where id = $1 returning id", [g]).catch(() => [])).length === 0;
    return (a === true && (b === true || c)) || { a, b, c };
  });
  await check("Another household and a stranger see no guest; the host household sees her", async () => {
    const mine = await as(kid, "select name, answer, headcount from event_guests where event_id = $1", [party]);
    const bens = await as(ben, "select name from event_guests where event_id = $1", [party]);
    const dans = await as(dan, "select name from event_guests where event_id = $1", [party]);
    return (mine.length === 1 && mine[0].name === "Tita Baby" && bens.length === 0 && dans.length === 0) || { mine, bens, dans };
  });

  // The draw.
  const draw = (await as(ann, `insert into gift_draws (family_id, title, exchange_date, created_by) values ($1, 'Pasko', ${today} + 60, $2) returning id`, [A, P("a1")]))[0].id;
  await check("Only the household's own draw can be attached, and only by a grown-up", async () => {
    const other = (await db.query(`insert into gift_draws (family_id, title, exchange_date) values ('b0000000-0000-0000-0000-000000000000', 'Theirs', ${today} + 60) returning id`)).rows[0].id;
    const a = await refused(() => as(ann, "select set_event_guest_link_draw($1, $2)", [party, other]), "not this household");
    const b = await refused(() => as(kid, "select set_event_guest_link_draw($1, $2)", [party, draw]), "grown-up");
    const c = await refused(() => joinDraw("Tita Baby", true), "no gift draw");
    await as(ann, "select set_event_guest_link_draw($1, $2)", [party, draw]);
    const e = (await event(link))[0];
    return (a === true && b === true && c === true && e.draw_id === draw && e.draw_title === "Pasko" && e.draw_open === true) || { a, b, c, e };
  });
  await check("Guests put themselves in, under the host household, and the household sees them by link", async () => {
    const s = await joinDraw("Tita Baby", true);
    await joinDraw("Kuya Jun", true);
    const rows = await as(kid, "select name, household_name, family_id, member_id, guest_id from gift_draw_people where draw_id = $1 order by created_at", [draw]);
    return (s.in_draw === true && rows.length === 2 && rows[0].name === "Tita Baby" && rows[0].household_name === "House A" && rows[0].family_id === A && rows[0].member_id === null && rows[0].guest_id !== null) || { s, rows };
  });
  await check("With Ann in, the draw runs over guests and members alike, and each guest reads only their own pick", async () => {
    await as(ann, "insert into gift_draw_people (draw_id, member_id, family_id, added_by) values ($1, $2, $3, $2)", [draw, P("a1"), A]);
    await as(ann, "insert into gift_draw_wishes (draw_id, person_id, body) select $1, id, 'Socks' from gift_draw_people where draw_id = $1 and member_id = $2", [draw, P("a1")]);
    const n = (await as(ann, "select draw_gift_draw($1) as n", [draw]))[0].n;
    const baby = await hello("Tita Baby");
    const jun = await hello("Kuya Jun");
    const names = [baby.pick?.name, jun.pick?.name];
    const annPick = (await as(ann, "select r.name from gift_draw_picks k join gift_draw_people g on g.id = k.giver_id join gift_draw_people r on r.id = k.receiver_id where k.draw_id = $1 and g.member_id = $2", [draw, P("a1")]))[0]?.name;
    const okNames = new Set([...names, annPick]).size === 3 && !names.includes(undefined);
    const wishesOk = [baby, jun].every((s) => (s.pick.name === "Ann A" ? s.pick.wishes.length === 1 : s.pick.wishes.length === 0));
    return (n === 3 && okNames && wishesOk) || { n, baby, jun, annPick };
  });
  await check("Once drawn, nobody joins or leaves, and the host cannot take a drawn guest off", async () => {
    const a = await refused(() => joinDraw("Ate Weng", true), "drawn already");
    const b = await refused(() => joinDraw("Kuya Jun", false), "drawn already");
    const gone = await as(ann, "delete from event_guests where name = 'Kuya Jun' returning id");
    return (a === true && b === true && gone.length === 0) || { a, b, gone };
  });
  await check("The host's grown-ups take a guest off (not a child); her claims go with her", async () => {
    await answer("Ate Weng", "going", 2);
    await claim("Ate Weng", pancit, 0);
    const byKid = await as(kid, "delete from event_guests where name = 'Ate Weng' returning id");
    const byAnn = await as(ann, "delete from event_guests where name = 'Ate Weng' returning id");
    const left = (await db.query("select count(*)::int as n from event_guests where name = 'Ate Weng'")).rows[0].n;
    return (byKid.length === 0 && byAnn.length === 1 && left === 0) || { byKid, byAnn, left };
  });

  await check("40 guests at most on one event", async () => {
    for (let i = 0; i < 38; i++) await answer(`Guest ${i}`, "going", 1);
    const n = (await db.query("select count(*)::int as n from event_guests where event_id = $1", [party])).rows[0].n;
    const r = await refused(() => answer("One Too Many", "going", 1), "full");
    const again = await answer("Guest 3", "maybe", 1);
    return (n === 40 && r === true && again.answer === "maybe") || { n, r, again };
  });

  await check("A new link replaces the old; turned off, the link answers with nothing and the guests stay", async () => {
    await as(ann, "select set_event_guest_link($1, $2)", [party, hash("h")]);
    const old = await event(link);
    const fresh = await event(hash("h"));
    const still = await hello("Tita Baby", hash("h"));
    await as(ann, "select clear_event_guest_link($1)", [party]);
    const off = await event(hash("h"));
    const guests = (await db.query("select count(*)::int as n from event_guests where event_id = $1", [party])).rows[0].n;
    const on = await as(ann, "select * from event_guest_link($1)", [party]);
    return (old.length === 0 && fresh.length === 1 && still?.answer === "going" && off.length === 0 && guests === 40 && on.length === 0) || { old, fresh, still, off, guests, on };
  });
  await check("After the event: viewing for seven days, no answering; then nothing", async () => {
    const soon = await ev(A, 2);
    await as(ann, "select set_event_guest_link($1, $2)", [soon, hash("s")]);
    await answer("Lolo Ben", "going", 3, hash("s"));
    await db.query(`update events set event_date = ${today} - 6 where id = $1`, [soon]);
    const e = (await event(hash("s")))[0];
    const closed = await refused(() => answer("Lolo Ben", "maybe", 1, hash("s")), "closed");
    const still = await hello("Lolo Ben", hash("s"));
    await db.query(`update events set event_date = ${today} - 8 where id = $1`, [soon]);
    const gone = await event(hash("s"));
    return (e?.open === false && e.coming === 3 && closed === true && still?.answer === "going" && gone.length === 0) || { e, closed, still, gone };
  });
}
