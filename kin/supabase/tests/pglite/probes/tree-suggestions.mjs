// Suggested tree matches, "Is this the same Stella?"
// (20261006120000_tree_match_suggestions.sql). Suggested only between linked
// households, only to grown-ups; linked only when both households say yes;
// "Not the same" is for good, and only for the household that said it.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";
const C = "c0000000-0000-0000-0000-000000000000";
const D = "d0000000-0000-0000-0000-000000000000";
const T = (s) => `7ee00000-0000-0000-0000-0000000000${s}`;
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), ben = U("b1"), dan = U("d1");
  await db.exec(`
    insert into family_tree_people (id, family_id, full_name, dob, father_id, mother_id) values
      ('${T("01")}', '${A}', 'Stella Cruz', '1950-03-02', null, null),
      ('${T("02")}', '${A}', 'José Reyes', null, null, null),
      ('${T("03")}', '${A}', 'Ana Lopez', null, null, null),
      ('${T("04")}', '${A}', 'María Clara Reyes', null, '${T("02")}', '${T("03")}'),
      ('${T("05")}', '${A}', 'Pedro Santos', '1960-01-01', null, null),
      ('${T("11")}', '${B}', 'Stella Marie Cruz', '1950-03-02', null, null),
      ('${T("12")}', '${B}', 'Jose Reyes', null, null, null),
      ('${T("13")}', '${B}', 'ana lopez', null, null, null),
      ('${T("14")}', '${B}', 'Maria Reyes', null, '${T("12")}', '${T("13")}'),
      ('${T("15")}', '${B}', 'Pedro Santos', '1961-01-01', null, null),
      ('${T("16")}', '${B}', 'Lito Cruz', '1950-03-02', null, null),
      ('${T("31")}', '${C}', 'Stella Cruz', '1950-03-02', null, null),
      ('${T("41")}', '${D}', 'Stella Cruz', '1950-03-02', null, null);
  `);
  const list = (who) => as(who, "select * from tree_match_suggestions() order by other_family_name, other_name");
  const pair = (rows, mine, theirs) => rows.find((r) => r.person_id === T(mine) && r.other_person_id === T(theirs));

  await check("Names compare by first and last word, without case or accents", async () => {
    const r = await as(ann, "select tree_name_key('  María  Clara REYES ') a, tree_name_key('Ana Santos-Reyes') b, tree_name_key('   ') c");
    return r[0].a === "maria reyes" && r[0].b === "ana santos-reyes" && r[0].c === null;
  });

  let annSees;
  await check("A grown-up is shown Stella in a linked household, by birth date", async () => {
    annSees = await list(ann);
    return pair(annSees, "01", "11")?.reason === "birth date" && pair(annSees, "01", "11").other_birth_year === "1950";
  });
  await check("…and Maria, by both parents' names", async () => pair(annSees, "04", "14")?.reason === "parents");
  await check("…and the Stella of another linked household", async () => !!pair(annSees, "01", "31"));
  await check("A different birth date with no parents is not suggested", async () => !pair(annSees, "05", "15"));
  await check("The same birth date and another name is not suggested", async () => !annSees.some((r) => r.other_person_id === T("16")));
  await check("A household that is not linked is never suggested", async () => !annSees.some((r) => r.other_family_id === D));
  await check("The other household sees the same pair from its side", async () => !!pair(await list(ben), "11", "01"));
  await check("A child sees no suggestions", async () => (await list(kid)).length === 0);
  await check("A stranger sees none of these", async () => (await list(dan)).length === 0);

  // "Same person": an offer first, linked only when the other side says yes.
  let offer;
  await check("Ann's yes is an offer, and her side shows it waiting", async () => {
    offer = (await as(ann, "select offer_tree_person($1, $2) as id", [T("01"), B]))[0].id;
    return pair(await list(ann), "01", "11")?.we_offered === true;
  });
  await check("Nothing is matched yet", async () => (await as(ann, "select 1 from family_tree_matches where status = 'accepted'")).length === 0);
  await check("Ben's side carries Ann's offer to accept", async () => pair(await list(ben), "11", "01")?.their_offer_id === offer);
  await check("Ben's yes links them", async () => {
    await as(ben, "select respond_tree_offer($1, true, $2)", [offer, T("11")]);
    return (await as(ann, "select to_person_id from family_tree_matches where id = $1 and status = 'accepted'", [offer]))[0]?.to_person_id === T("11");
  });
  await check("Once linked, neither side is asked again", async () => !pair(await list(ann), "01", "11") && !pair(await list(ben), "11", "01"));

  // "Not the same".
  await check("Ann says Maria is not the same, and it is gone for her", async () => {
    await as(ann, "select dismiss_tree_suggestion($1, $2)", [T("04"), T("14")]);
    return !pair(await list(ann), "04", "14");
  });
  await check("It is still Ben's to answer", async () => !!pair(await list(ben), "14", "04"));
  await check("Ben cannot read Ann's household's answer", async () => (await as(ben, "select 1 from family_tree_match_dismissals")).length === 0);
  await check("Another grown-up of Ann's household sees it gone too", async () => {
    await db.exec(`update members set role = 'adult' where id = '00000000-0000-0000-0000-0000000000a4'`);
    return !pair(await list(U("a4")), "04", "14");
  });
  await check("A child cannot dismiss one", async () => refused(() => as(kid, "select dismiss_tree_suggestion($1, $2)", [T("01"), T("31")])));
  await check("Nobody dismisses a pair they were never shown", async () => refused(() => as(ann, "select dismiss_tree_suggestion($1, $2)", [T("05"), T("15")])));
  await check("A stranger cannot dismiss Ann's suggestion", async () => refused(() => as(dan, "select dismiss_tree_suggestion($1, $2)", [T("01"), T("31")])));
  await check("Nobody writes a dismissal directly", async () =>
    refused(() => as(ann, "insert into family_tree_match_dismissals (family_id, person_id, other_person_id) values ($1, $2, $3)", [A, T("01"), T("31")])));
  await check("Nobody undoes one directly", async () => {
    await as(ann, "delete from family_tree_match_dismissals").catch(() => null);
    return !pair(await list(ann), "04", "14");
  });
}
