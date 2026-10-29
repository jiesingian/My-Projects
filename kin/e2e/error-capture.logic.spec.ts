import { test, expect } from "@playwright/test";
import { describeThrown, errorReport, hash16, isOwnScriptError, isReaderGone, isStaleBuild, scrubMessage, scrubRoute, stackFrames } from "@/lib/error-capture";

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

test("only Kin's own scripts are reported from window.onerror, not an in-app browser's", () => {
  const origin = "https://kin.app";
  expect(isOwnScriptError("https://kin.app/_next/static/chunks/app.js", "", origin)).toBe(true);
  // Next's inline scripts: the page itself is the file.
  expect(isOwnScriptError("https://kin.app/today", "", origin)).toBe(true);
  expect(isOwnScriptError("", "TypeError: x\n    at f (https://kin.app/_next/static/chunks/1.js:1:2)", origin)).toBe(true);
  // 21 October, "reading 'M_ID'": injected code has no file of ours.
  expect(isOwnScriptError("", "TypeError: Cannot read properties of undefined (reading 'M_ID')\n    at <anonymous>:1:120", origin)).toBe(false);
  expect(isOwnScriptError("chrome-extension://abc/content.js", "", origin)).toBe(false);
  expect(isOwnScriptError("https://connect.facebook.net/en_US/iab.js", "", origin)).toBe(false);
  expect(isOwnScriptError("", "", origin)).toBe(false);
});

test("a reader leaving mid-page is not recorded as a server error, and nothing else is let off", () => {
  // 28 October: 100 of these on dev's /today, all from end-to-end runs moving on.
  expect(isReaderGone("The destination stream errored while writing data.")).toBe(true);
  expect(isReaderGone("Error: The destination stream errored while writing data.")).toBe(true);
  expect(isReaderGone("The destination stream closed early.")).toBe(true);
  expect(isReaderGone("TypeError: Cannot read properties of undefined (reading 'title')")).toBe(false);
  expect(isReaderGone("The destination stream errored while writing data. Also: the query failed")).toBe(false);
  expect(isReaderGone("")).toBe(false);
  expect(isReaderGone(undefined)).toBe(false);
});

test("a page from an earlier build asking for a removed file is told apart, in each browser's words", () => {
  // As dev recorded it on /wealth, 26 October.
  expect(isStaleBuild("ChunkLoadError: Failed to load chunk /_next/static/chunks/0-9osohsayip3.js from module [n]")).toBe(true);
  expect(isStaleBuild("Loading chunk 482 failed.")).toBe(true);
  expect(isStaleBuild("TypeError: Failed to fetch dynamically imported module: https://kin.app/_next/static/chunks/a.js")).toBe(true);
  expect(isStaleBuild("TypeError: Importing a module script failed.")).toBe(true);
  expect(isStaleBuild("TypeError: error loading dynamically imported module")).toBe(true);
  // Anything else is a real error, and is reported.
  expect(isStaleBuild("TypeError: Load failed")).toBe(false);
  expect(isStaleBuild("Minified React error #418")).toBe(false);
  expect(isStaleBuild(undefined)).toBe(false);
});
