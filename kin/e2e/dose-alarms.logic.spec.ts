import { test, expect } from "@playwright/test";
import { readAlarmFeed, alarmSummary, ALARM_LABEL_PREFIX } from "@/lib/dose-alarms";

/** Medicine doses as iPhone Clock alarms (23 October): what the "Kin Alarms"
 * Shortcut is handed, and what it shows when it's done. */

const alarm = (time: string, label = `${ALARM_LABEL_PREFIX} Losartan 50 mg`) => ({ time, hour: 0, minute: 0, label, until: null });

test("the feed keeps alarms with a real time and a Kin label, and reads the hour and minute", () => {
  const f = readAlarmFeed({ name: "Ann", tz: "Asia/Manila", today: "2026-10-23", alarms: [alarm("08:05"), alarm("20:30", "Kin · Zinc · Baby")] });
  expect(f?.alarms.map((a) => [a.time, a.hour, a.minute, a.label])).toEqual([
    ["08:05", 8, 5, "Kin · Losartan 50 mg"],
    ["20:30", 20, 30, "Kin · Zinc · Baby"],
  ]);
  expect(f?.name).toBe("Ann");
});

test("anything not shaped like an alarm is dropped, never passed on", () => {
  const f = readAlarmFeed({ alarms: [alarm("8am"), alarm("24:00"), alarm("07:00", "Wake up"), null, "x", { label: "Kin · x" }] });
  expect(f?.alarms).toEqual([]);
  expect(readAlarmFeed(null)).toBeNull();
  expect(readAlarmFeed("nope")).toBeNull();
  expect(readAlarmFeed({})?.alarms).toEqual([]);
});

test("an end date is carried; a missing one is null", () => {
  const f = readAlarmFeed({ alarms: [{ ...alarm("09:00"), until: "2026-11-01" }, alarm("10:00")] });
  expect(f?.alarms.map((a) => a.until)).toEqual(["2026-11-01", null]);
});

test("the summary counts the alarms and lists each time once", () => {
  expect(alarmSummary([])).toBe("No Kin alarms: no medicine has a dose time today.");
  expect(alarmSummary([alarm("08:00")].map((a) => ({ ...a })))).toBe("1 Kin alarm: 08:00.");
  expect(alarmSummary([alarm("08:00"), alarm("08:00", "Kin · Zinc · Baby"), alarm("20:00")])).toBe("3 Kin alarms: 08:00 and 20:00.");
  expect(alarmSummary([alarm("07:30"), alarm("08:00"), alarm("21:00")])).toBe("3 Kin alarms: 07:30, 08:00 and 21:00.");
});
