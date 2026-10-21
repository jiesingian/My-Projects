import { test, expect } from "@playwright/test";
import { describeThrown, errorReport, hash16, scrubMessage, scrubRoute, stackFrames } from "@/lib/error-capture";

/** Error capture (21 October): what is kept of an error, and how repeats
 * group. No network, no database. The database scrubs the same way again
 * (supabase/tests/pglite/probes/app-errors.mjs). */

test("nothing personal survives the scrub: email, id, query string, long number, token", () => {
  const m = scrubMessage(
    "Failed for ann.cruz@gmail.com member 2b1c9a52-8c1e-4f0e-9d3a-1c2b3c4d5e6f at https://kin.app/x?token=secret phone 09171234567 key abcdefghijklmnopqrstuvwxyz012345",
  );
  expect(m).not.toMatch(/ann|2b1c9a52|secret|0917|abcdefghijklmnop|\?/);
  expect(m).toContain("[email]");
  expect(m).toContain("[id]");
  expect(m).toContain("https://kin.app/x");
  expect(scrubMessage("x".repeat(1000)).length).toBeLessThanOrEqual(300);
});

test("the route is a pattern: path only, ids folded", () => {
  expect(scrubRoute("/family/members/2b1c9a52-8c1e-4f0e-9d3a-1c2b3c4d5e6f?tab=health#top")).toBe("/family/members/[id]");
  expect(scrubRoute("https://kin.app/join/AB12CD?ref=x")).toBe("/join/[id]");
  expect(scrubRoute("/guest/abcdefghijklmnopqrstuvwxyzABCD")).toBe("/guest/[id]");
  expect(scrubRoute("/today")).toBe("/today");
  expect(scrubRoute("")).toBe("/");
});

test("one bug keeps one fingerprint across builds; a different message is a different one", () => {
  const a = "TypeError: x is undefined\n    at Planner (https://kin.app/_next/static/chunks/app-1a2b3c4d5e.js?v=1:12:345)\n    at render (https://kin.app/_next/static/chunks/react-99887766.js:1:2)";
  const b = "TypeError: x is undefined\n    at Planner (https://kin.app/_next/static/chunks/app-1a2b3c4d5e.js?v=2:13:999)\n    at render (https://kin.app/_next/static/chunks/react-99887766.js:7:8)";
  expect(stackFrames(a)).toEqual(stackFrames(b));
  const r1 = errorReport("client", "/planner", "TypeError: x is undefined", a);
  const r2 = errorReport("client", "/planner/[id]", "TypeError: x is undefined", b);
  expect(r1.fingerprint).toBe(r2.fingerprint);
  expect(r1.fingerprint).toMatch(/^[0-9a-f]{16}$/);
  expect(errorReport("client", "/planner", "TypeError: y is undefined", a).fingerprint).not.toBe(r1.fingerprint);
  expect(errorReport("server", "/planner", "TypeError: x is undefined", a).fingerprint).not.toBe(r1.fingerprint);
});

test("the same id in two messages groups them; the hash is stable", () => {
  const one = errorReport("server", "render /x", "No row for 2b1c9a52-8c1e-4f0e-9d3a-1c2b3c4d5e6f", "");
  const two = errorReport("server", "render /x", "No row for 9f1c9a52-8c1e-4f0e-9d3a-1c2b3c4d5e6f", "");
  expect(one.fingerprint).toBe(two.fingerprint);
  expect(hash16("kin")).toBe(hash16("kin"));
  expect(hash16("kin")).not.toBe(hash16("kim"));
});

test("anything thrown is described: an Error, a string, an object with a message", () => {
  expect(describeThrown(new RangeError("bad")).message).toBe("RangeError: bad");
  expect(describeThrown("plain").message).toBe("plain");
  expect(describeThrown({ message: "from fetch" }).message).toBe("from fetch");
  expect(describeThrown(undefined).message).toBe("undefined");
});
