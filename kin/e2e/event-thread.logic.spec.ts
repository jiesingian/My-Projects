import { test, expect } from "@playwright/test";
import { commentAge, commentCountLine, threadAudience } from "@/lib/event-thread";

/** A thread on each event (20261014100000_event_comments.sql): who hears of
 * a new comment, the count on the Events row, and how old a comment reads. */

test("a whole-family event, or one naming nobody, tells the whole household", () => {
  expect(threadAudience({ applies_to_whole_family: true }, ["kid"])).toBeUndefined();
  expect(threadAudience({ applies_to_whole_family: false }, [])).toBeUndefined();
});

test("an event for some people tells only them", () => {
  expect(threadAudience({ applies_to_whole_family: false }, ["kid", "ann"])).toEqual(["kid", "ann"]);
});

test("the Events row shows a count only once someone has written", () => {
  expect(commentCountLine(0)).toBe("");
  expect(commentCountLine(1)).toBe("1 comment");
  expect(commentCountLine(4)).toBe("4 comments");
});

test("a comment's age reads short, and never negative", () => {
  const now = Date.parse("2026-10-14T10:00:00Z");
  expect(commentAge("2026-10-14T09:59:30Z", now)).toBe("now");
  expect(commentAge("2026-10-14T10:00:30Z", now)).toBe("now");
  expect(commentAge("2026-10-14T09:55:00Z", now)).toBe("5m");
  expect(commentAge("2026-10-14T07:00:00Z", now)).toBe("3h");
  expect(commentAge("2026-10-12T10:00:00Z", now)).toBe("2d");
});
