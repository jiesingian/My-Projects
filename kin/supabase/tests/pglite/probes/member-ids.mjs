// Government ID numbers (20261030140000): readable by the person and their
// household's parents and adults, never by a child's own login or another
// household; written by the person, the organizer, or a grown-up for a
// managed child; and held off members for good.
const ANN = "10000000-0000-0000-0000-0000000000a1"; // parent, household A
const KID = "10000000-0000-0000-0000-0000000000a2"; // child with a login, A
const BEN = "10000000-0000-0000-0000-0000000000b1"; // parent, household B
const P = (x) => `00000000-0000-0000-0000-0000000000${x}`;

export default async function ({ db, as, check, refused }) {
  await db.exec("reset role");
  await db.exec(`update members set status = 'managed' where id = '${P("a3")}'`);
  const sss = async (who, person) => (await as(who, `select sss_number from member_ids where person_id = '${person}'`)).map((r) => r.sss_number);

  await check("Ann writes her own numbers", async () => {
    await as(ANN, `insert into member_ids (person_id, sss_number) values ('${P("a1")}', '34-1234567-8')`);
    return (await sss(ANN, P("a1")))[0] === "34-1234567-8";
  });
  await check("A child's own login cannot read a grown-up's numbers", async () => (await sss(KID, P("a1"))).length === 0);
  await check("Another household cannot read them", async () => (await sss(BEN, P("a1"))).length === 0);
  await check("The child writes and reads their own", async () => {
    await as(KID, `insert into member_ids (person_id, tin_number) values ('${P("a2")}', '123-456-789')`);
    return (await as(KID, `select tin_number from member_ids where person_id = '${P("a2")}'`))[0]?.tin_number === "123-456-789";
  });
  await check("A parent reads the child's", async () => (await as(ANN, `select 1 from member_ids where person_id = '${P("a2")}'`)).length === 1);
  await check("A child cannot write a grown-up's", () => refused(() => as(KID, `insert into member_ids (person_id, sss_number) values ('${P("a3")}', 'x')`)));
  await check("A parent writes a managed child's", async () => {
    await as(ANN, `insert into member_ids (person_id, philhealth_number) values ('${P("a3")}', '12-345678901-2')`);
    return (await as(ANN, `select 1 from member_ids where person_id = '${P("a3")}'`)).length === 1;
  });
  await check("Another household cannot write anyone's", () => refused(() => as(BEN, `insert into member_ids (person_id, sss_number) values ('${P("d1")}', 'x')`)));
  await check("The old columns on members stay empty", () =>
    refused(async () => {
      await db.exec("reset role");
      await db.query(`update members set sss_number = '1' where id = '${P("a1")}'`);
    }),
  );
  await check("can_read_member_ids says no to a child for a grown-up, yes to the parent for the child", async () => {
    const kid = (await as(KID, `select can_read_member_ids('${P("a1")}') ok`))[0].ok;
    const ann = (await as(ANN, `select can_read_member_ids('${P("a2")}') ok`))[0].ok;
    return (kid === false && ann === true) || { kid, ann };
  });
  await check("can_write_member_ids says no to another household", async () => (await as(BEN, `select can_write_member_ids('${P("a1")}') ok`))[0].ok === false);
  await check("member_ids_sweep_former_member: a deleted account's numbers go", async () => {
    await db.exec("reset role");
    await db.query(`update members set auth_user_id = null, status = 'removed' where id = '${P("a2")}'`);
    const left = (await db.query(`select 1 from member_ids where person_id = '${P("a2")}'`)).rows.length;
    await db.query(`update members set auth_user_id = '${KID}', status = 'active' where id = '${P("a2")}'`);
    return left === 0 || left;
  });
  await db.exec("reset role");
  await db.exec(`delete from member_ids; update members set status = 'active' where id = '${P("a3")}'`);
}
