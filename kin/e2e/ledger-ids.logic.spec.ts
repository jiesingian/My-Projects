import { test, expect } from "@playwright/test";
import { alreadyRecorded, ledgerRowId } from "@/lib/ledger-ids";
import { UUID } from "@/lib/ids";

/** Money forms send an id made on the phone and keep it until the save
 * succeeds (29 October), so a retry after "Load failed" writes the same
 * rows and is refused as already there, not recorded twice. */

const id = "8e1c2b9e-1234-4abc-9def-0123456789ab";

test("the first row takes the phone's id; further rows a fixed id worked out from it", () => {
  expect(ledgerRowId(id)).toBe(id);
  expect(ledgerRowId(id.toUpperCase())).toBe(id);
  const legs = [1, 2, 3].map((leg) => ledgerRowId(id, leg));
  // The same on every try: that is what makes a retry collide.
  expect([1, 2, 3].map((leg) => ledgerRowId(id, leg))).toEqual(legs);
  // Each a real id, the column's own shape, and all different.
  for (const leg of legs) expect(leg).toMatch(UUID);
  for (const leg of legs) expect(leg?.[14]).toBe("4");
  expect(new Set([id, ...legs]).size).toBe(4);
  // Another save's legs are its own.
  expect(ledgerRowId("8e1c2b9e-1234-4abc-9def-0123456789ac", 1)).not.toBe(legs[0]);
});

test("no id, or one that isn't an id, names no rows: the database makes them as before", () => {
  expect(ledgerRowId(undefined)).toBeUndefined();
  expect(ledgerRowId(null, 1)).toBeUndefined();
  expect(ledgerRowId("not-an-id")).toBeUndefined();
});

test("a duplicate key means already recorded only for a save that named its rows", () => {
  expect(alreadyRecorded({ code: "23505" }, id)).toBe(true);
  expect(alreadyRecorded({ code: "23505" }, undefined)).toBe(false);
  expect(alreadyRecorded({ code: "42501" }, id)).toBe(false);
  expect(alreadyRecorded(null, id)).toBe(false);
});
