import { test, expect } from "@playwright/test";
import { HIGHLIGHT_MAX_SECONDS, groupHighlights, highlightRefusal, timeLeft } from "@/lib/highlights";

/** Highlights last a day and are kept small: a photo up to 15 MB, a video up
 * to 30 seconds and 25 MB, checked on the phone before anything uploads. */

const MB = 1024 * 1024;

test("a photo or short video is fine; anything else is refused in words", () => {
  expect(highlightRefusal({ type: "image/jpeg", size: 4 * MB })).toBeNull();
  expect(highlightRefusal({ type: "video/quicktime", size: 20 * MB }, 29.9)).toBeNull();
  expect(highlightRefusal({ type: "image/heic", size: 16 * MB })).toMatch(/15 MB/);
  expect(highlightRefusal({ type: "video/mp4", size: 26 * MB }, 20)).toMatch(/25 MB/);
  expect(highlightRefusal({ type: "video/mp4", size: 5 * MB }, HIGHLIGHT_MAX_SECONDS + 5)).toMatch(/30 seconds/);
  expect(highlightRefusal({ type: "application/pdf", size: 1 })).toMatch(/photo or a video/);
});

test("time left counts down to the end of the day it was posted", () => {
  const now = Date.parse("2026-09-29T10:00:00Z");
  expect(timeLeft("2026-09-30T09:30:00Z", now)).toBe("23h left");
  expect(timeLeft("2026-09-29T10:40:00Z", now)).toBe("40m left");
  expect(timeLeft("2026-09-29T10:00:30Z", now)).toBe("Ending");
});

test("yours come first, then whoever posted last; each person's play oldest first", () => {
  const h = (memberId: string, createdAt: string) => ({ memberId, createdAt, id: `${memberId}${createdAt}` });
  const groups = groupHighlights([h("ana", "2026-09-29T08:00Z"), h("me", "2026-09-29T07:00Z"), h("ben", "2026-09-29T09:00Z"), h("ana", "2026-09-29T06:00Z")], "me");
  expect(groups.map((g) => g.memberId)).toEqual(["me", "ben", "ana"]);
  expect(groups[2].items.map((i) => i.createdAt)).toEqual(["2026-09-29T06:00Z", "2026-09-29T08:00Z"]);
});
