import { test, expect } from "@playwright/test";
import { breachCandidates, breachCount, breachReason, findings, isCode, rangePrefix, reuse, sha1Hex, weakness, PWNED_RANGE_URL } from "@/lib/password-health";

/** Password health in the Vault (19 October): reused, weak and breached,
 * worked out on the phone. */

test("the hash is SHA-1, and only its first five characters are ever sent", async () => {
  const hash = await sha1Hex("password");
  expect(hash).toBe("5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8");
  expect(rangePrefix(hash)).toBe("5BAA6");
  const url = PWNED_RANGE_URL + rangePrefix(hash);
  expect(url).toBe("https://api.pwnedpasswords.com/range/5BAA6");
  expect(new URL(url).pathname).toBe("/range/5BAA6");
  expect(url).not.toContain(hash.slice(5));
});

test("the range answer is read for this hash's suffix, padding counting as nothing", async () => {
  const hash = await sha1Hex("password");
  const body = ["0018A45C4D1DEF81644B54AB7F969B88D65:1", `${hash.slice(5)}:9545824`, "1E4C9B93F3F0682250B6CF8331B7EE68FD9:0"].join("\r\n");
  expect(breachCount(body, hash)).toBe(9545824);
  expect(breachCount(body.toLowerCase(), hash)).toBe(9545824);
  expect(breachCount("0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n", hash)).toBe(0);
  expect(breachCount(`${hash.slice(5)}:0`, hash)).toBe(0);
  expect(breachReason(9545824)).toContain("millions of times");
  expect(breachReason(2400)).toContain("2,000+ times");
  expect(breachReason(1)).toContain("1 time)");
});

test("weak: short, common, a run, the same character -- calmly said", () => {
  expect(weakness("password")).toBe("One of the first passwords anyone tries");
  expect(weakness("Password1!")).toBe("One of the first passwords anyone tries");
  expect(weakness("abcdef")).toBe("Easy to guess");
  expect(weakness("zzzzzzzzzzzz")).toBe("Easy to guess");
  expect(weakness("k7#Lq")).toMatch(/^Short/);
  expect(weakness("sunflower")).toMatch(/^Short/);
  expect(weakness("sunflower-kitchen-42")).toBeNull();
  expect(weakness("Tr0ub4dor&3x")).toBeNull();
});

test("a door code is a code: only flagged when plainly guessable, never sent for a breach check", () => {
  expect(isCode("4821")).toBe(true);
  expect(isCode("wifi4821")).toBe(false);
  expect(weakness("4821")).toBeNull();
  expect(weakness("1234")).toBe("Easy to guess");
  expect(weakness("0000")).toBe("Easy to guess");
  expect(weakness("123123")).toBe("Easy to guess");
  const items = [
    { id: "gate", label: "Gate", secret: "4821" },
    { id: "wifi", label: "Home Wi-Fi", secret: "sunflower-kitchen-42" },
  ];
  expect(breachCandidates(items).map((i) => i.id)).toEqual(["wifi"]);
});

test("a password used twice is flagged on both, naming the other", () => {
  const items = [
    { id: "a", label: "Netflix", secret: "sunflower-kitchen-42" },
    { id: "b", label: "Home Wi-Fi", secret: "sunflower-kitchen-42" },
    { id: "c", label: "Gate", secret: "4821" },
  ];
  expect(reuse(items).get("a")).toEqual(["Home Wi-Fi"]);
  expect(reuse(items).get("c")).toBeUndefined();
  expect(findings(items)).toEqual([
    { id: "a", label: "Netflix", reasons: ["Also used for Home Wi-Fi"] },
    { id: "b", label: "Home Wi-Fi", reasons: ["Also used for Netflix"] },
  ]);
});

test("breached says breached rather than also weak; a healthy vault says nothing", () => {
  const items = [
    { id: "a", label: "Old email", secret: "password" },
    { id: "b", label: "Home Wi-Fi", secret: "sunflower-kitchen-42" },
  ];
  const [old] = findings(items, new Map([["a", 9545824], ["b", 0]]));
  expect(old.reasons).toHaveLength(1);
  expect(old.reasons[0]).toMatch(/^Seen in known data breaches/);
  expect(findings([items[1]], new Map([["b", 0]]))).toEqual([]);
});
