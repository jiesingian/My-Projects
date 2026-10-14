// Emergency access to the vault (20261014205000). House A names Ben (House B,
// linked and sharing) as its trusted person. Ben asks; A's grown-ups can deny,
// allow now or let the wait run out; once open Ben reads A's vault through
// the logged functions only, never writes, and sees nobody else's. Cat (House
// C, linked but not sharing), Dan (House D, a stranger), Kid (a child of A)
// and House E (linked, two more grown-ups) are the negative cases.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const D = "d0000000-0000-0000-0000-000000000000";
const E = "e0000000-0000-0000-0000-000000000000";
const SECRET = "pglite-cron-secret-0123456789abcdef0123456789";
const NOBODY = "99999999-9999-9999-9999-999999999999";

const WIFI = "a6000000-0000-0000-0000-000000000001";
const BANK = "a6000000-0000-0000-0000-000000000002";
const D_ITEM = "d6000000-0000-0000-0000-000000000001";
const FOLDER = "a7000000-0000-0000-0000-000000000001";
const PASSPORT = "a8000000-0000-0000-0000-000000000001";
const DEED = "a8000000-0000-0000-0000-000000000002";
const DIARY = "a8000000-0000-0000-0000-000000000003";
const D_DOC = "d8000000-0000-0000-0000-000000000001";
const PASSPORT_PDF = `${A}/docs/passport.pdf`;
const D_PDF = `${D}/docs/title.pdf`;

const realPlus = `create or replace function public.family_has_plus(p_family uuid) returns boolean language sql stable set search_path = public as $$
  select exists (select 1 from families f where f.id = p_family and f.access_status in ('trialing', 'comped', 'active', 'past_due')) $$`;

export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), ben = U("b1"), cat = U("c1"), dan = U("d1");
  const eve = U("e1"), eli = U("e2");

  await db.exec(`
    insert into families (id, name, share_with_relatives) values ('${E}', 'House E', true);
    insert into family_links (requester_family_id, addressee_family_id, status) values ('${A}', '${E}', 'accepted');
    insert into members (id, family_id, auth_user_id, full_name, role) values
      ('${P("e1")}', '${E}', '${eve}', 'Eve E', 'adult'),
      ('${P("e2")}', '${E}', '${eli}', 'Eli E', 'parent');
    insert into family_vault_items (id, family_id, group_name, label, username, secret, visibility) values
      ('${WIFI}', '${A}', 'Wi-Fi', 'Home Wi-Fi', 'SantosHome', 'wifi-pass', 'everyone'),
      ('${BANK}', '${A}', 'Bank', 'BDO online', 'ann', 'bank-pass', 'grown_ups'),
      ('${D_ITEM}', '${D}', 'Wi-Fi', 'Dan Wi-Fi', null, 'dan-pass', 'everyone');
    insert into doc_folders (id, family_id, name) values ('${FOLDER}', '${A}', 'IDs');
    insert into doc_entries (id, family_id, folder_id, owner_member_id, title, visibility) values
      ('${PASSPORT}', '${A}', '${FOLDER}', '${P("a2")}', 'Passport', 'family'),
      ('${DEED}', '${A}', '${FOLDER}', null, 'House deed', 'parents'),
      ('${DIARY}', '${A}', '${FOLDER}', '${P("a1")}', 'Ann private', 'private'),
      ('${D_DOC}', '${D}', null, null, 'Dan title', 'family');
    insert into doc_files (entry_id, family_id, file_name, storage_provider, storage_path, drive_file_id) values
      ('${PASSPORT}', '${A}', 'passport.pdf', 'supabase', '${PASSPORT_PDF}', null),
      ('${PASSPORT}', '${A}', 'passport-old.pdf', 'google_drive', null, 'drive-123'),
      ('${D_DOC}', '${D}', 'title.pdf', 'supabase', '${D_PDF}', null);
    insert into storage.objects (bucket_id, name) values ('documents', '${PASSPORT_PDF}'), ('documents', '${D_PDF}');
  `);

  const items = (who, req) => as(who, "select * from vault_emergency_items($1)", [req]);
  const open = (who, req, kind, id) => as(who, "select open_vault_emergency_item($1, $2, $3) as r", [req, kind, id]);
  const answer = (who, req, a) => as(who, "select answer_vault_emergency_request($1, $2) as r", [req, a]);
  const ask = async (who, family, reason = "Ann is in hospital and we need the insurance card") =>
    (await as(who, "select request_vault_emergency_access($1, $2) as id", [family, reason]))[0].id;
  const statusOf = async (who, id) => (await as(who, "select status from vault_emergency_request_list() where id = $1", [id]))[0]?.status;
  const sees = async (who, name) => (await as(who, "select 1 from storage.objects where bucket_id = 'documents' and name = $1", [name])).length === 1;
  const due = async (now = "now()") => (await db.query(`select * from due_vault_emergency_reminders('${SECRET}', ${now})`)).rows;

  // -- Naming ----------------------------------------------------------------
  await check("Ann's candidates are Ben, Eve and Eli: not Cat (not sharing), Dan (not linked), nor anyone in A", async () => {
    const names = (await as(ann, "select full_name from vault_emergency_candidates()")).map((r) => r.full_name).sort();
    return JSON.stringify(names) === JSON.stringify(["Ben B", "Eli E", "Eve E"]) || names;
  });
  await check("Kid gets no candidates and cannot name anyone", async () =>
    (await as(kid, "select 1 from vault_emergency_candidates()")).length === 0 &&
    (await refused(() => as(kid, "select name_vault_emergency_contact($1, 3)", [P("b1")]))) === true);
  await check("A stranger cannot name anyone", async () =>
    (await as(dan, "select 1 from vault_emergency_candidates() where member_id = $1", [P("b1")])).length === 0 &&
    (await refused(() => as(dan, "select name_vault_emergency_contact($1, 3)", [P("b1")]))) === true);
  await check("Ann cannot name Dan, Cat, herself, Abe or Kid", async () => {
    for (const m of ["d1", "c1", "a1", "a4", "a2"]) {
      if ((await refused(() => as(ann, "select name_vault_emergency_contact($1, 3)", [P(m)]), "cannot be named")) !== true) return m;
    }
    return true;
  });
  await check("Ben cannot name himself into his own household", async () =>
    refused(() => as(ben, "select name_vault_emergency_contact($1, 3)", [P("b1")]), "cannot be named"));
  await check("Only a wait of 1, 3 or 7 days", async () =>
    refused(() => as(ann, "select name_vault_emergency_contact($1, 2)", [P("b1")]), "1, 3 or 7"));
  await check("On Kin Free, naming is refused as a Plus feature", async () => {
    await db.exec(realPlus);
    await db.exec(`update families set access_status = 'expired' where id = '${A}'`);
    const r = await refused(() => as(ann, "select name_vault_emergency_contact($1, 3)", [P("b1")]), "kin_plus_required");
    await db.exec(`update families set access_status = 'trialing' where id = '${A}'`);
    return r;
  });
  await check("Nobody writes the list directly, not even Ann (forged row naming Dan)", async () =>
    refused(() => as(ann, `insert into vault_emergency_contacts (family_id, family_name, member_id, member_family_id, member_name, member_household_name)
      values ('${A}', 'House A', '${P("d1")}', '${D}', 'Dan D', 'House D')`)));

  let benContact;
  await check("Ann names Ben with a wait of 3 days; then Eve", async () => {
    benContact = (await as(ann, "select name_vault_emergency_contact($1) as id", [P("b1")]))[0].id;
    const r = await as(ann, "select wait_days from vault_emergency_contacts where id = $1", [benContact]);
    await as(ann, "select name_vault_emergency_contact($1, 1)", [P("e1")]);
    return r[0]?.wait_days === 3;
  });
  await check("Two at most: Eli is refused", async () =>
    refused(() => as(abe, "select name_vault_emergency_contact($1, 7)", [P("e2")]), "Two people at most"));
  await check("Kid cannot remove anyone; Ann can, and then Eli fits", async () => {
    const eveId = (await as(ann, "select id from vault_emergency_contacts where member_id = $1", [P("e1")]))[0].id;
    const kidRefused = (await refused(() => as(kid, "select remove_vault_emergency_contact($1)", [eveId]))) === true;
    await as(ann, "select remove_vault_emergency_contact($1)", [eveId]);
    await as(ann, "select name_vault_emergency_contact($1, 7)", [P("e2")]);
    return kidRefused && (await as(ann, "select 1 from vault_emergency_contacts")).length === 2;
  });
  await check("Abe sees the list; Kid and Dan see nothing; Ben sees only his own row", async () =>
    (await as(abe, "select 1 from vault_emergency_contacts")).length === 2 &&
    (await as(kid, "select 1 from vault_emergency_contacts")).length === 0 &&
    (await as(dan, "select 1 from vault_emergency_contacts")).length === 0 &&
    (await as(ben, "select member_name from vault_emergency_contacts")).map((r) => r.member_name).join() === "Ben B");

  // -- Asking ----------------------------------------------------------------
  await check("Before asking, Ben reads nothing of A's vault", async () =>
    (await as(ben, `select 1 from family_vault_items where family_id = '${A}'`)).length === 0 &&
    (await as(ben, `select 1 from doc_entries where family_id = '${A}'`)).length === 0 &&
    (await refused(() => items(ben, NOBODY), "not open")) === true &&
    !(await sees(ben, PASSPORT_PDF)));
  await check("Dan, Cat and Kid cannot ask for A; Ben cannot ask for D, which never named him", async () =>
    (await refused(() => ask(dan, A), "has not named you")) === true &&
    (await refused(() => ask(cat, A), "has not named you")) === true &&
    (await refused(() => ask(kid, A), "has not named you")) === true &&
    (await refused(() => ask(ben, D), "has not named you")) === true);
  await check("A reason is required", async () => refused(() => ask(ben, A, "  "), "few words"));

  const first = await ask(ben, A);
  await check("Ben asks; it is waiting, for him and for A's grown-ups", async () =>
    (await statusOf(ben, first)) === "waiting" && (await statusOf(ann, first)) === "waiting" && (await statusOf(abe, first)) === "waiting");
  await check("Kid, Dan and Cat see no request", async () =>
    (await as(kid, "select 1 from vault_emergency_request_list()")).length === 0 &&
    (await as(dan, "select 1 from vault_emergency_request_list()")).length === 0 &&
    (await as(cat, "select 1 from vault_emergency_requests")).length === 0);
  await check("A second request while one waits is refused", async () => refused(() => ask(ben, A), "already waiting"));
  await check("Before the wait ends Ben cannot list, open, or fetch a file", async () =>
    (await refused(() => items(ben, first), "not open")) === true &&
    (await refused(() => open(ben, first, "password", WIFI), "not open")) === true &&
    !(await sees(ben, PASSPORT_PDF)));

  await check("A's grown-ups are pushed at once (Ann has a device); Kid and Ben are not", async () => {
    const rows = await due();
    const asked = rows.filter((r) => r.key === `vault-emergency:${first}:asked`);
    return (asked.length === 1 && asked[0].member_id === P("a1") && /Ben B asks to open the vault/.test(asked[0].title)) || rows;
  });
  await check("The ledger sends it once; a wrong secret gets nothing", async () =>
    (await due()).length === 0 && (await db.query(`select * from due_vault_emergency_reminders('wrong', now())`)).rows.length === 0);
  await check("Tomorrow from 09:00 in the household's zone, one more a day", async () => {
    const tomorrow = `((date_trunc('day', now() at time zone 'Asia/Manila') + interval '1 day 9 hours 30 minutes') at time zone 'Asia/Manila')`;
    const rows = await due(tomorrow);
    const again = await due(tomorrow);
    return (rows.length === 1 && /:day:/.test(rows[0].key) && again.length === 0) || rows;
  });

  // -- Deny, allow --------------------------------------------------------------
  await check("Kid, Ben, Dan and Cat cannot answer it", async () =>
    (await refused(() => answer(kid, first, "allow"), "not yours")) === true &&
    (await refused(() => answer(ben, first, "allow"), "not yours")) === true &&
    (await refused(() => answer(dan, first, "deny"), "not yours")) === true &&
    (await refused(() => answer(cat, first, "allow"), "not yours")) === true);
  await check("Nobody changes a request directly, Ben included", async () =>
    (await refused(() => as(ben, `update vault_emergency_requests set allowed_at = now() where id = '${first}'`))) === true &&
    (await refused(() => as(ann, `delete from vault_emergency_requests where id = '${first}'`))) === true);
  await check("Ann denies: it is over, and Ben reads nothing", async () =>
    (await answer(ann, first, "deny"))[0].r === "denied" &&
    (await statusOf(ben, first)) === "denied" &&
    (await refused(() => items(ben, first), "not open")) === true);
  await check("A denied request cannot be allowed after all", async () => refused(() => answer(abe, first, "allow"), "no longer waiting"));
  await check("One request a day: Ben cannot ask again at once", async () => refused(() => ask(ben, A), "One request a day"));

  await db.exec(`update vault_emergency_requests set requested_at = now() - interval '2 days' where id = '${first}'`);
  const second = await ask(ben, A, "Kuya is abroad and Ate is in the ICU");
  await check("Abe allows now: open at once", async () =>
    (await answer(abe, second, "allow"))[0].r === "open" && (await statusOf(ben, second)) === "open");

  // -- Open: what Ben reads -----------------------------------------------------
  await check("Ben's list: both passwords and the Whole family and Parents only documents; not Ann's private one, nothing of D", async () => {
    const rows = await items(ben, second);
    const ids = rows.map((r) => r.id).sort();
    const want = [WIFI, BANK, PASSPORT, DEED].sort();
    const noSecrets = rows.every((r) => !("secret" in r) && !("username" in r));
    return (JSON.stringify(ids) === JSON.stringify(want) && noSecrets) || rows;
  });
  await check("Ben opens the bank password: he gets it, and it is logged for A's grown-ups", async () => {
    const r = (await open(ben, second, "password", BANK))[0].r;
    const log = await as(ann, "select member_name, item_label from vault_emergency_opens");
    return (r.secret === "bank-pass" && log.length === 1 && log[0].member_name === "Ben B" && log[0].item_label === "BDO online") || { r, log };
  });
  await check("The log is A's grown-ups' alone: not Kid, not Ben, not Dan", async () =>
    (await as(abe, "select 1 from vault_emergency_opens")).length === 1 &&
    (await as(kid, "select 1 from vault_emergency_opens")).length === 0 &&
    (await as(ben, "select 1 from vault_emergency_opens")).length === 0 &&
    (await as(dan, "select 1 from vault_emergency_opens")).length === 0);
  await check("Nobody writes or wipes the log", async () =>
    (await refused(() => as(ben, `insert into vault_emergency_opens (family_id, member_name, item_kind, item_id, item_label) values ('${A}', 'Ann A', 'password', '${WIFI}', 'x')`))) === true &&
    (await refused(() => as(ann, "delete from vault_emergency_opens"))) === true);
  await check("Ben cannot open Ann's private document, D's item, or with a forged request", async () =>
    (await refused(() => open(ben, second, "document", DIARY), "not there")) === true &&
    (await refused(() => open(ben, second, "password", D_ITEM), "not there")) === true &&
    (await refused(() => open(ben, second, "document", D_DOC), "not there")) === true &&
    (await refused(() => open(ben, NOBODY, "password", WIFI), "not open")) === true &&
    (await refused(() => open(ben, second, "secret", WIFI), "not there")) === true);
  await check("Dan and Kid cannot use Ben's open request", async () =>
    (await refused(() => items(dan, second), "not open")) === true &&
    (await refused(() => open(kid, second, "password", WIFI), "not open")) === true &&
    (await refused(() => items(ann, second), "not open")) === true);

  await check("The passport's file: not before Ben opens the entry, then yes; the Drive file has no path", async () => {
    const before = await sees(ben, PASSPORT_PDF);
    const r = (await open(ben, second, "document", PASSPORT))[0].r;
    const after = await sees(ben, PASSPORT_PDF);
    const drive = r.files.find((f) => f.provider === "google_drive");
    const label = (await as(ann, `select item_label from vault_emergency_opens where item_id = '${PASSPORT}'`))[0]?.item_label;
    return (!before && after && drive && drive.storagePath === null && label === "Passport (Kid)") || { before, after, r, label };
  });
  await check("The bucket stays A's otherwise: not A's chat photos, not D's documents", async () =>
    !(await sees(ben, `${A}/chat/room.jpg`)) && !(await sees(ben, D_PDF)) && !(await sees(dan, PASSPORT_PDF)));

  await check("Ben cannot write anything of A's", async () =>
    (await refused(() => as(ben, `insert into family_vault_items (family_id, label, secret) values ('${A}', 'Mine', 'x')`))) === true &&
    (await as(ben, `update family_vault_items set secret = 'changed' where id = '${WIFI}' returning id`)).length === 0 &&
    (await as(ben, `delete from family_vault_items where id = '${WIFI}' returning id`)).length === 0 &&
    (await as(ben, `update doc_entries set title = 'x' where id = '${PASSPORT}' returning id`)).length === 0 &&
    (await as(ben, `delete from doc_files where entry_id = '${PASSPORT}' returning id`)).length === 0 &&
    (await as(ben, `delete from storage.objects where name = '${PASSPORT_PDF}' returning id`)).length === 0 &&
    (await db.query(`select secret from family_vault_items where id = '${WIFI}'`)).rows[0].secret === "wifi-pass");

  await check("A's grown-ups are told when it opens", async () => {
    const rows = (await due()).filter((r) => r.key === `vault-emergency:${second}:open`);
    return (rows.length === 1 && rows[0].member_id === P("a1")) || rows;
  });

  await check("A drops to Kin Free: the open grant keeps working", async () => {
    await db.exec(`update families set access_status = 'expired' where id = '${A}'`);
    const ok = (await items(ben, second)).length === 4;
    await db.exec(`update families set access_status = 'trialing' where id = '${A}'`);
    return ok;
  });
  await check("If the households unlink, it stops", async () => {
    await db.exec(`update family_links set status = 'removed' where requester_family_id = '${A}' and addressee_family_id = 'b0000000-0000-0000-0000-000000000000'`);
    const stopped = (await refused(() => items(ben, second), "not open")) === true;
    await db.exec(`update family_links set status = 'accepted' where requester_family_id = '${A}' and addressee_family_id = 'b0000000-0000-0000-0000-000000000000'`);
    return stopped;
  });

  // -- Revoke, expiry, the wait running out ----------------------------------
  await check("Kid cannot revoke; Ann can, and then Ben reads nothing, files included", async () =>
    (await refused(() => answer(kid, second, "revoke"), "not yours")) === true &&
    (await answer(ann, second, "revoke"))[0].r === "revoked" &&
    (await statusOf(ben, second)) === "revoked" &&
    (await refused(() => items(ben, second), "not open")) === true &&
    !(await sees(ben, PASSPORT_PDF)));

  const insertRequest = async (requestedAgo) =>
    (await db.query(
      `insert into vault_emergency_requests (family_id, family_name, contact_id, member_id, member_name, member_household_name, reason, wait_days, requested_at)
       values ('${A}', 'House A', '${benContact}', '${P("b1")}', 'Ben B', 'House B', 'For the probe', 3, now() - interval '${requestedAgo}') returning id`,
    )).rows[0].id;
  await check("Nobody said no for three days: it opened by itself", async () => {
    const id = await insertRequest("3 days 1 hour");
    return (await statusOf(ben, id)) === "open" && (await items(ben, id)).length === 4;
  });
  await check("Thirty days after opening it has expired", async () => {
    const id = await insertRequest("34 days");
    return (await statusOf(ann, id)) === "expired" && (await refused(() => items(ben, id), "not open")) === true;
  });
  await check("Ann takes Ben off the list: his open grant ends and he can no longer ask", async () => {
    const live = (await as(ben, "select id from vault_emergency_request_list() where status = 'open'")).map((r) => r.id);
    await as(ann, "select remove_vault_emergency_contact($1)", [benContact]);
    for (const id of live) if ((await refused(() => items(ben, id), "not open")) !== true) return id;
    return (await refused(() => ask(ben, A), "has not named you")) === true && live.length === 1;
  });
  await check("Removing with a forged id is refused", async () =>
    refused(() => as(ann, "select remove_vault_emergency_contact($1)", [NOBODY]), "not yours"));

  // -- Review: more ways in -------------------------------------------------------
  // Bea is Ben's partner in House B, a grown-up with her own login.
  const bea = U("b2");
  await db.exec(`insert into members (id, family_id, auth_user_id, full_name, role) values ('${P("b2")}', 'b0000000-0000-0000-0000-000000000000', '${bea}', 'Bea B', 'adult')`);

  await check("Naming Ben again does not bring back what he had: every old request stays over", async () => {
    benContact = (await as(ann, "select name_vault_emergency_contact($1, 1) as id", [P("b1")]))[0].id;
    const live = await as(ben, "select id, status from vault_emergency_request_list() where status in ('waiting', 'open')");
    for (const id of [first, second]) if ((await refused(() => items(ben, id), "not open")) !== true) return id;
    return live.length === 0 || live;
  });

  const third = await ask(ben, A, "Tito's insurance card, he is in the ER");
  const at = async (id, when) =>
    (await db.query(`select vault_emergency_status(r, ${when}) as s from vault_emergency_requests r where id = $1`, [id])).rows[0].s;
  await check("To the second: waiting until the wait ends, open until thirty days later, then expired", async () => {
    const got = [
      await at(third, "r.requested_at + interval '1 day' - interval '1 second'"),
      await at(third, "r.requested_at + interval '1 day'"),
      await at(third, "r.requested_at + interval '31 days' - interval '1 second'"),
      await at(third, "r.requested_at + interval '31 days'"),
    ];
    return got.join() === "waiting,open,open,expired" || got;
  });

  await check("Bea, Ben's partner, cannot see or use his request, nor ask in his place", async () =>
    (await as(bea, "select 1 from vault_emergency_request_list()")).length === 0 &&
    (await as(bea, "select 1 from vault_emergency_contacts")).length === 0 &&
    (await refused(() => items(bea, third), "not open")) === true &&
    (await refused(() => ask(bea, A), "has not named you")) === true);
  await check("Eli, A's other trusted person, cannot see or use Ben's request", async () =>
    (await as(eli, "select 1 from vault_emergency_request_list()")).length === 0 &&
    (await as(eli, "select member_name from vault_emergency_contacts")).map((r) => r.member_name).join() === "Eli E" &&
    (await refused(() => answer(eli, third, "allow"), "not yours")) === true);

  await check("The helpers behind the checks cannot be called directly, and the file check says no to D", async () =>
    (await refused(() => as(ben, "select vault_emergency_granted_family($1)", [third]))) === true &&
    (await refused(() => as(ben, "select * from vault_emergency_grownup_of($1)", [A]))) === true &&
    (await as(ben, "select vault_emergency_can_read_object($1) as ok", [D_PDF]))[0].ok === false &&
    (await as(ben, `select * from due_vault_emergency_reminders('wrong', now())`)).length === 0);

  await check("Signed out, nothing works and nothing shows", async () => {
    const anon = async (sql, params = []) => {
      await db.exec("reset role");
      await db.exec("set role anon");
      try {
        return (await db.query(sql, params)).rows;
      } finally {
        await db.exec("reset role");
      }
    };
    return (
      (await refused(() => anon("select request_vault_emergency_access($1, 'let me in please')", [A]))) === true &&
      (await refused(() => anon("select name_vault_emergency_contact($1, 3)", [P("b1")]))) === true &&
      (await refused(() => anon("select * from vault_emergency_items($1)", [third]))) === true &&
      (await refused(() => anon("select open_vault_emergency_item($1, 'password', $2)", [third, WIFI]))) === true &&
      (await refused(() => anon("select answer_vault_emergency_request($1, 'allow')", [third]))) === true &&
      (await anon("select 1 from vault_emergency_requests")).length === 0 &&
      (await anon("select 1 from vault_emergency_opens")).length === 0
    );
  });

  // The household's zone, not Manila's: the daily push waits for 09:00 there.
  // The wait is stretched to 7 days here so "tomorrow" is still inside it.
  await check("A household in Los Angeles is pushed each day from 09:00 Los Angeles time, not Manila's", async () => {
    await db.exec(`update families set time_zone = 'America/Los_Angeles' where id = '${A}'; update vault_emergency_requests set wait_days = 7 where id = '${third}'`);
    await due(); // the "asked" push for the third request
    const la = (hm) => `((date_trunc('day', now() at time zone 'America/Los_Angeles') + interval '1 day ${hm}') at time zone 'America/Los_Angeles')`;
    const early = (await due(la("8 hours 50 minutes"))).filter((r) => r.key.startsWith(`vault-emergency:${third}:day:`));
    const nine = (await due(la("9 hours 5 minutes"))).filter((r) => r.key.startsWith(`vault-emergency:${third}:day:`));
    await db.exec(`update families set time_zone = 'Asia/Manila' where id = '${A}'`);
    return (early.length === 0 && nine.length === 1) || { early, nine };
  });

  await check("Ann allows Ben's third request now", async () => (await answer(ann, third, "allow"))[0].r === "open");
  await check("Ben leaves House B: the grant stops while he is not an active member", async () => {
    await db.exec(`update members set status = 'removed' where id = '${P("b1")}'`);
    const stopped = (await refused(() => items(ben, third), "not open")) === true;
    await db.exec(`update members set status = 'active' where id = '${P("b1")}'`);
    return stopped && (await items(ben, third)).length === 4;
  });
  await check("Ben made a child in his own house: the grant stops", async () => {
    await db.exec(`update members set role = 'child_self' where id = '${P("b1")}'`);
    const stopped = (await refused(() => items(ben, third), "not open")) === true;
    await db.exec(`update members set role = 'parent' where id = '${P("b1")}'`);
    return stopped;
  });

  await check("A file read lasts an hour after its entry was opened, then needs a new (logged) open", async () => {
    await open(ben, third, "document", PASSPORT);
    const fresh = await sees(ben, PASSPORT_PDF);
    await db.exec(`update vault_emergency_opens set opened_at = now() - interval '61 minutes' where request_id = '${third}'`);
    const stale = await sees(ben, PASSPORT_PDF);
    return (fresh && !stale) || { fresh, stale };
  });
  await check("Opening an entry of A does not open a file indexed under another of A's entries", async () => {
    await db.exec(`insert into doc_files (entry_id, family_id, file_name, storage_provider, storage_path) values ('${DEED}', '${A}', 'deed.pdf', 'supabase', '${A}/docs/deed.pdf');
      insert into storage.objects (bucket_id, name) values ('documents', '${A}/docs/deed.pdf')`);
    await open(ben, third, "document", PASSPORT);
    const deedBefore = await sees(ben, `${A}/docs/deed.pdf`);
    await open(ben, third, "document", DEED);
    return (!deedBefore && (await sees(ben, `${A}/docs/deed.pdf`))) || { deedBefore };
  });
  await check("Bea reads none of A's documents through Ben's grant", async () =>
    !(await sees(bea, PASSPORT_PDF)) && !(await sees(bea, `${A}/docs/deed.pdf`)));
  await check("Each opening is logged, under Ben's name, never Bea's or anyone typed", async () => {
    const log = await as(ann, `select distinct member_name from vault_emergency_opens where request_id = '${third}'`);
    return log.map((r) => r.member_name).join() === "Ben B" || log;
  });

  await check("Eli asks, then A takes him off the list: Allow now is refused and he reads nothing", async () => {
    const eliReq = await ask(eli, A, "Lola needs her senior citizen ID");
    const eliContact = (await as(ann, "select id from vault_emergency_contacts where member_id = $1", [P("e2")]))[0].id;
    await as(abe, "select remove_vault_emergency_contact($1)", [eliContact]);
    return (
      (await statusOf(ann, eliReq)) === "revoked" &&
      (await refused(() => answer(ann, eliReq, "allow"), "no longer waiting")) === true &&
      (await refused(() => items(eli, eliReq), "not open")) === true
    );
  });
}
