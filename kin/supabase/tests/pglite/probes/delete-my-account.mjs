// Delete my account (20261021020000): a request waits 7 days and can be
// taken back; only the job finalizes. The hand-over rules: the last
// grown-up organizer hands to another grown-up (a parent before an adult);
// with no grown-up left the household is deleted. Their own data goes;
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
  await check("With no other grown-up (only children), the household is to be deleted", async () => {
    const p = await plan(M("d1"));
    return (p.kind === "delete_household" && p.family_id === D) || p;
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

  await check("After 7 days the job removes their own data and keeps the shared records under 'Former member'", async () => {
    await db.exec("update account_deletions set delete_after = now() - interval '1 minute'");
    const due = await svc("select * from due_account_deletions() u");
    const r = (await svc(`select finalize_account_deletion('${ANN}') r`))[0].r;
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
  await check("A managed child's profile is untouched", async () => {
    const baby = (await db.query(`select full_name, status, role from members where id = '${M("a3")}'`)).rows[0];
    return (baby.full_name === "Baby A" && baby.role === "child_managed") || baby;
  });

  await check("The household's only grown-up: the job names the household, and it is deleted only once no grown-up is left", async () => {
    // A household of its own (as live, members go with their household).
    const F = "f0000000-0000-0000-0000-000000000000";
    const FAY = "10000000-0000-0000-0000-0000000000f1";
    await db.exec(`
      alter table members drop constraint if exists members_family_id_fkey;
      alter table members add constraint members_family_id_fkey foreign key (family_id) references families(id) on delete cascade;
      insert into families (id, name) values ('${F}', 'House F');
      insert into people (id, auth_user_id) values ('${M("f1")}', '${FAY}');
      insert into members (id, family_id, person_id, auth_user_id, full_name, role, is_organiser) values
        ('${M("f1")}', '${F}', '${M("f1")}', '${FAY}', 'Fay F', 'parent', true),
        ('${M("f2")}', '${F}', null, null, 'Tot F', 'child_managed', false);
    `);
    await as(FAY, "select request_account_deletion()");
    const early = await refused(() => svc(`select delete_household_for_account_deletion('${F}')`), "still has a grown-up");
    await db.exec(`update account_deletions set delete_after = now() - interval '1 minute' where auth_user_id = '${FAY}'`);
    const r = (await svc(`select finalize_account_deletion('${FAY}') r`))[0].r;
    await svc(`select delete_household_for_account_deletion('${F}')`);
    const after = (await db.query(`select 1 from families where id = '${F}'`)).rows.length;
    return (early === true && r.delete_families.includes(F) && after === 0) || { early, r, after };
  });
  await check("A household with a grown-up left is refused by the job's delete", () => refused(() => svc(`select delete_household_for_account_deletion('${A}')`), "still has a grown-up"));
}
