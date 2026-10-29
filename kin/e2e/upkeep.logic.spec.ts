import { test, expect } from "@playwright/test";
import { addMonthsISO, nextServiceDue, upkeepDue, type UpkeepItem } from "@/lib/upkeep";
import { wealthRows } from "@/lib/today-wealth";

/** Home upkeep (lib/upkeep, 20261029160000_home_upkeep.sql). */

const item = (over: Partial<UpkeepItem>): UpkeepItem => ({ id: "i1", name: "Aircon", asset_id: "a1", acquired_on: "2026-01-15", service_every_months: 6, last_serviced_on: null, warranty_until: null, ...over });

test("months are added the way a calendar does, ending on the last day of a short month", () => {
  expect(addMonthsISO("2026-01-15", 6)).toBe("2026-07-15");
  expect(addMonthsISO("2026-08-31", 6)).toBe("2027-02-28");
  expect(addMonthsISO("2026-11-30", 3)).toBe("2027-02-28");
});

test("the next service counts from the last one, else from the day it was bought", () => {
  expect(nextServiceDue(item({}))).toBe("2026-07-15");
  expect(nextServiceDue(item({ last_serviced_on: "2026-10-01" }))).toBe("2027-04-01");
  expect(nextServiceDue(item({ service_every_months: null }))).toBeNull();
  expect(nextServiceDue(item({ acquired_on: null }))).toBeNull();
});

test("Today: a service due or overdue is a row; a warranty ending this week is in Coming up, on its day a row", () => {
  const none = { utang: [], paluwagans: [], loans: [], funds: [], income: [] };
  const today = "2026-10-29";
  const due = upkeepDue([item({}), item({ id: "i2", last_serviced_on: "2026-09-01" })], today);
  expect(due.service.map((i) => [i.id, i.due])).toEqual([["i1", "2026-07-15"]]);
  const rows = wealthRows({ ...none, upkeep: [item({}), item({ id: "w1", name: "Ref", service_every_months: null, warranty_until: "2026-11-02" }), item({ id: "w2", name: "TV", service_every_months: null, warranty_until: today }), item({ id: "w3", name: "Fan", service_every_months: null, warranty_until: "2026-12-01" })] }, today, "PHP");
  expect(rows.today.map((r) => r.title)).toEqual(["Service the aircon", "TV: warranty ends today"]);
  expect(rows.soon.map((r) => [r.title, r.at])).toEqual([["Ref: warranty ends", 4]]);
});
