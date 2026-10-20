import { test, expect } from "@playwright/test";
import { askedMembers, canAnswerFor, eventTakesRsvps, rsvpLine, rsvpOpen, summarizeRsvps } from "@/lib/event-rsvp";

/** Who's coming (20261014090000_event_rsvps.sql): who is asked, who may
 * answer for whom, and that answers close once the event is over. The
 * policies enforce the same rules; this is what the screen shows. */

const today = "2026-10-14";
const ann = { id: "ann", role: "parent", status: "active" };
const abe = { id: "abe", role: "adult", status: "active" };
const kid = { id: "kid", role: "child_self", status: "active" };
// A managed child has status "managed" in the real schema (20261021000500).
const baby = { id: "baby", role: "child_managed", status: "managed" };
const gone = { id: "gone", role: "adult", status: "moved" };
const household = [ann, abe, kid, baby, gone];

test("a whole-family event, or one naming nobody, asks every active member", () => {
  const whole = { event_date: "2026-10-20", applies_to_whole_family: true };
  expect(askedMembers(whole, ["kid"], household).map((m) => m.id)).toEqual(["ann", "abe", "kid", "baby"]);
  const nobody = { event_date: "2026-10-20", applies_to_whole_family: false };
  expect(askedMembers(nobody, [], household).map((m) => m.id)).toEqual(["ann", "abe", "kid", "baby"]);
});

test("an event for some people asks only them", () => {
  const some = { event_date: "2026-10-20", applies_to_whole_family: false };
  expect(askedMembers(some, ["kid", "baby", "gone"], household).map((m) => m.id)).toEqual(["kid", "baby"]);
});

test("answers stay open through the event's last day, then lock", () => {
  const e = { event_date: "2026-10-12", end_date: "2026-10-14", applies_to_whole_family: true };
  expect(rsvpOpen(e, today)).toBe(true);
  expect(rsvpOpen(e, "2026-10-15")).toBe(false);
  expect(rsvpOpen({ event_date: "2026-10-14", applies_to_whole_family: true }, today)).toBe(true);
  expect(rsvpOpen({ event_date: "2026-10-13", applies_to_whole_family: true }, today)).toBe(false);
});

test("a yearly event takes no answers at all", () => {
  const birthday = { event_date: "1990-10-20", recurs_yearly: true, applies_to_whole_family: true };
  expect(eventTakesRsvps(birthday)).toBe(false);
  expect(rsvpOpen(birthday, today)).toBe(false);
});

test("you answer for yourself; a grown-up also for a managed child, never a child with a login", () => {
  expect(canAnswerFor(ann, ann)).toBe(true);
  expect(canAnswerFor(ann, baby)).toBe(true);
  expect(canAnswerFor(abe, baby)).toBe(true);
  expect(canAnswerFor(ann, kid)).toBe(false);
  expect(canAnswerFor(ann, abe)).toBe(false);
  expect(canAnswerFor(kid, kid)).toBe(true);
  expect(canAnswerFor(kid, baby)).toBe(false);
  expect(canAnswerFor(kid, ann)).toBe(false);
});

test("who still needs to answer, and answers from people no longer asked don't count", () => {
  const asked = [ann, kid, baby];
  const s = summarizeRsvps(asked, [
    { member_id: "ann", answer: "going" },
    { member_id: "baby", answer: "maybe" },
    { member_id: "abe", answer: "no" },
  ]);
  expect(s.going.map((m) => m.id)).toEqual(["ann"]);
  expect(s.maybe.map((m) => m.id)).toEqual(["baby"]);
  expect(s.no).toEqual([]);
  expect(s.waiting.map((m) => m.id)).toEqual(["kid"]);
  expect(rsvpLine(s)).toBe("1 going · 1 maybe");
  expect(rsvpLine(summarizeRsvps(asked, []))).toBe("");
});
