// Delete my account (20261021020000): a request waits 7 days and can be
// taken back; only the job finalizes. The hand-over rules: the last
// grown-up organizer hands to another grown-up (a parent before an adult);
// with no grown-up left but children, the household stays for them; only a
// household with nobody left is deleted. Their own data goes, in every table
// that holds any (20261022090000: rows are made in each and must be gone);
// shared records keep an author called "Former member"; a managed child's
// profile is never touched.
const A = "a0000000-0000-0000-0000-000000000000";
const D = "d0000000-0000-0000-0000-000000000000";
const ANN = "10000000-0000-0000-0000-0000000000a1";
const KID = "10000000-0000-0000-0000-0000000000a2";
const BEN = "10000000-0000-0000-0000-0000000000b1";
const DAN = "10000000-0000-0000-0000-0000000000d1";
const M = (x) => `00000000-0000-0000-0000-0000000000${x}`;

export default async function ({ db, as, check, refused }) {
  await db.exec(`
    alter table members add column if not exists is_organiser boolean not null default false, add column if not exists email text, add column if not exists mobile text;
    update members set is_organiser = true where full_name in ('Ann A', 'Dan D', 'Cat C', 'Ben B');
    update members set email = 'ann@example.com', mobile = '0917' where full_name = 'Ann A';
    create table if not exists personal_notes (id uuid primary key default gen_random_uuid(), owner_person_id uuid references people(id), body text);
    insert into personal_notes (owner_person_id, body) values ('${M("a1")}', 'mine'), ('${M("b1")}', 'Ben''s');
    create table if not exists shared_lists (id uuid primary key default gen_random_uuid(), family_id uuid, created_by uuid references members(id), title text);
    insert into shared_lists (family_id, created_by, title) values ('${A}', '${M("a1")}', 'Groceries');
    insert into health_medicines (family_id, member_id, name) values ('${A}', '${M("a1")}', 'Ann pill'), ('${A}', '${M("a3")}', 'Baby drops');
  `);
  const svc = async (sql, params = []) => {
    await db.exec("reset role");
    // The job has no signed-in user: auth.uid() is null, as live.
    await db.query("select set_config('request.jwt.claims', '{}', false)");
    await db.exec("set role service_role");
    try {
      return (await db.query(sql, params)).rows;
    } finally {
      await db.exec("reset role");
    }
  };
  const anon = async (sql) => {
    await db.exec("reset role");
    await db.exec("set role anon");
    try {
      return (await db.query(sql)).rows;
    } finally {
      await db.exec("reset role");
    }
  };
  const B = "b0000000-0000-0000-0000-000000000000";
  const C = "c0000000-0000-0000-0000-000000000000";
  let finalResult = null;
  const plan = async (id) => (await db.query("select account_handover_plan($1) p", [id])).rows[0].p;

  await check("The last grown-up organizer hands the household to the other grown-up", async () => {
    const p = await plan(M("a1"));
    return (p.kind === "handover" && p.to_member === M("a4")) || p;
  });
  await check("A parent is chosen before an adult, even one who joined later", async () => {
    await db.exec(`insert into members (id, family_id, person_id, auth_user_id, full_name, role, created_at) values ('${M("a5")}', '${A}', null, null, 'Pia A', 'parent', now() + interval '1 day')`);
    const p = await plan(M("a1"));
    await db.exec(`delete from members where id = '${M("a5")}'`);
    return (p.kind === "handover" && p.to_member === M("a5")) || p;
  });
  await check("With no other grown-up but a child, the screen says the household goes unless a grown-up joins", async () => {
    const p = await plan(M("d1"));
    return (p.kind === "last_grown_up" && p.family_id === D) || p;
  });
  await check("Someone who is not the organizer hands nothing over", async () => (await plan(M("a2"))).kind === "none");
  await check("While another grown-up organizer remains, nothing is handed over", async () => {
    await db.exec(`update members set is_organiser = true where id = '${M("a4")}'`);
    const p = await plan(M("a1"));
    await db.exec(`update members set is_organiser = false where id = '${M("a4")}'`);
    return p.kind === "none" || p;
  });

  await check("my_account_deletion_plan tells the caller about their own household only", async () => {
    const ann = (await as(ANN, "select my_account_deletion_plan() p"))[0].p;
    const kid = (await as(KID, "select my_account_deletion_plan() p"))[0].p;
    return (ann.kind === "handover" && kid.kind === "none") || { ann, kid };
  });
  await check("Signed out, there is no plan to read", () => refused(() => anon("select my_account_deletion_plan()")));
  await check("A member cannot fire the deletion job", () => refused(() => as(ANN, "select kin_fire_account_deletions()")));
  await check("Signed out, nobody can fire the deletion job", () => refused(() => anon("select kin_fire_account_deletions()")));
  await check("Asking waits 7 days and says what happens to the household", async () => {
    const r = (await as(ANN, "select request_account_deletion() r"))[0].r;
    const days = Math.round((new Date(r.delete_after) - Date.now()) / 86400000);
    return (days === 7 && r.plan.kind === "handover") || r;
  });
  await check("They see their own request; someone else does not", async () => {
    const own = await as(ANN, "select * from account_deletions");
    const ben = await as(BEN, "select * from account_deletions");
    return (own.length === 1 && ben.length === 0) || { own, ben };
  });
  await check("A member cannot write account_deletions directly", () => refused(() => as(BEN, `insert into account_deletions (auth_user_id) values ('${ANN}')`)));
  await check("A member cannot move their date forward", () => refused(() => as(ANN, "update account_deletions set delete_after = now()")));
  await check("Signed out, nobody can ask", () => refused(() => anon("select request_account_deletion()")));
  await check("Keep my account takes the request back", async () => {
    const kept = (await as(ANN, "select cancel_account_deletion() k"))[0].k;
    return (kept === true && (await db.query("select 1 from account_deletions")).rows.length === 0) || kept;
  });
  await check("Someone else's cancel does not take back Ann's", async () => {
    await as(ANN, "select request_account_deletion()");
    const k = (await as(BEN, "select cancel_account_deletion() k"))[0].k;
    return (k === false && (await db.query("select 1 from account_deletions")).rows.length === 1) || k;
  });

  await check("A member cannot list who is due", () => refused(() => as(BEN, "select * from due_account_deletions()")));
  await check("A member cannot finalize anyone, themselves included", () => refused(() => as(ANN, `select finalize_account_deletion('${ANN}')`)));
  await check("Signed out, nobody can finalize", () => refused(() => anon(`select finalize_account_deletion('${ANN}')`)));
  await check("A member cannot delete a household through the job's door", () => refused(() => as(DAN, `select delete_household_for_account_deletion('${D}')`)));
  await check("A member cannot read another's plan by id", () => refused(() => as(BEN, `select account_handover_plan('${M("a1")}')`)));
  await check("Nothing is due before 7 days", async () => (await svc("select * from due_account_deletions()")).length === 0);

  // ── Every table that holds something of Ann's (the audit in
  // 20261022090000). Stand-ins for the ones PGlite does not have, shaped as
  // on dev (each cascades from members or people). Then a row for Ann and a
  // control row for Ben in each, made with foreign keys off so a row needs
  // nothing else to exist.
  await db.exec(`
    create table if not exists calendar_event_links (id uuid primary key default gen_random_uuid(), member_id uuid not null references members(id) on delete cascade, source_id uuid);
    create table if not exists calendar_links (id uuid primary key default gen_random_uuid(), member_id uuid not null references members(id) on delete cascade, token text);
    create table if not exists calendar_sync_failures (id uuid primary key default gen_random_uuid(), member_id uuid not null references members(id) on delete cascade);
    create table if not exists calendar_tokens (member_id uuid primary key references members(id) on delete cascade, refresh_token text);
    create table if not exists family_message_reads (member_id uuid primary key references members(id) on delete cascade, read_at timestamptz default now());
    create table if not exists highlights (id uuid primary key default gen_random_uuid(), family_id uuid, member_id uuid not null references members(id) on delete cascade, storage_path text not null);
    create table if not exists journal_entry_people (entry_id uuid, member_id uuid not null references members(id) on delete cascade);
    create table if not exists liquid_intake_log (id uuid primary key default gen_random_uuid(), member_id uuid not null references members(id) on delete cascade, ml int);
    create table if not exists meal_plan_members (meal_plan_id uuid, member_id uuid not null references members(id) on delete cascade);
    create table if not exists member_avatars (id uuid primary key default gen_random_uuid(), member_id uuid not null references members(id) on delete cascade, family_id uuid, storage_path text, drive_file_id text);
    create table if not exists member_security (member_id uuid primary key references members(id) on delete cascade, pin_hash text);
    create table if not exists member_webauthn_credentials (id uuid primary key default gen_random_uuid(), member_id uuid not null references members(id) on delete cascade, public_key text);
    create table if not exists omron_links (member_id uuid primary key references members(id) on delete cascade, token text);
    create table if not exists routine_members (routine_id uuid, member_id uuid not null references members(id) on delete cascade);
    create table if not exists trip_travellers (trip_id uuid, member_id uuid not null references members(id) on delete cascade);
    create table if not exists wealth_targets (id uuid primary key default gen_random_uuid(), member_id uuid not null references members(id) on delete cascade, amount numeric);
    create table if not exists journal_comments (id uuid primary key default gen_random_uuid(), entry_id uuid references journal_entries(id) on delete cascade, family_id uuid, member_id uuid references members(id) on delete set null, author_name text, body text);
    create table if not exists journal_reactions (id uuid primary key default gen_random_uuid(), entry_id uuid references journal_entries(id) on delete cascade, family_id uuid, member_id uuid not null references members(id) on delete cascade, author_name text, emoji text);
    create table if not exists occasion_greetings (id uuid primary key default gen_random_uuid(), family_id uuid, member_id uuid references members(id) on delete set null, author_name text, body text);
    create table if not exists journal_media (id uuid primary key default gen_random_uuid(), family_id uuid, owner_person_id uuid references people(id), visibility text not null default 'household', storage_path text);
    create table if not exists trips (id uuid primary key default gen_random_uuid(), family_id uuid, title text, journal_entry_id uuid references journal_entries(id));
    -- As on dev, an account's transactions and a document's files go with it.
    alter table doc_files drop constraint if exists doc_files_entry_id_fkey;
    alter table doc_files add constraint doc_files_entry_id_fkey foreign key (entry_id) references doc_entries(id) on delete cascade;
    alter table wealth_transactions drop constraint if exists wealth_transactions_account_id_fkey;
    alter table wealth_transactions add constraint wealth_transactions_account_id_fkey foreign key (account_id) references accounts(id) on delete cascade;
    alter table goals add column if not exists owner_person_id uuid references people(id), add column if not exists is_joint boolean not null default false;
    alter table doc_entries add column if not exists created_by uuid references members(id);
    alter table members add column if not exists dob date, add column if not exists quick_actions jsonb not null default '[]';
  `);
  // What a table's own checks ask of a row, beyond being named.
  const token = () => (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "").slice(0, 43);
  const EXTRA = {
    alkansya_entries: { jar: "ipon", kind: "deposit" },
    chat_room_reactions: { emoji: "👍", family_message_id: () => crypto.randomUUID() },
    event_rsvps: { answer: "going" },
    game_awards: { kind: "all_dailies" },
    gift_list_people: { year: 2026 },
    list_add_tokens: { token_hash: token },
    member_budgets: { period_year: 2026, period_month: 10 },
    member_locations: { sharing: "on" },
    net_worth_snapshots: { month: "2026-10-01", scope: "all" },
    remittances: { currency: "USD", php_received: 560, channel: "bank" },
    send_to_kin_tokens: { token_hash: token },
    sent_screenshots: { data: new Uint8Array([0]), mime: "image/png" },
    shared_pot_entries: { kind: "cost" },
    time_capsules: { opens_on: "2027-01-01" },
    vault_emergency_contacts: { member_family_id: A },
    vault_emergency_requests: { reason: "An emergency" },
  };
  const seed = async (table, values) => {
    const cols = (await db.query(
      `select column_name, udt_name from information_schema.columns
       where table_schema = 'public' and table_name = $1 and is_nullable = 'NO' and column_default is null and is_identity = 'NO'`,
      [table],
    )).rows;
    const row = Object.fromEntries(Object.entries({ ...(EXTRA[table] ?? {}), ...values }).map(([k, v]) => [k, typeof v === "function" ? v() : v]));
    for (const c of cols) {
      if (c.column_name in row) continue;
      if (c.column_name === "family_id") row.family_id = A;
      else row[c.column_name] = { uuid: crypto.randomUUID(), text: "x", bool: false, numeric: 1, int4: 1, int2: 1, int8: 1, float8: 1, date: "2026-10-22", timestamptz: "2026-10-22T00:00:00Z", bytea: "\\x00", jsonb: "{}", _uuid: "{}", _int2: "{}", _text: "{}" }[c.udt_name] ?? "x";
    }
    const keys = Object.keys(row);
    await db.query(`insert into ${table} (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => row[k]));
  };
  // Tables whose rows are about the person alone: [table, column naming them, other values a row needs].
  const ABOUT = [
    ["account_viewers", "member_id"], ["activity_members", "member_id"], ["alkansya_entries", "member_id"],
    ["alkansya_plans", "member_id"], ["calendar_event_links", "member_id"], ["calendar_links", "member_id"],
    ["calendar_sync_failures", "member_id"], ["calendar_tokens", "member_id"], ["event_members", "member_id"],
    ["event_rsvps", "member_id"], ["family_message_reads", "member_id"], ["game_awards", "member_id"],
    ["game_member_badges", "member_id"], ["game_streaks", "member_id"], ["highlights", "member_id"],
    ["journal_entry_people", "member_id"], ["liquid_intake_log", "member_id"], ["list_add_tokens", "member_id"],
    ["meal_plan_members", "member_id"], ["member_avatars", "member_id"], ["member_budgets", "member_id"],
    ["member_checkins", "member_id"], ["member_locations", "member_id"], ["member_security", "member_id"],
    ["member_webauthn_credentials", "member_id"], ["net_worth_snapshots", "viewer_member_id"], ["omron_links", "member_id"],
    ["planner_goal_completions", "member_id"], ["planner_goals", "owner_member_id"], ["push_call_rings", "caller"],
    ["push_call_rings", "callee"], ["push_handouts", "recipient"], ["push_subscriptions", "member_id"], ["push_tests", "member_id"],
    ["reward_redemptions", "member_id"], ["routine_members", "member_id"], ["send_to_kin_tokens", "member_id"],
    ["sent_screenshots", "member_id"], ["sos_alerts", "member_id"],
    ["trip_travellers", "member_id"], ["vault_emergency_contacts", "member_id"], ["wealth_targets", "member_id"],
  ];
  // Rows they wrote for others, which keep the row and lose the name: [table, name column, column naming them].
  const NAMED = [
    ["family_link_messages", "author_name", "member_id"], ["family_tree_messages", "author_name", "member_id"],
    ["journal_comments", "author_name", "member_id"], ["journal_reactions", "author_name", "member_id"],
    ["occasion_greetings", "author_name", "member_id"], ["potluck_claims", "member_name", "member_id"],
    ["remittances", "sender_name", "sender_member_id"], ["shared_pot_entries", "author_name", "member_id"],
    ["tree_person_stories", "told_by_name", "told_by_member_id"], ["time_capsules", "writer_name", "writer_member_id"],
    ["gift_draw_people", "name", "member_id"], ["gift_list_people", "name", "member_id"],
    ["vault_emergency_contacts", "added_by_name", "added_by"], ["vault_emergency_requests", "member_name", "member_id"],
    ["chat_group_messages", "author_name", "sender_person_id"], ["chat_room_reactions", "author_name", "person_id"],
  ];
  const ANN_PERSON = M("a1");
  const BEN_PERSON = M("b1");
  const HOUSE_ENTRY = "e1000000-0000-0000-0000-000000000001";
  const MINE_ENTRY = "e1000000-0000-0000-0000-000000000002";
  const REQ = "e1000000-0000-0000-0000-000000000003";
  const seedErrors = [];
  await db.exec("set session_replication_role = replica");
  for (const [table, col] of ABOUT) {
    for (const who of [M("a1"), M("b1")]) {
      try {
        await seed(table, { [col]: who });
      } catch (e) {
        seedErrors.push(`${table}.${col}: ${e.message}`);
      }
    }
  }
  for (const [table, nameCol, col] of NAMED) {
    for (const [who, person, name] of [[M("a1"), ANN_PERSON, "Ann A"], [M("b1"), BEN_PERSON, "Ben B"]]) {
      try {
        await seed(table, {
          [nameCol]: name,
          [col]: col.includes("person") ? person : who,
          ...(table === "vault_emergency_requests" && who === M("a1") ? { id: REQ } : {}),
        });
      } catch (e) {
        seedErrors.push(`${table}.${nameCol}: ${e.message}`);
      }
    }
  }
  await db.exec(`
    -- Their own journal entry, a household one they wrote (with Ben's
    -- comment), and a household trip that points at the personal one: it
    -- must let go, not stop the job.
    insert into journal_entries (id, family_id, visibility, owner_person_id) values
      ('${HOUSE_ENTRY}', '${A}', 'household', '${ANN_PERSON}'), ('${MINE_ENTRY}', '${A}', 'personal', '${ANN_PERSON}');
    insert into trips (family_id, title, journal_entry_id) values ('${A}', 'Baguio', '${MINE_ENTRY}');
    insert into journal_comments (entry_id, family_id, member_id, author_name, body) values ('${HOUSE_ENTRY}', '${A}', '${M("b1")}', 'Ben B', 'Lovely');
    insert into journal_media (family_id, owner_person_id, visibility, storage_path) values
      ('${A}', '${ANN_PERSON}', 'personal', 'person/${ANN_PERSON}/mine.jpg'),
      ('${A}', '${ANN_PERSON}', 'household', 'person/${ANN_PERSON}/shared-from-just-me.jpg'),
      ('${A}', '${ANN_PERSON}', 'household', '${A}/household.jpg');
    insert into journal_entry_videos (entry_id, family_id, storage_path, poster_path, mime_type, width, height, duration_seconds) values
      ('${HOUSE_ENTRY}', '${A}', 'person/${ANN_PERSON}/videos/v.mp4', 'person/${ANN_PERSON}/videos/v.jpg', 'video/mp4', 640, 480, 5);
    insert into goals (family_id, title, owner_person_id, is_joint) values ('${A}', 'Ann saves', '${ANN_PERSON}', false), ('${A}', 'House fund', '${ANN_PERSON}', true);
    -- Files named by their rows.
    update member_avatars set storage_path = '${A}/avatars/ann.jpg' where member_id = '${M("a1")}';
    update highlights set storage_path = '${A}/highlights/ann.mp4' where member_id = '${M("a1")}';
    -- Private money and a private document go; the household's stay.
    insert into accounts (id, family_id, name, owner_member_id, is_private) values
      ('ac000000-0000-0000-0000-000000000001', '${A}', 'Ann secret', '${M("a1")}', true),
      ('ac000000-0000-0000-0000-000000000002', '${A}', 'Ann wallet (household sees it)', '${M("a1")}', false);
    insert into wealth_transactions (family_id, account_id, direction, amount, particulars) values ('${A}', 'ac000000-0000-0000-0000-000000000001', 'in', 5, 'pay');
    insert into utang_entries (family_id, direction, person_name, amount, started_on, is_private, recorded_by) values ('${A}', 'lent', 'Cousin', 1, current_date, true, '${M("a1")}');
    -- A private account she shared with Ben (account_viewers) is not hers
    -- alone: it stays, with its movement, for him (20261022110000).
    insert into accounts (id, family_id, name, owner_member_id, is_private) values
      ('ac000000-0000-0000-0000-000000000003', '${A}', 'Ann shared (Ben sees it)', '${M("a1")}', true);
    insert into wealth_transactions (family_id, account_id, direction, amount, particulars) values ('${A}', 'ac000000-0000-0000-0000-000000000003', 'in', 7, 'pay');
    insert into account_viewers (account_id, member_id, family_id, added_by) values ('ac000000-0000-0000-0000-000000000003', '${M("b1")}', '${A}', '${M("a1")}');
    -- A "just me" paluwagan of hers goes, members and all; Ben's stays his.
    insert into paluwagan_groups (id, family_id, name, contribution, starts_on, is_private, recorded_by) values
      ('9a100000-0000-0000-0000-000000000001', '${A}', 'Office paluwagan', 1000, current_date, true, '${M("a1")}'),
      ('9a100000-0000-0000-0000-000000000002', '${A}', 'Ben''s barkada', 500, current_date, true, '${M("b1")}');
    insert into paluwagan_members (group_id, family_id, name, turn) values
      ('9a100000-0000-0000-0000-000000000001', '${A}', 'Tita Rose', 1), ('9a100000-0000-0000-0000-000000000002', '${A}', 'Jun', 1);
    -- A check-in she asked of Ben goes with her, as the cascade would have.
    insert into member_checkins (family_id, asked_by, member_id) values ('${A}', '${M("a1")}', '${M("b1")}');
    update remittances set is_private = true, recorded_by = '${M("a1")}' where sender_member_id = '${M("a1")}';
    -- Ben's own private remittance naming Ann as sender stays his.
    update remittances set is_private = true, recorded_by = '${M("b1")}' where sender_member_id = '${M("b1")}';
    insert into doc_entries (id, family_id, title, visibility, owner_member_id, created_by) values
      ('d0c00000-0000-0000-0000-000000000001', '${A}', 'Ann passport', 'private', '${M("a1")}', '${M("a1")}'),
      ('d0c00000-0000-0000-0000-000000000002', '${A}', 'House title', 'family', '${M("a1")}', '${M("a1")}'),
      ('d0c00000-0000-0000-0000-000000000003', '${A}', 'Kid passport', 'private', '${M("a2")}', '${M("a1")}');
    -- A letter Ben wrote to Ann: his, and he still reads it.
    insert into time_capsules (family_id, writer_member_id, writer_name, recipient_member_id, title, body, opens_on) values
      ('${A}', '${M("b1")}', 'Ben B', '${M("a1")}', 'For Ann', 'Dear Ann', '2030-01-01');
    insert into doc_files (entry_id, family_id, file_name, storage_path) values
      ('d0c00000-0000-0000-0000-000000000001', '${A}', 'p.pdf', '${A}/docs/passport.pdf'),
      ('d0c00000-0000-0000-0000-000000000002', '${A}', 't.pdf', '${A}/docs/title.pdf');
    -- The vault log names the grown-up who allowed a request, by name only;
    -- a namesake in another household keeps theirs.
    update vault_emergency_requests set family_id = '${A}', allowed_by_name = 'Ann A' where id = '${REQ}';
    insert into vault_emergency_opens (family_id, request_id, member_name, item_kind, item_id, item_label) values ('${A}', '${REQ}', 'Ann A', 'document', gen_random_uuid(), 'x');
    insert into vault_emergency_notices (family_id, body, dismissed_by_name) values ('${A}', 'n', 'Ann A'), ('${C}', 'n', 'Ann A');
    -- A message she unsent: renaming its author must not stop the job.
    update family_tree_messages set deleted_at = now(), body = '' where member_id = '${M("a1")}';
    -- Ann in the household tree; a membership she moved out of, in House B.
    insert into family_tree_people (family_id, member_id, full_name) values ('${A}', '${M("a1")}', 'Ann A');
    insert into members (id, family_id, person_id, auth_user_id, full_name, role, status, email) values
      ('${M("a9")}', '${B}', '${ANN_PERSON}', null, 'Ann A', 'adult', 'moved', 'ann@old.example');
    update members set notification_prefs = '{"chat": false}', quick_actions = '["chat"]', dob = '1990-01-01' where id = '${M("a1")}';
    insert into chat_group_members (group_id, person_id) select id, '${ANN_PERSON}' from chat_groups limit 1;
  `);
  await seed("remittances", { sender_member_id: M("a1"), sender_name: "Ann A", amount: 10, is_private: false, recorded_by: M("a1") });
  await db.exec("set session_replication_role = origin");
  await check("A row of Ann's and of Ben's was made in every table the audit names", async () => seedErrors.length === 0 || seedErrors);

  await check("After 7 days the job removes their own data and keeps the shared records under 'Former member'", async () => {
    await db.exec("update account_deletions set delete_after = now() - interval '1 minute'");
    const due = await svc("select * from due_account_deletions() u");
    const r = (await svc(`select finalize_account_deletion('${ANN}') r`))[0].r;
    finalResult = r;
    const ann = (await db.query(`select full_name, auth_user_id, status, is_organiser, email, mobile from members where id = '${M("a1")}'`)).rows[0];
    const abe = (await db.query(`select is_organiser from members where id = '${M("a4")}'`)).rows[0];
    const notes = (await db.query("select body from personal_notes order by body")).rows.map((x) => x.body);
    const meds = (await db.query("select name from health_medicines order by name")).rows.map((x) => x.name);
    const list = (await db.query("select m.full_name from shared_lists l join members m on m.id = l.created_by")).rows[0];
    const left = (await db.query("select 1 from account_deletions")).rows.length;
    const ok =
      due.length === 1 &&
      ann.full_name === "Former member" && ann.auth_user_id === null && ann.status === "removed" && !ann.is_organiser && ann.email === null && ann.mobile === null &&
      abe.is_organiser === true &&
      notes.join() === "Ben's" &&
      meds.join() === "Baby drops" &&
      list.full_name === "Former member" &&
      left === 0 &&
      r.person_id === M("a1") && r.delete_families.length === 0;
    return ok || { due, r, ann, abe, notes, meds, list, left };
  });
  const count = async (sql, params = []) => Number((await db.query(sql, params)).rows[0].n);
  await check("Nothing about Ann alone is left in any table; Ben's rows are all still there", async () => {
    const left = [];
    for (const [table, col] of ABOUT) {
      const ann = await count(`select count(*) n from ${table} where ${col} = $1`, [M("a1")]);
      const ben = await count(`select count(*) n from ${table} where ${col} = $1`, [M("b1")]);
      if (ann !== 0 || ben < 1) left.push(`${table}.${col}: Ann ${ann}, Ben ${ben}`);
    }
    return left.length === 0 || left;
  });
  await check("What Ann wrote for others stays, as 'Former member'; Ben's name is untouched", async () => {
    const wrong = [];
    for (const [table, nameCol, col] of NAMED) {
      const annKey = col.includes("person") ? ANN_PERSON : M("a1");
      const benKey = col.includes("person") ? BEN_PERSON : M("b1");
      const ann = (await db.query(`select ${nameCol} v from ${table} where ${col} = $1`, [annKey])).rows.map((r) => r.v);
      const ben = (await db.query(`select ${nameCol} v from ${table} where ${col} = $1`, [benKey])).rows.map((r) => r.v);
      if (ann.length === 0 || ann.some((v) => v !== "Former member") || ben.length === 0 || ben.some((v) => v !== "Ben B")) wrong.push({ table, ann, ben });
    }
    return wrong.length === 0 || wrong;
  });
  await check("The vault's log forgets Ann's name; a namesake in another household keeps theirs", async () => {
    const req = (await db.query(`select member_name, allowed_by_name from vault_emergency_requests where id = '${REQ}'`)).rows[0];
    const opened = (await db.query(`select member_name from vault_emergency_opens where request_id = '${REQ}'`)).rows[0];
    const notices = (await db.query("select family_id, dismissed_by_name n from vault_emergency_notices order by family_id")).rows;
    const ok =
      req.member_name === "Former member" && req.allowed_by_name === "Former member" && opened.member_name === "Former member" &&
      notices.find((r) => r.family_id === A).n === "Former member" && notices.find((r) => r.family_id === C).n === "Ann A";
    return ok || { req, opened, notices };
  });
  await check("Her household journal entry stays, with Ben's comment; her personal one goes, and the trip lets go of it", async () => {
    const entries = (await db.query(`select id from journal_entries where id in ('${HOUSE_ENTRY}', '${MINE_ENTRY}')`)).rows.map((r) => r.id);
    const comment = await count(`select count(*) n from journal_comments where entry_id = '${HOUSE_ENTRY}' and body = 'Lovely'`);
    const trip = (await db.query("select journal_entry_id from trips where title = 'Baguio'")).rows[0];
    const media = (await db.query("select storage_path p from journal_media order by 1")).rows.map((r) => r.p);
    const goals = (await db.query(`select title from goals where owner_person_id = '${ANN_PERSON}' order by 1`)).rows.map((r) => r.title);
    const ok =
      entries.join() === HOUSE_ENTRY && comment === 1 && trip && trip.journal_entry_id === null &&
      media.join() === [`${A}/household.jpg`, `person/${ANN_PERSON}/shared-from-just-me.jpg`].sort().join() &&
      goals.join() === "House fund";
    return ok || { entries, comment, trip, media, goals };
  });
  await check("The job names every file of hers to remove, and keeps the household's files in her folder", async () => {
    const files = finalResult.files.map((f) => `${f.bucket}:${f.path}`).sort();
    const keep = finalResult.keep_files.map((f) => `${f.bucket}:${f.path}`).sort();
    const wantFiles = [`journal:person/${ANN_PERSON}/mine.jpg`, `avatars:${A}/avatars/ann.jpg`, `documents:${A}/highlights/ann.mp4`, `documents:${A}/docs/passport.pdf`];
    const wantKeep = [`journal:person/${ANN_PERSON}/shared-from-just-me.jpg`, `journal:person/${ANN_PERSON}/videos/v.mp4`, `journal:person/${ANN_PERSON}/videos/v.jpg`];
    const ok = wantFiles.every((f) => files.includes(f)) && !files.some((f) => f.includes("title.pdf") || f.includes("household.jpg") || f.includes("shared-from")) &&
      wantKeep.every((f) => keep.includes(f)) && keep.length === wantKeep.length;
    return ok || { files, keep };
  });
  await check("A letter written to her stays with its writer, under her new name", async () => {
    const letters = (await db.query(`select writer_name from time_capsules where recipient_member_id = '${M("a1")}' and title = 'For Ann'`)).rows;
    return (letters.length === 1 && letters[0].writer_name === "Ben B") || letters;
  });
  await check("Her private account, debt, remittance and document go; what the household or someone else sees stays", async () => {
    const accounts = (await db.query(`select name from accounts where owner_member_id = '${M("a1")}' order by 1`)).rows.map((r) => r.name);
    const tx = await count("select count(*) n from wealth_transactions where account_id = 'ac000000-0000-0000-0000-000000000001'");
    const sharedTx = await count("select count(*) n from wealth_transactions where account_id = 'ac000000-0000-0000-0000-000000000003'");
    const viewer = await count(`select count(*) n from account_viewers where account_id = 'ac000000-0000-0000-0000-000000000003' and member_id = '${M("b1")}'`);
    const paluwagan = (await db.query("select name from paluwagan_groups where id::text like '9a1%' order by 1")).rows.map((r) => r.name);
    const paluwaganPeople = (await db.query("select name from paluwagan_members where group_id::text like '9a1%' order by 1")).rows.map((r) => r.name);
    const asked = await count(`select count(*) n from member_checkins where asked_by = '${M("a1")}'`);
    const utang = await count(`select count(*) n from utang_entries where recorded_by = '${M("a1")}'`);
    const remit = (await db.query(`select is_private, sender_name from remittances where sender_member_id = '${M("a1")}'`)).rows;
    const docs = (await db.query(`select title from doc_entries where 'd0c' = left(id::text, 3) order by 1`)).rows.map((r) => r.title);
    const bens = await count(`select count(*) n from remittances where is_private and recorded_by = '${M("b1")}'`);
    const ok = accounts.join() === "Ann shared (Ben sees it),Ann wallet (household sees it)" && tx === 0 && sharedTx === 1 && viewer === 1 &&
      paluwagan.join() === "Ben's barkada" && paluwaganPeople.join() === "Jun" && asked === 0 && utang === 0 &&
      remit.length === 1 && !remit[0].is_private && remit[0].sender_name === "Former member" &&
      docs.join() === "House title,Kid passport" && bens === 1;
    return ok || { accounts, tx, sharedTx, viewer, paluwagan, paluwaganPeople, asked, utang, remit, docs, bens };
  });
  await check("The membership she moved out of is emptied too, and stays 'moved'; her tree person stays, untied", async () => {
    const old = (await db.query(`select full_name, status, email from members where id = '${M("a9")}'`)).rows[0];
    const tree = (await db.query("select member_id from family_tree_people where full_name = 'Ann A'")).rows;
    const me = (await db.query(`select notification_prefs, quick_actions, dob::text dob from members where id = '${M("a1")}'`)).rows[0];
    const groups = await count(`select count(*) n from chat_group_members where person_id = '${ANN_PERSON}'`);
    const ok = old.full_name === "Former member" && old.status === "moved" && old.email === null &&
      tree.length === 1 && tree[0].member_id === null &&
      JSON.stringify(me.notification_prefs) === "{}" && JSON.stringify(me.quick_actions) === "[]" && me.dob === null && groups === 0;
    return ok || { old, tree, me, groups };
  });
  await check("A managed child's profile is untouched", async () => {
    const baby = (await db.query(`select full_name, status, role from members where id = '${M("a3")}'`)).rows[0];
    return (baby.full_name === "Baby A" && baby.role === "child_managed") || baby;
  });

  // Households of their own (as live, members go with their household).
  await db.exec(`
    alter table members drop constraint if exists members_family_id_fkey;
    alter table members add constraint members_family_id_fkey foreign key (family_id) references families(id) on delete cascade;
  `);
  const leave = async (who) => {
    await as(who, "select request_account_deletion()");
    await db.exec(`update account_deletions set delete_after = now() - interval '1 minute' where auth_user_id = '${who}'`);
    return (await svc(`select finalize_account_deletion('${who}') r`))[0].r;
  };

  await check("A household with people on its family tree can be deleted: the tree goes with it", async () => {
    const t = (await db.query("select confdeltype from pg_constraint where conname = 'family_tree_people_family_id_fkey'")).rows[0];
    return t?.confdeltype === "c" || t;
  });
  // As on Supabase, every reference to a household goes with it (the
  // stand-ins in base.sql leave most of them plain).
  await db.exec(`
    do $$
    declare r record;
    begin
      for r in
        select c.conrelid::regclass t, c.conname, a.attname col
        from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
        where c.contype = 'f' and c.confrelid = 'public.families'::regclass and c.confdeltype = 'a' and c.conrelid <> 'public.families'::regclass
      loop
        execute format('alter table %s drop constraint %I', r.t, r.conname);
        execute format('alter table %s add constraint %I foreign key (%I) references public.families(id) on delete cascade', r.t, r.conname, r.col);
      end loop;
    end
    $$;
  `);
  await check("The only grown-up of a household with a managed child: the household goes, the child's profile with it", async () => {
    const F = "f0000000-0000-0000-0000-000000000000";
    const FAY = "10000000-0000-0000-0000-0000000000f1";
    await db.exec(`
      insert into families (id, name) values ('${F}', 'House F');
      insert into people (id, auth_user_id) values ('${M("f1")}', '${FAY}'), ('${M("f2")}', null);
      insert into members (id, family_id, person_id, auth_user_id, full_name, role, status, is_organiser, dob) values
        ('${M("f1")}', '${F}', '${M("f1")}', '${FAY}', 'Fay F', 'parent', 'active', true, null),
        ('${M("f2")}', '${F}', '${M("f2")}', null, 'Tot F', 'child_managed', 'managed', false, '2022-05-01');
      insert into health_medicines (family_id, member_id, name) values ('${F}', '${M("f2")}', 'Tot drops');
      insert into member_avatars (member_id, family_id, storage_path) values ('${M("f2")}', '${F}', '${F}/avatars/tot.jpg');
    `);
    const told = (await as(FAY, "select my_account_deletion_plan() p"))[0].p;
    const r = await leave(FAY);
    await svc(`select delete_household_for_account_deletion('${F}')`);
    const house = await count(`select count(*) n from families where id = '${F}'`);
    const totLeft = await count(`select (select count(*) from members where id = '${M("f2")}') + (select count(*) from health_medicines where member_id = '${M("f2")}') + (select count(*) from member_avatars where member_id = '${M("f2")}') n`);
    const ok = told.kind === "last_grown_up" && r.delete_families.includes(F) && house === 0 && totLeft === 0;
    return ok || { told, r, house, totLeft };
  });
  await check("The only grown-up of a household with a child who signs in: the household goes, the child's login is not touched", async () => {
    // A namesake once in House D: the vault's log can't tell whose "Dan D"
    // it is, so it is left.
    await db.exec(`
      insert into members (family_id, full_name, role, status) values ('${D}', 'Dan D', 'adult', 'removed');
      insert into vault_emergency_notices (family_id, body, dismissed_by_name) values ('${D}', 'n', 'Dan D');
    `);
    const r = await leave("10000000-0000-0000-0000-0000000000d1");
    const notice = (await db.query(`select dismissed_by_name n from vault_emergency_notices where family_id = '${D}'`)).rows[0].n;
    if (notice !== "Dan D") return { notice };
    await svc(`select delete_household_for_account_deletion('${D}')`);
    const house = await count(`select count(*) n from families where id = '${D}'`);
    const dee = await count(`select count(*) n from people where id = '${M("d2")}'`);
    const ok = r.delete_families.includes(D) && house === 0 && dee === 1;
    return ok || { r, dee, house };
  });
  await check("Someone alone in their household: the job names it, and deletes it", async () => {
    const G = "90000000-0000-0000-0000-000000000000";
    const GIL = "10000000-0000-0000-0000-0000000000f9";
    await db.exec(`
      insert into families (id, name) values ('${G}', 'House G');
      insert into people (id, auth_user_id) values ('${M("f9")}', '${GIL}');
      insert into members (id, family_id, person_id, auth_user_id, full_name, role, is_organiser) values ('${M("f9")}', '${G}', '${M("f9")}', '${GIL}', 'Gil G', 'adult', true);
      -- A photo of a former member's, added to House G's journal from "Just me".
      insert into journal_media (family_id, owner_person_id, visibility, storage_path) values ('${G}', '${M("b1")}', 'household', 'person/${M("b1")}/old.jpg');
    `);
    const told = (await as(GIL, "select my_account_deletion_plan() p"))[0].p;
    const early = await refused(() => svc(`select delete_household_for_account_deletion('${G}')`), "still has a grown-up in it");
    const r = await leave(GIL);
    const paths = (await svc(`select delete_household_for_account_deletion('${G}') p`))[0].p;
    const after = await count(`select count(*) n from families where id = '${G}'`);
    const ok = told.kind === "delete_household" && early === true && r.delete_families.includes(G) && after === 0 && paths.includes(`person/${M("b1")}/old.jpg`);
    return ok || { told, early, r, after, paths };
  });
  await check("A grown-up and a teen both leaving: the household goes with the grown-up", async () => {
    const H = "80000000-0000-0000-0000-000000000000";
    const HAL = "10000000-0000-0000-0000-0000000000e1";
    const HANA = "10000000-0000-0000-0000-0000000000e2";
    await db.exec(`
      insert into families (id, name) values ('${H}', 'House H');
      insert into people (id, auth_user_id) values ('${M("e1")}', '${HAL}'), ('${M("e2")}', '${HANA}');
      insert into members (id, family_id, person_id, auth_user_id, full_name, role, is_organiser) values
        ('${M("e1")}', '${H}', '${M("e1")}', '${HAL}', 'Hal H', 'parent', true),
        ('${M("e2")}', '${H}', '${M("e2")}', '${HANA}', 'Hana H', 'child_self', false);
    `);
    await as(HANA, "select request_account_deletion()");
    const first = await leave(HAL);
    const between = await count(`select count(*) n from families where id = '${H}'`);
    await svc(`select delete_household_for_account_deletion('${H}')`);
    const second = await leave(HANA);
    const after = await count(`select count(*) n from families where id = '${H}'`);
    const ok = first.delete_families.includes(H) && between === 1 && second.delete_families.length === 0 && after === 0;
    return ok || { first, between, second, after };
  });
  await check("Two grown-ups both leaving with a child: the household stays until the second goes, and goes with them", async () => {
    const K = "70000000-0000-0000-0000-000000000000";
    const KAI = "10000000-0000-0000-0000-0000000000b7";
    const KIT = "10000000-0000-0000-0000-0000000000b8";
    await db.exec(`
      insert into families (id, name) values ('${K}', 'House K');
      insert into people (id, auth_user_id) values ('${M("b7")}', '${KAI}'), ('${M("b8")}', '${KIT}'), ('${M("b9")}', null);
      insert into members (id, family_id, person_id, auth_user_id, full_name, role, status, is_organiser) values
        ('${M("b7")}', '${K}', '${M("b7")}', '${KAI}', 'Kai K', 'parent', 'active', true),
        ('${M("b8")}', '${K}', '${M("b8")}', '${KIT}', 'Kit K', 'adult', 'active', false),
        ('${M("b9")}', '${K}', '${M("b9")}', null, 'Kid K', 'child_managed', 'managed', false);
    `);
    // Kit is not the organizer, but is the only grown-up staying once Kai has asked.
    await as(KAI, "select request_account_deletion()");
    const toldKit = (await as(KIT, "select my_account_deletion_plan() p"))[0].p;
    await as(KIT, "select request_account_deletion()");
    const first = await leave(KAI);
    const early = await refused(() => svc(`select delete_household_for_account_deletion('${K}')`), "still has a grown-up in it");
    const second = await leave(KIT);
    await svc(`select delete_household_for_account_deletion('${K}')`);
    const after = await count(`select count(*) n from families where id = '${K}'`);
    const ok = toldKit.kind === "last_grown_up" && first.delete_families.length === 0 && early === true && second.delete_families.includes(K) && after === 0;
    return ok || { toldKit, first, early, second, after };
  });
  await check("A household with a grown-up left in it is refused by the job's delete", () => refused(() => svc(`select delete_household_for_account_deletion('${A}')`), "still has a grown-up in it"));
}
