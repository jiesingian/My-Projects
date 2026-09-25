import { test, expect } from "@playwright/test";
import { lockChangeProblem } from "@/lib/security/lock-rules";

/** Changing the documents lock is also a way round it -- a new fingerprint
 * opens the documents, and so does removing the only PIN -- so the server
 * refuses any change to a lock that exists and is shut. */

test("a lock that exists and is shut cannot be changed", () => {
  expect(lockChangeProblem({ configured: true, unlocked: false })).toBeTruthy();
});

test("an open lock can be changed", () => {
  expect(lockChangeProblem({ configured: true, unlocked: true })).toBeNull();
});

test("the first lock can always be set up", () => {
  // getLockState reports an unconfigured lock as open, but the rule does not
  // lean on that: with nothing set up there is nothing to protect.
  expect(lockChangeProblem({ configured: false, unlocked: true })).toBeNull();
  expect(lockChangeProblem({ configured: false, unlocked: false })).toBeNull();
});
