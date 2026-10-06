import { test, expect } from "@playwright/test";
import { fileFitsTarget, forwardLabel, forwardedPath, isForwardSource, parseTargetKey } from "@/lib/chat-forward";

/** Forwarding (20260930031500). The action is only as safe as what it will
 * accept from the browser, so the parsing is tested on its own. */

const A = "0f1e2d3c-4b5a-4968-8776-655443322110";

test("a conversation key names exactly one conversation", () => {
  expect(parseTargetKey("household")).toEqual({ kind: "household" });
  expect(parseTargetKey("family")).toEqual({ kind: "family" });
  expect(parseTargetKey("saved")).toEqual({ kind: "saved" });
  expect(parseTargetKey(`dm:${A}`)).toEqual({ kind: "dm", id: A });
  expect(parseTargetKey(`group:${A.toUpperCase()}`)).toEqual({ kind: "group", id: A });
  // Link threads are not forward targets, and nothing loose gets through.
  for (const bad of [`link:${A}`, "dm:", "dm:not-a-uuid", `dm:${A}; drop table`, "", "Household", `group:${A}:x`]) {
    expect(parseTargetKey(bad), bad).toBeNull();
  }
});

test("a forward source must be a known kind and a uuid", () => {
  expect(isForwardSource({ kind: "dm", id: A })).toBe(true);
  expect(isForwardSource({ kind: "link", id: A })).toBe(false);
  expect(isForwardSource({ kind: "dm", id: "x" })).toBe(false);
  expect(isForwardSource(null)).toBe(false);
  expect(isForwardSource("dm")).toBe(false);
});

test("the label is the writer's first name, and survives being forwarded again", () => {
  expect(forwardLabel("Maria Clara Santos")).toBe("Maria");
  expect(forwardLabel("  Lola  ")).toBe("Lola");
  expect(forwardLabel("Jonathan", "Mama")).toBe("Mama");
  expect(forwardLabel("", null)).toBeNull();
  expect(forwardLabel(null)).toBeNull();
  expect(forwardLabel("x".repeat(200))!.length).toBe(60);
});

test("a forwarded file is copied into the forwarder's own chat folder", () => {
  const fam = "11111111-2222-4333-8444-555555555555";
  const other = "99999999-2222-4333-8444-555555555555";
  const p = forwardedPath(fam, `${other}/chat/1727600000000-abcd1234-beach.jpg`, 1727700000000, "deadbeefcafe");
  // The attachment tables only accept a path in the sender's own household's
  // chat folder; this is that check, from the other side.
  expect(p.startsWith(`${fam}/chat/`)).toBe(true);
  expect(p).toBe(`${fam}/chat/1727700000000-deadbeef-fwd-beach.jpg`);
  expect(forwardedPath(fam, "", 1, "00000000")).toBe(`${fam}/chat/1-00000000-fwd-file`);
});

test("only the household chat takes files other than media", () => {
  expect(fileFitsTarget("household", "application/pdf")).toBe(true);
  for (const kind of ["family", "dm", "group", "saved"] as const) {
    expect(fileFitsTarget(kind, "application/pdf")).toBe(false);
    expect(fileFitsTarget(kind, "image/jpeg")).toBe(true);
    expect(fileFitsTarget(kind, "video/mp4")).toBe(true);
    expect(fileFitsTarget(kind, "audio/mp4")).toBe(true);
  }
});
