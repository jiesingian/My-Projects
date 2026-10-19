import { test, expect } from "@playwright/test";
import { cleanQuestion, maySeeSheet, recentIllness, recentVitals, sheetText, vaccineLines } from "@/lib/visit-sheet";
import { vaccineGuide } from "@/lib/vaccine-schedule";

/** The doctor-visit sheet, without a browser or a database: who may open it,
 * which readings and illnesses go on it, a child's vaccines, and the text
 * that is shared. */

test("grown-ups and the person themself; not another child, never kid view", () => {
  expect(maySeeSheet({ id: "mom", role: "parent", kidView: false }, "lola")).toBe(true);
  expect(maySeeSheet({ id: "tito", role: "adult", kidView: false }, "baby")).toBe(true);
  expect(maySeeSheet({ id: "teen", role: "child_self", kidView: false }, "teen")).toBe(true);
  expect(maySeeSheet({ id: "teen", role: "child_self", kidView: false }, "baby")).toBe(false);
  expect(maySeeSheet({ id: "teen", role: "child_self", kidView: true }, "teen")).toBe(false);
});

test("recentVitals: the latest of each kind in 90 days, two earlier, steps left off", () => {
  const v = (vital_type: string, reading_date: string, value_text: string, unit = "") => ({ vital_type, reading_date, value_text, unit });
  const lines = recentVitals(
    [
      v("blood_pressure", "2026-10-10", "135/88"),
      v("blood_pressure", "2026-10-18", "128/84"),
      v("blood_pressure", "2026-09-01", "140/90"),
      v("blood_pressure", "2026-08-01", "150/95"),
      v("blood_pressure", "2026-06-01", "160/100"),
      v("weight", "2026-10-01", "62.5", "kg"),
      v("steps", "2026-10-18", "9000"),
      v("weight", "2026-10-25", "70", "kg"),
    ],
    "2026-10-19",
  );
  expect(lines).toEqual([
    { label: "Blood pressure", latest: "128/84", on: "2026-10-18", earlier: ["135/88", "140/90"] },
    { label: "Weight", latest: "62.5 kg", on: "2026-10-01", earlier: [] },
  ]);
});

test("recentIllness: the last 60 days, newest first, in one line each", () => {
  const day = (iso: string) => iso.slice(0, 10);
  const lines = recentIllness(
    [
      { logged_at: "2026-10-12T08:00:00Z", temperature_c: 38.6, symptoms: "cough, runny nose", given: "paracetamol", note: null },
      { logged_at: "2026-10-15T08:00:00Z", temperature_c: null, symptoms: null, given: null, note: "better, eating" },
      { logged_at: "2026-07-01T08:00:00Z", temperature_c: 39, symptoms: "fever", given: null, note: null },
      { logged_at: "2026-10-16T08:00:00Z", temperature_c: null, symptoms: " ", given: null, note: null },
    ],
    "2026-10-19",
    day,
  );
  expect(lines).toEqual([
    { day: "2026-10-15", text: "better, eating" },
    { day: "2026-10-12", text: "38.6 °C · cough, runny nose · gave paracetamol" },
  ]);
});

test("vaccineLines: given and due now, from the guide", () => {
  const guide = vaccineGuide("2026-06-01", [{ name: "BCG", dates: ["2026-06-02"] }], "2026-10-19");
  const v = vaccineLines(guide);
  expect(v.given).toContain("BCG (2026-06-02)");
  expect(v.dueNow.length).toBeGreaterThan(0);
  expect(v.dueNow.some((d) => d.endsWith("(overdue)"))).toBe(true);
});

test("cleanQuestion trims, joins lines and caps at 300", () => {
  expect(cleanQuestion("  Is the cough\n worth an X-ray?  ")).toBe("Is the cough worth an X-ray?");
  expect(cleanQuestion("   ")).toBe("");
  expect(cleanQuestion("a".repeat(400))).toHaveLength(300);
});

test("sheetText: allergies always, empty sections left out, questions last", () => {
  const text = sheetText({
    name: "Lola Nena",
    born: "1948-03-02",
    allergies: null,
    bloodType: "O+",
    doctor: null,
    medicines: ["Losartan 50 mg at 08:00"],
    conditions: [],
    vitals: [{ label: "Blood pressure", latest: "128/84", on: "2026-10-18", earlier: ["135/88"] }],
    illness: [],
    labs: [],
    vaccines: null,
    questions: ["Can the dose go down?"],
  });
  expect(text.split("\n")).toEqual([
    "FOR THE DOCTOR: Lola Nena, born 1948-03-02",
    "Allergies: none recorded",
    "Blood type: O+",
    "",
    "MEDICINES NOW",
    "- Losartan 50 mg at 08:00",
    "",
    "RECENT READINGS",
    "- Blood pressure: 128/84 (2026-10-18); earlier 135/88",
    "",
    "QUESTIONS TO ASK",
    "- Can the dose go down?",
  ]);
});
