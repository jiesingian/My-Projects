import { test, expect } from "@playwright/test";
import { doseAlarmUrl, doseFromKey, doseFromParams } from "@/lib/dose-alarm";

const MED = "3f2a9c1e-1b2c-4d5e-8f90-1234567890ab";

/** Which reminders ring as an alarm, and where they open (lib/dose-alarm.ts). */
test.describe("dose alarm", () => {
  test("a dose reminder and its repeats name the dose", () => {
    expect(doseFromKey(`dose:${MED}:2026-10-22:08:00`)).toEqual({ medicineId: MED, day: "2026-10-22", time: "08:00" });
    expect(doseFromKey(`dose-again:${MED}:2026-10-22:08:00:2`)).toEqual({ medicineId: MED, day: "2026-10-22", time: "08:00" });
  });
  test("every other reminder is not an alarm", () => {
    for (const key of [`bill:${MED}:2026-10-22:today`, `soon:${MED}:x`, `missed-dose:${MED}:2026-10-22:08:00`, "dose:not-a-uuid:2026-10-22:08:00", `dose:${MED}:22-10-2026:08:00`, `dose:${MED}:2026-10-22:8am`]) {
      expect(doseFromKey(key), key).toBeNull();
    }
  });
  test("the alarm page reads back exactly what the push sent", () => {
    const d = { medicineId: MED, day: "2026-10-22", time: "20:00" };
    const url = new URL(doseAlarmUrl(d), "https://kin.example");
    expect(url.pathname).toBe("/today/dose");
    expect(doseFromParams(Object.fromEntries(url.searchParams))).toEqual(d);
    expect(doseFromParams({ med: MED, day: "2026-10-22" })).toBeNull();
  });
});
