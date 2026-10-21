import { test, expect } from "@playwright/test";
import { messageablePeople } from "@/lib/new-message";

/** "New message": the people you can write to now, your own household first. */

const p = (fullName: string, householdName: string | null, connected = true) => ({ personId: fullName, fullName, avatarUrl: null, householdName, connected });

test("household first, then everyone else, each by name", () => {
  const r = messageablePeople([p("Tita Nena", "Reyes"), p("Pat", "Testers"), p("Ben", "House B"), p("Ana", "Testers")], "Testers");
  expect(r.household.map((x) => x.fullName)).toEqual(["Ana", "Pat"]);
  expect(r.others.map((x) => x.fullName)).toEqual(["Ben", "Tita Nena"]);
});

test("a former connection is not offered", () => {
  const r = messageablePeople([p("Pat", "Testers"), p("Old friend", "Elsewhere", false)], "Testers");
  expect(r.others).toEqual([]);
  expect(r.household.map((x) => x.fullName)).toEqual(["Pat"]);
});

test("a connection with no household name is listed with the others", () => {
  expect(messageablePeople([p("Someone", null)], "Testers").others.map((x) => x.fullName)).toEqual(["Someone"]);
});

test("nobody to message is two empty lists", () => {
  expect(messageablePeople([], "Testers")).toEqual({ household: [], others: [] });
});
