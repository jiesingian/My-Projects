import { test, expect } from "@playwright/test";
import {
  AUTH_FALLBACK,
  EMAIL_RATE_LIMITED,
  REQUEST_RATE_LIMITED,
  humanAuthError,
  isEmailRateLimit,
} from "@/lib/auth-errors";

/** What a person reads when Supabase Auth refuses a sign-up or a resend.
 *
 * The first shape is the one production returned on 29 September, read from
 * the auth logs: a friend's sign-up got a 429 because two confirmation emails
 * had already gone out that hour, and "email rate limit exceeded" was shown
 * to them word for word. */

const MAIL_CAPPED = { code: "over_email_send_rate_limit", message: "email rate limit exceeded", status: 429 };

test("the mailer's hourly cap reads as a pause, not a fault", () => {
  expect(humanAuthError(MAIL_CAPPED)).toBe(EMAIL_RATE_LIMITED);
  expect(EMAIL_RATE_LIMITED).toContain("Try again in a few minutes");
});

test("the code alone is enough, whatever the prose says", () => {
  expect(isEmailRateLimit({ code: "over_email_send_rate_limit", message: "something reworded" })).toBe(true);
  expect(humanAuthError({ code: "over_email_send_rate_limit" })).toBe(EMAIL_RATE_LIMITED);
});

test("the message alone is enough when no code came back", () => {
  expect(isEmailRateLimit({ message: "Email rate limit exceeded" })).toBe(true);
  expect(humanAuthError({ message: "email rate limit exceeded" })).toBe(EMAIL_RATE_LIMITED);
});

test("asking too often is told apart from the mailer being capped", () => {
  expect(humanAuthError({ code: "over_request_rate_limit", message: "Request rate limit reached", status: 429 })).toBe(
    REQUEST_RATE_LIMITED,
  );
  expect(humanAuthError({ status: 429, message: "Too many requests" })).toBe(REQUEST_RATE_LIMITED);
});

test("no Supabase wording reaches the screen", () => {
  const raw = [
    MAIL_CAPPED,
    { code: "over_request_rate_limit", message: "Request rate limit reached" },
    { code: "weak_password", message: "Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz" },
    { code: "email_address_invalid", message: 'Email address "x@y" is invalid' },
    { code: "unexpected_failure", message: "Error sending confirmation email" },
    { message: "Database error saving new user" },
  ];
  for (const error of raw) {
    const shown = humanAuthError(error);
    expect(shown).not.toBeNull();
    expect(shown).not.toBe(error.message);
    for (const leak of ["rate limit", "exceeded", "database", "abcdefghijklmnopqrstuvwxyz", "is invalid", "confirmation email"]) {
      expect(shown!.toLowerCase(), `${error.message} leaks "${leak}"`).not.toContain(leak);
    }
  }
});

test("anything unrecognised gets the plain fallback", () => {
  expect(humanAuthError({ message: "Error sending confirmation email" })).toBe(AUTH_FALLBACK);
});

test("no error, no message", () => {
  expect(humanAuthError(null)).toBeNull();
  expect(humanAuthError(undefined)).toBeNull();
  expect(isEmailRateLimit(null)).toBe(false);
});
