import { test, expect } from "@playwright/test";
import { dateAtAge, doseName, guideApplies, nextVaccine, vaccineFor, vaccineGuide, VACCINES } from "@/lib/vaccine-schedule";

// A child's vaccine guide (lib/vaccine-schedule.ts): ages to dates, recorded
// names to vaccines, and done / due / past due / later.

const dob = "2026-01-31";
const find = (g: ReturnType<typeof vaccineGuide>, key: string) => g.find((d) => d.key === key)!;

test("ages become days: weeks, and months that land past a short month's end", () => {
  expect(dateAtAge(dob, {})).toBe("2026-01-31");
  expect(dateAtAge(dob, { w: 6 })).toBe("2026-03-14");
  expect(dateAtAge(dob, { m: 1 })).toBe("2026-02-28");
  expect(dateAtAge(dob, { m: 9 })).toBe("2026-10-31");
  expect(dateAtAge(dob, { y: 1 })).toBe("2027-01-31");
  expect(dateAtAge("2024-02-29", { y: 1 })).toBe("2025-02-28");
  expect(dateAtAge(dob, { y: 9, m: 6 })).toBe("2035-07-31");
});

test("recorded names find their vaccine as whole words, the longest name winning", () => {
  expect(vaccineFor("BCG")?.name).toBe("BCG");
  expect(vaccineFor("Penta 2")?.name).toBe("Pentavalent");
  expect(vaccineFor("DPT-HepB-Hib")?.name).toBe("Pentavalent");
  expect(vaccineFor("DPT")?.name).toBe("Pentavalent");
  expect(vaccineFor("DPT booster")?.name).toBe("DTaP booster");
  expect(vaccineFor("Hepatitis B")?.name).toBe("Hepatitis B");
  expect(vaccineFor("Hep A")?.name).toBe("Hepatitis A");
  expect(vaccineFor("measles")?.name).toBe("Measles (MR/MMR)");
  expect(vaccineFor("School MR")?.name).toBe("School MR and Td");
  expect(vaccineFor("Prevnar 13")?.name).toBe("Pneumococcal (PCV)");
  // Not a vaccine, and no match inside another word.
  expect(vaccineFor("Asthma")).toBeNull();
  expect(vaccineFor("Amoxicillin")).toBeNull();
  expect(vaccineFor("hmr")).toBeNull();
});

test("a newborn with nothing recorded: birth doses due, the 6-week ones later", () => {
  const g = vaccineGuide(dob, [], "2026-02-05");
  expect(find(g, "BCG#1").status).toBe("due");
  expect(find(g, "Hepatitis B#1").status).toBe("due");
  expect(find(g, "Pentavalent#1").status).toBe("upcoming");
  expect(g[0].dueDate).toBe(dob);
  // In date order.
  expect(g.map((d) => d.dueDate)).toEqual([...g.map((d) => d.dueDate)].sort());
});

test("due from two weeks before, past due after the usual age", () => {
  // Pentavalent 1: from 14 March (6 weeks), by 11 April (10 weeks).
  expect(find(vaccineGuide(dob, [], "2026-02-27"), "Pentavalent#1").status).toBe("upcoming");
  expect(find(vaccineGuide(dob, [], "2026-02-28"), "Pentavalent#1").status).toBe("due");
  expect(find(vaccineGuide(dob, [], "2026-04-11"), "Pentavalent#1").status).toBe("due");
  expect(find(vaccineGuide(dob, [], "2026-04-12"), "Pentavalent#1").status).toBe("overdue");
});

test("recorded doses count in date order, under any of the vaccine's names", () => {
  const recorded = [
    { name: "Penta", dates: ["2026-04-25", "2026-03-15"] },
    { name: "DPT-HepB-Hib", dates: ["2026-05-10"] },
    { name: "BCG", dates: ["2026-01-31"] },
  ];
  const g = vaccineGuide(dob, recorded, "2026-06-01");
  expect(find(g, "Pentavalent#1").givenOn).toBe("2026-03-15");
  expect(find(g, "Pentavalent#2").givenOn).toBe("2026-04-25");
  expect(find(g, "Pentavalent#3")).toMatchObject({ status: "done", givenOn: "2026-05-10" });
  expect(find(g, "BCG#1").status).toBe("done");
  expect(find(g, "Hepatitis B#1").status).toBe("overdue");
  expect(find(g, "Oral polio (OPV)#1").status).toBe("overdue");
});

test("This week: the next dose due within the week, or one past due lately; not an old gap", () => {
  // 25 October: the 9-month doses (31 October) are due within the week.
  const recordedAll = VACCINES.filter((v) => v.doses[0].at.m === undefined && v.doses[0].at.y === undefined).map((v) => ({
    name: v.name,
    dates: v.doses.filter((d) => !d.at.m && !d.at.y).map((_, i) => `2026-0${3 + i}-20`),
  }));
  const g = vaccineGuide(dob, recordedAll, "2026-10-25");
  expect(doseName(nextVaccine(g, "2026-10-25")!)).toBe("Inactivated polio (IPV), 2nd of 2");
  // Two weeks ahead is "due" on the guide but not yet in "This week".
  expect(nextVaccine(vaccineGuide(dob, recordedAll, "2026-10-20"), "2026-10-20")).toBeNull();
  // A ten-year-old with nothing recorded is not nagged about BCG.
  expect(nextVaccine(vaccineGuide("2016-01-10", [], "2026-10-15"), "2026-10-15")).toBeNull();
  // A nine-year-old is told about HPV when its age comes, not for years after.
  expect(nextVaccine(vaccineGuide("2017-10-10", [], "2026-10-15"), "2026-10-15")?.key).toBe("HPV#1");
  expect(nextVaccine(vaccineGuide("2016-10-10", [], "2026-10-15"), "2026-10-15")).toBeNull();
  // But a dose that went past due last month is.
  const baby = nextVaccine(vaccineGuide(dob, [], "2026-04-05"), "2026-04-05");
  expect(baby?.key).toBe("BCG#1");
  expect(baby?.status).toBe("overdue");
});

test("dose names", () => {
  const g = vaccineGuide(dob, [], "2026-02-01");
  expect(doseName(find(g, "BCG#1"))).toBe("BCG");
  expect(doseName(find(g, "Pentavalent#2"))).toBe("Pentavalent, 2nd of 3");
});

test("the guide is for children with a birthday, under 18", () => {
  expect(guideApplies("child_managed", "2020-05-01", "2026-10-15")).toBe(true);
  expect(guideApplies("child_self", "2010-05-01", "2026-10-15")).toBe(true);
  expect(guideApplies("child_self", "2008-10-15", "2026-10-15")).toBe(false);
  expect(guideApplies("child_managed", null, "2026-10-15")).toBe(false);
  expect(guideApplies("adult", "2020-05-01", "2026-10-15")).toBe(false);
  expect(guideApplies("parent", "1990-05-01", "2026-10-15")).toBe(false);
  // A birthday in the future is a typo, not a child.
  expect(guideApplies("child_managed", "2027-01-01", "2026-10-15")).toBe(false);
});

test("every vaccine's doses come in order, each due before it is past due", () => {
  for (const v of VACCINES) {
    let last = "";
    for (const d of v.doses) {
      const at = dateAtAge(dob, d.at);
      expect(at >= last, `${v.name} ${d.label}`).toBe(true);
      expect(dateAtAge(dob, d.by) >= at, `${v.name} ${d.label}`).toBe(true);
      last = at;
    }
  }
});
