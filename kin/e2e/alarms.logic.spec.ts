import { test, expect } from "@playwright/test";
import { buildAlarms, ringsFor, ALARM_MAX, type AlarmMedicine } from "@/lib/alarms";

/** Real alarms in the Kin iPhone app (29 October): which doses, plans,
 * check-ups and bills ring on whose phone, and when. Manila is UTC+8. */

const tz = "Asia/Manila";
const now = new Date("2026-10-29T00:00:00Z"); // 08:00 Manila, Thursday
const ann = { id: "ann", role: "parent", firstName: "Ann" };
const dan = { id: "dan", role: "adult", firstName: "Dan" };
const kid = { id: "kid", role: "child_self", firstName: "Kid" };
const med = (over: Partial<AlarmMedicine> = {}): AlarmMedicine => ({
  id: "11111111-1111-1111-1111-111111111111",
  name: "Losartan",
  dose: "50 mg",
  times: ["09:00", "21:00"],
  start_date: "2026-10-01",
  end_date: null,
  member_id: "ann",
  visibility: "family",
  created_by: "ann",
  member: { full_name: "Ann Tester", role: "parent" },
  ...over,
});
const none = { activities: [], appointments: [], bills: [] };

test("a dose rings at its time in the household's zone, from now on only", () => {
  const a = buildAlarms({ now, tz, me: ann, dosesOn: true, medicines: [med()], ...none, days: 2 });
  expect(a.map((x) => x.at)).toEqual(["2026-10-29T01:00:00.000Z", "2026-10-29T13:00:00.000Z", "2026-10-30T01:00:00.000Z", "2026-10-30T13:00:00.000Z"]);
  expect(a[0].title).toBe("Time for your Losartan");
  expect(a[0].body).toBe("50 mg · 09:00");
  expect(a[0].url).toBe("/today/dose?med=11111111-1111-1111-1111-111111111111&day=2026-10-29&time=09%3A00");
});

test("a dose already past today, an ended medicine and one not started make no alarm", () => {
  const past = buildAlarms({ now, tz, me: ann, dosesOn: true, medicines: [med({ times: ["07:00"] })], ...none, days: 1 });
  expect(past).toEqual([]);
  const ended = buildAlarms({ now, tz, me: ann, dosesOn: true, medicines: [med({ end_date: "2026-10-28" })], ...none });
  expect(ended).toEqual([]);
  const later = buildAlarms({ now, tz, me: ann, dosesOn: true, medicines: [med({ start_date: "2026-10-30" })], ...none, days: 2 });
  expect(later.every((x) => x.at >= "2026-10-29T16:00:00.000Z")).toBe(true);
  expect(buildAlarms({ now, tz, me: ann, dosesOn: true, medicines: [med({ times: ["8am"] })], ...none })).toEqual([]);
});

test("with Health reminders off, no dose rings", () => {
  expect(buildAlarms({ now, tz, me: ann, dosesOn: false, medicines: [med()], ...none })).toEqual([]);
});

test("whose doses ring: the same people as the dose reminder", () => {
  const childMed = (visibility: string, created_by = "x") => med({ member_id: "kid", visibility, created_by, member: { full_name: "Robin Tester", role: "child_self" } });
  expect(ringsFor(ann, childMed("family"))).toBe(true);
  expect(ringsFor(ann, childMed("parents"))).toBe(true);
  expect(ringsFor(dan, childMed("parents"))).toBe(false); // an adult, not a parent
  expect(ringsFor(dan, childMed("private", "dan"))).toBe(true); // he added it
  expect(ringsFor(ann, childMed("private"))).toBe(false);
  expect(ringsFor(kid, childMed("private"))).toBe(true); // their own
  // Another grown-up's medicine never rings on Ann's phone.
  expect(ringsFor(ann, med({ member_id: "dan", member: { full_name: "Dan", role: "adult" } }))).toBe(false);
  const a = buildAlarms({ now, tz, me: ann, dosesOn: true, medicines: [childMed("family")], ...none, days: 1 });
  expect(a[0].title).toBe("Time for Robin's Losartan");
});

test("a picked plan rings 30 minutes before, every day it repeats", () => {
  const a = buildAlarms({
    now, tz, me: ann, dosesOn: false, medicines: [], appointments: [], bills: [], days: 3,
    activities: [{ id: "p1", title: "Swimming", start_at: "2026-10-29T08:00:00Z", status: "upcoming", location: "Pool", repeat: "weekly", repeat_days: [4, 5] }],
  });
  expect(a.map((x) => [x.at, x.body])).toEqual([
    ["2026-10-29T07:30:00.000Z", "At 16:00 · Pool"],
    ["2026-10-30T07:30:00.000Z", "At 16:00 · Pool"],
  ]);
});

test("a cancelled or done plan does not ring", () => {
  const a = buildAlarms({ now, tz, me: ann, dosesOn: false, medicines: [], appointments: [], bills: [], activities: [{ id: "p", title: "x", start_at: "2026-10-29T08:00:00Z", status: "completed", repeat: "once" }] });
  expect(a).toEqual([]);
});

test("a check-up rings an hour before; a bill at 09:00 on its day, unless paid", () => {
  const a = buildAlarms({
    now, tz, me: ann, dosesOn: false, medicines: [], activities: [],
    appointments: [{ id: "v1", what: "Dental check-up", when_at: "2026-10-30T02:00:00Z", where_text: "Clinic", member_id: "kid", member: { full_name: "Robin Tester" } }],
    bills: [
      { id: "b1", name: "Meralco", amount: 4380.5, due_date: "2026-10-31", status: "unpaid" },
      { id: "b2", name: "Water", amount: 890, due_date: "2026-10-31", status: "paid" },
    ],
  });
  expect(a.map((x) => [x.kind, x.at, x.title, x.body])).toEqual([
    ["appointment", "2026-10-30T01:00:00.000Z", "Robin: Dental check-up", "At 10:00 · Clinic"],
    ["bill", "2026-10-31T01:00:00.000Z", "Meralco is due today", "₱4,380.50"],
  ]);
  expect(a[0].url).toBe("/family/members/kid/visit/v1");
});

test("never more than the most the phone is handed, earliest first", () => {
  const many = Array.from({ length: 10 }, (_, i) => med({ id: `1111111${i}-1111-1111-1111-111111111111`, times: ["09:00", "12:00", "21:00"] }));
  const a = buildAlarms({ now, tz, me: ann, dosesOn: true, medicines: many, ...none });
  expect(a.length).toBe(ALARM_MAX);
  expect([...a].sort((x, y) => x.at.localeCompare(y.at))).toEqual(a);
});
