import { test, expect } from "@playwright/test";
import {
  buildGedcom,
  gedcomExactDate,
  gedcomFileName,
  importNotes,
  importPlan,
  matchImport,
  parseGedcom,
  presumedLiving,
  sameRelative,
  treeNameKey,
  type ExportPerson,
} from "@/lib/gedcom";

/** A tree file in and out: reading what MyHeritage, FamilySearch and
 * Ancestry write, matching it against the tree by the "Is this the same
 * Stella?" rule, and writing a file that says no more than a name and a birth
 * year about anyone who may be alive. */

// The shape a MyHeritage export has: CRLF, a BOM, CONC/CONT, loose dates.
const FILE = [
  "﻿0 HEAD",
  "1 SOUR MYHERITAGE",
  "2 NAME MyHeritage Family Tree Builder",
  "1 GEDC",
  "2 VERS 5.5.1",
  "1 CHAR UTF-8",
  "0 @I1@ INDI",
  "1 NAME Ernesto /Singian/",
  "1 SEX M",
  "1 BIRT",
  "2 DATE ABT 1920",
  "2 PLAC Pampanga",
  "1 DEAT",
  "2 DATE 12 MAR 1998",
  "1 FAMS @F1@",
  "0 @I2@ INDI",
  "1 NAME María /Arenas/",
  "1 SEX F",
  "1 BIRT",
  "2 DATE 2 FEB 1925",
  "1 FAMS @F1@",
  "0 @I3@ INDI",
  "1 NAME Stella Marie /Singian/",
  "1 SEX F",
  "1 BIRT",
  "2 DATE 14 JUN 1955",
  "1 NOTE A very long note that goes",
  "2 CONC  on.",
  "1 FAMC @F1@",
  "0 @I4@ INDI",
  "1 NAME /Ghost/",
  "1 FAMC @F9@",
  "0 @F1@ FAM",
  "1 HUSB @I1@",
  "1 WIFE @I2@",
  "1 CHIL @I3@",
  "0 TRLR",
].join("\r\n");

test("a file's people, with parents, spouse, exact days and loose ones", () => {
  const { people, source } = parseGedcom(FILE);
  expect(source).toBe("MyHeritage Family Tree Builder");
  expect(people.map((p) => p.fullName)).toEqual(["Ernesto Singian", "María Arenas", "Stella Marie Singian", "Ghost"]);
  const [ernesto, maria, stella, ghost] = people;
  expect(ernesto).toMatchObject({ sex: "M", dob: null, birthText: "ABT 1920", birthPlace: "Pampanga", died: true, deathText: "12 MAR 1998", spouseRef: "@I2@" });
  expect(maria).toMatchObject({ dob: "1925-02-02", spouseRef: "@I1@", died: false });
  expect(stella).toMatchObject({ dob: "1955-06-14", fatherRef: "@I1@", motherRef: "@I2@", spouseRef: null });
  // A family that is not in the file links to nobody.
  expect(ghost).toMatchObject({ fatherRef: null, motherRef: null });
});

test("a child named only under the family's CHIL still has their parents", () => {
  const ged = ["0 @A@ INDI", "1 NAME Pedro /Cruz/", "0 @B@ INDI", "1 NAME Rosa /Cruz/", "0 @C@ INDI", "1 NAME Lito /Cruz/", "0 @F@ FAM", "1 HUSB @A@", "1 WIFE @B@", "1 CHIL @C@", "0 TRLR"].join("\n");
  const [a, b, c] = parseGedcom(ged).people;
  expect(c).toMatchObject({ fatherRef: "@A@", motherRef: "@B@" });
  expect([a.spouseRef, b.spouseRef]).toEqual(["@B@", "@A@"]);
});

test("only an exact, real day becomes a date; the rest is kept as words", () => {
  expect(gedcomExactDate("3 MAY 1975")).toBe("1975-05-03");
  expect(gedcomExactDate("31 FEB 1975")).toBeNull();
  expect(gedcomExactDate("MAY 1975")).toBeNull();
  expect(gedcomExactDate("BET 1900 AND 1910")).toBeNull();
  const [ernesto] = parseGedcom(FILE).people;
  expect(importNotes(ernesto)).toBe("Born about 1920 in Pampanga. Died 12 Mar 1998.");
});

test("the same relative: same name, and the same birth date or the same parents", () => {
  // Accents, case and middle names never keep two records apart, as in tree_name_key().
  expect(treeNameKey("  María  de la CRUZ ")).toBe("maria cruz");
  expect(treeNameKey("Stella Marie Singian")).toBe(treeNameKey("stella singian"));
  const ours = { id: "o1", fullName: "Stella Singian", dob: "1955-06-14", fatherName: null, motherName: null };
  expect(sameRelative({ fullName: "Stella M. Singian", dob: "1955-06-14", fatherName: null, motherName: null }, ours)).toBe(true);
  // A name alone is not enough.
  expect(sameRelative({ fullName: "Stella Singian", dob: null, fatherName: null, motherName: null }, ours)).toBe(false);
  // Different birth dates, and no parents to go on.
  expect(sameRelative({ fullName: "Stella Singian", dob: "1956-01-01", fatherName: null, motherName: null }, ours)).toBe(false);
  // All four parents recorded and the same.
  const withParents = { ...ours, dob: null, fatherName: "Ernesto Singian", motherName: "Maria Arenas" };
  expect(sameRelative({ fullName: "Stella Singian", dob: null, fatherName: "Ernesto R. Singian", motherName: "María Arenas" }, withParents)).toBe(true);
  expect(sameRelative({ fullName: "Stella Singian", dob: null, fatherName: "Ernesto Singian", motherName: null }, withParents)).toBe(false);
});

test("matching is one to one, and the plan fills gaps without overruling the tree", () => {
  const { people } = parseGedcom(FILE);
  const ours = [
    { id: "o-stella", fullName: "Stella Singian", dob: "1955-06-14", fatherName: null, motherName: null, fatherId: null, motherId: "o-mama", spouseId: null },
    { id: "o-mama", fullName: "Maria Arenas", dob: null, fatherName: null, motherName: null, fatherId: null, motherId: null, spouseId: null },
  ];
  const same = matchImport(people, ours);
  // Stella by her birth date; María then as Stella's mother on our tree.
  expect(Object.fromEntries(same)).toEqual({ "@I3@": "o-stella", "@I2@": "o-mama" });

  const plan = importPlan(people, same, new Set(["@I4@"]), ours);
  expect(plan.existing).toEqual({ "@I3@": "o-stella", "@I2@": "o-mama" });
  expect(plan.add.map((a) => a.ref)).toEqual(["@I1@"]);
  expect(plan.add[0]).toMatchObject({ fullName: "Ernesto Singian", spouseRef: "@I2@", notes: "Born about 1920 in Pampanga. Died 12 Mar 1998." });
  // Stella gains a father, and Mama a husband; Stella's mother stays.
  expect(plan.fill).toEqual([
    { personId: "o-mama", fatherRef: null, motherRef: null, spouseRef: "@I1@" },
    { personId: "o-stella", fatherRef: "@I1@", motherRef: null, spouseRef: null },
  ]);

  // Leaving Ernesto out drops every link to him.
  const without = importPlan(people, same, new Set(["@I1@", "@I4@"]), ours);
  expect(without.add).toEqual([]);
  expect(without.fill).toEqual([]);

  // "Not the same person": María is added after all, as Stella's mother in the file.
  same.delete("@I2@");
  const apart = importPlan(people, same, new Set(["@I4@"]), ours);
  expect(apart.add.map((a) => a.ref)).toEqual(["@I1@", "@I2@"]);
});

test("from a matched person, their parents and spouse with the same names are ours too", () => {
  const ged = ["0 @A@ INDI", "1 NAME Pedro /Cruz/", "0 @B@ INDI", "1 NAME Rosa /Cruz/", "1 BIRT", "2 DATE 1901", "0 @C@ INDI", "1 NAME Lito /Cruz/", "1 BIRT", "2 DATE 4 JUL 1921", "0 @F@ FAM", "1 HUSB @A@", "1 WIFE @B@", "1 CHIL @C@", "0 TRLR"].join("\n");
  const { people } = parseGedcom(ged);
  const ours = [
    { id: "lito", fullName: "Lito Cruz", dob: "1921-07-04", fatherName: "Pedro Cruz", motherName: "Rosa Cruz", fatherId: "pedro", motherId: "rosa", spouseId: null },
    { id: "pedro", fullName: "Pedro Cruz", dob: null, fatherName: null, motherName: null, fatherId: null, motherId: null, spouseId: "rosa" },
    // A birth year that disagrees keeps them apart.
    { id: "rosa", fullName: "Rosa Cruz", dob: "1899-01-01", fatherName: null, motherName: null, fatherId: null, motherId: null, spouseId: "pedro" },
  ];
  expect(Object.fromEntries(matchImport(people, ours))).toEqual({ "@C@": "lito", "@A@": "pedro" });
});

test("whoever may be alive: no death recorded, and born within 110 years or not known", () => {
  expect(presumedLiving({ notes: null, dob: "1955-06-14", birthYear: null }, 2026)).toBe(true);
  expect(presumedLiving({ notes: null, dob: null, birthYear: null }, 2026)).toBe(true);
  expect(presumedLiving({ notes: null, dob: null, birthYear: "1900" }, 2026)).toBe(false);
  expect(presumedLiving({ notes: "Born about 1920. Died 12 Mar 1998.", dob: null, birthYear: null }, 2026)).toBe(false);
});

test("the file written: families, and a living person's birth as a year only", () => {
  const people: ExportPerson[] = [
    { id: "a", fullName: "Ernesto Singian", sex: null, dob: null, birthYear: null, notes: "Born about 1920. Died 12 Mar 1998.", fatherId: null, motherId: null, spouseId: "b" },
    { id: "b", fullName: "Maria Arenas", sex: "F", dob: "1925-02-02", birthYear: "1925", notes: "Lola's own words", fatherId: null, motherId: null, spouseId: "a" },
    { id: "c", fullName: "Stella Singian", sex: "F", dob: "1955-06-14", birthYear: "1955", notes: "Allergic to penicillin", fatherId: "a", motherId: "b", spouseId: null },
    { id: "x:m1:9", fullName: "Ben Reyes", sex: null, dob: null, birthYear: "1990", notes: null, fatherId: null, motherId: "c", spouseId: null },
  ];
  const ged = buildGedcom(people, { household: "Singian", today: "2026-10-19" });
  const lines = ged.split("\r\n");
  expect(lines[0]).toBe("0 HEAD");
  expect(ged).toContain("2 VERS 5.5.1");
  expect(ged).toContain("1 CHAR UTF-8");
  expect(lines.at(-2)).toBe("0 TRLR");
  expect(lines.every((l) => l.length <= 255)).toBe(true);

  // Ernesto: a father, so M; dead, so his notes go too.
  expect(ged).toContain("0 @I1@ INDI\r\n1 NAME Ernesto /Singian/\r\n1 SEX M\r\n1 DEAT Y\r\n1 NOTE Born about 1920. Died 12 Mar 1998.");
  // Stella may be alive: 1955, never 14 June, and not her notes.
  expect(ged).not.toContain("14 JUN 1955");
  expect(ged).not.toContain("penicillin");
  expect(ged).toContain("0 @I3@ INDI\r\n1 NAME Stella /Singian/\r\n1 SEX F\r\n1 BIRT\r\n2 DATE 1955");
  // Maria, born 1925, is within 110 years and has no death: a year only too.
  expect(ged).not.toContain("2 FEB 1925");

  // One family for the couple and their child, one for Stella and her son.
  const fams = ged.split("\r\n0 ").filter((r) => r.match(/^@F\d+@ FAM/));
  expect(fams).toHaveLength(2);
  expect(fams[0]).toContain("1 HUSB @I1@\r\n1 WIFE @I2@\r\n1 CHIL @I3@");
  expect(fams[1]).toContain("1 WIFE @I3@\r\n1 CHIL @I4@");

  // Read back by our own reader, the people and links survive.
  const back = parseGedcom(ged).people;
  expect(back.map((p) => p.fullName)).toEqual(["Ernesto Singian", "Maria Arenas", "Stella Singian", "Ben Reyes"]);
  expect(back[2]).toMatchObject({ fatherRef: "@I1@", motherRef: "@I2@" });
  expect(back[0].spouseRef).toBe("@I2@");
  expect(gedcomFileName("Singian")).toBe("Singian family tree.ged");
});

test("a long note is folded to the line limit and reads back whole", () => {
  const note = `Died 1990. ${"x".repeat(600)}\nSecond line`;
  const ged = buildGedcom([{ id: "a", fullName: "A B", sex: null, dob: null, birthYear: "1850", notes: note, fatherId: null, motherId: null, spouseId: null }], { household: "H", today: "2026-10-19" });
  expect(ged.split("\r\n").every((l) => l.length <= 255)).toBe(true);
  expect(ged).toMatch(/2 CONC x+/);
  expect(ged).toContain("2 CONT Second line");
});
