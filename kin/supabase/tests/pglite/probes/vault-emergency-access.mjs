// Emergency access to the vault (20261015120000, within the household since
// 20261020170000). Ann, the parent of House A -- the one person who reads its
// "Parents only" documents -- names Abe, an adult of the same house, as its
// trusted person. Abe asks; A's other grown-ups can deny, allow now or let the
// wait run out; once open Abe reads A's vault through the logged functions
// only, with a parents-only document only when Ann marked it "Share in an
// emergency", and never writes. Ben (House B, linked and sharing, who could be
// named before), Cat (House C), Dan (House D, a stranger), Kid (a child of A)
// and Ada (A's other adult) are the negative cases.
import fs from "node:fs";
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";
const D = "d0000000-0000-0000-0000-000000000000";
const SECRET = "pglite-cron-secret-0123456789abcdef0123456789";
const NOBODY = "99999999-9999-9999-9999-999999999999";

const WIFI = "a6000000-0000-0000-0000-000000000001";
const BANK = "a6000000-0000-0000-0000-000000000002";
const D_ITEM = "d6000000-0000-0000-0000-000000000001";
const FOLDER = "a7000000-0000-0000-0000-000000000001";
const PASSPORT = "a8000000-0000-0000-0000-000000000001";
const DEED = "a8000000-0000-0000-0000-000000000002";
const DIARY = "a8000000-0000-0000-0000-000000000003";
const WILL = "a8000000-0000-0000-0000-000000000004";
const D_DOC = "d8000000-0000-0000-0000-000000000001";
const PASSPORT_PDF = `${A}/docs/passport.pdf`;
const DEED_PDF = `${A}/docs/deed.pdf`;
const D_PDF = `${D}/docs/title.pdf`;

const realPlus = `create or replace function public.family_has_plus(p_family uuid) returns boolean language sql stable set search_path = public as $$
  select exists (select 1 from families f where f.id = p_family and f.access_status in ('trialing', 'comped', 'active', 'past_due')) $$`;
const MIGRATION = fs.readFileSync(new URL("../../../migrations/20261020170000_vault_emergency_same_household.sql", import.meta.url), "utf8");

export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), ada = U("a5"), ben = U("b1"), cat = U("c1"), dan = U("d1");

  await db.exec(`
    insert into members (id, family_id, auth_user_id, full_name, role) values ('${P("a5")}', '${A}', '${ada}', 'Ada A', 'adult');
    insert into push_subscriptions (member_id, family_id, endpoint, p256dh, auth) values
      ('${P("a4")}', '${A}', 'https://push/Abe A', 'k', 'a'),
      ('${P("a5")}', '${A}', 'https://push/Ada A', 'k', 'a');
    -- The documents' own visibility (pre-pipeline), in place of base.sql's
    -- stand-in: a parents-only document is the parent's alone, a private one
    -- its keeper's. Edits follow the same rule.
    drop policy if exists de_all on doc_entries;
    create policy de_select on doc_entries for select using (
      family_id = current_family_id()
      and (visibility = 'family' or (visibility = 'parents' and current_member_role() = 'parent')
           or (visibility = 'private' and owner_member_id = current_member_id())));
    create policy de_update on doc_entries for update using (
      family_id = current_family_id()
      and (visibility = 'family' or (visibility = 'parents' and current_member_role() = 'parent')
           or (visibility = 'private' and owner_member_id = current_member_id())))
      with check (family_id = current_family_id());
    insert into family_vault_items (id, family_id, group_name, label, username, secret, visibility) values
      ('${WIFI}', '${A}', 'Wi-Fi', 'Home Wi-Fi', 'SantosHome', 'wifi-pass', 'everyone'),
      ('${BANK}', '${A}', 'Bank', 'BDO online', 'ann', 'bank-pass', 'grown_ups'),
      ('${D_ITEM}', '${D}', 'Wi-Fi', 'Dan Wi-Fi', null, 'dan-pass', 'everyone');
    insert into doc_folders (id, family_id, name) values ('${FOLDER}', '${A}', 'IDs');
    insert into doc_entries (id, family_id, folder_id, owner_member_id, title, visibility) values
      ('${PASSPORT}', '${A}', '${FOLDER}', '${P("a2")}', 'Passport', 'family'),
      ('${DEED}', '${A}', '${FOLDER}', null, 'House deed', 'parents'),
      ('${WILL}', '${A}', '${FOLDER}', null, 'Will', 'parents'),
      ('${DIARY}', '${A}', '${FOLDER}', '${P("a1")}', 'Ann private', 'private'),
      ('${D_DOC}', '${D}', null, null, 'Dan title', 'family');
    insert into doc_files (entry_id, family_id, file_name, storage_provider, storage_path, drive_file_id) values
      ('${PASSPORT}', '${A}', 'passport.pdf', 'supabase', '${PASSPORT_PDF}', null),
      ('${PASSPORT}', '${A}', 'passport-old.pdf', 'google_drive', null, 'drive-123'),
      ('${DEED}', '${A}', 'deed.pdf', 'supabase', '${DEED_PDF}', null),
      ('${D_DOC}', '${D}', 'title.pdf', 'supabase', '${D_PDF}', null);
    insert into storage.objects (bucket_id, name) values ('documents', '${PASSPORT_PDF}'), ('documents', '${DEED_PDF}'), ('documents', '${D_PDF}');
  `);

  const items = (who, req) => as(who, "select * from vault_emergency_items($1)", [req]);
  const open = (who, req, kind, id) => as(who, "select open_vault_emergency_item($1, $2, $3) as r", [req, kind, id]);
  const answer = (who, req, a) => as(who, "select answer_vault_emergency_request($1, $2) as r", [req, a]);
  const ask = async (who, family, reason = "Ann is in hospital and we need the insurance card") =>
    (await as(who, "select request_vault_emergency_access($1, $2) as id", [family, reason]))[0].id;
  const statusOf = async (who, id) => (await as(who, "select status from vault_emergency_request_list() where id = $1", [id]))[0]?.status;
  const canRead = async (who, name) => (await as(who, "select vault_emergency_can_read_object($1) as ok", [name]))[0].ok;
  const sees = async (who, name) => (await as(who, "select 1 from storage.objects where bucket_id = 'documents' and name = $1", [name])).length === 1;
  const due = async (now = "now()") => {
    await db.exec("reset role");
    return (await db.query(`select * from due_vault_emergency_reminders('${SECRET}', ${now})`)).rows;
  };

  // -- Share in an emergency, per document -------------------------------------------
  await check("Off to begin with, on every document", async () =>
    (await db.query("select count(*)::int as n from doc_entries where share_in_emergency")).rows[0].n === 0);
  await check("Ann, the parent, marks the deed; Abe (adult) and Kid cannot touch a parents-only document, and Kid cannot mark a family one", async () => {
    await as(ann, "update doc_entries set share_in_emergency = true where id = $1", [DEED]);
    const abeRows = (await as(abe, "update doc_entries set share_in_emergency = true where id = $1 returning id", [WILL])).length;
    const kidRows = (await as(kid, "update doc_entries set share_in_emergency = true where id = $1 returning id", [WILL])).length;
    const kidFamily = await refused(() => as(kid, "update doc_entries set share_in_emergency = true where id = $1 returning id", [PASSPORT]), "grown-up");
    const flags = (await db.query("select id, share_in_emergency from doc_entries where family_id = $1 order by title", [A])).rows;
    return (abeRows === 0 && kidRows === 0 && kidFamily === true && flags.filter((f) => f.share_in_emergency).map((f) => f.id).join() === DEED) || { abeRows, kidRows, kidFamily, flags };
  });

  // -- Naming ----------------------------------------------------------------
  await check("Ann's candidates are Abe and Ada, the household's other grown-ups with a login: not Ben, Cat, Dan, Kid, Baby or herself", async () => {
    const names = (await as(ann, "select full_name, household_name from vault_emergency_candidates()")).map((r) => `${r.full_name}@${r.household_name}`).sort();
    return JSON.stringify(names) === JSON.stringify(["Abe A@House A", "Ada A@House A"]) || names;
  });
  await check("Abe's candidates are Ann and Ada", async () => {
    const names = (await as(abe, "select full_name from vault_emergency_candidates()")).map((r) => r.full_name).sort();
    return JSON.stringify(names) === JSON.stringify(["Ada A", "Ann A"]) || names;
  });
  await check("Kid gets no candidates and cannot name anyone", async () =>
    (await as(kid, "select 1 from vault_emergency_candidates()")).length === 0 &&
    (await refused(() => as(kid, "select name_vault_emergency_contact($1, 3)", [P("a4")]))) === true);
  await check("A stranger cannot name anyone of A", async () =>
    (await as(dan, "select 1 from vault_emergency_candidates() where member_id = $1", [P("a4")])).length === 0 &&
    (await refused(() => as(dan, "select name_vault_emergency_contact($1, 3)", [P("a4")]))) === true);
  await check("Ann cannot name Ben (linked household), Cat, Dan, herself or Kid", async () => {
    for (const m of ["b1", "c1", "d1", "a1", "a2"]) {
      if ((await refused(() => as(ann, "select name_vault_emergency_contact($1, 3)", [P(m)]), "cannot be named")) !== true) return m;
    }
    return true;
  });
  await check("Only a wait of 1, 3 or 7 days", async () =>
    refused(() => as(ann, "select name_vault_emergency_contact($1, 2)", [P("a4")]), "1, 3 or 7"));
  await check("On Kin Free, naming is refused as a Plus feature", async () => {
    await db.exec(realPlus);
    await db.exec(`update families set access_status = 'expired' where id = '${A}'`);
    const r = await refused(() => as(ann, "select name_vault_emergency_contact($1, 3)", [P("a4")]), "kin_plus_required");
    await db.exec(`update families set access_status = 'trialing' where id = '${A}'`);
    return r;
  });
  await check("Nobody writes the list directly, not even Ann; and a row naming another household is refused by the table itself", async () =>
    (await refused(() => as(ann, `insert into vault_emergency_contacts (family_id, family_name, member_id, member_family_id, member_name, member_household_name)
      values ('${A}', 'House A', '${P("a4")}', '${A}', 'Abe A', 'House A')`))) === true &&
    (await refused(() => db.query(`insert into vault_emergency_contacts (family_id, family_name, member_id, member_family_id, member_name, member_household_name)
      values ('${A}', 'House A', '${P("b1")}', '${B}', 'Ben B', 'House B')`), "same_household")) === true);

  let abeContact;
  await check("Ann names Abe with a wait of 3 days, in her own household; then Ada", async () => {
    abeContact = (await as(ann, "select name_vault_emergency_contact($1) as id", [P("a4")]))[0].id;
    const r = await as(ann, "select wait_days, member_family_id, member_household_name from vault_emergency_contacts where id = $1", [abeContact]);
    await as(ann, "select name_vault_emergency_contact($1, 1)", [P("a5")]);
    return (r[0]?.wait_days === 3 && r[0].member_family_id === A && r[0].member_household_name === "House A") || r;
  });
  await check("Two at most: with Abe and Ada named, Ada cannot add Ann", async () =>
    refused(() => as(ada, "select name_vault_emergency_contact($1, 7)", [P("a1")]), "Two people at most"));
  await check("Kid cannot remove anyone; Ann can", async () => {
    const adaId = (await as(ann, "select id from vault_emergency_contacts where member_id = $1", [P("a5")]))[0].id;
    const kidRefused = (await refused(() => as(kid, "select remove_vault_emergency_contact($1)", [adaId]))) === true;
    await as(ann, "select remove_vault_emergency_contact($1)", [adaId]);
    return kidRefused && (await as(ann, "select 1 from vault_emergency_contacts")).length === 1;
  });
  await check("Ann, Abe and Ada see the list; Kid, Ben and Dan see nothing", async () =>
    (await as(abe, "select 1 from vault_emergency_contacts")).length === 1 &&
    (await as(ada, "select 1 from vault_emergency_contacts")).length === 1 &&
    (await as(kid, "select 1 from vault_emergency_contacts")).length === 0 &&
    (await as(ben, "select 1 from vault_emergency_contacts")).length === 0 &&
    (await as(dan, "select 1 from vault_emergency_contacts")).length === 0);

  // -- Asking ----------------------------------------------------------------
  await check("Before asking, Abe reads no parents-only document and cannot use the functions", async () =>
    (await as(abe, `select 1 from doc_entries where family_id = '${A}' and visibility = 'parents'`)).length === 0 &&
    (await refused(() => items(abe, NOBODY), "not open")) === true &&
    (await canRead(abe, DEED_PDF)) === false);
  await check("Ben, Dan, Cat, Kid and Ada cannot ask for A; Abe cannot ask for D, which never named him", async () => {
    for (const who of [ben, dan, cat, kid, ada]) {
      if ((await refused(() => ask(who, A), "has not named you")) !== true) return who;
    }
    return (await refused(() => ask(abe, D), "has not named you")) === true;
  });
  await check("A reason is required", async () => refused(() => ask(abe, A, "  "), "few words"));

  const first = await ask(abe, A);
  await check("Abe asks; it is waiting, for him and for A's grown-ups", async () =>
    (await statusOf(abe, first)) === "waiting" && (await statusOf(ann, first)) === "waiting" && (await statusOf(ada, first)) === "waiting");
  await check("It is his, not Ann's", async () =>
    (await as(abe, "select mine from vault_emergency_request_list() where id = $1", [first]))[0].mine === true &&
    (await as(ann, "select mine from vault_emergency_request_list() where id = $1", [first]))[0].mine === false);
  await check("Kid, Dan, Ben and Cat see no request", async () =>
    (await as(kid, "select 1 from vault_emergency_request_list()")).length === 0 &&
    (await as(dan, "select 1 from vault_emergency_request_list()")).length === 0 &&
    (await as(ben, "select 1 from vault_emergency_request_list()")).length === 0 &&
    (await as(cat, "select 1 from vault_emergency_requests")).length === 0);
  await check("A second request while one waits is refused", async () => refused(() => ask(abe, A), "already waiting"));
  await check("Before the wait ends Abe cannot list or open", async () =>
    (await refused(() => items(abe, first), "not open")) === true &&
    (await refused(() => open(abe, first, "password", WIFI), "not open")) === true &&
    (await canRead(abe, DEED_PDF)) === false);

  await check("A's other grown-ups are pushed at once (Ann and Ada); not Abe, who asked, and not Kid", async () => {
    const rows = await due();
    const asked = rows.filter((r) => r.key === `vault-emergency:${first}:asked`);
    const who = asked.map((r) => r.member_id).sort().join();
    return (who === [P("a1"), P("a5")].sort().join() && /Abe A asks to open the vault/.test(asked[0].title)) || rows;
  });
  await check("The ledger sends it once; a wrong secret gets nothing", async () =>
    (await due()).length === 0 && (await db.query(`select * from due_vault_emergency_reminders('wrong', now())`)).rows.length === 0);
  await check("Tomorrow from 09:00 in the household's zone, one more a day, again not to Abe", async () => {
    const tomorrow = `((date_trunc('day', now() at time zone 'Asia/Manila') + interval '1 day 9 hours 30 minutes') at time zone 'Asia/Manila')`;
    const rows = await due(tomorrow);
    const again = await due(tomorrow);
    return (rows.length === 2 && rows.every((r) => /:day:/.test(r.key) && r.member_id !== P("a4")) && again.length === 0) || rows;
  });

  // -- Deny, allow --------------------------------------------------------------
  await check("Abe cannot answer his own request; nor can Kid, Ben, Dan or Cat", async () =>
    (await refused(() => answer(abe, first, "allow"), "not yours")) === true &&
    (await refused(() => answer(kid, first, "allow"), "not yours")) === true &&
    (await refused(() => answer(ben, first, "allow"), "not yours")) === true &&
    (await refused(() => answer(dan, first, "deny"), "not yours")) === true &&
    (await refused(() => answer(cat, first, "allow"), "not yours")) === true);
  await check("Nobody changes a request directly, Abe included", async () =>
    (await refused(() => as(abe, `update vault_emergency_requests set allowed_at = now() where id = '${first}'`))) === true &&
    (await refused(() => as(ann, `delete from vault_emergency_requests where id = '${first}'`))) === true);
  await check("Ada denies: it is over, and Abe reads nothing", async () =>
    (await answer(ada, first, "deny"))[0].r === "denied" &&
    (await statusOf(abe, first)) === "denied" &&
    (await refused(() => items(abe, first), "not open")) === true);
  await check("A denied request cannot be allowed after all", async () => refused(() => answer(ann, first, "allow"), "no longer waiting"));
  await check("One request a day: Abe cannot ask again at once", async () => refused(() => ask(abe, A), "One request a day"));

  await db.exec(`update vault_emergency_requests set requested_at = now() - interval '2 days' where id = '${first}'`);
  const second = await ask(abe, A, "Ann is in the ICU and we need the house papers");
  await check("Ann allows now: open at once", async () =>
    (await answer(ann, second, "allow"))[0].r === "open" && (await statusOf(abe, second)) === "open");

  // -- Open: what Abe reads -----------------------------------------------------
  await check("Abe's list: both passwords, the Whole family passport and the deed marked to share; not the will, not Ann's private one, nothing of D", async () => {
    const rows = await items(abe, second);
    const ids = rows.map((r) => r.id).sort();
    const want = [WIFI, BANK, PASSPORT, DEED].sort();
    const noSecrets = rows.every((r) => !("secret" in r) && !("username" in r));
    return (JSON.stringify(ids) === JSON.stringify(want) && noSecrets) || rows;
  });
  await check("Ann marks the will too: it joins the list; unmarks it: it leaves", async () => {
    await as(ann, "update doc_entries set share_in_emergency = true where id = $1", [WILL]);
    const withWill = (await items(abe, second)).some((r) => r.id === WILL);
    await as(ann, "update doc_entries set share_in_emergency = false where id = $1", [WILL]);
    const without = (await items(abe, second)).some((r) => r.id === WILL);
    return (withWill && !without) || { withWill, without };
  });
  await check("Abe opens the bank password: he gets it, and it is logged for A's grown-ups", async () => {
    const r = (await open(abe, second, "password", BANK))[0].r;
    const log = await as(ann, "select member_name, item_label from vault_emergency_opens");
    return (r.secret === "bank-pass" && log.length === 1 && log[0].member_name === "Abe A" && log[0].item_label === "BDO online") || { r, log };
  });
  await check("Nobody writes or wipes the log", async () =>
    (await refused(() => as(abe, `insert into vault_emergency_opens (family_id, member_name, item_kind, item_id, item_label) values ('${A}', 'Ann A', 'password', '${WIFI}', 'x')`))) === true &&
    (await refused(() => as(ann, "delete from vault_emergency_opens"))) === true);
  await check("Abe cannot open the will, Ann's private document, D's item, or with a forged request", async () =>
    (await refused(() => open(abe, second, "document", WILL), "not there")) === true &&
    (await refused(() => open(abe, second, "document", DIARY), "not there")) === true &&
    (await refused(() => open(abe, second, "password", D_ITEM), "not there")) === true &&
    (await refused(() => open(abe, second, "document", D_DOC), "not there")) === true &&
    (await refused(() => open(abe, NOBODY, "password", WIFI), "not open")) === true &&
    (await refused(() => open(abe, second, "secret", WIFI), "not there")) === true);
  await check("Ada, Dan and Kid cannot use Abe's open request; nor can Ann, who allowed it", async () =>
    (await refused(() => items(ada, second), "not open")) === true &&
    (await refused(() => items(dan, second), "not open")) === true &&
    (await refused(() => open(kid, second, "password", WIFI), "not open")) === true &&
    (await refused(() => items(ann, second), "not open")) === true);

  await check("The deed's file: the window opens only once Abe opens the entry, and the will's never does", async () => {
    const before = await canRead(abe, DEED_PDF);
    const r = (await open(abe, second, "document", DEED))[0].r;
    const after = await canRead(abe, DEED_PDF);
    const label = (await as(ann, `select item_label from vault_emergency_opens where item_id = '${DEED}'`))[0]?.item_label;
    return (!before && after && r.files.length === 1 && label === "House deed") || { before, after, r, label };
  });
  await check("The passport's Drive file has no path; its Kin file opens with the entry", async () => {
    const r = (await open(abe, second, "document", PASSPORT))[0].r;
    const drive = r.files.find((f) => f.provider === "google_drive");
    return (drive && drive.storagePath === null && (await canRead(abe, PASSPORT_PDF)) === true) || r;
  });
  await check("The bucket's window is Abe's alone: not Ada's, not Dan's; and not for D's documents", async () =>
    (await canRead(ada, DEED_PDF)) === false && (await canRead(dan, DEED_PDF)) === false && (await canRead(abe, D_PDF)) === false && !(await sees(dan, PASSPORT_PDF)));

  // Abe is a member here, so the vault's own policies decide what he edits
  // (base.sql's stand-ins are looser than production's); what the grant
  // adds is read-only, and a parents-only document stays beyond his edits.
  await check("The grant writes nothing: a parents-only document opened to Abe is still not his to edit", async () =>
    (await as(abe, `update doc_entries set title = 'x' where id = '${DEED}' returning id`)).length === 0 &&
    (await as(abe, `update doc_entries set share_in_emergency = false where id = '${DEED}' returning id`)).length === 0 &&
    (await db.query(`select title, share_in_emergency from doc_entries where id = '${DEED}'`)).rows[0].title === "House deed" &&
    (await refused(() => as(ben, `insert into family_vault_items (family_id, label, secret) values ('${A}', 'Mine', 'x')`))) === true);

  await check("A's other grown-ups are told when it opens, and Abe gets his own line", async () => {
    const rows = (await due()).filter((r) => r.key.startsWith(`vault-emergency:${second}:open`));
    const others = rows.filter((r) => r.key.endsWith(":open")).map((r) => r.member_id).sort().join();
    const mine = rows.filter((r) => r.key.endsWith(":open:asker"));
    return (others === [P("a1"), P("a5")].sort().join() && mine.length === 1 && mine[0].member_id === P("a4") && /open to you/.test(mine[0].title)) || rows;
  });

  await check("A drops to Kin Free: the open grant keeps working", async () => {
    await db.exec(`update families set access_status = 'expired' where id = '${A}'`);
    const ok = (await items(abe, second)).length === 4;
    await db.exec(`update families set access_status = 'trialing' where id = '${A}'`);
    return ok;
  });

  // -- Revoke, expiry, the wait running out ----------------------------------
  await check("Kid cannot revoke; Ada can, and then Abe reads nothing, files included", async () =>
    (await refused(() => answer(kid, second, "revoke"), "not yours")) === true &&
    (await answer(ada, second, "revoke"))[0].r === "revoked" &&
    (await statusOf(abe, second)) === "revoked" &&
    (await refused(() => items(abe, second), "not open")) === true &&
    (await canRead(abe, DEED_PDF)) === false);

  const insertRequest = async (requestedAgo) =>
    (await db.query(
      `insert into vault_emergency_requests (family_id, family_name, contact_id, member_id, member_name, member_household_name, reason, wait_days, requested_at)
       values ('${A}', 'House A', '${abeContact}', '${P("a4")}', 'Abe A', 'House A', 'For the probe', 3, now() - interval '${requestedAgo}') returning id`,
    )).rows[0].id;
  await check("Nobody said no for three days: it opened by itself", async () => {
    const id = await insertRequest("3 days 1 hour");
    return (await statusOf(abe, id)) === "open" && (await items(abe, id)).length === 4;
  });
  await check("Thirty days after opening it has expired", async () => {
    const id = await insertRequest("34 days");
    return (await statusOf(ann, id)) === "expired" && (await refused(() => items(abe, id), "not open")) === true;
  });
  await check("Ann takes Abe off the list: his open grant ends and he can no longer ask", async () => {
    const live = (await as(abe, "select id from vault_emergency_request_list() where status = 'open'")).map((r) => r.id);
    await as(ann, "select remove_vault_emergency_contact($1)", [abeContact]);
    for (const id of live) if ((await refused(() => items(abe, id), "not open")) !== true) return id;
    return (await refused(() => ask(abe, A), "has not named you")) === true && live.length === 1;
  });
  await check("Removing with a forged id is refused", async () =>
    refused(() => as(ann, "select remove_vault_emergency_contact($1)", [NOBODY]), "not yours"));

  // -- Review: more ways in -------------------------------------------------------
  await check("Naming Abe again does not bring back what he had: every old request stays over", async () => {
    abeContact = (await as(ann, "select name_vault_emergency_contact($1, 1) as id", [P("a4")]))[0].id;
    const live = await as(abe, "select id, status from vault_emergency_request_list() where status in ('waiting', 'open')");
    for (const id of [first, second]) if ((await refused(() => items(abe, id), "not open")) !== true) return id;
    return live.length === 0 || live;
  });

  const third = await ask(abe, A, "Ann's insurance card, she is in the ER");
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

  await check("Ada, a grown-up here but not the one named, sees the request yet cannot use it or ask in his place", async () =>
    (await as(ada, "select mine from vault_emergency_request_list() where id = $1", [third]))[0].mine === false &&
    (await refused(() => items(ada, third), "not open")) === true &&
    (await refused(() => ask(ada, A), "has not named you")) === true);

  await check("The helpers behind the checks cannot be called directly, and the file check says no to D", async () =>
    (await refused(() => as(abe, "select vault_emergency_granted_family($1)", [third]))) === true &&
    (await refused(() => as(abe, "select * from vault_emergency_grownup_of($1)", [A]))) === true &&
    (await canRead(abe, D_PDF)) === false &&
    (await as(abe, `select * from due_vault_emergency_reminders('wrong', now())`)).length === 0);

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
      (await refused(() => anon("select name_vault_emergency_contact($1, 3)", [P("a4")]))) === true &&
      (await refused(() => anon("select * from vault_emergency_items($1)", [third]))) === true &&
      (await refused(() => anon("select open_vault_emergency_item($1, 'password', $2)", [third, WIFI]))) === true &&
      (await refused(() => anon("select answer_vault_emergency_request($1, 'allow')", [third]))) === true &&
      (await refused(() => anon("select dismiss_vault_emergency_notice($1)", [NOBODY]))) === true &&
      (await anon("select 1 from vault_emergency_requests")).length === 0 &&
      (await anon("select 1 from vault_emergency_notices")).length === 0 &&
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
    return (early.length === 0 && nine.length === 2) || { early, nine };
  });

  await check("Ann allows Abe's third request now", async () => (await answer(ann, third, "allow"))[0].r === "open");
  await check("Abe leaves the household: the grant stops while he is not an active member", async () => {
    await db.exec(`update members set status = 'removed' where id = '${P("a4")}'`);
    const stopped = (await refused(() => items(abe, third), "not open")) === true;
    await db.exec(`update members set status = 'active' where id = '${P("a4")}'`);
    return stopped && (await items(abe, third)).length === 4;
  });
  await check("Abe moved to another household: the grant stops, and he cannot ask", async () => {
    await db.exec(`update members set family_id = '${B}' where id = '${P("a4")}'`);
    const stopped = (await refused(() => items(abe, third), "not open")) === true;
    const cannotAsk = (await refused(() => ask(abe, A), "no longer in this household")) === true;
    await db.exec(`update members set family_id = '${A}' where id = '${P("a4")}'`);
    return stopped && cannotAsk;
  });
  await check("Abe made a child: the grant stops", async () => {
    await db.exec(`update members set role = 'child_self' where id = '${P("a4")}'`);
    const stopped = (await refused(() => items(abe, third), "not open")) === true;
    await db.exec(`update members set role = 'adult' where id = '${P("a4")}'`);
    return stopped;
  });

  await check("A file read lasts an hour after its entry was opened, then needs a new (logged) open", async () => {
    await open(abe, third, "document", DEED);
    const fresh = await canRead(abe, DEED_PDF);
    await db.exec(`update vault_emergency_opens set opened_at = now() - interval '61 minutes' where request_id = '${third}'`);
    const stale = await canRead(abe, DEED_PDF);
    return (fresh && !stale) || { fresh, stale };
  });
  await check("Opening the passport does not open the deed's file", async () => {
    await open(abe, third, "document", PASSPORT);
    const deedBefore = await canRead(abe, DEED_PDF);
    await open(abe, third, "document", DEED);
    return (!deedBefore && (await canRead(abe, DEED_PDF))) || { deedBefore };
  });
  await check("Each opening is logged, under Abe's name, never anyone typed", async () => {
    const log = await as(ann, `select distinct member_name from vault_emergency_opens where request_id = '${third}'`);
    return log.map((r) => r.member_name).join() === "Abe A" || log;
  });

  await check("Ada is named and asks, then Ann takes her off the list: Allow now is refused and she reads nothing", async () => {
    await as(ann, "select name_vault_emergency_contact($1, 3)", [P("a5")]);
    const adaReq = await ask(ada, A, "Lola needs her senior citizen ID");
    const adaContact = (await as(ann, "select id from vault_emergency_contacts where member_id = $1", [P("a5")]))[0].id;
    await as(ann, "select remove_vault_emergency_contact($1)", [adaContact]);
    return (
      (await statusOf(ann, adaReq)) === "revoked" &&
      (await refused(() => answer(ann, adaReq, "allow"), "no longer waiting")) === true &&
      (await refused(() => items(ada, adaReq), "not open")) === true
    );
  });

  // -- The migration over a household that had named a relative --------------------
  await check("A relative named before 20 October comes off the list, their request ends, and the household's grown-ups get one notice", async () => {
    await db.exec(`
      alter table vault_emergency_contacts drop constraint vault_emergency_contacts_same_household;
      insert into vault_emergency_contacts (id, family_id, family_name, member_id, member_family_id, member_name, member_household_name, wait_days)
        values ('c9000000-0000-0000-0000-000000000001', '${A}', 'House A', '${P("b1")}', '${B}', 'Ben B', 'House B', 3);
      insert into vault_emergency_requests (id, family_id, family_name, contact_id, member_id, member_name, member_household_name, reason, wait_days, allowed_at)
        values ('c9000000-0000-0000-0000-000000000002', '${A}', 'House A', 'c9000000-0000-0000-0000-000000000001', '${P("b1")}', 'Ben B', 'House B', 'Old request', 3, now());
    `);
    await db.exec(MIGRATION);
    const gone = (await db.query("select 1 from vault_emergency_contacts where member_family_id <> family_id")).rows.length === 0;
    const ended = (await statusOf(ann, "c9000000-0000-0000-0000-000000000002")) === "revoked";
    const benSees = (await as(ben, "select 1 from vault_emergency_contacts")).length === 0;
    const notices = await as(ann, "select id, body, dismissed_at from vault_emergency_notices");
    const abeNotices = (await as(abe, "select 1 from vault_emergency_notices")).length;
    const kidNotices = (await as(kid, "select 1 from vault_emergency_notices")).length;
    const danNotices = (await as(dan, "select 1 from vault_emergency_notices")).length;
    const constraintBack = (await db.query("select 1 from pg_constraint where conname = 'vault_emergency_contacts_same_household'")).rows.length === 1;
    return (
      (gone && ended && benSees && notices.length === 1 && /Ben B \(House B\) came off your list/.test(notices[0].body) && notices[0].dismissed_at === null
        && abeNotices === 1 && kidNotices === 0 && danNotices === 0 && constraintBack) || { gone, ended, benSees, notices, abeNotices, kidNotices, danNotices, constraintBack }
    );
  });
  await check("Run again, the migration adds no second notice", async () => {
    await db.exec(MIGRATION);
    return (await as(ann, "select 1 from vault_emergency_notices")).length === 1;
  });
  await check("Kid and Dan cannot dismiss the notice; Abe can, once for the household; nobody edits it directly", async () => {
    const id = (await as(ann, "select id from vault_emergency_notices"))[0].id;
    const kidRefused = (await refused(() => as(kid, "select dismiss_vault_emergency_notice($1)", [id]), "not yours")) === true;
    const danRefused = (await refused(() => as(dan, "select dismiss_vault_emergency_notice($1)", [id]), "not yours")) === true;
    const direct = (await refused(() => as(ann, "update vault_emergency_notices set body = 'x' where id = $1", [id]))) === true;
    await as(abe, "select dismiss_vault_emergency_notice($1)", [id]);
    const row = (await as(ann, "select dismissed_at, dismissed_by_name from vault_emergency_notices where id = $1", [id]))[0];
    return (kidRefused && danRefused && direct && row.dismissed_at !== null && row.dismissed_by_name === "Abe A") || { kidRefused, danRefused, direct, row };
  });
}
