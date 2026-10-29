import { test, expect } from "@playwright/test";
import { petDueLine, petsDue } from "@/lib/pets";

/** Pets on Today (lib/pets, 20261029170000_pets.sql). */

test("vaccines and vet visits from overdue to a week ahead, soonest first; later ones wait", () => {
  const today = "2026-10-29";
  const due = petsDue(
    [
      { id: "p1", name: "Bantay", next_vaccine_on: "2026-11-02", next_vet_on: "2026-10-27" },
      { id: "p2", name: "Mingming", next_vaccine_on: today, next_vet_on: "2026-12-01" },
      { id: "p3", name: "Nemo", next_vaccine_on: null, next_vet_on: null },
    ],
    today,
  );
  expect(due.map((d) => [d.name, d.what, d.inDays])).toEqual([["Bantay", "vet visit", -2], ["Mingming", "vaccine", 0], ["Bantay", "vaccine", 4]]);
});

test("each line says when, in words", () => {
  const d = (inDays: number) => ({ petId: "p", name: "Bantay", what: "vaccine" as const, on: "2026-10-29", inDays });
  expect(petDueLine(d(0))).toBe("Bantay's vaccine is due today");
  expect(petDueLine(d(1))).toBe("Bantay's vaccine is due tomorrow");
  expect(petDueLine(d(4))).toBe("Bantay's vaccine is due in 4 days");
  expect(petDueLine(d(-1))).toBe("Bantay's vaccine was due yesterday");
  expect(petDueLine(d(-3))).toBe("Bantay's vaccine was due 3 days ago");
});
