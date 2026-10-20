import { test, expect } from "@playwright/test";
import { REFERRAL_CAP, cleanReferralCode, referralLine, referralMessage, referralRewardLine, referralUrl } from "@/lib/referral";

/** Invite a family (20261020180000_invite_a_family.sql): the link, the
 * message, and what Settings says. The database keeps the cap and the
 * window; this is what the screens show. */

test("a code from a link or a cookie is cleaned to 8 letters and digits, or nothing", () => {
  expect(cleanReferralCode("aaaa1111")).toBe("AAAA1111");
  expect(cleanReferralCode(" AAAA-1111 ")).toBe("AAAA1111");
  expect(cleanReferralCode("AAAA1111extra")).toBe("AAAA1111");
  expect(cleanReferralCode("short")).toBeNull();
  expect(cleanReferralCode("")).toBeNull();
  expect(cleanReferralCode(undefined)).toBeNull();
});

test("the link carries the code and nothing else", () => {
  expect(referralUrl("https://kin.example", "AAAA1111")).toBe("https://kin.example/r/AAAA1111");
  expect(referralUrl("https://kin.example", "AA/AA?11")).toBe("https://kin.example/r/AAAA11");
});

test("the message names the family, the days for both, and ends with the link", () => {
  const m = referralMessage("The Cruz Family", "https://kin.example/r/AAAA1111");
  expect(m.startsWith("The Cruz Family invite you to Kin")).toBe(true);
  expect(m).toContain("we both get 7 days of Kin Plus");
  expect(m.endsWith("https://kin.example/r/AAAA1111")).toBe(true);
  expect(referralMessage("  ", "u").startsWith("We invite")).toBe(true);
});

test("Settings' row and the line under the link", () => {
  expect(referralLine(0)).toBe("Share your link");
  expect(referralLine(1)).toBe("1 family joined through you");
  expect(referralLine(3)).toBe("3 families joined through you");
  expect(referralRewardLine(0)).toContain(`for ${REFERRAL_CAP} more families`);
  expect(referralRewardLine(4)).toContain("for 1 more family");
  expect(referralRewardLine(5)).toContain("the most Kin gives");
  expect(referralRewardLine(7)).toContain("the most Kin gives");
});
