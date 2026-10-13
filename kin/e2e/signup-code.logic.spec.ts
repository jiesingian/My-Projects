import { test, expect } from "@playwright/test";
import { signupCode } from "@/lib/signup-code";

/** What the sign-up screen accepts as the emailed code. The check runs before
 * Supabase is asked, so a wrong shape costs nobody a verify attempt (they are
 * rate limited) and the reply can say what the code looks like. */

test("six digits are the code", () => {
  expect(signupCode("123456")).toBe("123456");
});

test("spaces and dashes a phone or a person adds are dropped", () => {
  expect(signupCode(" 123 456 ")).toBe("123456");
  expect(signupCode("123-456")).toBe("123456");
});

test("a longer code is fine, if the project is set to send one", () => {
  expect(signupCode("12345678")).toBe("12345678");
  expect(signupCode("1234567890")).toBe("1234567890");
});

test("too short, too long or not digits is not a code", () => {
  expect(signupCode("")).toBeNull();
  expect(signupCode("12345")).toBeNull();
  expect(signupCode("12345678901")).toBeNull();
  expect(signupCode("12a456")).toBeNull();
  // Someone pasting the whole link from an email that has not been switched
  // to codes yet: told what to type, not sent to Supabase.
  expect(signupCode("https://example.supabase.co/auth/v1/verify?token=abc")).toBeNull();
});
